import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type CreativeJobRecord,
  type BrandAssetRecord,
  type CreativeBrief,
  type CreativeOutputRecord,
  type ProjectReraRegistrationRecord,
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
  listProjectReraRegistrations,
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
import { createSignedImageUrls } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { deriveAspectRatio, randomId } from "../lib/utils.js";
import {
  getFinalProviderModel,
  getStyleSeedProviderModel,
  isImmediateImageProvider,
  resolveImageGenerationProvider,
  submitFinalGeneration,
  submitStyleSeedGeneration
} from "../lib/image-provider.js";
import { getSignedPreview, persistCompletedJobImages, refreshJobOutputs } from "../lib/job-sync.js";
import { env } from "../lib/config.js";
import {
  isInsufficientWorkspaceCreditsError,
  isReservationAlreadySettledError,
  releaseWorkspaceCreditReservation,
  reserveWorkspaceCredits,
  settleWorkspaceCreditReservation
} from "../lib/credits.js";
import {
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
import {
  buildCanonicalV2AgentPayload,
  compilePromptPackageV2,
  normalizeCreativeBriefForCompilation
} from "../lib/creative-director.js";

const MAX_SUPPORTING_REFERENCE_IMAGES = 2;
const CreativeCompileV2RequestSchema = CreativeBriefSchema.extend({
  variationCount: z.number().int().min(1).max(6).optional()
});
const GenerateOptionsRequestSchema = z.object({
  promptPackage: PromptPackageSchema,
  variationCount: z.number().int().min(1).max(6).optional()
});
const CreativeOutputsQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
  reviewState: z.enum(["pending_review", "approved", "needs_revision", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(48),
  offset: z.coerce.number().int().min(0).default(0)
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

async function prepareV2CompileContext(params: {
  parsedBrief: z.infer<typeof CreativeCompileV2RequestSchema>;
  viewer: any;
  request: any;
  allowedRoles: Array<"owner" | "admin" | "editor" | "viewer">;
}) {
  const { brief, autoCopyStripped } = normalizeCreativeBriefForCompilation(params.parsedBrief);
  const brand = await getBrand(brief.brandId);
  await assertWorkspaceRole(params.viewer, brand.workspaceId, params.allowedRoles, params.request.log);

  const [
    project,
    postType,
    reusableTemplateDetail,
    calendarItem,
    campaign,
    series,
    campaignPlan,
    sourceOutput,
    festival
  ] = await Promise.all([
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
    return { ok: false as const, message: "Project does not belong to the selected brand/workspace" };
  }

  if (postType && postType.workspaceId && postType.workspaceId !== brand.workspaceId) {
    return { ok: false as const, message: "Post type does not belong to the selected workspace" };
  }

  if (reusableTemplate && (reusableTemplate.workspaceId !== brand.workspaceId || reusableTemplate.brandId !== brand.id)) {
    return { ok: false as const, message: "Template does not belong to the selected brand/workspace" };
  }

  if (calendarItem && (calendarItem.workspaceId !== brand.workspaceId || calendarItem.brandId !== brand.id)) {
    return { ok: false as const, message: "Calendar item does not belong to the selected brand/workspace" };
  }

  if (campaign && (campaign.workspaceId !== brand.workspaceId || campaign.brandId !== brand.id)) {
    return { ok: false as const, message: "Campaign does not belong to the selected brand/workspace" };
  }

  if (series && (series.workspaceId !== brand.workspaceId || series.brandId !== brand.id)) {
    return { ok: false as const, message: "Series does not belong to the selected brand/workspace" };
  }

  if (campaignPlan && !campaign) {
    return { ok: false as const, message: "A campaign is required when selecting a planned asset" };
  }

  if (campaignPlan && campaign && campaignPlan.campaignId !== campaign.id) {
    return { ok: false as const, message: "Planned asset does not belong to the selected campaign" };
  }

  if (sourceOutput && (sourceOutput.workspace_id !== brand.workspaceId || sourceOutput.brand_id !== brand.id)) {
    return { ok: false as const, message: "Source post does not belong to the selected brand/workspace" };
  }

  if (festival && festival.workspaceId && festival.workspaceId !== brand.workspaceId) {
    return { ok: false as const, message: "Festival does not belong to the selected workspace" };
  }

  if (!postType) {
    return { ok: false as const, message: "Choose a post type before compiling v2 prompts" };
  }

  if (postType.code === "festive-greeting" && !festival) {
    return { ok: false as const, message: "Choose a festival before creating a festive greeting" };
  }

  const [brandProfileVersion, allAssets, reraRegistrations, projectProfileVersion] = await Promise.all([
    getActiveBrandProfile(brand.id),
    listBrandAssets(brand.id),
    listProjectReraRegistrations(brand.workspaceId, brand.id),
    project ? getActiveProjectProfile(project.id).catch(() => null) : Promise.resolve(null)
  ]);

  const isFestiveGreeting = postType.code === "festive-greeting" && Boolean(festival);
  const projectActualImages = Array.isArray(projectProfileVersion?.profile.actualProjectImageIds)
    ? projectProfileVersion.profile.actualProjectImageIds
    : [];
  const projectSampleImages = Array.isArray(projectProfileVersion?.profile.sampleFlatImageIds)
    ? projectProfileVersion.profile.sampleFlatImageIds
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
  const selectedBrandLogoAsset = brief.includeBrandLogo ? explicitLogoAsset : null;
  const selectedReraQrAsset = brief.includeReraQr
    ? selectReraQrAssetForProject(allAssets, project?.id ?? null, null, reraRegistrations)
    : null;
  const requestedVariationCount = brief.variationCount ?? env.CREATIVE_STYLE_VARIATION_COUNT;
  const sourceBriefSnapshot = {
    ...brief,
    variationCount: requestedVariationCount
  };

  return {
    ok: true as const,
    context: {
      brief,
      autoCopyStripped,
      brand,
      project,
      postType,
      reusableTemplate,
      reusableTemplateAssets,
      calendarItem,
      campaign,
      series,
      campaignPlan,
      sourceOutput,
      festival,
      brandProfileVersion,
      allAssets,
      reraRegistrations,
      projectProfileVersion,
      inferredReferenceSelection,
      referenceAssets,
      selectedBrandLogoAsset,
      selectedReraQrAsset,
      requestedVariationCount,
      sourceBriefSnapshot
    }
  };
}

function buildPreparedV2CompileInput(context: any) {
  return {
    workspaceId: context.brand.workspaceId,
    brandName: context.brand.name,
    brandProfile: context.brandProfileVersion.profile,
    brandAssets: context.allAssets,
    projectId: context.project?.id ?? null,
    projectName: context.project?.name ?? null,
    projectSlug: context.project?.slug ?? null,
    projectCity: context.project?.city ?? null,
    projectMicroLocation: context.project?.microLocation ?? null,
    projectStage: context.project?.stage ?? null,
    projectProfile: context.projectProfileVersion?.profile ?? null,
    festival: context.festival,
    postType: {
      code: context.postType.code,
      name: context.postType.name,
      config: context.postType.config
    },
    template: context.reusableTemplate
      ? {
          id: context.reusableTemplate.id,
          name: context.reusableTemplate.name,
          channel: context.reusableTemplate.channel,
          format: context.reusableTemplate.format,
          basePrompt: context.reusableTemplate.basePrompt,
          previewStoragePath: context.reusableTemplate.previewStoragePath,
          config: context.reusableTemplate.config,
          linkedAssets: context.reusableTemplateAssets.map((asset: any) => ({
            assetId: asset.assetId,
            role: asset.role
          }))
        }
      : null,
    templateAssets: context.reusableTemplateAssets.map((asset: any) => ({
      assetId: asset.assetId,
      role: asset.role
    })),
    calendarItem: context.calendarItem
      ? {
          title: context.calendarItem.title,
          objective: context.calendarItem.objective,
          scheduledFor: context.calendarItem.scheduledFor,
          status: context.calendarItem.status
        }
      : null,
    series: context.series
      ? {
          id: context.series.id,
          name: context.series.name,
          description: context.series.description,
          contentFormat: context.series.contentFormat,
          sourceBriefJson: context.series.sourceBriefJson
        }
      : null,
    deliverableSnapshot: null,
    brief: context.sourceBriefSnapshot,
    referenceLabels: context.referenceAssets.map((asset: any) => asset.label),
    variationCount: context.requestedVariationCount
  } as const;
}

function buildPreviewV2PromptPackage(
  context: any,
  compiled: any,
  options: {
    endpoint: string;
  }
) {
  const now = Date.now();
  return PromptPackageSchema.parse({
    id: randomId(),
    workspaceId: context.brand.workspaceId,
    brandId: context.brand.id,
    deliverableId: null,
    projectId: context.project?.id ?? null,
    postTypeId: context.postType.id,
    postType: {
      code: context.postType.code,
      name: context.postType.name,
      config: context.postType.config
    },
    creativeTemplateId: context.reusableTemplate?.id ?? null,
    calendarItemId: context.calendarItem?.id ?? null,
    creativeRequestId: randomId(),
    brandProfileVersionId: context.brandProfileVersion.id,
    promptSummary: compiled.promptSummary,
    seedPrompt: compiled.seedPrompt,
    finalPrompt: compiled.finalPrompt,
    aspectRatio: compiled.aspectRatio,
    chosenModel: compiled.chosenModel,
    templateType: compiled.templateType,
    referenceStrategy: compiled.referenceStrategy,
    referenceAssetIds: context.inferredReferenceSelection.referenceAssetIds,
    variations: compiled.variations ?? [],
    resolvedConstraints: {
      ...compiled.resolvedConstraints,
      projectImageAssetIds: context.projectProfileVersion?.profile.actualProjectImageIds ?? [],
      sampleFlatImageIds: context.projectProfileVersion?.profile.sampleFlatImageIds ?? [],
      amenityImageAssetIds: context.inferredReferenceSelection.amenityAssetIds,
      includeBrandLogo: context.brief.includeBrandLogo,
      includeReraQr: context.brief.includeReraQr,
      brandLogoAssetId: context.selectedBrandLogoAsset?.id ?? null,
      brandLogoLabel: context.selectedBrandLogoAsset?.label ?? null,
      reraQrAssetId: context.selectedReraQrAsset?.id ?? null,
      reraQrLabel: context.selectedReraQrAsset?.label ?? null
    },
    compilerTrace: {
      ...compiled.compilerTrace,
      sourceBrief: context.sourceBriefSnapshot,
      preview: true,
      previewId: `preview_v2_${now}`,
      endpoint: options.endpoint,
      persisted: false,
      postTypeCode: context.postType.code,
      promptDetailMode: "poster-spec",
      autoCopySanitized: context.autoCopyStripped,
      referenceRolePlan: {
        hasPrimaryAnchor: Boolean(context.reusableTemplate || context.sourceOutput),
        hasAmenityAnchorCandidate: context.inferredReferenceSelection.amenityAssetIds.length > 0,
        hasProjectAnchorCandidate: (context.projectProfileVersion?.profile.actualProjectImageIds ?? []).length > 0,
        secondaryReferenceCount: Math.max(
          0,
          context.referenceAssets.length - context.inferredReferenceSelection.amenityAssetIds.length
        ),
        includeBrandLogo: context.brief.includeBrandLogo,
        includeReraQr: context.brief.includeReraQr
      }
    }
  });
}

async function processCompileJobLocally(params: {
  jobId: string;
  compileInput: ReturnType<typeof buildPreparedV2CompileInput>;
  log: { error: (payload: unknown, message?: string) => void };
}) {
  const processingTimestamp = new Date().toISOString();
  const { data: claimedJob, error: claimError } = await supabaseAdmin
    .from("compile_jobs")
    .update({
      status: "processing",
      updated_at: processingTimestamp
    })
    .eq("id", params.jobId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) {
    params.log.error({ error: claimError, jobId: params.jobId }, "failed to claim async compile job locally");
    return;
  }

  if (!claimedJob) {
    return;
  }

  try {
    const result = await compilePromptPackageV2(params.compileInput);
    await supabaseAdmin
      .from("compile_jobs")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId);
  } catch (error) {
    params.log.error({ error, jobId: params.jobId }, "async compile job failed locally");
    await supabaseAdmin
      .from("compile_jobs")
      .update({
        status: "failed",
        error_json: {
          message: error instanceof Error ? error.message : "Async compile failed"
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId);
  }
}

function selectReraQrAssetForProject(
  assets: BrandAssetRecord[],
  projectId?: string | null,
  explicitAssetId?: string | null,
  registrations: ProjectReraRegistrationRecord[] = []
) {
  const matchesScope = (asset: BrandAssetRecord) =>
    asset.kind === "rera_qr" && (projectId ? asset.projectId === projectId : asset.projectId == null);
  const matchesGlobal = (asset: BrandAssetRecord) => asset.kind === "rera_qr" && asset.projectId == null;

  if (explicitAssetId) {
    const exactScoped = assets.find((asset) => asset.id === explicitAssetId && matchesScope(asset));
    if (exactScoped) return exactScoped;
    const exactGlobal = assets.find((asset) => asset.id === explicitAssetId && matchesGlobal(asset));
    if (exactGlobal) return exactGlobal;
  }

  if (projectId) {
    const scopedRegistration =
      registrations.find((registration) => registration.projectId === projectId && registration.isDefault && registration.qrAssetId) ??
      registrations.find((registration) => registration.projectId === projectId && registration.qrAssetId);
    const registrationAsset = scopedRegistration?.qrAssetId
      ? assets.find((asset) => asset.id === scopedRegistration.qrAssetId && asset.kind === "rera_qr")
      : null;
    if (registrationAsset) return registrationAsset;
  }

  const scoped = assets.find((asset) => matchesScope(asset));
  if (scoped) return scoped;

  return assets.find((asset) => matchesGlobal(asset)) ?? null;
}

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

function generationCreditAmount(kind: "style_seed" | "final", requestedCount: number) {
  const units = Math.max(0, Math.trunc(requestedCount));
  const perImage = kind === "style_seed" ? env.CREDITS_STYLE_SEED_PER_IMAGE : env.CREDITS_FINAL_PER_IMAGE;
  return units * Math.max(0, perImage);
}

function insufficientCreditsMessage(error: unknown) {
  if (isInsufficientWorkspaceCreditsError(error)) {
    if (typeof error.required === "number" && typeof error.available === "number") {
      return `Not enough credits. Required ${error.required}, available ${error.available}.`;
    }

    return "Not enough credits for this request.";
  }

  return "Not enough credits for this request.";
}

async function settleReservationIfPresent(
  reservationId: string | null | undefined,
  metadata?: Record<string, unknown>
) {
  if (!reservationId) {
    return;
  }

  await settleWorkspaceCreditReservation({
    reservationId,
    ...(metadata ? { metadata } : {})
  });
}

async function releaseReservationIfPresent(
  reservationId: string | null | undefined,
  params: {
    actorUserId?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  if (!reservationId) {
    return;
  }

  try {
    await releaseWorkspaceCreditReservation({
      reservationId,
      actorUserId: params.actorUserId ?? null,
      note: params.note ?? null,
      metadata: params.metadata ?? {}
    });
  } catch (error) {
    if (isReservationAlreadySettledError(error)) {
      return;
    }

    throw error;
  }
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
      Promise.all(detail.finalOutputs.map((output) => createSignedImageUrls(output.storagePath, output.thumbnailStoragePath)))
    ]);

    return CreativeRunDetailSchema.parse({
      ...detail,
      seedTemplates: detail.seedTemplates.map((template, index) => ({
        ...template,
        previewUrl: seedPreviewUrls[index] ?? undefined
      })),
      finalOutputs: detail.finalOutputs.map((output, index) => ({
        ...output,
        previewUrl: finalPreviewUrls[index]?.originalUrl,
        thumbnailUrl: finalPreviewUrls[index]?.thumbnailUrl,
        originalUrl: finalPreviewUrls[index]?.originalUrl
      }))
    });
  });

  app.post("/api/creative/compile-v2", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const parsedBrief = CreativeCompileV2RequestSchema.parse(request.body);
    const prepared = await prepareV2CompileContext({
      parsedBrief,
      viewer,
      request,
      allowedRoles: ["owner", "admin", "editor", "viewer"]
    });
    if (!prepared.ok) {
      return reply.badRequest(prepared.message);
    }

    const compileInput = buildPreparedV2CompileInput(prepared.context);

    try {
      const compiled = await compilePromptPackageV2(compileInput);
      return buildPreviewV2PromptPackage(prepared.context, compiled, {
        endpoint: "/api/creative/compile-v2"
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
  });

  app.post("/api/creative/compile-v2-async", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const parsedBrief = CreativeCompileV2RequestSchema.parse(request.body);
    const prepared = await prepareV2CompileContext({
      parsedBrief,
      viewer,
      request,
      allowedRoles: ["owner", "admin", "editor"]
    });
    if (!prepared.ok) {
      return reply.badRequest(prepared.message);
    }

    const compileInput = buildPreparedV2CompileInput(prepared.context);
    const preparedPayload = {
      sourceBrief: prepared.context.sourceBriefSnapshot,
      payload: await buildCanonicalV2AgentPayload(compileInput),
      meta: {
        autoCopyStripped: prepared.context.autoCopyStripped,
        brandProfileVersionId: prepared.context.brandProfileVersion.id,
        postTypeCode: prepared.context.postType.code,
        referenceAssetIds: prepared.context.inferredReferenceSelection.referenceAssetIds,
        amenityAssetIds: prepared.context.inferredReferenceSelection.amenityAssetIds
      }
    };

    const sessionToken = request.headers.authorization?.replace("Bearer ", "") || "";
    const { data: compileJob, error: jobError } = await supabaseAdmin
      .from("compile_jobs")
      .insert({
        workspace_id: prepared.context.brand.workspaceId,
        brand_id: prepared.context.brand.id,
        status: "pending",
        input_brief: preparedPayload,
        session_token: sessionToken
      })
      .select("id")
      .single();

    if (jobError) {
      request.log.error({ error: jobError }, "failed to create compile job");
      return reply.code(500).send({ error: "Failed to create compile job" });
    }

    const jobId = compileJob.id;
    const backgroundLog = request.log.child({ jobId, route: "compile-v2-async" });

    void processCompileJobLocally({
      jobId,
      compileInput,
      log: backgroundLog
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
      try {
        const result = await buildAsyncV2PromptPackage({
          brand,
          compileJob
        });
        return { status: "completed", result };
      } catch (error) {
        request.log.error({ error, jobId }, "failed to materialize async v2 compile result");
        return {
          status: "failed",
          error: {
            message: error instanceof Error ? error.message : "Async compile returned an invalid result"
          }
        };
      }
    }

    if (compileJob.status === "failed") {
      return { status: "failed", error: compileJob.error_json };
    }

    return { status: compileJob.status as "pending" | "processing" };
  });

  const handleGenerateOptions = async (request: any, reply: any) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const bodyParse = GenerateOptionsRequestSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return reply.badRequest(bodyParse.error.message);
    }
    const body = bodyParse.data;
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
            finalPrompt: promptPackage.finalPrompt,
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
      .select("deliverable_id, variations, compiler_trace")
      .eq("id", promptPackage.id)
      .maybeSingle();
    if (persistedPromptPackageError) {
      if (isPromptPackageVariationsSchemaError(persistedPromptPackageError)) {
        return reply.code(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Database schema is missing prompt_packages.variations. Apply the prompt package variations compatibility migration before generating options."
        });
      }
      throw persistedPromptPackageError;
    }
    const persistedDeliverableId =
      typeof persistedPromptPackage?.deliverable_id === "string" ? persistedPromptPackage.deliverable_id : null;
    const persistedVariations =
      Array.isArray(persistedPromptPackage?.variations)
        ? persistedPromptPackage.variations
        : Array.isArray(persistedPromptPackage?.compiler_trace?.variations)
          ? persistedPromptPackage.compiler_trace.variations
          : [];

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
      variations: promptPackage.variations.length > 0 ? promptPackage.variations : persistedVariations,
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
        seed_prompt: promptPackage.seedPrompt ?? promptPackage.finalPrompt,
        final_prompt: promptPackage.finalPrompt,
        aspect_ratio: promptPackage.aspectRatio,
        chosen_model: promptPackage.chosenModel,
        template_type: promptPackage.templateType ?? null,
        reference_strategy: promptPackage.referenceStrategy,
        reference_asset_ids: promptPackage.referenceAssetIds,
        variations,
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
      if (isPromptPackageVariationsSchemaError(promptPackageError)) {
        return reply.code(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Database schema is missing prompt_packages.variations. Apply the prompt package variations compatibility migration before generating options."
        });
      }
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
      variations[0]?.seedPrompt ?? variations[0]?.finalPrompt ?? promptPackage.seedPrompt ?? promptPackage.finalPrompt,
      getPostTypeCode(promptPackage) ?? "default"
    );
    const finalReferenceCount = filteredRefs.length;
    const optionProvider = resolveImageGenerationProvider();
    const optionProviderModel = getFinalProviderModel(finalReferenceCount);
    const v2OptionBatchId = randomId();
    const preparedOptionJobs = variations.map((variation) => {
      const jobId = randomId();
      const optionPrompt = variation.seedPrompt ?? variation.finalPrompt;
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
        jobType: "option" as const,
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
        optionPrompt,
        optionJob
      };
    });

    const optionReservationByJobId = new Map<string, string | null>();
    const perOptionCreditAmount = generationCreditAmount("final", 1);

    if (perOptionCreditAmount > 0) {
      for (const option of preparedOptionJobs) {
        try {
          const reservation = await reserveWorkspaceCredits({
            workspaceId: promptPackage.workspaceId,
            source: "creative_job",
            sourceRef: option.jobId,
            amount: perOptionCreditAmount,
            actorUserId: viewer.userId,
            metadata: {
              endpoint: "/api/creative/options",
              jobType: "option",
              promptPackageId: promptPackage.id,
              variationId: option.variationId
            }
          });
          optionReservationByJobId.set(option.jobId, reservation.reservationId);
        } catch (error) {
          for (const reservationId of optionReservationByJobId.values()) {
            await releaseReservationIfPresent(reservationId, {
              actorUserId: viewer.userId,
              note: "options reservation rollback",
              metadata: {
                endpoint: "/api/creative/options",
                reason: "reservation_rollback"
              }
            }).catch(() => null);
          }

          if (isInsufficientWorkspaceCreditsError(error)) {
            return reply.code(402).send({
              statusCode: 402,
              error: "Payment Required",
              message: insufficientCreditsMessage(error)
            });
          }

          throw error;
        }
      }
    }

    const { error } = await supabaseAdmin.from("creative_jobs").insert(
      preparedOptionJobs.map(({ jobId, variationId, variationTitle, variationStrategy, optionPrompt }) => ({
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
        job_type: "option",
        status: "queued",
        provider: optionProvider,
        provider_model: optionProviderModel,
        requested_count: 1,
        request_payload: {
          prompt: optionPrompt,
          aspectRatio: promptPackage.aspectRatio,
          count: 1,
          v2OptionBatchId,
          variationId,
          variationTitle,
          variationStrategy,
          referenceCount: finalReferenceCount
        },
        credit_reservation_id: optionReservationByJobId.get(jobId) ?? null,
        created_by: viewer.userId
      }))
    );

    if (error) {
      for (const reservationId of optionReservationByJobId.values()) {
        await releaseReservationIfPresent(reservationId, {
          actorUserId: viewer.userId,
          note: "options reservation rollback",
          metadata: {
            endpoint: "/api/creative/options",
            reason: "job_insert_failed"
          }
        }).catch(() => null);
      }
      throw error;
    }

    const jobs: Array<{ id: string; variationId: string; variationTitle: string; requestId: string | null }> = [];

    if (isImmediateImageProvider(optionProvider)) {
      for (const { jobId, variationId, variationTitle, optionPrompt, optionJob } of preparedOptionJobs) {
        let requestInfo: { request_id: string } | null = null;

        requestInfo = { request_id: `${optionProvider}-v2-option-${jobId}` };

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
            createdBy: viewer.userId,
            creditReservationId: optionReservationByJobId.get(jobId) ?? null,
            providerRequestId: requestInfo.request_id,
            status: "processing"
          },
          prompt: optionPrompt,
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
      const submissionResults: Array<
        | {
            status: "accepted";
            id: string;
            variationId: string;
            variationTitle: string;
            requestId: string | null;
          }
        | {
            status: "failed";
            id: string;
            variationId: string;
            variationTitle: string;
            requestId: null;
            error: { message: string; statusCode?: number };
          }
      > = [];

      // FAL option submissions are more reliable when serialized. The single-option
      // paths already behave this way; only multi-option generation was fan-out parallel.
      for (const { jobId, variationId, variationTitle, optionPrompt, optionJob } of preparedOptionJobs) {
        try {
          const requestInfo = await submitFinalGeneration(
            optionJob,
            {
              prompt: optionPrompt,
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
            submissionResults.push({
              status: "failed",
              id: jobId,
              variationId,
              variationTitle,
              requestId: null,
              error: serialized
            });
            continue;
          }

          submissionResults.push({
            status: "accepted",
            id: jobId,
            variationId,
            variationTitle,
            requestId: requestInfo?.request_id ?? null
          });
        } catch (submissionError) {
          const serialized = await failJobSubmission(jobId, submissionError);
          submissionResults.push({
            status: "failed",
            id: jobId,
            variationId,
            variationTitle,
            requestId: null,
            error: serialized
          });
        }
      }

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
  };

  app.post("/api/creative/options", { preHandler: app.authenticate }, handleGenerateOptions);
  app.post("/api/creative/style-seeds-v2", { preHandler: app.authenticate }, handleGenerateOptions);

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
    const seedPrompt = promptPackage.seedPrompt ?? promptPackage.finalPrompt;
    const seedProvider = resolveImageGenerationProvider();
    const seedProviderModel = getStyleSeedProviderModel(seedReferenceCount);
    const jobId = randomId();
    const seedCreditAmount = generationCreditAmount("style_seed", body.count);
    let seedReservationId: string | null = null;

    if (seedCreditAmount > 0) {
      try {
        const reservation = await reserveWorkspaceCredits({
          workspaceId: promptPackage.workspaceId,
          source: "creative_job",
          sourceRef: jobId,
          amount: seedCreditAmount,
          actorUserId: viewer.userId,
          metadata: {
            endpoint: "/api/creative/style-seeds",
            jobType: "style_seed",
            promptPackageId: promptPackage.id,
            requestedCount: body.count
          }
        });
        seedReservationId = reservation.reservationId;
      } catch (error) {
        if (isInsufficientWorkspaceCreditsError(error)) {
          return reply.code(402).send({
            statusCode: 402,
            error: "Payment Required",
            message: insufficientCreditsMessage(error)
          });
        }
        throw error;
      }
    }

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
        prompt: seedPrompt,
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
      credit_reservation_id: seedReservationId,
      created_by: viewer.userId
    });

    if (error) {
      await releaseReservationIfPresent(seedReservationId, {
        actorUserId: viewer.userId,
        note: "style-seed reservation rollback",
        metadata: {
          endpoint: "/api/creative/style-seeds",
          reason: "job_insert_failed"
        }
      }).catch(() => null);
      throw error;
    }

    let requestInfo: { request_id: string } | null = null;

    if (isImmediateImageProvider(seedProvider)) {
      requestInfo = { request_id: `${seedProvider}-style-seed-${jobId}` };

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
          createdBy: viewer.userId,
          creditReservationId: seedReservationId,
          providerRequestId: requestInfo.request_id,
          status: "processing"
        },
        prompt: seedPrompt,
        aspectRatio: promptPackage.aspectRatio,
        referenceStoragePaths,
        mode: "seed",
        referencePlan,
        postTypeCode: getPostTypeCode(promptPackage)
      });
    } else {
      const filteredRefs = filterReferenceStoragePathsForPrompt(referencePlan, seedPrompt, getPostTypeCode(promptPackage) ?? "default");
      try {
        requestInfo = await submitStyleSeedGeneration(
          styleSeedJob,
          {
            prompt: seedPrompt,
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
    const finalPrompt = promptPackage.finalPrompt;
    const referenceStoragePaths = collectReferenceStoragePaths(referencePlan);
    const filteredRefs = filterReferenceStoragePathsForPrompt(
      referencePlan,
      finalPrompt,
      getPostTypeCode(promptPackage) ?? "default"
    );
    const expectedReferenceCount = filteredRefs.length;
    const finalProvider = resolveImageGenerationProvider();
    const finalProviderModel = getFinalProviderModel(expectedReferenceCount);
    const finalCreditAmount = generationCreditAmount("final", body.count);
    let finalReservationId: string | null = null;

    if (finalCreditAmount > 0) {
      try {
        const reservation = await reserveWorkspaceCredits({
          workspaceId: promptPackage.workspaceId,
          source: "creative_job",
          sourceRef: jobId,
          amount: finalCreditAmount,
          actorUserId: viewer.userId,
          metadata: {
            endpoint: "/api/creative/finals",
            jobType: "final",
            promptPackageId: promptPackage.id,
            requestedCount: body.count
          }
        });
        finalReservationId = reservation.reservationId;
      } catch (error) {
        if (isInsufficientWorkspaceCreditsError(error)) {
          return reply.code(402).send({
            statusCode: 402,
            error: "Payment Required",
            message: insufficientCreditsMessage(error)
          });
        }
        throw error;
      }
    }

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
        prompt: finalPrompt,
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
      credit_reservation_id: finalReservationId,
      created_by: viewer.userId
    });

    if (error) {
      await releaseReservationIfPresent(finalReservationId, {
        actorUserId: viewer.userId,
        note: "final reservation rollback",
        metadata: {
          endpoint: "/api/creative/finals",
          reason: "job_insert_failed"
        }
      }).catch(() => null);
      throw error;
    }

    let requestInfo: { request_id: string } | null = null;

    if (isImmediateImageProvider(finalProvider)) {
      requestInfo = { request_id: `${finalProvider}-final-${jobId}` };

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
          createdBy: viewer.userId,
          creditReservationId: finalReservationId,
          providerRequestId: requestInfo.request_id,
          status: "processing"
        },
        prompt: finalPrompt,
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
            prompt: finalPrompt,
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
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by"
      )
      .eq("job_id", jobId)
      .order("output_index", { ascending: true });

    if (outputsError) {
      throw outputsError;
    }

    const signedUrls = await Promise.all(
      (outputs ?? []).map(async (output) => {
        const outputRow = output as { storage_path: string; thumbnail_storage_path?: string | null };
        return createSignedImageUrls(outputRow.storage_path, outputRow.thumbnail_storage_path);
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
        thumbnailStoragePath: output.thumbnail_storage_path,
        providerUrl: output.provider_url,
        outputIndex: output.output_index,
        parentOutputId: output.parent_output_id,
        rootOutputId: output.root_output_id,
        editedFromOutputId: output.edited_from_output_id,
        versionNumber: output.version_number,
        isLatestVersion: output.is_latest_version,
        reviewState: output.review_state,
        latestVerdict: output.latest_feedback_verdict,
        reviewedAt: output.reviewed_at,
        createdBy: output.created_by,
        previewUrl: signedUrls[index]?.originalUrl,
        thumbnailUrl: signedUrls[index]?.thumbnailUrl,
        originalUrl: signedUrls[index]?.originalUrl
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

  app.get("/api/creative/outputs", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);

    const parsedQuery = CreativeOutputsQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return reply.badRequest(parsedQuery.error.issues[0]?.message ?? "Invalid outputs query");
    }

    const { brandId, reviewState, limit, offset } = parsedQuery.data;

    if (brandId) {
      const brand = await getBrand(brandId);
      if (brand.workspaceId !== workspace.id) {
        return reply.badRequest("Brand does not belong to this workspace");
      }
    }

    let query = supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by"
      )
      .eq("workspace_id", workspace.id);

    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    if (reviewState) {
      query = query.eq("review_state", reviewState);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
      .returns<
        Array<{
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
          thumbnail_storage_path: string | null;
          provider_url: string | null;
          output_index: number;
          parent_output_id: string | null;
          root_output_id: string | null;
          edited_from_output_id: string | null;
          version_number: number;
          is_latest_version: boolean;
          review_state: CreativeOutputRecord["reviewState"];
          latest_feedback_verdict: CreativeOutputRecord["latestVerdict"];
          reviewed_at: string | null;
          created_by: string | null;
        }>
      >();

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const signedUrls = await Promise.all(
      rows.map((row) => createSignedImageUrls(row.storage_path, row.thumbnail_storage_path))
    );

    return rows.map((output, index) => ({
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
      thumbnailStoragePath: output.thumbnail_storage_path,
      providerUrl: output.provider_url,
      outputIndex: output.output_index,
      parentOutputId: output.parent_output_id,
      rootOutputId: output.root_output_id,
      editedFromOutputId: output.edited_from_output_id,
      versionNumber: output.version_number,
      isLatestVersion: output.is_latest_version,
      reviewState: output.review_state,
      latestVerdict: output.latest_feedback_verdict,
      reviewedAt: output.reviewed_at,
      createdBy: output.created_by,
      previewUrl: signedUrls[index]?.originalUrl,
      thumbnailUrl: signedUrls[index]?.thumbnailUrl,
      originalUrl: signedUrls[index]?.originalUrl
    }));
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
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by"
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
          thumbnail_storage_path: string | null;
          provider_url: string | null;
          output_index: number;
          parent_output_id: string | null;
          root_output_id: string | null;
          edited_from_output_id: string | null;
          version_number: number;
          is_latest_version: boolean;
          review_state: "pending_review" | "approved" | "needs_revision" | "closed";
          latest_feedback_verdict: "approved" | "close" | "off-brand" | "wrong-layout" | "wrong-text" | null;
          reviewed_at: string | null;
          created_by: string | null;
        }
      | null;

    if (error) {
      throw error;
    }

    if (!output) {
      return reply.notFound("Output not found");
    }

    await assertWorkspaceRole(viewer, output.workspace_id, ["owner", "admin", "editor", "viewer"], request.log);

    const signedUrls = await createSignedImageUrls(output.storage_path, output.thumbnail_storage_path);

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
      thumbnailStoragePath: output.thumbnail_storage_path,
      providerUrl: output.provider_url,
      outputIndex: output.output_index,
      parentOutputId: output.parent_output_id,
      rootOutputId: output.root_output_id,
      editedFromOutputId: output.edited_from_output_id,
      versionNumber: output.version_number,
      isLatestVersion: output.is_latest_version,
      reviewState: output.review_state,
      latestVerdict: output.latest_feedback_verdict,
      reviewedAt: output.reviewed_at,
      createdBy: output.created_by,
      previewUrl: signedUrls.originalUrl,
      thumbnailUrl: signedUrls.thumbnailUrl,
      originalUrl: signedUrls.originalUrl
    };
  });
}

function sortAssetsByIdOrder<T extends { id: string }>(assets: T[], orderedIds: string[]) {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...assets].sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));
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


async function runImmediateProviderJob({
  job,
  prompt,
  aspectRatio,
  referenceStoragePaths,
  mode,
  referencePlan,
  postTypeCode
}: {
  job: CreativeJobRecord & { createdBy?: string | null; creditReservationId?: string | null };
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
        error_json: null,
        created_by: job.createdBy ?? null
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

    await settleReservationIfPresent(job.creditReservationId ?? null, {
      endpoint: "runImmediateProviderJob",
      jobId: job.id
    });
  } catch (error) {
    console.error("[runImmediateProviderJob] failed", {
      jobId: job.id,
      provider: job.provider,
      providerRequestId: job.providerRequestId,
      mode,
      postTypeCode,
      message: error instanceof Error ? error.message : String(error)
    });
    await failJobSubmission(job.id, error, job.creditReservationId ?? null);
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

function getPromptPackageAmenityResolutionSummary(
  promptPackage: { compilerTrace?: Record<string, unknown> | null | undefined }
) {
  const compilerTrace =
    promptPackage.compilerTrace && typeof promptPackage.compilerTrace === "object"
      ? promptPackage.compilerTrace
      : {};
  const value = compilerTrace.amenityResolutionSummary;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getPromptPackageAmenityImageAssetIds(
  promptPackage: {
    resolvedConstraints?: Record<string, unknown> | null | undefined;
    compilerTrace?: Record<string, unknown> | null | undefined;
  }
) {
  const amenityResolutionSummary = getPromptPackageAmenityResolutionSummary(promptPackage);
  const tracedValue = amenityResolutionSummary?.selectedAssetIds;
  if (Array.isArray(tracedValue)) {
    const parsed = tracedValue.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (parsed.length > 0) {
      return parsed;
    }
  }

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

function getPromptPackageAmenityFocus(
  promptPackage: {
    resolvedConstraints?: Record<string, unknown> | null | undefined;
    compilerTrace?: Record<string, unknown> | null | undefined;
  }
) {
  const amenityResolutionSummary = getPromptPackageAmenityResolutionSummary(promptPackage);
  if (typeof amenityResolutionSummary?.selectedAmenity === "string" && amenityResolutionSummary.selectedAmenity.trim().length > 0) {
    return amenityResolutionSummary.selectedAmenity.trim();
  }

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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asUuidArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item))
    : [];
}

function normalizeAsyncReferenceStrategy(referenceStrategy: unknown, referenceAssetIds: string[]) {
  if (
    referenceStrategy === "generated-template" ||
    referenceStrategy === "uploaded-references" ||
    referenceStrategy === "hybrid"
  ) {
    return referenceStrategy;
  }

  return referenceAssetIds.length > 0 ? "uploaded-references" : "generated-template";
}

function normalizeAsyncTemplateType(templateType: unknown) {
  return templateType === "hero" ||
      templateType === "product-focus" ||
      templateType === "testimonial" ||
      templateType === "announcement" ||
      templateType === "quote" ||
      templateType === "offer"
    ? templateType
    : undefined;
}

function normalizeAsyncVariations(
  value: unknown,
  fallback: {
    seedPrompt: string;
    finalPrompt: string;
  }
) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((row, index) => {
      const record = asObject(row);
      const seedPrompt =
        asOptionalString(record.seedPrompt) ??
        asOptionalString(record.finalPrompt);
      const finalPrompt =
        asOptionalString(record.finalPrompt) ??
        asOptionalString(record.seedPrompt);
      if (!seedPrompt || !finalPrompt) {
        return null;
      }

      return {
        id: asOptionalString(record.id) ?? `variation_${index + 1}`,
        title: asOptionalString(record.title) ?? `Variation ${index + 1}`,
        strategy: asOptionalString(record.strategy) ?? "Distinct creative route",
        seedPrompt,
        finalPrompt,
        resolvedConstraints: asObject(record.resolvedConstraints),
        compilerTrace: asObject(record.compilerTrace)
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      id: "variation_1",
      title: "Primary route",
      strategy: "Primary route",
      seedPrompt: fallback.seedPrompt,
      finalPrompt: fallback.finalPrompt,
      resolvedConstraints: {},
      compilerTrace: {}
    }
  ];
}

async function buildAsyncV2PromptPackage(params: {
  brand: Awaited<ReturnType<typeof getBrand>>;
  compileJob: {
    id: string;
    brand_id: string;
    workspace_id: string;
    input_brief: unknown;
    result: unknown;
  };
}) {
  const envelope = asObject(params.compileJob.input_brief);
  const sourceBriefPayload = asObject(envelope.sourceBrief);
  const payload = asObject(envelope.payload);
  const meta = asObject(envelope.meta);
  const inputBrief = Object.keys(sourceBriefPayload).length > 0 ? sourceBriefPayload : envelope;
  const compilePayload = Object.keys(payload).length > 0 ? payload : envelope;
  const rawResultEnvelope = asObject(params.compileJob.result);
  const rawCompiled = asObject("result" in rawResultEnvelope ? rawResultEnvelope.result : rawResultEnvelope);

  const persistedBrandProfileVersionId = asOptionalString(meta.brandProfileVersionId);
  const brandProfileVersion = persistedBrandProfileVersionId ? null : await getActiveBrandProfile(params.brand.id);
  const truthBundle = asObject(compilePayload.truthBundle);
  const exactAssetContract = asObject(truthBundle.exactAssetContract);
  const amenityResolution = asObject(truthBundle.amenityResolution);
  const postTypeContract = asObject(truthBundle.postTypeContract);
  const truthProject = asObject(truthBundle.projectTruth);
  const truthProjectProfile = asObject(truthBundle.projectProfile);
  const rawResolvedConstraints = asObject(rawCompiled.resolvedConstraints);
  const rawCompilerTrace = asObject(rawCompiled.compilerTrace);
  const [allAssets, reraRegistrations] = await Promise.all([
    listBrandAssets(params.brand.id),
    listProjectReraRegistrations(params.brand.workspaceId, params.brand.id)
  ]);

  const sourceBrief = CreativeCompileV2RequestSchema.parse({
    ...inputBrief,
    brandId: asOptionalString(inputBrief.brandId) ?? params.brand.id
  });
  const referenceAssetIds = asUuidArray(meta.referenceAssetIds ?? sourceBrief.referenceAssetIds);
  const amenityAssetIds = asUuidArray(meta.amenityAssetIds ?? amenityResolution.selectedAssetIds);
  const explicitLogoAssetId = sourceBrief.logoAssetId ?? asOptionalString(exactAssetContract.logoAssetId);
  const selectedBrandLogoAsset =
    sourceBrief.includeBrandLogo === true && explicitLogoAssetId
      ? allAssets.find((asset) => asset.id === explicitLogoAssetId && asset.kind === "logo") ?? null
      : null;
  const selectedReraQrAsset =
    sourceBrief.includeReraQr === true
      ? selectReraQrAssetForProject(
          allAssets,
          sourceBrief.projectId ?? null,
          asOptionalString(exactAssetContract.reraQrAssetId),
          reraRegistrations
        )
      : null;

  const referenceStrategy = normalizeAsyncReferenceStrategy(rawCompiled.referenceStrategy, referenceAssetIds);
  const seedPrompt =
    asOptionalString(rawCompiled.seedPrompt) ??
    asOptionalString(rawCompiled.finalPrompt) ??
    "";
  const finalPrompt =
    asOptionalString(rawCompiled.finalPrompt) ??
    asOptionalString(rawCompiled.seedPrompt) ??
    "";
  if (!seedPrompt || !finalPrompt) {
    throw new Error("Async compile result is missing finalPrompt");
  }

  return PromptPackageSchema.parse({
    id: params.compileJob.id,
    workspaceId: params.brand.workspaceId,
    brandId: params.brand.id,
    deliverableId: null,
    projectId: sourceBrief.projectId ?? null,
    postTypeId: sourceBrief.postTypeId ?? null,
    creativeTemplateId: sourceBrief.creativeTemplateId ?? null,
    calendarItemId: sourceBrief.calendarItemId ?? null,
    creativeRequestId: params.compileJob.id,
    brandProfileVersionId: persistedBrandProfileVersionId ?? brandProfileVersion!.id,
    promptSummary: asOptionalString(rawCompiled.promptSummary) ?? "Compiled prompt package",
    seedPrompt,
    finalPrompt,
    aspectRatio: deriveAspectRatio(sourceBrief.format),
    chosenModel: asOptionalString(rawCompiled.chosenModel) ?? "unknown",
    templateType: normalizeAsyncTemplateType(rawCompiled.templateType),
    referenceStrategy,
    referenceAssetIds,
    variations: normalizeAsyncVariations(rawCompiled.variations, {
      seedPrompt,
      finalPrompt
    }),
    resolvedConstraints: {
      ...rawResolvedConstraints,
      projectImageAssetIds: asUuidArray(truthProject.actualProjectImageIds ?? truthProjectProfile.actualProjectImageIds),
      sampleFlatImageIds: asUuidArray(truthProject.sampleFlatImageIds ?? truthProjectProfile.sampleFlatImageIds),
      amenityImageAssetIds: amenityAssetIds,
      includeBrandLogo: sourceBrief.includeBrandLogo,
      includeReraQr: sourceBrief.includeReraQr,
      brandLogoAssetId: selectedBrandLogoAsset?.id ?? null,
      brandLogoLabel: selectedBrandLogoAsset?.label ?? null,
      reraQrAssetId: selectedReraQrAsset?.id ?? null,
      reraQrLabel: selectedReraQrAsset?.label ?? null,
      postTypeGuidance: rawResolvedConstraints.postTypeGuidance ?? postTypeContract
    },
    compilerTrace: {
      ...rawCompilerTrace,
      ...asObject(rawResultEnvelope.trace),
      runtime: rawResultEnvelope.runtime,
      sourceBrief,
      preview: true,
      previewId: `preview_v2_${params.compileJob.id}`,
      endpoint: "/api/creative/compile-v2",
      persisted: false,
      postTypeCode: asOptionalString(meta.postTypeCode) ?? asOptionalString(postTypeContract.code) ?? asOptionalString(rawCompilerTrace.postTypeCode),
      promptDetailMode: "poster-spec",
      autoCopySanitized:
        typeof rawCompilerTrace.autoCopySanitized === "boolean"
          ? rawCompilerTrace.autoCopySanitized
          : asOptionalBoolean(meta.autoCopyStripped) ?? false
    }
  });
}

async function failJobSubmission(jobId: string, error: unknown, reservationIdHint?: string | null) {
  const serialized = serializeSubmissionError(error);

  let reservationId = reservationIdHint ?? null;

  if (!reservationId) {
    const { data } = await supabaseAdmin
      .from("creative_jobs")
      .select("credit_reservation_id")
      .eq("id", jobId)
      .maybeSingle();

    reservationId = (data as { credit_reservation_id?: string | null } | null)?.credit_reservation_id ?? null;
  }

  await supabaseAdmin
    .from("creative_jobs")
    .update({
      status: "failed",
      error_json: serialized
    })
    .eq("id", jobId);

  await releaseReservationIfPresent(reservationId, {
    note: "generation failed",
    metadata: {
      endpoint: "failJobSubmission",
      jobId,
      reason: serialized.message
    }
  }).catch(() => null);

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

function isPromptPackageVariationsSchemaError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : "";
  return /prompt_packages/i.test(message) && /variations/i.test(message) && /schema cache/i.test(message);
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
