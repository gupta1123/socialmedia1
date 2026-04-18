import type { FastifyInstance } from "fastify";
import {
  ApprovalDecisionSchema,
  CreateDeliverableSchema,
  CreatePostVersionSchema,
  CreatePublicationSchema,
  ContentFormatSchema,
  CreativeFormatSchema,
  CreativeOutputSchema,
  DeliverableDetailSchema,
  DeliverablePrioritySchema,
  DeliverableSchema,
  ExternalPostReviewModeSchema,
  ExternalPostUploadResponseSchema,
  ObjectiveCodeSchema,
  PlacementCodeSchema,
  PostVersionSchema,
  PublicationSchema,
  ReviewQueueEntrySchema,
  UpdateDeliverableSchema,
  UpdatePublicationSchema
} from "@image-lab/contracts";
import { assertWorkspaceRole, getActiveBrandProfile, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import {
  applyApprovalDecision,
  compileDeliverablePromptPackage,
  ensurePostVersionForOutput
} from "../lib/deliverable-flow.js";
import {
  getBrandPersona,
  getChannelAccount,
  getDeliverable,
  getDeliverableDetail,
  getPostVersion,
  getPublication,
  getSeries,
  attachDeliverablePreviews,
  listDeliverables,
  listPostVersions,
  listReviewQueue
} from "../lib/deliverables-repository.js";
import { getCreativeTemplate, getPostType, getProject } from "../lib/planning-repository.js";
import { invalidateRuntimeCache } from "../lib/runtime-cache.js";
import { createSignedImageUrls, removeStorageObjects, uploadBufferToStorage } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createThumbnailFromBuffer } from "../lib/thumbnails.js";
import { buildStoragePath, deriveAspectRatio, randomId } from "../lib/utils.js";

export async function registerDeliverableRoutes(app: FastifyInstance) {
  app.get("/api/deliverables", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as {
      brandId?: string;
      projectId?: string;
      campaignId?: string;
      seriesId?: string;
      ownerUserId?: string;
      reviewerUserId?: string;
      planningMode?: string;
      status?: string;
      statusIn?: string;
      scheduledFrom?: string;
      scheduledTo?: string;
      limit?: string;
      includePreviews?: string;
    };
    const deliverables = await listDeliverables(workspace.id, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.seriesId ? { seriesId: query.seriesId } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.reviewerUserId ? { reviewerUserId: query.reviewerUserId } : {}),
      ...(query.planningMode
        ? {
            planningMode: query.planningMode as
              | "campaign"
              | "series"
              | "one_off"
              | "always_on"
              | "ad_hoc"
          }
        : {}),
      ...(query.status
        ? {
            status: query.status as
              | "planned"
              | "brief_ready"
              | "generating"
              | "review"
              | "approved"
              | "scheduled"
              | "published"
              | "archived"
              | "blocked"
          }
        : {})
      ,
      ...(query.statusIn
        ? {
            statusIn: query.statusIn
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean) as Array<
                | "planned"
                | "brief_ready"
                | "generating"
                | "review"
                | "approved"
                | "scheduled"
                | "published"
                | "archived"
                | "blocked"
              >
          }
        : {}),
      ...(query.scheduledFrom ? { scheduledFrom: query.scheduledFrom } : {}),
      ...(query.scheduledTo ? { scheduledTo: query.scheduledTo } : {}),
      ...(query.limit ? { limit: Number(query.limit) } : {})
    });
    const includePreviews = query.includePreviews === "1" || query.includePreviews === "true";
    const responseDeliverables = includePreviews ? await attachDeliverablePreviews(deliverables) : deliverables;
    return responseDeliverables.map((deliverable) => DeliverableSchema.parse(deliverable));
  });

  app.get("/api/deliverables/:deliverableId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const detail = await getDeliverableDetail((request.params as { deliverableId: string }).deliverableId);
    await assertWorkspaceRole(viewer, detail.deliverable.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    return DeliverableDetailSchema.parse(detail);
  });

  app.post("/api/deliverables", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateDeliverableSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);
    await validateDeliverableRelations({
      workspaceId: workspace.id,
      brandId: brand.id,
      ...(body.projectId ? { projectId: body.projectId } : {}),
      ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      ...(body.seriesId ? { seriesId: body.seriesId } : {}),
      ...(body.personaId ? { personaId: body.personaId } : {}),
      postTypeId: body.postTypeId,
      ...(body.creativeTemplateId ? { creativeTemplateId: body.creativeTemplateId } : {}),
      ...(body.channelAccountId ? { channelAccountId: body.channelAccountId } : {})
    });

    const deliverableId = randomId();
    const { error } = await supabaseAdmin.from("deliverables").insert({
      id: deliverableId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      project_id: body.projectId ?? null,
      campaign_id: body.campaignId ?? null,
      series_id: body.seriesId ?? null,
      persona_id: body.personaId ?? null,
      content_pillar_id: body.contentPillarId ?? null,
      post_type_id: body.postTypeId,
      creative_template_id: body.creativeTemplateId ?? null,
      channel_account_id: body.channelAccountId ?? null,
      planning_mode: body.planningMode,
      objective_code: body.objectiveCode,
      placement_code: body.placementCode,
      content_format: body.contentFormat,
      title: body.title,
      brief_text: body.briefText ?? null,
      cta_text: body.ctaText ?? null,
      scheduled_for: body.scheduledFor,
      due_at: body.dueAt ?? null,
      owner_user_id: body.ownerUserId ?? null,
      reviewer_user_id: body.reviewerUserId ?? body.ownerUserId ?? null,
      priority: body.priority,
      status: body.status,
      series_occurrence_date: body.seriesOccurrenceDate ?? null,
      source_json: body.sourceJson,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return DeliverableSchema.parse(await getDeliverable(deliverableId));
  });

  app.post("/api/deliverables/external-upload", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let filePart:
      | {
          filename: string;
          mimetype: string;
          buffer: Buffer;
        }
      | null = null;
    const fields: Record<string, string> = {};

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();

        if (!filePart) {
          filePart = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer
          };
        }
        continue;
      }

      fields[part.fieldname] = typeof part.value === "string" ? part.value : String(part.value ?? "");
    }

    if (!filePart) {
      return reply.badRequest("Image upload is required");
    }

    if (!filePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Only image uploads are supported for external post review");
    }

    const brandId = optionalMultipartField(fields, "brandId");
    if (!brandId) {
      return reply.badRequest("brandId is required");
    }

    const brand = await getBrand(brandId);
    const workspace = fields.workspaceId ? { id: fields.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const projectId = optionalMultipartField(fields, "projectId");
    const campaignId = optionalMultipartField(fields, "campaignId");
    const seriesId = optionalMultipartField(fields, "seriesId");
    const postTypeId = optionalMultipartField(fields, "postTypeId");
    if (!postTypeId) {
      return reply.badRequest("postTypeId is required");
    }

    const creativeTemplateId = optionalMultipartField(fields, "creativeTemplateId");
    const channelAccountId = optionalMultipartField(fields, "channelAccountId");
    const placementCode = PlacementCodeSchema.parse(optionalMultipartField(fields, "placementCode") ?? "instagram-feed");
    const contentFormat = ContentFormatSchema.parse(optionalMultipartField(fields, "contentFormat") ?? "static");
    const creativeFormat = CreativeFormatSchema.parse(optionalMultipartField(fields, "creativeFormat") ?? "portrait");
    const objectiveCode = ObjectiveCodeSchema.parse(optionalMultipartField(fields, "objectiveCode") ?? "awareness");
    const priority = DeliverablePrioritySchema.parse(optionalMultipartField(fields, "priority") ?? "normal");
    const reviewMode = ExternalPostReviewModeSchema.parse(optionalMultipartField(fields, "reviewMode") ?? "review");
    const title = normalizeTitle(optionalMultipartField(fields, "title") ?? filePart.filename);
    const briefText = optionalMultipartField(fields, "briefText");
    const ctaText = optionalMultipartField(fields, "ctaText");
    const caption = optionalMultipartField(fields, "caption");
    const ownerUserId = optionalMultipartField(fields, "ownerUserId") ?? viewer.userId;
    const reviewerUserId = optionalMultipartField(fields, "reviewerUserId") ?? ownerUserId;
    const scheduledFor = parseUploadDate(optionalMultipartField(fields, "scheduledFor"));
    const dueAt = optionalMultipartField(fields, "dueAt");

    await validateDeliverableRelations({
      workspaceId: workspace.id,
      brandId: brand.id,
      ...(projectId ? { projectId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(seriesId ? { seriesId } : {}),
      postTypeId,
      ...(creativeTemplateId ? { creativeTemplateId } : {}),
      ...(channelAccountId ? { channelAccountId } : {})
    });

    const brandProfileVersion = await getActiveBrandProfile(brand.id);
    const deliverableId = randomId();
    const creativeRequestId = randomId();
    const promptPackageId = randomId();
    const jobId = randomId();
    const outputId = randomId();
    const now = new Date().toISOString();
    const postVersionStatus = reviewMode === "review" ? "in_review" : "approved";
    const outputReviewState = reviewMode === "review" ? "pending_review" : "approved";
    const storagePath = buildStoragePath({
      workspaceId: workspace.id,
      brandId: brand.id,
      section: "outputs",
      id: outputId,
      fileName: filePart.filename
    });
    const sourceJson = {
      source: "external_upload",
      creativeFormat,
      reviewMode,
      originalFileName: filePart.filename,
      mimeType: filePart.mimetype
    };
    let thumbnail:
      | {
          thumbnailStoragePath: string;
          thumbnailWidth: number;
          thumbnailHeight: number;
          thumbnailBytes: number;
        }
      | null = null;

    try {
      await uploadBufferToStorage(storagePath, filePart.buffer, filePart.mimetype);
      thumbnail = await createThumbnailFromBuffer(storagePath, filePart.buffer).catch(() => null);

      const { error: deliverableError } = await supabaseAdmin.from("deliverables").insert({
      id: deliverableId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      project_id: projectId ?? null,
      campaign_id: campaignId ?? null,
      series_id: seriesId ?? null,
      post_type_id: postTypeId,
      creative_template_id: creativeTemplateId ?? null,
      channel_account_id: channelAccountId ?? null,
      planning_mode: campaignId ? "campaign" : seriesId ? "series" : "one_off",
      objective_code: objectiveCode,
      placement_code: placementCode,
      content_format: contentFormat,
      title,
      brief_text: briefText ?? null,
      cta_text: ctaText ?? null,
      scheduled_for: scheduledFor,
      due_at: dueAt ?? null,
      owner_user_id: ownerUserId,
      reviewer_user_id: reviewerUserId,
      priority,
      status: reviewMode === "scheduled" ? "scheduled" : reviewMode === "approved" ? "approved" : "review",
      source_json: sourceJson,
      created_by: viewer.userId
    });

      if (deliverableError) {
        throw deliverableError;
      }

    const { error: creativeRequestError } = await supabaseAdmin.from("creative_requests").insert({
      id: creativeRequestId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      deliverable_id: deliverableId,
      project_id: projectId ?? null,
      post_type_id: postTypeId,
      creative_template_id: creativeTemplateId ?? null,
      status: "compiled",
      brief_json: {
        ...sourceJson,
        title,
        briefText: briefText ?? null,
        caption: caption ?? null,
        placementCode,
        contentFormat,
        scheduledFor
      },
      created_by: viewer.userId
    });

      if (creativeRequestError) {
        throw creativeRequestError;
      }

    const promptSummary = `External uploaded post: ${title}`;
    const { error: promptPackageError } = await supabaseAdmin.from("prompt_packages").insert({
      id: promptPackageId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      deliverable_id: deliverableId,
      project_id: projectId ?? null,
      post_type_id: postTypeId,
      creative_template_id: creativeTemplateId ?? null,
      creative_request_id: creativeRequestId,
      brand_profile_version_id: brandProfileVersion.id,
      prompt_summary: promptSummary,
      seed_prompt: promptSummary,
      final_prompt: promptSummary,
      aspect_ratio: deriveAspectRatio(creativeFormat),
      chosen_model: "external-upload",
      template_type: null,
      reference_strategy: "uploaded-references",
      reference_asset_ids: [],
      variations: [],
      resolved_constraints: sourceJson,
      compiler_trace: {
        pipeline: "external-upload",
        createdByRoute: "/api/deliverables/external-upload"
      },
      created_by: viewer.userId
    });

      if (promptPackageError) {
        throw promptPackageError;
      }

    const { error: jobError } = await supabaseAdmin.from("creative_jobs").insert({
      id: jobId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      deliverable_id: deliverableId,
      project_id: projectId ?? null,
      post_type_id: postTypeId,
      creative_template_id: creativeTemplateId ?? null,
      prompt_package_id: promptPackageId,
      selected_template_id: null,
      job_type: "final",
      status: "completed",
      provider: "external-upload",
      provider_model: filePart.mimetype,
      provider_request_id: null,
      requested_count: 1,
      request_payload: {
        ...sourceJson,
        title,
        storagePath
      },
      webhook_payload: {},
      submitted_at: now,
      completed_at: now,
      created_by: viewer.userId
    });

      if (jobError) {
        throw jobError;
      }

    const { error: outputError } = await supabaseAdmin.from("creative_outputs").insert({
      id: outputId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      deliverable_id: deliverableId,
      project_id: projectId ?? null,
      post_type_id: postTypeId,
      creative_template_id: creativeTemplateId ?? null,
      job_id: jobId,
      kind: "final",
      storage_path: storagePath,
      thumbnail_storage_path: thumbnail?.thumbnailStoragePath ?? null,
      thumbnail_width: thumbnail?.thumbnailWidth ?? null,
      thumbnail_height: thumbnail?.thumbnailHeight ?? null,
      thumbnail_bytes: thumbnail?.thumbnailBytes ?? null,
      provider_url: null,
      output_index: 0,
      review_state: outputReviewState,
      reviewed_at: reviewMode === "review" ? null : now,
      metadata_json: {
        ...sourceJson,
        caption: caption ?? null
      },
      created_by: viewer.userId
    });

      if (outputError) {
        throw outputError;
      }

    let postVersion = await ensurePostVersionForOutput(outputId, {
      status: postVersionStatus,
      createdBy: viewer.userId
    });

    const { error: postVersionError } = await supabaseAdmin
      .from("post_versions")
      .update({
        headline: title,
        caption: caption ?? briefText ?? null,
        body_json: {
          source: "external_upload",
          originalFileName: filePart.filename
        },
        cta_text: ctaText ?? null,
        notes_json: {
          briefText: briefText ?? null,
          reviewMode,
          uploadedMimeType: filePart.mimetype
        },
        created_from_prompt_package_id: promptPackageId
      })
      .eq("id", postVersion.id);

      if (postVersionError) {
        throw postVersionError;
      }

      if (reviewMode === "scheduled") {
        const { error: scheduleError } = await supabaseAdmin
          .from("deliverables")
          .update({ status: "scheduled" })
          .eq("id", deliverableId);

        if (scheduleError) {
          throw scheduleError;
        }

        await ensureScheduledPublication({
          workspaceId: workspace.id,
          brandId: brand.id,
          deliverableId,
          postVersionId: postVersion.id,
          channelAccountId: channelAccountId ?? null,
          scheduledFor,
          createdBy: viewer.userId
        });
      }

      invalidateRuntimeCache(`home-overview:${workspace.id}:`);
      invalidateRuntimeCache(`plan-overview:${workspace.id}:`);
      invalidateRuntimeCache(`queue:${workspace.id}:`);

      const signedUrls = await createSignedImageUrls(storagePath, thumbnail?.thumbnailStoragePath);
      postVersion = await getPostVersion(postVersion.id);
      const deliverable = await getDeliverable(deliverableId);

      return ExternalPostUploadResponseSchema.parse({
        deliverable,
        postVersion,
        output: CreativeOutputSchema.parse({
          id: outputId,
          workspaceId: workspace.id,
          brandId: brand.id,
          deliverableId,
          projectId: projectId ?? null,
          postTypeId,
          creativeTemplateId: creativeTemplateId ?? null,
          calendarItemId: null,
          jobId,
          postVersionId: postVersion.id,
          kind: "final",
          storagePath,
          thumbnailStoragePath: thumbnail?.thumbnailStoragePath ?? null,
          providerUrl: null,
          outputIndex: 0,
          reviewState: outputReviewState,
          latestVerdict: null,
          reviewedAt: reviewMode === "review" ? null : now,
          createdBy: viewer.userId,
          previewUrl: signedUrls.originalUrl,
          thumbnailUrl: signedUrls.thumbnailUrl,
          originalUrl: signedUrls.originalUrl
        })
      });
    } catch (error) {
      await cleanupExternalUploadArtifacts({
        storagePath,
        thumbnailStoragePath: thumbnail?.thumbnailStoragePath ?? null,
        deliverableId,
        creativeRequestId,
        promptPackageId,
        jobId,
        outputId
      });
      throw error;
    }
  });

  app.patch("/api/deliverables/:deliverableId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
    const body = UpdateDeliverableSchema.parse(request.body);
    const hasReviewerUserId = Object.prototype.hasOwnProperty.call(body, "reviewerUserId");
    await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor"], request.log);
    await validateDeliverableRelations({
      workspaceId: deliverable.workspaceId,
      brandId: deliverable.brandId,
      ...(body.projectId ? { projectId: body.projectId } : {}),
      ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      ...(body.seriesId ? { seriesId: body.seriesId } : {}),
      ...(body.personaId ? { personaId: body.personaId } : {}),
      postTypeId: body.postTypeId,
      ...(body.creativeTemplateId ? { creativeTemplateId: body.creativeTemplateId } : {}),
      ...(body.channelAccountId ? { channelAccountId: body.channelAccountId } : {})
    });

    const { error } = await supabaseAdmin
      .from("deliverables")
      .update({
        project_id: body.projectId ?? null,
        campaign_id: body.campaignId ?? null,
        series_id: body.seriesId ?? null,
        persona_id: body.personaId ?? null,
        content_pillar_id: body.contentPillarId ?? null,
        post_type_id: body.postTypeId,
        creative_template_id: body.creativeTemplateId ?? null,
        channel_account_id: body.channelAccountId ?? null,
        planning_mode: body.planningMode,
        objective_code: body.objectiveCode,
        placement_code: body.placementCode,
        content_format: body.contentFormat,
        title: body.title,
        brief_text: body.briefText ?? null,
        cta_text: body.ctaText ?? null,
        scheduled_for: body.scheduledFor,
        due_at: body.dueAt ?? null,
        owner_user_id: body.ownerUserId ?? null,
        reviewer_user_id: hasReviewerUserId ? body.reviewerUserId ?? null : deliverable.reviewerUserId ?? null,
        priority: body.priority,
        status: body.status,
        approved_post_version_id: body.approvedPostVersionId ?? null,
        series_occurrence_date: body.seriesOccurrenceDate ?? null,
        source_json: body.sourceJson
      })
      .eq("id", deliverable.id);

    if (error) {
      throw error;
    }

    const postVersionIdForSchedule = body.approvedPostVersionId ?? deliverable.approvedPostVersionId;
    if (body.status === "scheduled" && postVersionIdForSchedule) {
      await ensureScheduledPublication({
        workspaceId: deliverable.workspaceId,
        brandId: deliverable.brandId,
        deliverableId: deliverable.id,
        postVersionId: postVersionIdForSchedule,
        channelAccountId: body.channelAccountId ?? null,
        scheduledFor: body.scheduledFor,
        createdBy: viewer.userId
      });
    }

    return DeliverableSchema.parse(await getDeliverable(deliverable.id));
  });

  app.delete("/api/deliverables/:deliverableId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
    await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor"], request.log);

    const { error } = await supabaseAdmin.from("deliverables").delete().eq("id", deliverable.id);

    if (error) {
      throw error;
    }

    return reply.status(204).send();
  });

  app.post("/api/deliverables/:deliverableId/compile", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
    await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    const promptPackage = await compileDeliverablePromptPackage({
      deliverableId: deliverable.id,
      viewerUserId: viewer.userId
    });
    return promptPackage;
  });

  app.get("/api/deliverables/:deliverableId/post-versions", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
    await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    const postVersions = await listPostVersions(deliverable.id);
    return postVersions.map((postVersion) => PostVersionSchema.parse(postVersion));
  });

  app.post("/api/deliverables/:deliverableId/post-versions", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
    const body = CreatePostVersionSchema.parse(request.body);
    await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor"], request.log);

    let postVersion;

    if (body.creativeOutputId) {
      postVersion = await ensurePostVersionForOutput(body.creativeOutputId, {
        status: body.status,
        createdBy: viewer.userId
      });

      const { error } = await supabaseAdmin
        .from("post_versions")
        .update({
          headline: body.headline ?? null,
          caption: body.caption ?? null,
          body_json: body.bodyJson,
          cta_text: body.ctaText ?? null,
          hashtags: body.hashtags,
          notes_json: body.notesJson,
          created_from_template_id: body.createdFromTemplateId ?? postVersion.createdFromTemplateId
        })
        .eq("id", postVersion.id);

      if (error) {
        throw error;
      }

      postVersion = await getPostVersion(postVersion.id);
    } else {
      const existing = await listPostVersions(deliverable.id);
      const postVersionId = randomId();
      const { error } = await supabaseAdmin.from("post_versions").insert({
        id: postVersionId,
        deliverable_id: deliverable.id,
        version_number: (existing[0]?.versionNumber ?? 0) + 1,
        status: body.status,
        headline: body.headline ?? null,
        caption: body.caption ?? null,
        body_json: body.bodyJson,
        cta_text: body.ctaText ?? null,
        hashtags: body.hashtags,
        notes_json: body.notesJson,
        created_from_template_id: body.createdFromTemplateId ?? null,
        created_by: viewer.userId
      });

      if (error) {
        throw error;
      }

      await supabaseAdmin
        .from("deliverables")
        .update({
          latest_post_version_id: postVersionId,
          status: body.status === "approved" ? "approved" : "review",
          approved_post_version_id: body.status === "approved" ? postVersionId : deliverable.approvedPostVersionId
        })
        .eq("id", deliverable.id);

      postVersion = await getPostVersion(postVersionId);
    }

    return PostVersionSchema.parse(postVersion);
  });

  app.post(
    "/api/deliverables/:deliverableId/post-versions/:postVersionId/approval",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const viewer = request.viewer;
      if (!viewer) {
        return reply.unauthorized();
      }

      const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
      const postVersionId = (request.params as { postVersionId: string }).postVersionId;
      const body = ApprovalDecisionSchema.parse(request.body);

      await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor"], request.log);
      const result = await applyApprovalDecision({
        deliverableId: deliverable.id,
        postVersionId,
        reviewerUserId: viewer.userId,
        action: body.action,
        comment: body.comment ?? null,
        metadataJson: body.metadataJson
      });

      return {
        deliverable: DeliverableSchema.parse(result.deliverable),
        postVersion: PostVersionSchema.parse(result.postVersion)
      };
    }
  );

  app.get("/api/review-queue", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as {
      brandId?: string;
      deliverableId?: string;
      scope?: string;
      limit?: string;
      offset?: string;
    };
    const scope = query.scope === "my" || query.scope === "team" || query.scope === "unassigned" ? query.scope : "team";
    const parsedLimit = Number.parseInt(query.limit ?? "", 10);
    const parsedOffset = Number.parseInt(query.offset ?? "", 10);
    const items = await listReviewQueue(workspace.id, query.brandId, query.deliverableId, {
      scope,
      reviewerUserId: viewer.userId,
      ...(Number.isFinite(parsedLimit) ? { limit: parsedLimit } : {}),
      ...(Number.isFinite(parsedOffset) ? { offset: parsedOffset } : {})
    });
    const signedItems = await Promise.all(
      items.map(async (item) => {
        if (!item.previewOutput) {
          return {
            ...item,
            previewOutput: null
          };
        }

        const urls = await createSignedImageUrls(
          item.previewOutput.storagePath,
          item.previewOutput.thumbnailStoragePath
        );

        return {
          ...item,
          previewOutput: {
            ...item.previewOutput,
            previewUrl: urls.originalUrl,
            thumbnailUrl: urls.thumbnailUrl,
            originalUrl: urls.originalUrl
          }
        };
      })
    );
    return signedItems.map((item) => ReviewQueueEntrySchema.parse(item));
  });

  app.get("/api/publications", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { deliverableId?: string; status?: string };
    let publicationRows = supabaseAdmin
      .from("publications")
      .select("id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });

    if (query.deliverableId) {
      publicationRows = publicationRows.eq("deliverable_id", query.deliverableId);
    }
    if (query.status) {
      publicationRows = publicationRows.eq("status", query.status);
    }

    const { data, error } = await publicationRows;
    if (error) {
      throw error;
    }

    const publications = await Promise.all((data ?? []).map((row) => getPublication(row.id)));
    return publications.map((publication) => PublicationSchema.parse(publication));
  });

  app.post("/api/publications", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreatePublicationSchema.parse(request.body);
    const deliverable = await getDeliverable(body.deliverableId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== deliverable.workspaceId || deliverable.brandId !== body.brandId) {
      return reply.badRequest("Publication does not match the target deliverable/workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const postVersion = await getPostVersion(body.postVersionId);
    if (postVersion.deliverableId !== deliverable.id) {
      return reply.badRequest("Post version does not belong to the selected deliverable");
    }

    if (body.channelAccountId) {
      const account = await getChannelAccount(body.channelAccountId);
      if (account.workspaceId !== workspace.id || account.brandId !== deliverable.brandId) {
        return reply.badRequest("Channel account does not belong to the target brand/workspace");
      }
    }

    const publicationId = randomId();
    const { error } = await supabaseAdmin.from("publications").insert({
      id: publicationId,
      workspace_id: workspace.id,
      brand_id: deliverable.brandId,
      deliverable_id: deliverable.id,
      post_version_id: postVersion.id,
      channel_account_id: body.channelAccountId ?? null,
      scheduled_for: body.scheduledFor ?? null,
      status: body.status,
      provider: body.provider ?? null,
      provider_publication_id: body.providerPublicationId ?? null,
      provider_payload_json: body.providerPayloadJson
    });

    if (error) {
      throw error;
    }

    if (body.status === "scheduled" || body.status === "published") {
      await supabaseAdmin
        .from("deliverables")
        .update({ status: body.status })
        .eq("id", deliverable.id);
    }

    return PublicationSchema.parse(await getPublication(publicationId));
  });

  app.patch("/api/publications/:publicationId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const publication = await getPublication((request.params as { publicationId: string }).publicationId);
    const body = UpdatePublicationSchema.parse(request.body);
    await assertWorkspaceRole(viewer, publication.workspaceId, ["owner", "admin", "editor"], request.log);

    if (body.channelAccountId) {
      const account = await getChannelAccount(body.channelAccountId);
      if (account.workspaceId !== publication.workspaceId || account.brandId !== publication.brandId) {
        return reply.badRequest("Channel account does not belong to the target brand/workspace");
      }
    }

    const { error } = await supabaseAdmin
      .from("publications")
      .update({
        channel_account_id: body.channelAccountId ?? null,
        scheduled_for: body.scheduledFor ?? null,
        published_at: body.publishedAt ?? null,
        status: body.status,
        provider: body.provider ?? null,
        provider_publication_id: body.providerPublicationId ?? null,
        provider_payload_json: body.providerPayloadJson,
        error_json: body.errorJson ?? null
      })
      .eq("id", publication.id);

    if (error) {
      throw error;
    }

    await supabaseAdmin
      .from("deliverables")
      .update({
        status: body.status === "published" ? "published" : body.status === "scheduled" ? "scheduled" : undefined
      })
      .eq("id", publication.deliverableId);

    return PublicationSchema.parse(await getPublication(publication.id));
  });
}

function optionalMultipartField(fields: Record<string, string>, key: string) {
  const value = fields[key]?.trim();
  if (!value || value === "null" || value === "undefined") {
    return undefined;
  }

  return value;
}

function normalizeTitle(value: string) {
  const title = value.trim();
  if (title.length >= 2) {
    return title.slice(0, 200);
  }

  return "External uploaded post";
}

function parseUploadDate(value: string | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("scheduledFor must be a valid date");
  }

  return date.toISOString();
}

async function ensureScheduledPublication(params: {
  workspaceId: string;
  brandId: string;
  deliverableId: string;
  postVersionId: string;
  channelAccountId: string | null;
  scheduledFor: string;
  createdBy: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("publications")
    .select("id")
    .eq("deliverable_id", params.deliverableId)
    .eq("post_version_id", params.postVersionId)
    .in("status", ["draft", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const existing = data as { id: string } | null;

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("publications")
      .update({
        channel_account_id: params.channelAccountId,
        scheduled_for: params.scheduledFor,
        status: "scheduled"
      })
      .eq("id", existing.id);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const { error: insertError } = await supabaseAdmin.from("publications").insert({
    id: randomId(),
    workspace_id: params.workspaceId,
    brand_id: params.brandId,
    deliverable_id: params.deliverableId,
    post_version_id: params.postVersionId,
    channel_account_id: params.channelAccountId,
    scheduled_for: params.scheduledFor,
    status: "scheduled",
    provider_payload_json: {
      source: "calendar_schedule"
    }
  });

  if (insertError) {
    throw insertError;
  }
}

async function cleanupExternalUploadArtifacts(params: {
  storagePath: string;
  thumbnailStoragePath?: string | null;
  deliverableId: string;
  creativeRequestId: string;
  promptPackageId: string;
  jobId: string;
  outputId: string;
}) {
  await Promise.allSettled([
    supabaseAdmin.from("creative_outputs").delete().eq("id", params.outputId),
    supabaseAdmin.from("creative_jobs").delete().eq("id", params.jobId),
    supabaseAdmin.from("prompt_packages").delete().eq("id", params.promptPackageId),
    supabaseAdmin.from("creative_requests").delete().eq("id", params.creativeRequestId),
    supabaseAdmin.from("deliverables").delete().eq("id", params.deliverableId),
    removeStorageObjects([params.storagePath, params.thumbnailStoragePath ?? ""])
  ]);
}

async function validateDeliverableRelations(params: {
  workspaceId: string;
  brandId: string;
  projectId?: string | null;
  campaignId?: string | undefined;
  seriesId?: string | undefined;
  personaId?: string | undefined;
  postTypeId: string;
  creativeTemplateId?: string | undefined;
  channelAccountId?: string | undefined;
}) {
  if (params.projectId) {
    const project = await getProject(params.projectId);
    if (project.workspaceId !== params.workspaceId || project.brandId !== params.brandId) {
      throw new Error("Project does not belong to the target brand/workspace");
    }
  }

  if (params.campaignId) {
    const { getCampaign } = await import("../lib/deliverables-repository.js");
    const campaign = await getCampaign(params.campaignId);
    if (campaign.workspaceId !== params.workspaceId || campaign.brandId !== params.brandId) {
      throw new Error("Campaign does not belong to the target brand/workspace");
    }

    const campaignProjectIds = campaign.projectIds.length > 0
      ? campaign.projectIds
      : campaign.primaryProjectId
        ? [campaign.primaryProjectId]
        : [];
    if (params.projectId && campaignProjectIds.length > 0 && !campaignProjectIds.includes(params.projectId)) {
      throw new Error("Project is not part of the selected campaign");
    }
  }

  if (params.seriesId) {
    const series = await getSeries(params.seriesId);
    if (series.workspaceId !== params.workspaceId || series.brandId !== params.brandId) {
      throw new Error("Series does not belong to the target brand/workspace");
    }
  }

  if (params.personaId) {
    const persona = await getBrandPersona(params.personaId);
    if (persona.workspaceId !== params.workspaceId || persona.brandId !== params.brandId) {
      throw new Error("Persona does not belong to the target brand/workspace");
    }
  }

  const postType = await getPostType(params.postTypeId);
  if (postType.workspaceId && postType.workspaceId !== params.workspaceId) {
    throw new Error("Post type does not belong to the target workspace");
  }

  if (params.creativeTemplateId) {
    const template = await getCreativeTemplate(params.creativeTemplateId);
    if (template.workspaceId !== params.workspaceId || template.brandId !== params.brandId) {
      throw new Error("Template does not belong to the target brand/workspace");
    }
  }

  if (params.channelAccountId) {
    const account = await getChannelAccount(params.channelAccountId);
    if (account.workspaceId !== params.workspaceId || account.brandId !== params.brandId) {
      throw new Error("Channel account does not belong to the target brand/workspace");
    }
  }
}
