import type { FastifyInstance } from "fastify";
import {
  CreativeRunDetailSchema,
  CreativeRunSummarySchema,
  CreativeBriefSchema,
  FeedbackRequestSchema,
  FinalGenerationRequestSchema,
  PromptPackageSchema,
  StyleSeedRequestSchema
} from "@image-lab/contracts";
import {
  getBrand,
  getPrimaryWorkspace,
  getPromptPackage,
  getStyleTemplate,
  listBrandAssets,
  assertWorkspaceRole
} from "../lib/repository.js";
import {
  getCalendarItem,
  getCreativeTemplate as getReusableTemplate,
  getFestival,
  getPostType,
  getProject
} from "../lib/planning-repository.js";
import {
  getCampaign,
  getCampaignDeliverablePlan,
  getSeries
} from "../lib/deliverables-repository.js";
import { createSignedUrl } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";
import { submitFinalGeneration, submitStyleSeedGeneration, uploadStoragePathToFal } from "../lib/fal.js";
import { getSignedPreview, refreshJobOutputs } from "../lib/job-sync.js";
import { env } from "../lib/config.js";
import {
  compileDeliverablePromptPackage,
  recordOutputFeedback,
  resolveOrCreateAdHocDeliverable
} from "../lib/deliverable-flow.js";
import { getCreativeRunDetail, listWorkspaceRuns } from "../lib/runs.js";

const MAX_SUPPORTING_REFERENCE_IMAGES = 2;
type RoleAwareReferencePlan = {
  primaryAnchor: { role: "template" | "source_post"; label: string; storagePath: string } | null;
  sourcePost: { role: "source_post"; label: string; storagePath: string } | null;
  references: Array<{ role: "reference"; label: string; storagePath: string }>;
};

export async function registerCreativeRoutes(app: FastifyInstance) {
  app.get("/api/creative/runs", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const runs = await listWorkspaceRuns(workspace.id);
    return runs.map((run) => CreativeRunSummarySchema.parse(run));
  });

  app.get("/api/creative/runs/:runId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const runId = (request.params as { runId: string }).runId;
    let detail = await getCreativeRunDetail(runId);
    await assertWorkspaceRole(viewer, detail.run.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const jobsToRefresh = detail.jobs.filter(
      (job) =>
        job.providerRequestId &&
        job.status !== "failed" &&
        job.status !== "cancelled"
    );

    if (jobsToRefresh.length > 0) {
      await Promise.all(jobsToRefresh.map((job) => refreshJobOutputs(job.id).catch(() => null)));
      detail = await getCreativeRunDetail(runId);
    }

    const [seedPreviewUrls, finalPreviewUrls] = await Promise.all([
      Promise.all(detail.seedTemplates.map((template) => getSignedPreview(template.storagePath))),
      Promise.all(detail.finalOutputs.map((output) => getSignedPreview(output.storagePath)))
    ]);

    return CreativeRunDetailSchema.parse({
      ...detail,
      seedTemplates: detail.seedTemplates.map((template, index) => ({
        ...template,
        previewUrl: seedPreviewUrls[index] ?? undefined
      })),
      finalOutputs: detail.finalOutputs.map((output, index) => ({
        ...output,
        previewUrl: finalPreviewUrls[index] ?? undefined
      }))
    });
  });

  app.post("/api/creative/compile", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const brief = CreativeBriefSchema.parse(request.body);
    const brand = await getBrand(brief.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const [project, postType, reusableTemplate, calendarItem, campaign, series, campaignPlan, sourceOutput, festival] = await Promise.all([
      brief.projectId ? getProject(brief.projectId) : Promise.resolve(null),
      brief.postTypeId ? getPostType(brief.postTypeId) : Promise.resolve(null),
      brief.creativeTemplateId ? getReusableTemplate(brief.creativeTemplateId) : Promise.resolve(null),
      brief.calendarItemId ? getCalendarItem(brief.calendarItemId) : Promise.resolve(null),
      brief.campaignId ? getCampaign(brief.campaignId) : Promise.resolve(null),
      brief.seriesId ? getSeries(brief.seriesId) : Promise.resolve(null),
      brief.campaignPlanId ? getCampaignDeliverablePlan(brief.campaignPlanId) : Promise.resolve(null),
      brief.sourceOutputId
        ? supabaseAdmin
            .from("creative_outputs")
            .select("id, workspace_id, brand_id, storage_path")
            .eq("id", brief.sourceOutputId)
            .maybeSingle()
            .then(({ data }) => data)
        : Promise.resolve(null),
      brief.festivalId ? getFestival(brief.festivalId) : Promise.resolve(null)
    ]);

    if (project && (project.workspaceId !== brand.workspaceId || project.brandId !== brand.id)) {
      return reply.badRequest("Project does not belong to the selected brand/workspace");
    }

    if (postType && postType.workspaceId && postType.workspaceId !== brand.workspaceId) {
      return reply.badRequest("Post type does not belong to the selected workspace");
    }

    if (reusableTemplate && (reusableTemplate.workspaceId !== brand.workspaceId || reusableTemplate.brandId !== brand.id)) {
      return reply.badRequest("Template does not belong to the selected brand/workspace");
    }

    if (calendarItem && (calendarItem.workspaceId !== brand.workspaceId || calendarItem.brandId !== brand.id)) {
      return reply.badRequest("Calendar item does not belong to the selected brand/workspace");
    }

    if (campaign && (campaign.workspaceId !== brand.workspaceId || campaign.brandId !== brand.id)) {
      return reply.badRequest("Campaign does not belong to the selected brand/workspace");
    }

    if (series && (series.workspaceId !== brand.workspaceId || series.brandId !== brand.id)) {
      return reply.badRequest("Series does not belong to the selected brand/workspace");
    }

    if (campaignPlan && !campaign) {
      return reply.badRequest("A campaign is required when selecting a planned asset");
    }

    if (campaignPlan && campaign && campaignPlan.campaignId !== campaign.id) {
      return reply.badRequest("Planned asset does not belong to the selected campaign");
    }

    if (sourceOutput && (sourceOutput.workspace_id !== brand.workspaceId || sourceOutput.brand_id !== brand.id)) {
      return reply.badRequest("Source post does not belong to the selected brand/workspace");
    }

    if (festival && festival.workspaceId && festival.workspaceId !== brand.workspaceId) {
      return reply.badRequest("Festival does not belong to the selected workspace");
    }

    if (postType?.code === "festive-greeting" && !festival) {
      return reply.badRequest("Choose a festival before creating a festive greeting");
    }

    let deliverable;
    try {
      deliverable = await resolveOrCreateAdHocDeliverable({
        brandId: brand.id,
        deliverableId: brief.deliverableId ?? null,
        campaignId: brief.campaignId ?? null,
        campaignPlanId: brief.campaignPlanId ?? null,
        seriesId: brief.seriesId ?? null,
        sourceOutputId: brief.sourceOutputId ?? null,
        projectId: project?.id ?? null,
        postTypeId: postType?.id ?? null,
        creativeTemplateId: reusableTemplate?.id ?? null,
        calendarItemId: calendarItem?.id ?? null,
        brief,
        createdBy: viewer.userId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare a post task for creation";
      if (
        message.includes("Choose a post type") ||
        message.includes("A post type is required")
      ) {
        return reply.badRequest(message);
      }
      throw error;
    }

    let payload;

    try {
      payload = await compileDeliverablePromptPackage({
        deliverableId: deliverable.id,
        viewerUserId: viewer.userId,
        briefOverride: brief
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creative compile failed";

      if (isCompilerConnectionError(message)) {
        return reply.code(503).send({
          statusCode: 503,
          error: "Service Unavailable",
          message: "OpenAI compile service is unavailable right now"
        });
      }

      throw error;
    }

    return PromptPackageSchema.parse(payload);
  });

  app.post("/api/creative/style-seeds", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = StyleSeedRequestSchema.parse(request.body);
    const promptPackage = await getPromptPackage(body.promptPackageId);
    await assertWorkspaceRole(viewer, promptPackage.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const brandAssets = await listBrandAssets(promptPackage.brandId);
    const supportingReferenceAssetIds = promptPackage.referenceAssetIds ?? [];
    const supportingReferenceAssets = sortAssetsByIdOrder(
      brandAssets.filter((asset) => supportingReferenceAssetIds.includes(asset.id)),
      supportingReferenceAssetIds
    ).slice(0, MAX_SUPPORTING_REFERENCE_IMAGES);
    const reusableTemplate =
      promptPackage.creativeTemplateId
        ? await getReusableTemplate(promptPackage.creativeTemplateId).catch(() => null)
        : null;
    const sourceOutputId = getPromptPackageCreateContextValue(promptPackage.compilerTrace, "sourceOutputId");
    const sourceOutput = sourceOutputId
      ? await supabaseAdmin
          .from("creative_outputs")
          .select("id, workspace_id, brand_id, storage_path")
          .eq("id", sourceOutputId)
          .maybeSingle()
          .then(({ data }) => data)
      : null;

    if (sourceOutput && (sourceOutput.workspace_id !== promptPackage.workspaceId || sourceOutput.brand_id !== promptPackage.brandId)) {
      return reply.badRequest("Source post does not belong to the current workspace");
    }

    const referencePlan: RoleAwareReferencePlan = {
      primaryAnchor:
        reusableTemplate?.previewStoragePath
          ? {
              role: "template",
              label: reusableTemplate.name,
              storagePath: reusableTemplate.previewStoragePath
            }
          : sourceOutput?.storage_path
            ? {
                role: "source_post",
                label: "source post",
                storagePath: sourceOutput.storage_path
              }
            : null,
      sourcePost:
        sourceOutput?.storage_path && reusableTemplate?.previewStoragePath
          ? {
              role: "source_post" as const,
              label: "source post",
              storagePath: sourceOutput.storage_path
            }
          : null,
      references: supportingReferenceAssets.map((asset) => ({
        role: "reference" as const,
        label: asset.label,
        storagePath: asset.storagePath
      }))
    };

    const seedReferenceCount =
      (referencePlan.primaryAnchor ? 1 : 0) +
      (referencePlan.sourcePost ? 1 : 0) +
      referencePlan.references.length;
    const seedPromptWithRoles =
      seedReferenceCount > 0
        ? buildRoleAwarePrompt(promptPackage.seedPrompt, referencePlan, "seed")
        : promptPackage.seedPrompt;
    const seedProviderModel = seedReferenceCount > 0 ? env.FAL_FINAL_MODEL : env.FAL_STYLE_SEED_MODEL;
    const jobId = randomId();

    const { error } = await supabaseAdmin.from("creative_jobs").insert({
      id: jobId,
      workspace_id: promptPackage.workspaceId,
      brand_id: promptPackage.brandId,
      deliverable_id: promptPackage.deliverableId,
      project_id: promptPackage.projectId,
      post_type_id: promptPackage.postTypeId,
      creative_template_id: promptPackage.creativeTemplateId,
      calendar_item_id: promptPackage.calendarItemId,
      prompt_package_id: promptPackage.id,
      selected_template_id: null,
      job_type: "style_seed",
      status: "queued",
      provider: "fal",
      provider_model: seedProviderModel,
      requested_count: body.count,
      request_payload: {
        prompt: seedPromptWithRoles,
        aspectRatio: promptPackage.aspectRatio,
        count: body.count,
        referenceCount: seedReferenceCount,
        referenceManifest: {
          primaryAnchorRole: referencePlan.primaryAnchor?.role ?? null,
          primaryAnchorLabel: referencePlan.primaryAnchor?.label ?? null,
          sourcePostIncluded: Boolean(referencePlan.sourcePost),
          supportingReferenceLabels: referencePlan.references.map((reference) => reference.label)
        }
      },
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    let requestInfo: { request_id?: string } | null = null;

    try {
      const referenceUrls: string[] = [];

      if (referencePlan.primaryAnchor) {
        referenceUrls.push(await uploadStoragePathToFal(referencePlan.primaryAnchor.storagePath));
      }

      if (referencePlan.sourcePost) {
        referenceUrls.push(await uploadStoragePathToFal(referencePlan.sourcePost.storagePath));
      }

      if (referencePlan.references.length > 0) {
        const uploadedReferences = await Promise.all(
          referencePlan.references.map((reference) => uploadStoragePathToFal(reference.storagePath))
        );
        referenceUrls.push(...uploadedReferences);
      }

      requestInfo = await submitStyleSeedGeneration(
        {
          id: jobId,
          workspaceId: promptPackage.workspaceId,
          brandId: promptPackage.brandId,
          deliverableId: promptPackage.deliverableId,
          projectId: promptPackage.projectId,
          postTypeId: promptPackage.postTypeId,
          creativeTemplateId: promptPackage.creativeTemplateId,
          calendarItemId: promptPackage.calendarItemId,
          promptPackageId: promptPackage.id,
          selectedTemplateId: null,
          jobType: "style_seed",
          status: "queued",
          provider: "fal",
          providerModel: "fal-ai/nano-banana",
          providerRequestId: null,
          requestedCount: body.count,
          briefContext: null,
          outputs: [],
          error: null
        },
        {
          prompt: seedPromptWithRoles,
          aspectRatio: promptPackage.aspectRatio
        },
        referenceUrls
      );
    } catch (submissionError) {
      const serialized = await failJobSubmission(jobId, submissionError);
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: serialized.message
      });
    }

    const { error: styleJobUpdateError } = await supabaseAdmin
      .from("creative_jobs")
      .update({
        provider_request_id: requestInfo?.request_id ?? null,
        status: "processing",
        submitted_at: new Date().toISOString()
      })
      .eq("id", jobId);

    if (styleJobUpdateError) {
      const serialized = await failJobSubmission(jobId, styleJobUpdateError);
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: serialized.message
      });
    }

    if (promptPackage.deliverableId) {
      await supabaseAdmin
        .from("deliverables")
        .update({ status: "generating" })
        .eq("id", promptPackage.deliverableId);
    }

    if (promptPackage.calendarItemId) {
      await supabaseAdmin
        .from("calendar_items")
        .update({ status: "generating" })
        .eq("id", promptPackage.calendarItemId);
    }

    return { id: jobId, requestId: requestInfo?.request_id ?? null };
  });

  app.post("/api/creative/finals", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = FinalGenerationRequestSchema.parse(request.body);
    const promptPackage = await getPromptPackage(body.promptPackageId);
    await assertWorkspaceRole(viewer, promptPackage.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const jobId = randomId();
    const brandAssets = await listBrandAssets(promptPackage.brandId);
    const supportingReferenceAssetIds = promptPackage.referenceAssetIds ?? [];
    const supportingReferenceAssets = sortAssetsByIdOrder(
      brandAssets.filter((asset) => supportingReferenceAssetIds.includes(asset.id)),
      supportingReferenceAssetIds
    ).slice(0, MAX_SUPPORTING_REFERENCE_IMAGES);
    const selectedTemplate = body.selectedTemplateId ? await getStyleTemplate(body.selectedTemplateId) : null;
    const reusableTemplate =
      !body.selectedTemplateId && promptPackage.creativeTemplateId
        ? await getReusableTemplate(promptPackage.creativeTemplateId).catch(() => null)
        : null;
    const sourceOutputId = getPromptPackageCreateContextValue(promptPackage.compilerTrace, "sourceOutputId");
    const sourceOutput = sourceOutputId
      ? await supabaseAdmin
          .from("creative_outputs")
          .select("id, workspace_id, brand_id, storage_path")
          .eq("id", sourceOutputId)
          .maybeSingle()
          .then(({ data }) => data)
      : null;

    if (selectedTemplate && selectedTemplate.workspaceId !== promptPackage.workspaceId) {
      return reply.badRequest("Selected direction does not belong to this workspace");
    }

    if (sourceOutput && (sourceOutput.workspace_id !== promptPackage.workspaceId || sourceOutput.brand_id !== promptPackage.brandId)) {
      return reply.badRequest("Source post does not belong to the current workspace");
    }

    const referencePlan: RoleAwareReferencePlan = {
      primaryAnchor:
        selectedTemplate?.storagePath
          ? {
              role: "template",
              label: selectedTemplate.label,
              storagePath: selectedTemplate.storagePath
            }
          : reusableTemplate?.previewStoragePath
            ? {
                role: "template",
                label: reusableTemplate.name,
                storagePath: reusableTemplate.previewStoragePath
              }
            : sourceOutput?.storage_path
              ? {
                  role: "source_post",
                  label: "source post",
                  storagePath: sourceOutput.storage_path
                }
              : null,
      sourcePost:
        sourceOutput?.storage_path &&
        !(selectedTemplate === null && reusableTemplate === null)
          ? {
              role: "source_post" as const,
              label: "source post",
              storagePath: sourceOutput.storage_path
            }
          : null,
      references: supportingReferenceAssets.map((asset) => ({
        role: "reference" as const,
        label: asset.label,
        storagePath: asset.storagePath
      }))
    };

    const expectedReferenceCount =
      (referencePlan.primaryAnchor ? 1 : 0) +
      (referencePlan.sourcePost ? 1 : 0) +
      referencePlan.references.length;

    if (expectedReferenceCount === 0) {
      return reply.badRequest("Final generation requires a selected template or uploaded references");
    }

    const finalPromptWithRoles = buildRoleAwarePrompt(promptPackage.finalPrompt, referencePlan, "final");

    const { error } = await supabaseAdmin.from("creative_jobs").insert({
      id: jobId,
      workspace_id: promptPackage.workspaceId,
      brand_id: promptPackage.brandId,
      deliverable_id: promptPackage.deliverableId,
      project_id: promptPackage.projectId,
      post_type_id: promptPackage.postTypeId,
      creative_template_id: promptPackage.creativeTemplateId,
      calendar_item_id: promptPackage.calendarItemId,
      prompt_package_id: promptPackage.id,
      selected_template_id: body.selectedTemplateId ?? null,
      job_type: "final",
      status: "queued",
      provider: "fal",
      provider_model: "fal-ai/nano-banana/edit",
      requested_count: body.count,
      request_payload: {
        prompt: finalPromptWithRoles,
        aspectRatio: promptPackage.aspectRatio,
        count: body.count,
        selectedTemplateId: body.selectedTemplateId ?? null,
        referenceCount: expectedReferenceCount,
        referenceManifest: {
          primaryAnchorRole: referencePlan.primaryAnchor?.role ?? null,
          primaryAnchorLabel: referencePlan.primaryAnchor?.label ?? null,
          sourcePostIncluded: Boolean(referencePlan.sourcePost),
          supportingReferenceLabels: referencePlan.references.map((reference) => reference.label)
        }
      },
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    let requestInfo: { request_id?: string } | null = null;

    try {
      const referenceUrls: string[] = [];

      if (referencePlan.primaryAnchor) {
        referenceUrls.push(await uploadStoragePathToFal(referencePlan.primaryAnchor.storagePath));
      }

      if (referencePlan.sourcePost) {
        referenceUrls.push(await uploadStoragePathToFal(referencePlan.sourcePost.storagePath));
      }

      if (referencePlan.references.length > 0) {
        const uploadedReferences = await Promise.all(
          referencePlan.references.map((reference) => uploadStoragePathToFal(reference.storagePath))
        );
        referenceUrls.push(...uploadedReferences);
      }

      requestInfo = await submitFinalGeneration(
        {
          id: jobId,
          workspaceId: promptPackage.workspaceId,
          brandId: promptPackage.brandId,
          deliverableId: promptPackage.deliverableId,
          projectId: promptPackage.projectId,
          postTypeId: promptPackage.postTypeId,
          creativeTemplateId: promptPackage.creativeTemplateId,
          calendarItemId: promptPackage.calendarItemId,
          promptPackageId: promptPackage.id,
          selectedTemplateId: body.selectedTemplateId ?? null,
          jobType: "final",
          status: "queued",
          provider: "fal",
          providerModel: "fal-ai/nano-banana/edit",
          providerRequestId: null,
          requestedCount: body.count,
          briefContext: null,
          outputs: [],
          error: null
        },
        {
          prompt: finalPromptWithRoles,
          aspectRatio: promptPackage.aspectRatio
        },
        referenceUrls
      );
    } catch (submissionError) {
      const serialized = await failJobSubmission(jobId, submissionError);
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: serialized.message
      });
    }

    const { error: finalJobUpdateError } = await supabaseAdmin
      .from("creative_jobs")
      .update({
        provider_request_id: requestInfo?.request_id ?? null,
        status: "processing",
        submitted_at: new Date().toISOString()
      })
      .eq("id", jobId);

    if (finalJobUpdateError) {
      const serialized = await failJobSubmission(jobId, finalJobUpdateError);
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: serialized.message
      });
    }

    if (promptPackage.deliverableId) {
      await supabaseAdmin
        .from("deliverables")
        .update({ status: "generating" })
        .eq("id", promptPackage.deliverableId);
    }

    if (promptPackage.calendarItemId) {
      await supabaseAdmin
        .from("calendar_items")
        .update({ status: "generating" })
        .eq("id", promptPackage.calendarItemId);
    }

    return { id: jobId, requestId: requestInfo?.request_id ?? null };
  });

  app.get("/api/creative/jobs/:jobId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const jobId = (request.params as { jobId: string }).jobId;
    await refreshJobOutputs(jobId).catch(() => null);

    const { data: job, error: jobError } = await supabaseAdmin
      .from("creative_jobs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, prompt_package_id, selected_template_id, job_type, status, provider, provider_model, provider_request_id, requested_count, error_json"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      throw jobError;
    }

    if (!job) {
      return reply.notFound("Job not found");
    }

    await assertWorkspaceRole(viewer, job.workspace_id, ["owner", "admin", "editor", "viewer"], request.log);
    const promptPackage = await getPromptPackage(job.prompt_package_id);
    const resolved = (promptPackage.resolvedConstraints ?? {}) as Record<string, unknown>;
    const briefContext =
      typeof resolved.channel === "string" && typeof resolved.format === "string"
        ? {
            channel: resolved.channel,
            format: resolved.format,
            aspectRatio: promptPackage.aspectRatio,
            templateType:
              typeof promptPackage.templateType === "string" ? promptPackage.templateType : undefined
          }
        : null;

    const { data: outputs, error: outputsError } = await supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, provider_url, output_index, review_state, latest_feedback_verdict, reviewed_at"
      )
      .eq("job_id", jobId)
      .order("output_index", { ascending: true });

    if (outputsError) {
      throw outputsError;
    }

    const signedUrls = await Promise.all(
      (outputs ?? []).map(async (output) => {
        const outputRow = output as { storage_path: string };
        return createSignedUrl(outputRow.storage_path).catch(() => null);
      })
    );

    return {
      id: job.id,
      workspaceId: job.workspace_id,
      brandId: job.brand_id,
      deliverableId: job.deliverable_id,
      projectId: job.project_id,
      postTypeId: job.post_type_id,
      creativeTemplateId: job.creative_template_id,
      calendarItemId: job.calendar_item_id,
      promptPackageId: job.prompt_package_id,
      selectedTemplateId: job.selected_template_id,
      jobType: job.job_type,
      status: job.status,
      provider: job.provider,
      providerModel: job.provider_model,
      providerRequestId: job.provider_request_id,
      requestedCount: job.requested_count,
      briefContext,
      outputs: (outputs ?? []).map((output, index) => ({
        id: output.id,
        workspaceId: output.workspace_id,
        brandId: output.brand_id,
        deliverableId: output.deliverable_id,
        projectId: output.project_id,
        postTypeId: output.post_type_id,
        creativeTemplateId: output.creative_template_id,
        calendarItemId: output.calendar_item_id,
        jobId: output.job_id,
        postVersionId: output.post_version_id,
        kind: output.kind,
        storagePath: output.storage_path,
        providerUrl: output.provider_url,
        outputIndex: output.output_index,
        reviewState: output.review_state,
        latestVerdict: output.latest_feedback_verdict,
        reviewedAt: output.reviewed_at,
        previewUrl: signedUrls[index] ?? undefined
      })),
      error: job.error_json
    };
  });

  app.post(
    "/api/creative/outputs/:outputId/feedback",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const viewer = request.viewer;
      if (!viewer) {
        return reply.unauthorized();
      }

      const outputId = (request.params as { outputId: string }).outputId;
      const body = FeedbackRequestSchema.parse(request.body);

      const { data: output, error: outputError } = await supabaseAdmin
        .from("creative_outputs")
        .select("id, workspace_id, deliverable_id, calendar_item_id")
        .eq("id", outputId)
        .maybeSingle();

      const outputRow = output as {
        id: string;
        workspace_id: string;
        deliverable_id: string | null;
        calendar_item_id: string | null;
      } | null;

      if (outputError) {
        throw outputError;
      }

      if (!outputRow) {
        return reply.notFound("Output not found");
      }

      await assertWorkspaceRole(
        viewer,
        outputRow.workspace_id,
        ["owner", "admin", "editor", "viewer"],
        request.log
      );

      const result = await recordOutputFeedback({
        outputId,
        verdict: body.verdict,
        reason: body.reason,
        notes: body.notes ?? null,
        createdBy: viewer.userId
      });

      if (outputRow.calendar_item_id) {
        await supabaseAdmin
          .from("calendar_items")
          .update({
            status: result.deliverable.status === "approved" ? "approved" : "review",
            approved_output_id: result.deliverable.status === "approved" ? outputId : null
          })
          .eq("id", outputRow.calendar_item_id);
      }

      return {
        ok: true,
        reviewState:
          result.deliverable.status === "approved"
            ? "approved"
            : result.deliverable.status === "review"
              ? "pending_review"
              : "needs_revision",
        deliverableId: result.deliverable.id,
        postVersionId: result.postVersion.id
      };
    }
  );

  app.get("/api/creative/templates/:templateId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const templateId = (request.params as { templateId: string }).templateId;
    const template = await getStyleTemplate(templateId);
    await assertWorkspaceRole(viewer, template.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const previewUrl = await getSignedPreview(template.storagePath);
    let jobId: string | null = null;

    if (template.creativeOutputId) {
      const { data: output, error } = await supabaseAdmin
        .from("creative_outputs")
        .select("job_id")
        .eq("id", template.creativeOutputId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      jobId = (output as { job_id: string } | null)?.job_id ?? null;
    }

    return {
      ...template,
      jobId,
      previewUrl: previewUrl ?? undefined
    };
  });

  app.get("/api/creative/outputs/:outputId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const outputId = (request.params as { outputId: string }).outputId;
    const { data, error } = await supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, provider_url, output_index, review_state, latest_feedback_verdict, reviewed_at"
      )
      .eq("id", outputId)
      .maybeSingle();

    const output = data as
      | {
          id: string;
          workspace_id: string;
          brand_id: string;
          deliverable_id: string | null;
          project_id: string | null;
          post_type_id: string | null;
          creative_template_id: string | null;
          calendar_item_id: string | null;
          job_id: string;
          post_version_id: string | null;
          kind: "style_seed" | "final";
          storage_path: string;
          provider_url: string | null;
          output_index: number;
          review_state: "pending_review" | "approved" | "needs_revision" | "closed";
          latest_feedback_verdict: "approved" | "close" | "off-brand" | "wrong-layout" | "wrong-text" | null;
          reviewed_at: string | null;
        }
      | null;

    if (error) {
      throw error;
    }

    if (!output) {
      return reply.notFound("Output not found");
    }

    await assertWorkspaceRole(viewer, output.workspace_id, ["owner", "admin", "editor", "viewer"], request.log);

    const previewUrl = await getSignedPreview(output.storage_path);

    return {
      id: output.id,
      workspaceId: output.workspace_id,
      brandId: output.brand_id,
      deliverableId: output.deliverable_id,
      projectId: output.project_id,
      postTypeId: output.post_type_id,
      creativeTemplateId: output.creative_template_id,
      calendarItemId: output.calendar_item_id,
      jobId: output.job_id,
      postVersionId: output.post_version_id,
      kind: output.kind,
      storagePath: output.storage_path,
      providerUrl: output.provider_url,
      outputIndex: output.output_index,
      reviewState: output.review_state,
      latestVerdict: output.latest_feedback_verdict,
      reviewedAt: output.reviewed_at,
      previewUrl: previewUrl ?? undefined
    };
  });
}

function sortAssetsByIdOrder<T extends { id: string }>(assets: T[], orderedIds: string[]) {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...assets].sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));
}

function buildRoleAwarePrompt(
  basePrompt: string,
  plan: RoleAwareReferencePlan,
  mode: "seed" | "final"
) {
  const roleLines: string[] = [];

  if (plan.primaryAnchor?.role === "template") {
    roleLines.push(
      `Image 1 is the master template anchor (${plan.primaryAnchor.label}). Use it for layout language, spacing, hierarchy, safe zones, and overall design system. Do not copy its exact text, logo, or content.`
    );
  } else if (plan.primaryAnchor?.role === "source_post") {
    roleLines.push(
      "Image 1 is the source post. Preserve its core subject, framing intent, and visual identity while creating a refined new version."
    );
  }

  if (plan.sourcePost) {
    const sourcePostIndex = plan.primaryAnchor ? 2 : 1;
    roleLines.push(
      `Image ${sourcePostIndex} is the source post. Preserve its core subject and message, but restyle it using the primary template anchor.`
    );
  }

  if (plan.references.length > 0) {
    const startingIndex = (plan.primaryAnchor ? 1 : 0) + (plan.sourcePost ? 1 : 0) + 1;
    const referenceLabels = plan.references
      .map((reference, index) => `Image ${startingIndex + index}: ${reference.label}`)
      .join("; ");
    roleLines.push(
      `${referenceLabels}. Use these only as supporting references for architecture, materials, lighting, mood, and context. Do not let them override the template layout system.`
    );
  }

  roleLines.push(
    "When images conflict, follow the template or source anchor for structure first, then use supporting references for subject detail and realism."
  );

  if (mode === "seed") {
    roleLines.push(
      "This is a style exploration image. Prioritize composition, mood, pacing, and graphic language over dense copy."
    );
    roleLines.push(
      "Keep any on-canvas text extremely sparse. Do not include sample website text, page numbers, mock social handles, placeholder logos, or copied slogans from the input images."
    );
  } else {
    roleLines.push(
      "Treat any text, logos, URLs, page numbers, handles, and placeholder brand names visible in the input images as scaffolding only. Do not reproduce or remix them in the output."
    );
    roleLines.push(
      "Do not include sample website text, pagination markers, mock social handles, placeholder logos, or copied slogans from the reference images."
    );
    roleLines.push(
      "Keep on-canvas typography minimal, clean, and legible. If supporting copy cannot be rendered cleanly, omit it instead of generating garbled text."
    );
    roleLines.push(
      "Only render new text that matches the requested concept. Never copy literal words from the input images unless the prompt explicitly asks for them."
    );
  }

  roleLines.push("Keep the number of visual anchors low and synthesize them into one coherent output.");

  return `${basePrompt} ${roleLines.join(" ")}`.trim();
}

function isCompilerConnectionError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("openai api") ||
    normalized.includes("api connection error") ||
    normalized.includes("connection error")
  );
}

function getPromptPackageCreateContextValue(
  compilerTrace: Record<string, unknown> | null | undefined,
  key: "sourceOutputId"
) {
  const createContext =
    compilerTrace && typeof compilerTrace === "object" && compilerTrace.createContext && typeof compilerTrace.createContext === "object"
      ? (compilerTrace.createContext as Record<string, unknown>)
      : null;

  const value = createContext?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function failJobSubmission(jobId: string, error: unknown) {
  const serialized = serializeSubmissionError(error);

  await supabaseAdmin
    .from("creative_jobs")
    .update({
      status: "failed",
      error_json: serialized
    })
    .eq("id", jobId);

  return serialized;
}

function serializeSubmissionError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  const dnsCode = getDnsErrorCode(error);

  if (dnsCode === "ENOTFOUND") {
    return {
      message: "Fal API could not be reached from this machine. Check DNS, VPN, firewall, or internet access and try again.",
      statusCode: 503,
      code: dnsCode
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: statusCode ?? 500
    };
  }

  return {
    message: "Fal request failed",
    statusCode: statusCode ?? 500
  };
}

function getErrorStatusCode(error: unknown) {
  if (!isRecord(error)) {
    return null;
  }

  if (typeof error.status === "number") {
    return error.status;
  }

  if (typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if (isRecord(error.cause) && typeof error.cause.status === "number") {
    return error.cause.status;
  }

  return null;
}

function getDnsErrorCode(error: unknown) {
  if (!isRecord(error)) {
    return null;
  }

  if (typeof error.code === "string") {
    return error.code;
  }

  if (isRecord(error.cause) && typeof error.cause.code === "string") {
    return error.cause.code;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
