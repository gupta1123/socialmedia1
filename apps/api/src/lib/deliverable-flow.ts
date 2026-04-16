import type {
  ApprovalAction,
  BrandAssetRecord,
  CreativeBrief,
  OutputVerdict,
  PostVersionRecord
} from "@image-lab/contracts";
import { compilePromptPackage } from "./creative-director.js";
import { buildInferredReferenceSelection } from "./creative-reference-selection.js";
import { buildPostTypePromptGuidance } from "./post-type-prompt-guidance.js";
import { deriveLegacyCreativeFormat, inferDeliverableStatusFromExecution } from "./deliverable-utils.js";
import {
  buildDeliverableSnapshot,
  getDeliverable,
  getPostVersion,
  listPostVersions
} from "./deliverables-repository.js";
import {
  getActiveBrandProfile,
  getBrand,
  listBrandAssets
} from "./repository.js";
import {
  getFestival,
  getActiveProjectProfile,
  getCreativeTemplate,
  getProject,
  getPostType,
  listWorkspacePostTypes,
  listWorkspaceProjects
} from "./planning-repository.js";
import { supabaseAdmin } from "./supabase.js";
import { randomId } from "./utils.js";

export async function compileDeliverablePromptPackage(params: {
  deliverableId: string;
  viewerUserId: string | null;
  briefOverride?: Partial<CreativeBrief> | undefined;
}) {
  const snapshot = await buildDeliverableSnapshot(params.deliverableId);
  const deliverable = snapshot.deliverable;
  const brand = await getBrand(deliverable.brandId);
  const brandProfileVersion = await getActiveBrandProfile(deliverable.brandId);
  const postType = await getPostType(deliverable.postTypeId);
  const reusableTemplate = deliverable.creativeTemplateId
    ? await getCreativeTemplate(deliverable.creativeTemplateId).catch(() => null)
    : null;
  const festivalId =
    params.briefOverride?.festivalId ??
    (typeof deliverable.sourceJson?.festivalId === "string" ? deliverable.sourceJson.festivalId : null);
  const allAssets = await listBrandAssets(deliverable.brandId);
  const project = deliverable.projectId ? await getProject(deliverable.projectId).catch(() => null) : null;
  const projectProfileVersion = deliverable.projectId
    ? await getActiveProjectProfile(deliverable.projectId).catch(() => null)
    : null;
  const festival = festivalId ? await getFestival(festivalId).catch(() => null) : null;
  const isFestiveGreeting = postType.code === "festive-greeting" && Boolean(festival);
  const selectedBrandLogoAsset =
    params.briefOverride?.includeBrandLogo
      ? allAssets.find((asset) => asset.kind === "logo") ?? null
      : null;
  const selectedReraQrAsset =
    params.briefOverride?.includeReraQr
      ? allAssets.find((asset) => asset.kind === "rera_qr") ?? null
      : null;
  const brief = buildCreativeBrief({
    brandId: deliverable.brandId,
    deliverableId: deliverable.id,
    deliverable,
    postTypeName: postType.name,
    personaName: snapshot.persona?.name ?? null,
    ...(params.briefOverride ? { briefOverride: params.briefOverride } : {})
  });
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
    explicitReferenceAssetIds: params.briefOverride?.referenceAssetIds ?? [],
    projectImageAssetIds: projectProfileVersion?.profile.actualProjectImageIds ?? [],
    sampleFlatImageIds: projectProfileVersion?.profile.sampleFlatImageIds ?? [],
    brandReferenceAssetIds: brandProfileVersion.profile.referenceAssetIds,
    allAssets,
    projectId: project?.id ?? null,
    focusAmenity: postTypeGuidance.manifest.amenityFocus ?? null,
  });
  const inferredReferenceAssetIds = inferredReferenceSelection.referenceAssetIds;

  const referenceAssets = sortAssetsByIdOrder(
    allAssets.filter((asset) => inferredReferenceAssetIds.includes(asset.id)),
    inferredReferenceAssetIds
  );
  const compiled = await compilePromptPackage({
    brandName: brand.name,
    brandProfile: brandProfileVersion.profile,
    brandAssets: allAssets,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
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
          config: reusableTemplate.config
        }
      : null,
    calendarItem: null,
    deliverableSnapshot: {
      id: deliverable.id,
      title: deliverable.title,
      briefText: deliverable.briefText,
      objectiveCode: deliverable.objectiveCode,
      placementCode: deliverable.placementCode,
      contentFormat: deliverable.contentFormat,
      ctaText: deliverable.ctaText,
      scheduledFor: deliverable.scheduledFor,
      priority: deliverable.priority,
      status: deliverable.status,
      campaign: snapshot.campaign
        ? {
            id: snapshot.campaign.id,
            name: snapshot.campaign.name,
            objectiveCode: snapshot.campaign.objectiveCode,
            keyMessage: snapshot.campaign.keyMessage,
            ctaText: snapshot.campaign.ctaText
          }
        : null,
      persona: snapshot.persona
        ? {
            id: snapshot.persona.id,
            name: snapshot.persona.name,
            description: snapshot.persona.description
          }
        : null,
      channelAccount: snapshot.channelAccount
        ? {
            id: snapshot.channelAccount.id,
            platform: snapshot.channelAccount.platform,
            handle: snapshot.channelAccount.handle
          }
        : null
    },
    series: snapshot.series
      ? {
          id: snapshot.series.id,
          name: snapshot.series.name,
          description: snapshot.series.description,
          contentFormat: snapshot.series.contentFormat,
          sourceBriefJson: snapshot.series.sourceBriefJson
        }
      : null,
    brief,
    referenceLabels: referenceAssets.map((asset) => asset.label)
  });

  const createContext = buildCreateContext({
    deliverable,
    ...(params.briefOverride ? { briefOverride: params.briefOverride } : {})
  });

  const creativeRequestId = randomId();
  const promptPackageId = randomId();
  const compiledVariations =
    "variations" in compiled && Array.isArray(compiled.variations) ? compiled.variations : [];

  await supabaseAdmin.from("creative_requests").insert({
    id: creativeRequestId,
    workspace_id: brand.workspaceId,
    brand_id: brand.id,
    deliverable_id: deliverable.id,
    project_id: deliverable.projectId,
    post_type_id: deliverable.postTypeId,
    creative_template_id: deliverable.creativeTemplateId,
    status: "compiled",
    brief_json: {
      ...brief,
      referenceAssetIds: params.briefOverride?.referenceAssetIds ?? [],
      resolvedReferenceAssetIds: inferredReferenceAssetIds,
      resolvedBrandLogoAssetId: selectedBrandLogoAsset?.id ?? null,
      resolvedReraQrAssetId: selectedReraQrAsset?.id ?? null
    },
    created_by: params.viewerUserId
  });

  await supabaseAdmin.from("prompt_packages").insert({
    id: promptPackageId,
    workspace_id: brand.workspaceId,
    brand_id: brand.id,
    deliverable_id: deliverable.id,
    project_id: deliverable.projectId,
    post_type_id: deliverable.postTypeId,
    creative_template_id: deliverable.creativeTemplateId,
    creative_request_id: creativeRequestId,
    brand_profile_version_id: brandProfileVersion.id,
    prompt_summary: compiled.promptSummary,
    seed_prompt: compiled.seedPrompt,
    final_prompt: compiled.finalPrompt,
    aspect_ratio: compiled.aspectRatio,
    chosen_model: compiled.chosenModel,
    template_type: compiled.templateType ?? null,
    reference_strategy: compiled.referenceStrategy,
    reference_asset_ids: inferredReferenceAssetIds,
    variations: compiledVariations,
    resolved_constraints: {
      ...compiled.resolvedConstraints,
      projectImageAssetIds: projectProfileVersion?.profile.actualProjectImageIds ?? [],
      sampleFlatImageIds: projectProfileVersion?.profile.sampleFlatImageIds ?? [],
      amenityImageAssetIds: inferredReferenceSelection.amenityAssetIds,
      includeBrandLogo: params.briefOverride?.includeBrandLogo ?? false,
      includeReraQr: params.briefOverride?.includeReraQr ?? false,
      brandLogoAssetId: selectedBrandLogoAsset?.id ?? null,
      brandLogoLabel: selectedBrandLogoAsset?.label ?? null,
      reraQrAssetId: selectedReraQrAsset?.id ?? null,
      reraQrLabel: selectedReraQrAsset?.label ?? null
    },
    compiler_trace: {
      ...compiled.compilerTrace,
      createContext
    },
    created_by: params.viewerUserId
  });

  await supabaseAdmin
    .from("deliverables")
    .update({
      status: "brief_ready",
      source_json: {
        ...(deliverable.sourceJson ?? {}),
        latestCreativeBrief: brief
      }
    })
    .eq("id", deliverable.id);

  return {
    id: promptPackageId,
    workspaceId: brand.workspaceId,
    brandId: brand.id,
    deliverableId: deliverable.id,
    projectId: deliverable.projectId,
    postTypeId: deliverable.postTypeId,
    creativeTemplateId: deliverable.creativeTemplateId,
    calendarItemId: deliverable.sourceJson?.legacyCalendarItemId ?? null,
    creativeRequestId,
    brandProfileVersionId: brandProfileVersion.id,
    promptSummary: compiled.promptSummary,
    seedPrompt: compiled.seedPrompt,
    finalPrompt: compiled.finalPrompt,
    aspectRatio: compiled.aspectRatio,
    chosenModel: compiled.chosenModel,
    templateType: compiled.templateType ?? undefined,
    referenceStrategy: compiled.referenceStrategy,
    referenceAssetIds: inferredReferenceAssetIds,
    resolvedConstraints: {
      ...compiled.resolvedConstraints,
      projectImageAssetIds: projectProfileVersion?.profile.actualProjectImageIds ?? [],
      sampleFlatImageIds: projectProfileVersion?.profile.sampleFlatImageIds ?? [],
      amenityImageAssetIds: inferredReferenceSelection.amenityAssetIds,
      includeBrandLogo: params.briefOverride?.includeBrandLogo ?? false,
      includeReraQr: params.briefOverride?.includeReraQr ?? false,
      brandLogoAssetId: selectedBrandLogoAsset?.id ?? null,
      brandLogoLabel: selectedBrandLogoAsset?.label ?? null,
      reraQrAssetId: selectedReraQrAsset?.id ?? null,
      reraQrLabel: selectedReraQrAsset?.label ?? null
    },
    compilerTrace: {
      ...compiled.compilerTrace,
      createContext
    }
  };
}

export async function ensurePostVersionForOutput(outputId: string, opts?: {
  status?: PostVersionRecord["status"];
  createdBy?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("creative_outputs")
    .select("id, deliverable_id, post_version_id, job_id, creative_template_id, created_by")
    .eq("id", outputId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as {
    id: string;
    deliverable_id: string | null;
    post_version_id: string | null;
    job_id: string;
    creative_template_id: string | null;
    created_by: string | null;
  } | null;

  if (!row) {
    throw new Error("Creative output not found");
  }

  if (row.post_version_id) {
    return getPostVersion(row.post_version_id);
  }

  if (!row.deliverable_id) {
    throw new Error("Creative output is not linked to a deliverable");
  }

  const existingVersions = await listPostVersions(row.deliverable_id);
  const versionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;
  const postVersionId = randomId();
  const status = opts?.status ?? "draft";

  await supabaseAdmin.from("post_versions").insert({
    id: postVersionId,
    deliverable_id: row.deliverable_id,
    version_number: versionNumber,
    status,
    created_from_output_id: row.id,
    created_from_template_id: row.creative_template_id,
    created_by: opts?.createdBy ?? row.created_by ?? null
  });

  await supabaseAdmin.from("post_version_assets").insert({
    id: randomId(),
    post_version_id: postVersionId,
    creative_output_id: row.id,
    asset_role: "primary",
    sort_order: 0
  });

  await supabaseAdmin
    .from("creative_outputs")
    .update({ post_version_id: postVersionId })
    .eq("id", row.id);

  await supabaseAdmin
    .from("deliverables")
    .update({
      latest_post_version_id: postVersionId,
      status: status === "approved" ? "approved" : "review"
    })
    .eq("id", row.deliverable_id);

  if (status === "approved") {
    await supabaseAdmin
      .from("deliverables")
      .update({ approved_post_version_id: postVersionId })
      .eq("id", row.deliverable_id);
  }

  return getPostVersion(postVersionId);
}

export async function applyApprovalDecision(params: {
  deliverableId: string;
  postVersionId: string;
  reviewerUserId: string | null;
  action: ApprovalAction;
  comment?: string | null;
  metadataJson?: Record<string, unknown>;
}) {
  const deliverable = await getDeliverable(params.deliverableId);
  const postVersion = await getPostVersion(params.postVersionId);

  if (postVersion.deliverableId !== deliverable.id) {
    throw new Error("Post version does not belong to the deliverable");
  }

  await supabaseAdmin.from("approval_events").insert({
    id: randomId(),
    deliverable_id: deliverable.id,
    post_version_id: postVersion.id,
    reviewer_user_id: params.reviewerUserId,
    action: params.action,
    comment: params.comment ?? null,
    metadata_json: params.metadataJson ?? {}
  });

  const updates = resolveApprovalState(params.action, deliverable.approvedPostVersionId);

  await supabaseAdmin
    .from("post_versions")
    .update({ status: updates.postVersionStatus })
    .eq("id", postVersion.id);

  await supabaseAdmin
    .from("deliverables")
    .update({
      status: updates.deliverableStatus,
      approved_post_version_id: updates.approvedPostVersionId,
      latest_post_version_id: postVersion.id
    })
    .eq("id", deliverable.id);

  if (postVersion.createdFromOutputId) {
    const reviewState =
      params.action === "approve"
        ? "approved"
        : params.action === "close"
          ? "closed"
          : "needs_revision";
    await supabaseAdmin
      .from("creative_outputs")
      .update({
        review_state: reviewState,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", postVersion.createdFromOutputId);
  }

  return {
    deliverable: await getDeliverable(deliverable.id),
    postVersion: await getPostVersion(postVersion.id)
  };
}

export async function recordOutputFeedback(params: {
  outputId: string;
  verdict: OutputVerdict;
  reason: string;
  notes?: string | null;
  createdBy: string | null;
}) {
  await supabaseAdmin.from("feedback_events").insert({
    id: randomId(),
    creative_output_id: params.outputId,
    verdict: params.verdict,
    reason: params.reason,
    notes: params.notes ?? null,
    created_by: params.createdBy
  });

  const mappedStatus = mapVerdictToPostVersionStatus(params.verdict);
  const action = mapVerdictToApprovalAction(params.verdict);
  const postVersion = await ensurePostVersionForOutput(params.outputId, {
    status: mappedStatus,
    createdBy: params.createdBy
  });

  return applyApprovalDecision({
    deliverableId: postVersion.deliverableId,
    postVersionId: postVersion.id,
    reviewerUserId: params.createdBy,
    action,
    comment: params.reason,
    metadataJson: params.notes ? { notes: params.notes, verdict: params.verdict } : { verdict: params.verdict }
  });
}

export async function resolveOrCreateAdHocDeliverable(params: {
  brandId: string;
  deliverableId?: string | null;
  campaignId?: string | null;
  campaignPlanId?: string | null;
  seriesId?: string | null;
  sourceOutputId?: string | null;
  projectId?: string | null;
  postTypeId?: string | null;
  creativeTemplateId?: string | null;
  calendarItemId?: string | null;
  brief: CreativeBrief;
  createdBy: string | null;
}) {
  if (params.deliverableId) {
    return getDeliverable(params.deliverableId);
  }

  if (params.calendarItemId) {
    const legacy = await supabaseAdmin
      .from("deliverables")
      .select("id")
      .eq("legacy_calendar_item_id", params.calendarItemId)
      .maybeSingle();

    if (legacy.data?.id) {
      return getDeliverable(legacy.data.id);
    }
  }

  const brand = await getBrand(params.brandId);
  const allowImplicitDefaults = params.brief.createMode === "post";
  const projectId = params.projectId ?? (allowImplicitDefaults ? await findDefaultProjectId(brand.workspaceId, brand.id) : null);
  const postTypeId = params.postTypeId ?? (allowImplicitDefaults ? await findDefaultPostTypeId(brand.workspaceId) : null);

  if (!postTypeId) {
    throw new Error(getMissingPlanningContextMessage(params.brief.createMode));
  }

  const deliverableId = randomId();
  const placementCode = params.brief.channel;
  const contentFormat = mapBriefToContentFormat(params.brief);

  await supabaseAdmin.from("deliverables").insert({
    id: deliverableId,
    workspace_id: brand.workspaceId,
    brand_id: brand.id,
    project_id: projectId ?? null,
    campaign_id: params.campaignId ?? null,
    series_id: params.seriesId ?? null,
    post_type_id: postTypeId,
    creative_template_id: params.creativeTemplateId ?? null,
    planning_mode:
      params.seriesId
        ? "series"
        : params.campaignId
          ? "campaign"
          : "ad_hoc",
    objective_code: "awareness",
    placement_code: placementCode,
    content_format: contentFormat,
    title: params.brief.goal,
    brief_text: params.brief.prompt,
    cta_text: params.brief.offer ?? null,
    scheduled_for: new Date().toISOString(),
    owner_user_id: params.createdBy,
    reviewer_user_id: params.createdBy,
    priority: "normal",
    status: "planned",
    source_json: {
      source: "legacy_ad_hoc",
      createMode: params.brief.createMode,
      campaignPlanId: params.campaignPlanId ?? null,
      festivalId: params.brief.festivalId ?? null,
      sourceOutputId: params.sourceOutputId ?? null,
      seriesOutputKind: params.brief.seriesOutputKind ?? null,
      slideCount: params.brief.slideCount ?? null,
      creativeFormat: params.brief.format,
      legacyCalendarItemId: params.calendarItemId ?? null,
      exactText: params.brief.exactText ?? null
    },
    created_by: params.createdBy
  });

  return getDeliverable(deliverableId);
}

function getMissingPlanningContextMessage(createMode: CreativeBrief["createMode"]) {
  if (createMode === "series_episode") {
    return "Choose a post type before creating a series episode";
  }

  if (createMode === "campaign_asset") {
    return "Choose a post type before creating a campaign asset";
  }

  if (createMode === "adaptation") {
    return "Choose a post type before creating an adaptation";
  }

  return "A post type is required before compiling";
}

async function findDefaultProjectId(workspaceId: string, brandId: string) {
  const projects = await listWorkspaceProjects(workspaceId);
  return projects.find((project) => project.brandId === brandId)?.id ?? null;
}

async function findDefaultPostTypeId(workspaceId: string) {
  const postTypes = await listWorkspacePostTypes(workspaceId);
  return postTypes[0]?.id ?? null;
}

function buildCreativeBrief(params: {
  brandId: string;
  deliverableId: string;
  deliverable: Awaited<ReturnType<typeof getDeliverable>>;
  briefOverride?: Partial<CreativeBrief>;
  postTypeName: string;
  personaName: string | null;
}): CreativeBrief {
  return {
    brandId: params.brandId,
    createMode:
      params.briefOverride?.createMode ??
      (typeof params.deliverable.sourceJson?.createMode === "string"
        ? (params.deliverable.sourceJson.createMode as CreativeBrief["createMode"])
        : "post"),
    copyMode:
      params.briefOverride?.copyMode ??
      (typeof params.deliverable.sourceJson?.copyMode === "string"
        ? (params.deliverable.sourceJson.copyMode as CreativeBrief["copyMode"])
        : "manual"),
    deliverableId: params.deliverableId,
    campaignId: params.briefOverride?.campaignId ?? params.deliverable.campaignId ?? undefined,
    campaignPlanId:
      params.briefOverride?.campaignPlanId ??
      (typeof params.deliverable.sourceJson?.campaignPlanId === "string"
        ? params.deliverable.sourceJson.campaignPlanId
        : undefined),
    seriesId: params.briefOverride?.seriesId ?? params.deliverable.seriesId ?? undefined,
    festivalId:
      params.briefOverride?.festivalId ??
      (typeof params.deliverable.sourceJson?.festivalId === "string"
        ? params.deliverable.sourceJson.festivalId
        : undefined),
    sourceOutputId:
      params.briefOverride?.sourceOutputId ??
      (typeof params.deliverable.sourceJson?.sourceOutputId === "string"
        ? params.deliverable.sourceJson.sourceOutputId
        : undefined),
    projectId: params.deliverable.projectId ?? undefined,
    postTypeId: params.deliverable.postTypeId,
    creativeTemplateId: params.deliverable.creativeTemplateId ?? undefined,
    calendarItemId:
      typeof params.deliverable.sourceJson?.legacyCalendarItemId === "string"
        ? params.deliverable.sourceJson.legacyCalendarItemId
        : undefined,
    channel: params.deliverable.placementCode,
    format: deriveLegacyCreativeFormat(
      params.deliverable.placementCode,
      params.deliverable.contentFormat,
      params.deliverable.sourceJson
    ),
    seriesOutputKind:
      params.briefOverride?.seriesOutputKind ??
      (params.deliverable.contentFormat === "carousel" ? "carousel" : "single_image"),
    slideCount:
      params.briefOverride?.slideCount ??
      (typeof params.deliverable.sourceJson?.slideCount === "number"
        ? params.deliverable.sourceJson.slideCount
        : undefined),
    goal:
      params.briefOverride?.goal ??
      params.deliverable.title,
    prompt:
      params.briefOverride?.prompt ??
      params.deliverable.briefText ??
      `Create a ${params.postTypeName} creative for ${params.deliverable.title}.`,
    audience: params.briefOverride?.audience ?? params.personaName ?? undefined,
    offer: params.briefOverride?.offer ?? params.deliverable.ctaText ?? undefined,
    exactText:
      params.briefOverride?.exactText ??
      (typeof params.deliverable.sourceJson?.exactText === "string"
        ? params.deliverable.sourceJson.exactText
        : undefined),
    referenceAssetIds: params.briefOverride?.referenceAssetIds ?? [],
    includeBrandLogo: params.briefOverride?.includeBrandLogo ?? false,
    includeReraQr: params.briefOverride?.includeReraQr ?? false,
    logoAssetId: params.briefOverride?.logoAssetId ?? null,
    templateType: params.briefOverride?.templateType
  };
}

function buildCreateContext(params: {
  deliverable: Awaited<ReturnType<typeof getDeliverable>>;
  briefOverride?: Partial<CreativeBrief>;
}) {
  return {
    createMode:
      params.briefOverride?.createMode ??
      (typeof params.deliverable.sourceJson?.createMode === "string"
        ? params.deliverable.sourceJson.createMode
        : "post"),
    campaignId: params.briefOverride?.campaignId ?? params.deliverable.campaignId ?? null,
    campaignPlanId:
      params.briefOverride?.campaignPlanId ??
      (typeof params.deliverable.sourceJson?.campaignPlanId === "string"
        ? params.deliverable.sourceJson.campaignPlanId
        : null),
    seriesId: params.briefOverride?.seriesId ?? params.deliverable.seriesId ?? null,
    festivalId:
      params.briefOverride?.festivalId ??
      (typeof params.deliverable.sourceJson?.festivalId === "string"
        ? params.deliverable.sourceJson.festivalId
        : null),
    sourceOutputId:
      params.briefOverride?.sourceOutputId ??
      (typeof params.deliverable.sourceJson?.sourceOutputId === "string"
        ? params.deliverable.sourceJson.sourceOutputId
        : null),
    seriesOutputKind:
      params.briefOverride?.seriesOutputKind ??
      (params.deliverable.contentFormat === "carousel" ? "carousel" : "single_image"),
    slideCount:
      params.briefOverride?.slideCount ??
      (typeof params.deliverable.sourceJson?.slideCount === "number"
        ? params.deliverable.sourceJson.slideCount
        : null)
  };
}

function sortAssetsByIdOrder<T extends { id: string }>(assets: T[], orderedIds: string[]) {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...assets].sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));
}

export function resolveApprovalState(
  action: ApprovalAction,
  currentApprovedPostVersionId: string | null
): {
  postVersionStatus: PostVersionRecord["status"];
  deliverableStatus: Awaited<ReturnType<typeof getDeliverable>>["status"];
  approvedPostVersionId: string | null;
} {
  switch (action) {
    case "approve":
      return {
        postVersionStatus: "approved",
        deliverableStatus: "approved",
        approvedPostVersionId: null
      };
    case "request_changes":
      return {
        postVersionStatus: "rejected",
        deliverableStatus: "review",
        approvedPostVersionId: currentApprovedPostVersionId
      };
    case "reject":
      return {
        postVersionStatus: "rejected",
        deliverableStatus: "blocked",
        approvedPostVersionId: currentApprovedPostVersionId
      };
    case "close":
    default:
      return {
        postVersionStatus: "archived",
        deliverableStatus: currentApprovedPostVersionId ? "approved" : "review",
        approvedPostVersionId: currentApprovedPostVersionId
      };
  }
}

function mapVerdictToPostVersionStatus(verdict: OutputVerdict): PostVersionRecord["status"] {
  switch (verdict) {
    case "approved":
      return "approved";
    case "close":
      return "archived";
    case "off-brand":
    case "wrong-layout":
    case "wrong-text":
    default:
      return "rejected";
  }
}

export function mapVerdictToApprovalAction(verdict: OutputVerdict): ApprovalAction {
  switch (verdict) {
    case "approved":
      return "approve";
    case "close":
      return "close";
    case "off-brand":
      return "reject";
    case "wrong-layout":
    case "wrong-text":
    default:
      return "request_changes";
  }
}

function mapCreativeFormatToContentFormat(format: CreativeBrief["format"]) {
  if (format === "story") {
    return "story";
  }

  return "static";
}

function mapBriefToContentFormat(brief: CreativeBrief) {
  if (brief.seriesOutputKind === "carousel") {
    return "carousel";
  }

  return mapCreativeFormatToContentFormat(brief.format);
}
