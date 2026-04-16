import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type CreativeJobRecord,
  type BrandAssetRecord,
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
  getActiveBrandProfile,
  getPrimaryWorkspace,
  getPromptPackage,
  getStyleTemplate,
  listBrandAssets,
  assertWorkspaceRole
} from "../lib/repository.js";
import {
  getCalendarItem,
  getCreativeTemplate as getReusableTemplate,
  getCreativeTemplateDetail,
  getActiveProjectProfile,
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
import { getFinalProviderModel, getStyleSeedProviderModel, resolveImageGenerationProvider, submitFinalGeneration, submitStyleSeedGeneration } from "../lib/image-provider.js";
import { getSignedPreview, persistCompletedJobImages, refreshJobOutputs } from "../lib/job-sync.js";
import { env } from "../lib/config.js";
import {
  compileDeliverablePromptPackage,
  recordOutputFeedback,
  resolveOrCreateAdHocDeliverable
} from "../lib/deliverable-flow.js";
import {
  buildInferredReferenceSelection,
  inferAmenityNameFromAssetParts,
  isAmenityFocusedPostType,
  isAmenityReferenceAsset
} from "../lib/creative-reference-selection.js";
import { buildPostTypePromptGuidance } from "../lib/post-type-prompt-guidance.js";
import { getCreativeRunDetail, listWorkspaceRuns } from "../lib/runs.js";
import { compilePromptPackageV2, normalizeCreativeBriefForCompilation } from "../lib/creative-director.js";

const MAX_SUPPORTING_REFERENCE_IMAGES = 2;
const CreativeCompileV2RequestSchema = CreativeBriefSchema.extend({
  variationCount: z.number().int().min(1).max(6).optional()
});
const StyleSeedV2RequestSchema = z.object({
  promptPackage: PromptPackageSchema,
  variationCount: z.number().int().min(1).max(6).optional()
});

type RoleAwareReferencePlan = {
  primaryAnchor: { role: "template" | "source_post"; label: string; storagePath: string } | null;
  sourcePost: { role: "source_post"; label: string; storagePath: string } | null;
  amenityAnchor: { role: "amenity_image"; label: string; storagePath: string; amenityName: string | null } | null;
  projectAnchor: { role: "project_image"; label: string; storagePath: string } | null;
  brandLogo: { role: "brand_logo"; label: string; storagePath: string } | null;
  complianceQr: { role: "rera_qr"; label: string; storagePath: string } | null;
  references: Array<{ role: "reference"; label: string; storagePath: string }>;
};

function scoreProjectAnchorAsset(asset: BrandAssetRecord) {
  const metadata = asset.metadataJson ?? {};
  let score = 0;

  const usageIntent = typeof metadata.usageIntent === "string" ? metadata.usageIntent.toLowerCase() : "";
  if (usageIntent === "truth_anchor") score += 200;

  const qualityTier = typeof metadata.qualityTier === "string" ? metadata.qualityTier.toLowerCase() : "";
  if (qualityTier === "hero") score += 40;

  const viewType = typeof metadata.viewType === "string" ? metadata.viewType.toLowerCase() : "";
  if (["wide", "facade", "aerial", "street", "site"].includes(viewType)) score += 20;
  if (["close_up", "detail"].includes(viewType)) score -= 15;

  const subjectType = typeof metadata.subjectType === "string" ? metadata.subjectType.toLowerCase() : "";
  if (["project_exterior", "construction_progress"].includes(subjectType)) score += 30;
  if (["amenity", "interior", "sample_flat", "lifestyle"].includes(subjectType)) score -= 20;

  const label = asset.label.toLowerCase();
  if (/(hero|facade|elevation|tower|front|wide|aerial)/.test(label)) score += 15;
  if (/(close|detail|interior|amenity|lobby)/.test(label)) score -= 10;
  if (/(construction|site)/.test(label)) score += 5;

  return score;
}

function resolveProjectAnchorAsset(
  brandAssets: BrandAssetRecord[],
  projectImageAssetIds: string[],
  supportingReferenceAssetIds: string[]
) {
  if (projectImageAssetIds.length === 0) return null;
  const rank = new Map(projectImageAssetIds.map((id, index) => [id, index]));
  const projectAssets = brandAssets.filter((asset) => projectImageAssetIds.includes(asset.id));
  if (projectAssets.length === 0) return null;

  const explicitProjectRefs = supportingReferenceAssetIds.filter((id) => projectImageAssetIds.includes(id));
  const explicitAssets = projectAssets.filter((asset) => explicitProjectRefs.includes(asset.id));
  const candidates = explicitAssets.length > 0 ? explicitAssets : projectAssets;

  return (
    candidates.reduce<{ asset: BrandAssetRecord; score: number } | null>((best, asset) => {
      const score = scoreProjectAnchorAsset(asset);
      if (!best) return { asset, score };
      if (score > best.score) return { asset, score };
      if (score === best.score && (rank.get(asset.id) ?? 999) < (rank.get(best.asset.id) ?? 999)) {
        return { asset, score };
      }
      return best;
    }, null)?.asset ?? null
  );
}

function scoreAmenityAnchorAsset(asset: BrandAssetRecord, focusAmenity: string | null) {
  const metadata = asset.metadataJson ?? {};
  let score = 0;

  const subjectType = typeof metadata.subjectType === "string" ? metadata.subjectType.toLowerCase() : "";
  if (subjectType === "amenity") score += 200;

  const amenityName = inferAmenityNameFromAssetParts(asset.label, metadata);
  if (amenityName) score += 80;

  const qualityTier = typeof metadata.qualityTier === "string" ? metadata.qualityTier.toLowerCase() : "";
  if (qualityTier === "hero") score += 40;

  const usageIntent = typeof metadata.usageIntent === "string" ? metadata.usageIntent.toLowerCase() : "";
  if (usageIntent === "truth_anchor") score += 20;

  const viewType = typeof metadata.viewType === "string" ? metadata.viewType.toLowerCase() : "";
  if (["interior", "wide", "street"].includes(viewType)) score += 10;

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const haystack = `${asset.label} ${amenityName ?? ""} ${tags.join(" ")}`.toLowerCase();
  if (focusAmenity) {
    const normalizedFocus = focusAmenity.trim().toLowerCase();
    if (haystack.includes(normalizedFocus)) {
      score += 250;
    } else {
      const partialMatches = normalizedFocus
        .split(/[^a-z0-9]+/g)
        .filter((token) => token.length > 2 && haystack.includes(token)).length;
      score += partialMatches * 35;
    }
  }

  if (/(pool|gym|lounge|clubhouse|terrace|garden|amphitheater|theatre|cafe|deck|play|plaza|cricket|jacuzzi)/.test(haystack)) {
    score += 20;
  }

  return score;
}

function resolveAmenityAnchorAsset(
  orderedReferenceAssets: BrandAssetRecord[],
  amenityAssetIds: string[],
  focusAmenity: string | null
) {
  if (orderedReferenceAssets.length === 0) return null;
  if (focusAmenity && amenityAssetIds.length === 0) return null;

  const rank = new Map(orderedReferenceAssets.map((asset, index) => [asset.id, index]));
  const candidates = amenityAssetIds.length > 0
    ? orderedReferenceAssets.filter((asset) => amenityAssetIds.includes(asset.id))
    : orderedReferenceAssets.filter((asset) => isAmenityReferenceAsset(asset));
  if (candidates.length === 0) return null;

  return (
    candidates.reduce<{ asset: BrandAssetRecord; score: number } | null>((best, asset) => {
      const score = scoreAmenityAnchorAsset(asset, focusAmenity);
      if (!best) return { asset, score };
      if (score > best.score) return { asset, score };
      if (score === best.score && (rank.get(asset.id) ?? 999) < (rank.get(best.asset.id) ?? 999)) {
        return { asset, score };
      }
      return best;
    }, null)?.asset ?? null
  );
}

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

    const [project, postType, reusableTemplateDetail, calendarItem, campaign, series, campaignPlan, sourceOutput, festival] = await Promise.all([
      brief.projectId ? getProject(brief.projectId) : Promise.resolve(null),
      brief.postTypeId ? getPostType(brief.postTypeId) : Promise.resolve(null),
      brief.creativeTemplateId ? getCreativeTemplateDetail(brief.creativeTemplateId) : Promise.resolve(null),
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

    const reusableTemplate = reusableTemplateDetail?.template ?? null;
    const reusableTemplateAssets = reusableTemplateDetail?.assets ?? [];

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

  app.post("/api/creative/compile-v2", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const parsedBrief = CreativeCompileV2RequestSchema.parse(request.body);
    const { brief, autoCopyStripped } = normalizeCreativeBriefForCompilation(parsedBrief);
    const brand = await getBrand(brief.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const [project, postType, reusableTemplateDetail, calendarItem, campaign, series, campaignPlan, sourceOutput, festival] = await Promise.all([
      brief.projectId ? getProject(brief.projectId) : Promise.resolve(null),
      brief.postTypeId ? getPostType(brief.postTypeId) : Promise.resolve(null),
      brief.creativeTemplateId ? getCreativeTemplateDetail(brief.creativeTemplateId) : Promise.resolve(null),
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

    const reusableTemplate = reusableTemplateDetail?.template ?? null;
    const reusableTemplateAssets = reusableTemplateDetail?.assets ?? [];

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

    if (!postType) {
      return reply.badRequest("Choose a post type before compiling v2 prompts");
    }

    if (postType.code === "festive-greeting" && !festival) {
      return reply.badRequest("Choose a festival before creating a festive greeting");
    }

    const [brandProfileVersion, allAssets, projectProfileVersion] = await Promise.all([
      getActiveBrandProfile(brand.id),
      listBrandAssets(brand.id),
      project ? getActiveProjectProfile(project.id).catch(() => null) : Promise.resolve(null)
    ]);

    const isFestiveGreeting = postType.code === "festive-greeting" && Boolean(festival);
    const projectActualImages = Array.isArray(projectProfileVersion?.profile.actualProjectImageIds)
      ? projectProfileVersion?.profile.actualProjectImageIds
      : [];
    const projectSampleImages = Array.isArray(projectProfileVersion?.profile.sampleFlatImageIds)
      ? projectProfileVersion?.profile.sampleFlatImageIds
      : [];
    const brandReferenceImages = Array.isArray(brandProfileVersion.profile.referenceAssetIds)
      ? brandProfileVersion.profile.referenceAssetIds
      : [];
    const postTypeGuidance = buildPostTypePromptGuidance({
      brandName: brand.name,
      brief,
      postType: {
        code: postType.code,
        name: postType.name,
        config: postType.config
      },
      projectName: project?.name ?? null,
      projectProfile: projectProfileVersion?.profile ?? null,
      brandAssets: allAssets,
      projectId: project?.id ?? null
    });
    const inferredReferenceSelection = buildInferredReferenceSelection({
      postTypeCode: postType.code,
      isFestiveGreeting,
      explicitReferenceAssetIds: brief.referenceAssetIds,
      projectImageAssetIds: projectActualImages,
      sampleFlatImageIds: projectSampleImages,
      brandReferenceAssetIds: brandReferenceImages,
      allAssets,
      projectId: project?.id ?? null,
      focusAmenity: postTypeGuidance.manifest.amenityFocus ?? null,
    });
    const inferredReferenceAssetIds = inferredReferenceSelection.referenceAssetIds;
    const referenceAssets = sortAssetsByIdOrder(
      allAssets.filter((asset) => inferredReferenceAssetIds.includes(asset.id)),
      inferredReferenceAssetIds
    );
    const explicitLogoAsset =
      brief.logoAssetId
        ? allAssets.find((asset) => asset.id === brief.logoAssetId && asset.kind === "logo") ?? null
        : null;
    const selectedBrandLogoAsset = brief.includeBrandLogo
      ? explicitLogoAsset ?? allAssets.find((asset) => asset.kind === "logo") ?? null
      : null;
    const selectedReraQrAsset = brief.includeReraQr ? allAssets.find((asset) => asset.kind === "rera_qr") ?? null : null;

    let compiled;
    try {
      compiled = await compilePromptPackageV2({
        workspaceId: brand.workspaceId,
        brandName: brand.name,
        brandProfile: brandProfileVersion.profile,
        brandAssets: allAssets,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        projectStage: project?.stage ?? null,
        projectProfile: projectProfileVersion?.profile ?? null,
        festival,
        postType: {
          code: postType.code,
          name: postType.name,
          config: postType.config
        },
        template: reusableTemplate
          ? {
              id: reusableTemplate.id,
              name: reusableTemplate.name,
              channel: reusableTemplate.channel,
              format: reusableTemplate.format,
              basePrompt: reusableTemplate.basePrompt,
              config: reusableTemplate.config,
              linkedAssets: reusableTemplateAssets.map((asset) => ({
                assetId: asset.assetId,
                role: asset.role
              }))
            }
          : null,
        templateAssets: reusableTemplateAssets.map((asset) => ({
          assetId: asset.assetId,
          role: asset.role
        })),
        calendarItem: calendarItem
          ? {
              title: calendarItem.title,
              objective: calendarItem.objective,
              scheduledFor: calendarItem.scheduledFor,
              status: calendarItem.status
            }
          : null,
        series: series
          ? {
              id: series.id,
              name: series.name,
              description: series.description,
              contentFormat: series.contentFormat,
              sourceBriefJson: series.sourceBriefJson
            }
          : null,
        deliverableSnapshot: null,
        brief,
        referenceLabels: referenceAssets.map((asset) => asset.label),
        variationCount: brief.variationCount ?? env.CREATIVE_STYLE_VARIATION_COUNT
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creative v2 compile failed";
      request.log.error({ error }, "creative v2 compile failed");
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: isCompilerConnectionError(message)
          ? "OpenAI compile v2 service is unavailable right now"
          : `Prompt compiler v2 failed: ${message}`
      });
    }

    const now = Date.now();
    const promptPackage = {
      id: randomId(),
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      deliverableId: null,
      projectId: project?.id ?? null,
      postTypeId: postType.id,
      postType: {
        code: postType.code,
        name: postType.name,
        config: postType.config
      },
      creativeTemplateId: reusableTemplate?.id ?? null,
      calendarItemId: calendarItem?.id ?? null,
      creativeRequestId: randomId(),
      brandProfileVersionId: brandProfileVersion.id,
      promptSummary: compiled.promptSummary,
      seedPrompt: compiled.seedPrompt,
      finalPrompt: compiled.finalPrompt,
      aspectRatio: compiled.aspectRatio,
      chosenModel: compiled.chosenModel,
      templateType: compiled.templateType,
      referenceStrategy: compiled.referenceStrategy,
      referenceAssetIds: inferredReferenceAssetIds,
      variations: compiled.variations ?? [],
      resolvedConstraints: {
        ...compiled.resolvedConstraints,
        projectImageAssetIds: projectProfileVersion?.profile.actualProjectImageIds ?? [],
        sampleFlatImageIds: projectProfileVersion?.profile.sampleFlatImageIds ?? [],
        amenityImageAssetIds: inferredReferenceSelection.amenityAssetIds,
        includeBrandLogo: brief.includeBrandLogo,
        includeReraQr: brief.includeReraQr,
        brandLogoAssetId: selectedBrandLogoAsset?.id ?? null,
        brandLogoLabel: selectedBrandLogoAsset?.label ?? null,
        reraQrAssetId: selectedReraQrAsset?.id ?? null,
        reraQrLabel: selectedReraQrAsset?.label ?? null
      },
      compilerTrace: {
        ...compiled.compilerTrace,
        sourceBrief: brief,
        preview: true,
        previewId: `preview_v2_${now}`,
        endpoint: "/api/creative/compile-v2",
        persisted: false,
        postTypeCode: postType.code,
        promptDetailMode: "poster-spec",
        autoCopySanitized: autoCopyStripped,
        referenceRolePlan: {
          hasPrimaryAnchor: Boolean(reusableTemplate || sourceOutput),
          hasAmenityAnchorCandidate: inferredReferenceSelection.amenityAssetIds.length > 0,
          hasProjectAnchorCandidate: projectActualImages.length > 0,
          secondaryReferenceCount: Math.max(0, referenceAssets.length - inferredReferenceSelection.amenityAssetIds.length),
          includeBrandLogo: brief.includeBrandLogo,
          includeReraQr: brief.includeReraQr
        }
      }
    };

    return PromptPackageSchema.parse(promptPackage);
  });

  app.post("/api/creative/compile-v2-async", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const parsedBrief = CreativeCompileV2RequestSchema.parse(request.body);
    const brand = await getBrand(parsedBrief.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const sessionToken = request.headers.authorization?.replace("Bearer ", "") || "";
    const { data: compileJob, error: jobError } = await supabaseAdmin
      .from("compile_jobs")
      .insert({
        workspace_id: brand.workspaceId,
        brand_id: brand.id,
        status: "pending",
        input_brief: parsedBrief,
        session_token: sessionToken
      })
      .select("id")
      .single();

    if (jobError) {
      request.log.error({ error: jobError }, "failed to create compile job");
      return reply.code(500).send({ error: "Failed to create compile job" });
    }

    const jobId = compileJob.id;

    // Trigger the Edge Function to process the job
    fetch(`${env.SUPABASE_URL}/functions/v1/process-compile-jobs`, {
      method: "POST"
    }).catch(() => {
      // Non-blocking - job will be picked up on next poll
    });

    return { jobId, status: "pending" };
  });

  app.get("/api/creative/compile-v2-async/:jobId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const { jobId } = request.params as { jobId: string };

    const { data: compileJob, error: jobError } = await supabaseAdmin
      .from("compile_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !compileJob) {
      return reply.notFound();
    }

    const brand = await getBrand(compileJob.brand_id);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    if (compileJob.status === "completed") {
      return { status: "completed", result: compileJob.result };
    }

    if (compileJob.status === "failed") {
      return { status: "failed", error: compileJob.error_json };
    }

    return { status: compileJob.status as "pending" | "processing" };
  });

  app.post("/api/creative/style-seeds-v2", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = StyleSeedV2RequestSchema.parse(request.body);
    let promptPackage = body.promptPackage;
    const brand = await getBrand(promptPackage.brandId);

    if (promptPackage.workspaceId !== brand.workspaceId) {
      return reply.badRequest("Prompt package does not belong to the selected brand/workspace");
    }

    await assertWorkspaceRole(viewer, promptPackage.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const requestedVariationCount = body.variationCount ?? env.CREATIVE_STYLE_VARIATION_COUNT;
    const variations = (promptPackage.variations.length > 0
      ? promptPackage.variations
      : [
          {
            id: "variation_1",
            title: "Primary route",
            strategy: "Primary route",
            seedPrompt: promptPackage.seedPrompt,
            finalPrompt: promptPackage.finalPrompt,
            referenceStrategy: promptPackage.referenceStrategy,
            resolvedConstraints: {},
            compilerTrace: {}
          }
        ]).slice(0, requestedVariationCount);

    const sourceBriefParse = CreativeBriefSchema.safeParse(promptPackage.compilerTrace.sourceBrief);
    if (!sourceBriefParse.success) {
      return reply.badRequest("V2 prompt package is missing its source brief. Recompile before generating options.");
    }

    const { data: persistedPromptPackage, error: persistedPromptPackageError } = await supabaseAdmin
      .from("prompt_packages")
      .select("deliverable_id")
      .eq("id", promptPackage.id)
      .maybeSingle();
    if (persistedPromptPackageError) {
      throw persistedPromptPackageError;
    }
    const persistedDeliverableId =
      typeof persistedPromptPackage?.deliverable_id === "string" ? persistedPromptPackage.deliverable_id : null;

    let deliverable;
    try {
      deliverable = await resolveOrCreateAdHocDeliverable({
        brandId: promptPackage.brandId,
        deliverableId: sourceBriefParse.data.deliverableId ?? promptPackage.deliverableId ?? persistedDeliverableId,
        campaignId: sourceBriefParse.data.campaignId ?? null,
        campaignPlanId: sourceBriefParse.data.campaignPlanId ?? null,
        seriesId: sourceBriefParse.data.seriesId ?? null,
        sourceOutputId: sourceBriefParse.data.sourceOutputId ?? null,
        projectId: promptPackage.projectId,
        postTypeId: promptPackage.postTypeId,
        creativeTemplateId: promptPackage.creativeTemplateId,
        calendarItemId: promptPackage.calendarItemId,
        brief: sourceBriefParse.data,
        createdBy: viewer.userId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare a post task for v2 options";
      if (
        message.includes("Choose a post type") ||
        message.includes("A post type is required")
      ) {
        return reply.badRequest(message);
      }
      throw error;
    }

    promptPackage = {
      ...promptPackage,
      deliverableId: deliverable.id
    };

    const { error: creativeRequestError } = await supabaseAdmin.from("creative_requests").upsert(
      {
        id: promptPackage.creativeRequestId,
        workspace_id: promptPackage.workspaceId,
        brand_id: promptPackage.brandId,
        deliverable_id: deliverable.id,
        project_id: promptPackage.projectId,
        post_type_id: promptPackage.postTypeId,
        creative_template_id: promptPackage.creativeTemplateId,
        status: "compiled",
        brief_json: sourceBriefParse.data,
        created_by: viewer.userId
      },
      { onConflict: "id" }
    );

    if (creativeRequestError) {
      throw creativeRequestError;
    }

    const { error: promptPackageError } = await supabaseAdmin.from("prompt_packages").upsert(
      {
        id: promptPackage.id,
        workspace_id: promptPackage.workspaceId,
        brand_id: promptPackage.brandId,
        deliverable_id: promptPackage.deliverableId,
        project_id: promptPackage.projectId,
        post_type_id: promptPackage.postTypeId,
        creative_template_id: promptPackage.creativeTemplateId,
        calendar_item_id: promptPackage.calendarItemId,
        creative_request_id: promptPackage.creativeRequestId,
        brand_profile_version_id: promptPackage.brandProfileVersionId,
        prompt_summary: promptPackage.promptSummary,
        seed_prompt: promptPackage.seedPrompt,
        final_prompt: promptPackage.finalPrompt,
        aspect_ratio: promptPackage.aspectRatio,
        chosen_model: promptPackage.chosenModel,
        template_type: promptPackage.templateType ?? null,
        reference_strategy: promptPackage.referenceStrategy,
        reference_asset_ids: promptPackage.referenceAssetIds,
        resolved_constraints: promptPackage.resolvedConstraints,
        compiler_trace: {
          ...promptPackage.compilerTrace,
          variations,
          v2PostOptionGeneration: true
        },
        created_by: viewer.userId
      },
      { onConflict: "id" }
    );

    if (promptPackageError) {
      throw promptPackageError;
    }

    const brandAssets = await listBrandAssets(promptPackage.brandId);
    const sourceBrief = getPromptPackageSourceBrief(promptPackage);
    const supportingReferenceAssetIds = promptPackage.referenceAssetIds ?? sourceBrief?.referenceAssetIds ?? [];
    const {
      amenityAnchorAsset,
      projectAnchorAsset,
      secondaryReferenceAssets,
      brandLogoAsset,
      complianceQrAsset
    } = resolvePromptPackageReferenceAssets(promptPackage, brandAssets, supportingReferenceAssetIds);
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
      amenityAnchor: amenityAnchorAsset
        ? {
            role: "amenity_image" as const,
            label: amenityAnchorAsset.label,
            storagePath: amenityAnchorAsset.storagePath,
            amenityName: inferAmenityNameFromAssetParts(amenityAnchorAsset.label, amenityAnchorAsset.metadataJson ?? {}) ?? null
          }
        : null,
      projectAnchor: projectAnchorAsset
        ? {
            role: "project_image" as const,
            label: projectAnchorAsset.label,
            storagePath: projectAnchorAsset.storagePath
          }
        : null,
      brandLogo: brandLogoAsset
        ? {
            role: "brand_logo" as const,
            label: brandLogoAsset.label,
            storagePath: brandLogoAsset.storagePath
          }
        : null,
      complianceQr: complianceQrAsset
        ? {
            role: "rera_qr" as const,
            label: complianceQrAsset.label,
            storagePath: complianceQrAsset.storagePath
          }
        : null,
      references: secondaryReferenceAssets.map((asset) => ({
        role: "reference" as const,
        label: asset.label,
        storagePath: asset.storagePath
      }))
    };

    const referenceStoragePaths = collectReferenceStoragePaths(referencePlan);
    const filteredRefs = filterReferenceStoragePathsForPrompt(
      referencePlan,
      variations[0]?.finalPrompt ?? "",
      getPostTypeCode(promptPackage) ?? "default"
    );
    const finalReferenceCount = filteredRefs.length;
    const optionProvider = resolveImageGenerationProvider();
    const optionProviderModel = getFinalProviderModel(finalReferenceCount);
    const v2OptionBatchId = randomId();
    const preparedOptionJobs = variations.map((variation) => {
      const jobId = randomId();
      const optionPromptWithRoles =
        finalReferenceCount > 0
          ? buildV2RoleAwarePrompt(variation.finalPrompt, referencePlan, "final", getPostTypeCode(promptPackage))
          : variation.finalPrompt;
      const optionJob: CreativeJobRecord = {
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
        jobType: "final" as const,
        status: "queued" as const,
        provider: optionProvider,
        providerModel: optionProviderModel,
        providerRequestId: null,
        requestedCount: 1,
        briefContext: null,
        outputs: [],
        error: null
      };

      return {
        jobId,
        variationId: variation.id,
        variationTitle: variation.title,
        variationStrategy: variation.strategy,
        optionPromptWithRoles,
        optionJob
      };
    });

    const { error } = await supabaseAdmin.from("creative_jobs").insert(
      preparedOptionJobs.map(({ jobId, variationId, variationTitle, variationStrategy, optionPromptWithRoles }) => ({
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
        job_type: "final",
        status: "queued",
        provider: optionProvider,
        provider_model: optionProviderModel,
        requested_count: 1,
        request_payload: {
          prompt: optionPromptWithRoles,
          aspectRatio: promptPackage.aspectRatio,
          count: 1,
          v2OptionBatchId,
          variationId,
          variationTitle,
          variationStrategy,
          referenceCount: finalReferenceCount
        },
        created_by: viewer.userId
      }))
    );

    if (error) {
      throw error;
    }

    const jobs: Array<{ id: string; variationId: string; variationTitle: string; requestId: string | null }> = [];

    if (optionProvider === "openrouter") {
      for (const { jobId, variationId, variationTitle, optionPromptWithRoles, optionJob } of preparedOptionJobs) {
        let requestInfo: { request_id: string } | null = null;

        requestInfo = { request_id: `openrouter-v2-option-${jobId}` };

        const { error: optionJobUpdateError } = await supabaseAdmin
          .from("creative_jobs")
          .update({
            provider_request_id: requestInfo.request_id,
            status: "processing",
            submitted_at: new Date().toISOString()
          })
          .eq("id", jobId);

        if (optionJobUpdateError) {
          const serialized = await failJobSubmission(jobId, optionJobUpdateError);
          return reply.code(503).send({
            statusCode: 503,
            error: "Service Unavailable",
            message: serialized.message
          });
        }

        void runImmediateProviderJob({
          job: {
            ...optionJob,
            providerRequestId: requestInfo.request_id,
            status: "processing"
          },
          prompt: optionPromptWithRoles,
          aspectRatio: promptPackage.aspectRatio,
          referenceStoragePaths,
          mode: "final",
          referencePlan,
          postTypeCode: getPostTypeCode(promptPackage)
        });

        jobs.push({
          id: jobId,
          variationId,
          variationTitle,
          requestId: requestInfo?.request_id ?? null
        });
      }
    } else {
      const submissionResults = await Promise.all(
        preparedOptionJobs.map(async ({ jobId, variationId, variationTitle, optionPromptWithRoles, optionJob }) => {
          try {
            const requestInfo = await submitFinalGeneration(
              optionJob,
              {
                prompt: optionPromptWithRoles,
                aspectRatio: promptPackage.aspectRatio
              },
              filteredRefs
            );

            const { error: optionJobUpdateError } = await supabaseAdmin
              .from("creative_jobs")
              .update({
                provider_request_id: requestInfo?.request_id ?? null,
                status: "processing",
                submitted_at: new Date().toISOString()
              })
              .eq("id", jobId);

            if (optionJobUpdateError) {
              const serialized = await failJobSubmission(jobId, optionJobUpdateError);
              return {
                status: "failed" as const,
                id: jobId,
                variationId,
                variationTitle,
                requestId: null,
                error: serialized
              };
            }

            return {
              status: "accepted" as const,
              id: jobId,
              variationId,
              variationTitle,
              requestId: requestInfo?.request_id ?? null
            };
          } catch (submissionError) {
            const serialized = await failJobSubmission(jobId, submissionError);
            return {
              status: "failed" as const,
              id: jobId,
              variationId,
              variationTitle,
              requestId: null,
              error: serialized
            };
          }
        })
      );

      jobs.push(
        ...submissionResults.map(({ id, variationId, variationTitle, requestId }) => ({
          id,
          variationId,
          variationTitle,
          requestId
        }))
      );

      if (!submissionResults.some((result) => result.status === "accepted")) {
        const firstFailure = submissionResults.find((result) => result.status === "failed");
        return reply.code(503).send({
          statusCode: 503,
          error: "Service Unavailable",
          message: firstFailure?.error.message ?? "Image generation request failed"
        });
      }
    }

    if (jobs.some((job) => job.requestId)) {
      await supabaseAdmin
        .from("deliverables")
        .update({ status: "generating" })
        .eq("id", deliverable.id);

      if (promptPackage.calendarItemId) {
        await supabaseAdmin
          .from("calendar_items")
          .update({ status: "generating" })
          .eq("id", promptPackage.calendarItemId);
      }
    }

    return {
      promptPackageId: promptPackage.id,
      jobs
    };
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
    const sourceBrief = getPromptPackageSourceBrief(promptPackage);
    const supportingReferenceAssetIds = promptPackage.referenceAssetIds ?? sourceBrief?.referenceAssetIds ?? [];
    const {
      amenityAnchorAsset,
      projectAnchorAsset,
      secondaryReferenceAssets,
      brandLogoAsset,
      complianceQrAsset
    } = resolvePromptPackageReferenceAssets(promptPackage, brandAssets, supportingReferenceAssetIds);
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
      amenityAnchor: amenityAnchorAsset
        ? {
            role: "amenity_image" as const,
            label: amenityAnchorAsset.label,
            storagePath: amenityAnchorAsset.storagePath,
            amenityName: inferAmenityNameFromAssetParts(amenityAnchorAsset.label, amenityAnchorAsset.metadataJson ?? {}) ?? null
          }
        : null,
      projectAnchor: projectAnchorAsset
        ? {
            role: "project_image" as const,
            label: projectAnchorAsset.label,
            storagePath: projectAnchorAsset.storagePath
          }
        : null,
      brandLogo: brandLogoAsset
        ? {
            role: "brand_logo" as const,
            label: brandLogoAsset.label,
            storagePath: brandLogoAsset.storagePath
          }
        : null,
      complianceQr: complianceQrAsset
        ? {
            role: "rera_qr" as const,
            label: complianceQrAsset.label,
            storagePath: complianceQrAsset.storagePath
          }
        : null,
      references: secondaryReferenceAssets.map((asset) => ({
        role: "reference" as const,
        label: asset.label,
        storagePath: asset.storagePath
      }))
    };
    const referenceStoragePaths = collectReferenceStoragePaths(referencePlan);
    const seedReferenceCount = referenceStoragePaths.length;
    const seedPromptWithRoles =
      seedReferenceCount > 0
        ? isV2PromptPackage(promptPackage)
          ? buildV2RoleAwarePrompt(promptPackage.seedPrompt, referencePlan, "seed", getPostTypeCode(promptPackage))
          : buildRoleAwarePrompt(promptPackage.seedPrompt, referencePlan, "seed")
        : promptPackage.seedPrompt;
    const seedProvider = resolveImageGenerationProvider();
    const seedProviderModel = getStyleSeedProviderModel(seedReferenceCount);
    const jobId = randomId();
    const styleSeedJob: CreativeJobRecord = {
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
      jobType: "style_seed" as const,
      status: "queued" as const,
      provider: seedProvider,
      providerModel: seedProviderModel,
      providerRequestId: null,
      requestedCount: body.count,
      briefContext: null,
      outputs: [],
      error: null
    };

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
      provider: seedProvider,
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
          amenityAnchorIncluded: Boolean(referencePlan.amenityAnchor),
          amenityAnchorLabel: referencePlan.amenityAnchor?.label ?? null,
          amenityAnchorName: referencePlan.amenityAnchor?.amenityName ?? null,
          projectAnchorIncluded: Boolean(referencePlan.projectAnchor),
          projectAnchorLabel: referencePlan.projectAnchor?.label ?? null,
          brandLogoIncluded: Boolean(referencePlan.brandLogo),
          brandLogoLabel: referencePlan.brandLogo?.label ?? null,
          complianceQrIncluded: Boolean(referencePlan.complianceQr),
          complianceQrLabel: referencePlan.complianceQr?.label ?? null,
          supportingReferenceLabels: referencePlan.references.map((reference) => reference.label)
        }
      },
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    let requestInfo: { request_id: string } | null = null;

    if (seedProvider === "openrouter") {
      requestInfo = { request_id: `openrouter-style-seed-${jobId}` };

      const { error: styleJobUpdateError } = await supabaseAdmin
        .from("creative_jobs")
        .update({
          provider_request_id: requestInfo.request_id,
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

      void runImmediateProviderJob({
        job: {
          ...styleSeedJob,
          providerRequestId: requestInfo.request_id,
          status: "processing"
        },
        prompt: seedPromptWithRoles,
        aspectRatio: promptPackage.aspectRatio,
        referenceStoragePaths,
        mode: "seed",
        referencePlan,
        postTypeCode: getPostTypeCode(promptPackage)
      });
    } else {
      const filteredRefs = filterReferenceStoragePathsForPrompt(referencePlan, seedPromptWithRoles, getPostTypeCode(promptPackage) ?? "default");
      try {
        requestInfo = await submitStyleSeedGeneration(
          styleSeedJob,
          {
            prompt: seedPromptWithRoles,
            aspectRatio: promptPackage.aspectRatio
          },
          filteredRefs
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
    const {
      amenityAnchorAsset,
      projectAnchorAsset,
      secondaryReferenceAssets,
      brandLogoAsset,
      complianceQrAsset
    } = resolvePromptPackageReferenceAssets(promptPackage, brandAssets, supportingReferenceAssetIds);
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
      amenityAnchor: amenityAnchorAsset
        ? {
            role: "amenity_image" as const,
            label: amenityAnchorAsset.label,
            storagePath: amenityAnchorAsset.storagePath,
            amenityName: inferAmenityNameFromAssetParts(amenityAnchorAsset.label, amenityAnchorAsset.metadataJson ?? {}) ?? null
          }
        : null,
      projectAnchor: projectAnchorAsset
        ? {
            role: "project_image" as const,
            label: projectAnchorAsset.label,
            storagePath: projectAnchorAsset.storagePath
          }
        : null,
      brandLogo: brandLogoAsset
        ? {
            role: "brand_logo" as const,
            label: brandLogoAsset.label,
            storagePath: brandLogoAsset.storagePath
          }
        : null,
      complianceQr: complianceQrAsset
        ? {
            role: "rera_qr" as const,
            label: complianceQrAsset.label,
            storagePath: complianceQrAsset.storagePath
          }
        : null,
      references: secondaryReferenceAssets.map((asset) => ({
        role: "reference" as const,
        label: asset.label,
        storagePath: asset.storagePath
      }))
    };
    const finalPromptWithRoles = isV2PromptPackage(promptPackage)
      ? buildV2RoleAwarePrompt(promptPackage.finalPrompt, referencePlan, "final", getPostTypeCode(promptPackage))
      : buildRoleAwarePrompt(promptPackage.finalPrompt, referencePlan, "final");
    const referenceStoragePaths = collectReferenceStoragePaths(referencePlan);
    const filteredRefs = filterReferenceStoragePathsForPrompt(
      referencePlan,
      finalPromptWithRoles,
      getPostTypeCode(promptPackage) ?? "default"
    );
    const expectedReferenceCount = filteredRefs.length;
    const finalProvider = resolveImageGenerationProvider();
    const finalProviderModel = getFinalProviderModel(expectedReferenceCount);
    const finalJobRecord: CreativeJobRecord = {
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
      jobType: "final" as const,
      status: "queued" as const,
      provider: finalProvider,
      providerModel: finalProviderModel,
      providerRequestId: null,
      requestedCount: body.count,
      briefContext: null,
      outputs: [],
      error: null
    };

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
      provider: finalProvider,
      provider_model: finalProviderModel,
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
          amenityAnchorIncluded: Boolean(referencePlan.amenityAnchor),
          amenityAnchorLabel: referencePlan.amenityAnchor?.label ?? null,
          amenityAnchorName: referencePlan.amenityAnchor?.amenityName ?? null,
          projectAnchorIncluded: Boolean(referencePlan.projectAnchor),
          projectAnchorLabel: referencePlan.projectAnchor?.label ?? null,
          supportingReferenceLabels: referencePlan.references.map((reference) => reference.label)
        }
      },
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    let requestInfo: { request_id: string } | null = null;

    if (finalProvider === "openrouter") {
      requestInfo = { request_id: `openrouter-final-${jobId}` };

      const { error: finalJobUpdateError } = await supabaseAdmin
        .from("creative_jobs")
        .update({
          provider_request_id: requestInfo.request_id,
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

      void runImmediateProviderJob({
        job: {
          ...finalJobRecord,
          providerRequestId: requestInfo.request_id,
          status: "processing"
        },
        prompt: finalPromptWithRoles,
        aspectRatio: promptPackage.aspectRatio,
        referenceStoragePaths,
        mode: "final",
        referencePlan,
        postTypeCode: getPostTypeCode(promptPackage)
      });
    } else {
      try {
        requestInfo = await submitFinalGeneration(
          finalJobRecord,
          {
            prompt: finalPromptWithRoles,
            aspectRatio: promptPackage.aspectRatio
          },
          filteredRefs
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

  if (plan.amenityAnchor) {
    roleLines.push(
      `Use the amenity as the hero subject. Preserve its function, spatial cues, materiality, and lifestyle context. Do not switch to a different facility or amenity type.`
    );
  }

  if (plan.projectAnchor) {
    roleLines.push(
      plan.amenityAnchor
        ? `Use the project reference for building identity and architectural context only. It must not replace the amenity as the hero subject.`
        : `Use the project building reference for subject truth. Preserve its tower identity, facade rhythm, massing, proportions, podium composition, balcony language, and overall silhouette.`
    );
  }

  if (plan.brandLogo) {
    roleLines.push(
      `Use the brand logo as a small integrated footer/signature element. Match the exact lockup, shape, colors, and spacing. Blend it into a quiet designed logo zone with proper margin, scale, and tonal harmony so it feels part of the composition, never like a pasted sticker or floating overlay. Do not redraw, stylize, or invent a replacement.`
    );
  }

  if (plan.complianceQr) {
    roleLines.push(
      `Use the RERA QR as a small compliance element. Match the exact QR matrix. Keep it flat, unobstructed, and legible. Do not stylize or decorate.`
    );
  }

  if (plan.references.length > 0) {
    roleLines.push(
      `Use any additional references only for architecture, materials, lighting, mood, and context. Do not let them override the hero subject.`
    );
  }

  if (plan.amenityAnchor && plan.projectAnchor) {
    roleLines.push(
      "Use the amenity reference for the hero subject and the project reference only for brand-truth context."
    );
  } else if (plan.projectAnchor) {
    roleLines.push(
      "When images conflict, preserve the project reference for subject truth first, then use other references only for mood, realism, and finishing detail."
    );
  } else {
    roleLines.push(
      "When images conflict, follow the template or source anchor for structure first, then use supporting references for subject detail and realism."
    );
  }

  if (plan.brandLogo) {
    roleLines.push(
      mode === "seed"
        ? "During style exploration, either place the supplied logo exactly as provided inside a quiet integrated footer/signature zone or keep its reserved area blank. It must never feel like a pasted sticker, floating badge, or top-layer overlay. Never generate a mock logo, substitute emblem, or placeholder footer mark."
        : "Use the supplied logo only in a quiet integrated footer/signature zone with proper margin, scale, and tonal harmony. It must feel built into the layout, not pasted on top. If it cannot be rendered cleanly, keep it small and simple rather than inventing a distorted or incorrect logo mark."
    );
  }

  if (plan.complianceQr) {
    roleLines.push(
      mode === "seed"
        ? "During style exploration, either place the supplied RERA QR exactly as provided or keep its reserved area blank. Never generate a fake QR, barcode, badge, or placeholder compliance block."
        : "Treat the RERA QR as a compliance artifact, not decoration. Keep a quiet surrounding area so it remains scannable."
    );
  }

  if (mode === "seed") {
    roleLines.push(
      "This is a style exploration image. Prioritize composition, mood, pacing, and graphic language over dense copy."
    );
    roleLines.push(
      "Each output image must contain one complete concept only. Do not return a contact sheet, multi-panel board, tiled grid, collage of alternatives, or several poster variations inside a single frame."
    );
    roleLines.push(
      "Keep any on-canvas text extremely sparse. Do not include sample website text, page numbers, mock social handles, placeholder logos, or copied slogans from the input images."
    );
    if (plan.projectAnchor) {
      roleLines.push(
        "Even during style exploration, keep the actual building recognizable. Do not drift into a different generic tower or invented property facade."
      );
    }
    if (plan.amenityAnchor) {
      roleLines.push(
        "Even during style exploration, keep the same amenity type. Do not turn the chosen lounge, pool, gym, or terrace into a different facility."
      );
    }
  } else {
    roleLines.push(
      "Return one finished design per output image. Never create multiple alternate posters, tiled mini-designs, contact sheets, mood boards, or side-by-side concepts inside the same frame."
    );
    roleLines.push(
      "Treat any text, logos, URLs, page numbers, handles, and placeholder brand names visible in the template, source-post, project, or supporting reference images as scaffolding only. Do not reproduce or remix them in the output. The only exceptions are the dedicated supplied brand logo and dedicated supplied RERA QR reference images, which must be used exactly as provided when enabled."
    );
    roleLines.push(
      "Do not include sample website text, pagination markers, mock social handles, placeholder logos, or copied slogans from the reference images."
    );
    roleLines.push(
      "Keep on-canvas typography minimal, clean, and legible. If supporting copy cannot be rendered cleanly, omit it instead of generating garbled text."
    );
    roleLines.push(
      "Only render new text that matches the requested concept. Never copy literal words from the input images unless the prompt explicitly asks for them or they are part of the dedicated supplied brand logo / compliance reference assets."
    );
    if (plan.projectAnchor) {
      roleLines.push(
        "Do not replace the supplied project tower or facade with a different generic building. Keep the property identity visibly recognizable."
      );
    }
    if (plan.amenityAnchor) {
      roleLines.push(
        "Do not swap the supplied amenity for a different one. Keep the chosen amenity visibly consistent with the reference."
      );
    }
  }

  roleLines.push("Keep the number of visual anchors low and synthesize them into one coherent output.");

  return `${basePrompt} ${roleLines.join(" ")}`.trim();
}

function isV2PromptPackage(promptPackage: { compilerTrace?: Record<string, unknown> }) {
  const trace = promptPackage.compilerTrace ?? {};
  return (
    trace.endpoint === "/api/creative/compile-v2" ||
    trace.pipeline === "v2-notebook-two-agent" ||
    trace.v2PostOptionGeneration === true ||
    trace.v2StyleSeedGeneration === true
  );
}

function buildV2RoleAwarePrompt(
  basePrompt: string,
  plan: RoleAwareReferencePlan,
  mode: "seed" | "final",
  postTypeCode?: string
) {
  const roleLines: string[] = [];
  
  const heroRef = getHeroReferenceForPostType(plan, postTypeCode ?? "default");
  const firstHeroRef = heroRef[0];
  const heroAsset = firstHeroRef ? getAssetForPath(plan, firstHeroRef) : null;

  if (heroAsset) {
    const asset = heroAsset;
    if (asset.role === "amenity_image") {
      roleLines.push(
        `Use the amenity as the hero subject. Preserve its function, spatial cues, materiality, and lifestyle context. Do not switch to a different facility or amenity type.`
      );
    } else if (asset.role === "project_image") {
      roleLines.push(
        `Use the project building as the primary reference. Preserve its tower identity, facade rhythm, massing, proportions, and overall silhouette.`
      );
    } else if (asset.role === "template") {
      roleLines.push(
        `Use the template for layout rhythm and safe-zone discipline.`
      );
    } else if (asset.role === "source_post") {
      roleLines.push(
        `Preserve the source post's core subject and framing intent.`
      );
    }
  }

  if (plan.primaryAnchor?.role === "template") {
    roleLines.push(
      `Use the template reference (${plan.primaryAnchor.label}) for layout rhythm, safe-zone planning, overlay discipline, spacing, and footer structure only. Do not copy its literal text, brand names, or placeholder content.`
    );
  } else if (plan.primaryAnchor?.role === "source_post") {
    roleLines.push(
      `Use the source-post reference (${plan.primaryAnchor.label}) only for framing intent and compositional structure. Do not copy its literal text or branding.`
    );
  }

  if (postTypeCode === "amenity-spotlight" && !plan.amenityAnchor && plan.projectAnchor) {
    roleLines.push(
      "No exact amenity reference image was supplied for the requested facility. Generate the amenity scene without using a mismatched amenity or building image as the hero reference."
    );
    roleLines.push(
      "Do not substitute a different amenity, facility, park, lawn, pool, plaza, or building facade from any reference image."
    );
  } else if (plan.projectAnchor && plan.amenityAnchor) {
    roleLines.push(
      "Use the amenity reference for the hero subject and use the project reference only for brand-truth context."
    );
  } else if (plan.projectAnchor && !heroAsset) {
    roleLines.push(
      `Use the project building reference (${plan.projectAnchor.label}) for project identity and architectural context.`
    );
  }

  if (plan.brandLogo) {
    roleLines.push(
      `Use the brand logo (${plan.brandLogo.label}) as a small integrated footer/signature element. Match the exact lockup, shape, colors, and spacing. Blend it into a quiet designed logo zone with proper margin, scale, and tonal harmony so it feels built into the layout, never pasted on top.`
    );
  }

  if (plan.complianceQr) {
    roleLines.push(
      `Use the RERA QR (${plan.complianceQr.label}) as a small compliance element if needed.`
    );
  }

  if (plan.references.length > 0) {
    roleLines.push(
      "If an additional style or context reference is supplied, use it only for layout rhythm, overlay discipline, material language, atmosphere, or premium finishing detail. It must never override the hero subject."
    );
  }

  roleLines.push(
    mode === "seed"
      ? "One complete style direction only; no grid, collage, contact sheet, or multiple poster options."
      : "One finished design only; keep text minimal, clean, and legible."
  );

  if (plan.projectAnchor) {
    roleLines.push("Do not replace the supplied project with a different generic building.");
  }

  return `${basePrompt} ${roleLines.join(" ")}`.trim();
}

function getAssetForPath(plan: RoleAwareReferencePlan, storagePath: string): { role: string; label: string } | null {
  if (plan.primaryAnchor?.storagePath === storagePath) return { role: plan.primaryAnchor.role, label: plan.primaryAnchor.label };
  if (plan.sourcePost?.storagePath === storagePath) return { role: plan.sourcePost.role, label: plan.sourcePost.label };
  if (plan.amenityAnchor?.storagePath === storagePath) return { role: "amenity_image", label: plan.amenityAnchor.label };
  if (plan.projectAnchor?.storagePath === storagePath) return { role: "project_image", label: plan.projectAnchor.label };
  if (plan.brandLogo?.storagePath === storagePath) return { role: "brand_logo", label: plan.brandLogo.label };
  if (plan.complianceQr?.storagePath === storagePath) return { role: "rera_qr", label: plan.complianceQr.label };
  const reference = plan.references.find((entry) => entry.storagePath === storagePath);
  if (reference) return { role: "reference", label: reference.label };
  return null;
}

function getPostTypeCode(promptPackage: { postType?: { code: string }; resolvedConstraints?: Record<string, unknown>; compilerTrace?: Record<string, unknown>; postTypeId?: string | null }): string {
  if (promptPackage.postType?.code) {
    return promptPackage.postType.code;
  }
  if (typeof promptPackage.resolvedConstraints?.postTypeCode === "string") {
    return promptPackage.resolvedConstraints.postTypeCode;
  }
  if (typeof promptPackage.compilerTrace?.postTypeCode === "string") {
    return promptPackage.compilerTrace.postTypeCode as string;
  }
  return "default";
}

function collectReferenceStoragePaths(plan: RoleAwareReferencePlan) {
  return [
    plan.primaryAnchor?.storagePath,
    plan.sourcePost?.storagePath,
    plan.amenityAnchor?.storagePath,
    plan.projectAnchor?.storagePath,
    plan.brandLogo?.storagePath,
    plan.complianceQr?.storagePath,
    ...plan.references.map((reference) => reference.storagePath)
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function filterReferenceStoragePathsForPrompt(
  plan: RoleAwareReferencePlan,
  _prompt: string,
  postTypeCode: string
): string[] {
  const alwaysInclude = [
    plan.brandLogo?.storagePath,
    plan.complianceQr?.storagePath
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  const heroReference: string[] = [];
  const secondaryReference: string[] = [];
  const pushSecondary = (value: string | null | undefined) => {
    if (!value || heroReference.includes(value) || secondaryReference.includes(value)) {
      return;
    }
    secondaryReference.push(value);
  };
  if (postTypeCode === "amenity-spotlight") {
    if (plan.amenityAnchor?.storagePath) {
      heroReference.push(plan.amenityAnchor.storagePath);
    }
    pushSecondary(plan.projectAnchor?.storagePath);
  } else if (postTypeCode === "construction-update" || postTypeCode === "project-launch") {
    if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "sample-flat-showcase" || postTypeCode === "site-visit-invite") {
    if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "location-advantage") {
    if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "testimonial") {
    if (plan.primaryAnchor?.storagePath) {
      heroReference.push(plan.primaryAnchor.storagePath);
    } else if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "festive-greeting") {
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else {
    // Default: include amenity and project
    if (plan.amenityAnchor?.storagePath) heroReference.push(plan.amenityAnchor.storagePath);
    if (plan.projectAnchor?.storagePath) heroReference.push(plan.projectAnchor.storagePath);
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  }

  const result = [...heroReference, ...secondaryReference.slice(0, 1), ...alwaysInclude];
  console.log(`[filterReferenceStoragePathsForPrompt] postTypeCode=${postTypeCode}, heroRef=${heroReference.length}, alwaysInclude=${alwaysInclude.length}, total=${result.length}, paths=${JSON.stringify(result)}`);
  return result;
}

function getHeroReferenceForPostType(plan: RoleAwareReferencePlan, postTypeCode: string): string[] {
  switch (postTypeCode) {
    case "amenity-spotlight":
      return plan.amenityAnchor?.storagePath 
        ? [plan.amenityAnchor.storagePath]
        : [];
    
    case "construction-update":
    case "project-launch":
      return plan.projectAnchor?.storagePath
        ? [plan.projectAnchor.storagePath]
        : [];
    
    case "sample-flat-showcase":
    case "site-visit-invite":
      return plan.projectAnchor?.storagePath
        ? [plan.projectAnchor.storagePath]
        : [];

    case "location-advantage":
      return [
        plan.projectAnchor?.storagePath,
        plan.primaryAnchor?.storagePath
      ].filter((v): v is string => typeof v === "string" && v.length > 0);

    case "testimonial":
      return [
        plan.primaryAnchor?.storagePath,
        plan.projectAnchor?.storagePath
      ].filter((v): v is string => typeof v === "string" && v.length > 0);
    
    case "festive-greeting":
      return plan.primaryAnchor?.storagePath
        ? [plan.primaryAnchor.storagePath]
        : [];
    
    default:
      return [
        plan.amenityAnchor?.storagePath,
        plan.projectAnchor?.storagePath,
        plan.primaryAnchor?.storagePath
      ].filter((v): v is string => typeof v === "string" && v.length > 0);
  }
}

async function runImmediateProviderJob({
  job,
  prompt,
  aspectRatio,
  referenceStoragePaths,
  mode,
  referencePlan,
  postTypeCode
}: {
  job: CreativeJobRecord;
  prompt: string;
  aspectRatio: string;
  referenceStoragePaths: string[];
  mode: "seed" | "final";
  referencePlan?: RoleAwareReferencePlan;
  postTypeCode?: string;
}) {
  console.log(`[runImmediateProviderJob] mode=${mode}, referencePlan=${!!referencePlan}, postTypeCode=${postTypeCode}, originalRefCount=${referenceStoragePaths.length}`);
  const filteredRefs = (referencePlan && postTypeCode)
    ? filterReferenceStoragePathsForPrompt(referencePlan, prompt, postTypeCode)
    : referenceStoragePaths;
  console.log(`[runImmediateProviderJob] filteredRefs count=${filteredRefs.length}: ${JSON.stringify(filteredRefs)}`);
  try {
    const result =
      mode === "seed"
        ? await submitStyleSeedGeneration(
            job,
            {
              prompt,
              aspectRatio
            },
            filteredRefs
          )
        : await submitFinalGeneration(
            job,
            {
              prompt,
              aspectRatio
            },
            filteredRefs
          );

    if (!result.images || result.images.length === 0) {
      throw new Error("Image generation completed but returned no images");
    }

    await persistCompletedJobImages(
      {
        id: job.id,
        workspace_id: job.workspaceId,
        brand_id: job.brandId,
        deliverable_id: job.deliverableId,
        project_id: job.projectId,
        post_type_id: job.postTypeId,
        creative_template_id: job.creativeTemplateId,
        calendar_item_id: job.calendarItemId,
        prompt_package_id: job.promptPackageId,
        selected_template_id: job.selectedTemplateId,
        job_type: job.jobType,
        status: "completed",
        provider: job.provider,
        provider_model: result.providerModel,
        provider_request_id: result.request_id ?? job.providerRequestId,
        requested_count: job.requestedCount,
        error_json: null
      },
      result.images
    );

    await supabaseAdmin
      .from("creative_jobs")
      .update({
        provider_request_id: result.request_id ?? job.providerRequestId,
        provider_model: result.providerModel,
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", job.id);
  } catch (error) {
    await failJobSubmission(job.id, error);
  }
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

function getPromptPackageProjectImageAssetIds(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const value = resolvedConstraints.projectImageAssetIds;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function getPromptPackageAmenityImageAssetIds(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const value = resolvedConstraints.amenityImageAssetIds;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function getPromptPackageResolvedAssetId(
  promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined },
  key: "brandLogoAssetId" | "reraQrAssetId"
) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const value = resolvedConstraints[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getPromptPackageUsesProjectImage(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const postTypeGuidance =
    resolvedConstraints.postTypeGuidance && typeof resolvedConstraints.postTypeGuidance === "object"
      ? (resolvedConstraints.postTypeGuidance as Record<string, unknown>)
      : null;
  return postTypeGuidance?.usesProjectImage === true;
}

function getPromptPackagePostTypeGuidance(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  return resolvedConstraints.postTypeGuidance && typeof resolvedConstraints.postTypeGuidance === "object"
    ? (resolvedConstraints.postTypeGuidance as Record<string, unknown>)
    : null;
}

function getPromptPackagePostTypeCode(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const postTypeGuidance = getPromptPackagePostTypeGuidance(promptPackage);
  return typeof postTypeGuidance?.code === "string" && postTypeGuidance.code.length > 0 ? postTypeGuidance.code : null;
}

function getPromptPackageAmenityFocus(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const postTypeGuidance = getPromptPackagePostTypeGuidance(promptPackage);
  return typeof postTypeGuidance?.amenityFocus === "string" && postTypeGuidance.amenityFocus.trim().length > 0
    ? postTypeGuidance.amenityFocus.trim()
    : null;
}

function getPromptPackageSourceBrief(
  promptPackage: { compilerTrace?: Record<string, unknown> | null | undefined }
) {
  const parsed = CreativeBriefSchema.safeParse(promptPackage.compilerTrace?.sourceBrief);
  return parsed.success ? parsed.data : null;
}

function resolvePromptPackageReferenceAssets(
  promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined },
  brandAssets: BrandAssetRecord[],
  supportingReferenceAssetIds: string[]
) {
  const orderedReferenceAssets = sortAssetsByIdOrder(
    brandAssets.filter((asset) => supportingReferenceAssetIds.includes(asset.id)),
    supportingReferenceAssetIds
  );
  const postTypeCode = getPromptPackagePostTypeCode(promptPackage);
  const amenityAssetIds = getPromptPackageAmenityImageAssetIds(promptPackage);
  const amenityFocus = getPromptPackageAmenityFocus(promptPackage);
  const amenityAnchorAsset =
    isAmenityFocusedPostType(postTypeCode)
      ? resolveAmenityAnchorAsset(orderedReferenceAssets, amenityAssetIds, amenityFocus)
      : null;
  const projectImageAssetIds = getPromptPackageProjectImageAssetIds(promptPackage);
  const usesProjectImage = getPromptPackageUsesProjectImage(promptPackage);
  const projectAnchorAsset =
    usesProjectImage && projectImageAssetIds.length > 0
      ? resolveProjectAnchorAsset(brandAssets, projectImageAssetIds, supportingReferenceAssetIds)
      : null;
  const secondaryReferenceAssets = orderedReferenceAssets
    .filter((asset) => asset.id !== amenityAnchorAsset?.id && asset.id !== projectAnchorAsset?.id)
    .slice(0, MAX_SUPPORTING_REFERENCE_IMAGES);
  const brandLogoAssetId = getPromptPackageResolvedAssetId(promptPackage, "brandLogoAssetId");
  const reraQrAssetId = getPromptPackageResolvedAssetId(promptPackage, "reraQrAssetId");

  return {
    amenityAnchorAsset,
    projectAnchorAsset,
    secondaryReferenceAssets,
    brandLogoAsset: brandLogoAssetId ? brandAssets.find((asset) => asset.id === brandLogoAssetId) ?? null : null,
    complianceQrAsset: reraQrAssetId ? brandAssets.find((asset) => asset.id === reraQrAssetId) ?? null : null,
  };
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
      message: "The image generation service could not be reached from this machine. Check DNS, VPN, firewall, or internet access and try again.",
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
    message: "Image generation request failed",
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
