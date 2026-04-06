import type { FastifyInstance } from "fastify";
import {
  ApprovalDecisionSchema,
  CreateDeliverableSchema,
  CreatePostVersionSchema,
  CreatePublicationSchema,
  DeliverableDetailSchema,
  DeliverableSchema,
  PostVersionSchema,
  PublicationSchema,
  ReviewQueueEntrySchema,
  UpdateDeliverableSchema,
  UpdatePublicationSchema
} from "@image-lab/contracts";
import { assertWorkspaceRole, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import {
  applyApprovalDecision,
  compileDeliverablePromptPackage,
  ensurePostVersionForOutput
} from "../lib/deliverable-flow.js";
import { getSignedPreview } from "../lib/job-sync.js";
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
import { mapCreativeFormatToContentFormat } from "../lib/deliverable-utils.js";
import { getCreativeTemplate, getPostType, getProject } from "../lib/planning-repository.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";

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

  app.patch("/api/deliverables/:deliverableId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const deliverable = await getDeliverable((request.params as { deliverableId: string }).deliverableId);
    const body = UpdateDeliverableSchema.parse(request.body);
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
    const query = request.query as { brandId?: string; deliverableId?: string };
    const items = await listReviewQueue(workspace.id, query.brandId, query.deliverableId);
    const signedItems = await Promise.all(
      items.map(async (item) => ({
        ...item,
        previewOutput: item.previewOutput
          ? {
              ...item.previewOutput,
              previewUrl: (await getSignedPreview(item.previewOutput.storagePath)) ?? undefined
            }
          : null
      }))
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
