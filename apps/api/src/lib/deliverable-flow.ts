import type {
  ApprovalAction,
  CreativeBrief,
  OutputVerdict,
  PostVersionRecord
} from "@image-lab/contracts";
import {
  getDeliverable,
  getPostVersion,
  listPostVersions
} from "./deliverables-repository.js";
import { getBrand } from "./repository.js";
import {
  listWorkspacePostTypes,
  listWorkspaceProjects
} from "./planning-repository.js";
import { supabaseAdmin } from "./supabase.js";
import { randomId } from "./utils.js";

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
        : params.action === "reject"
          ? "needs_revision"
          : params.action === "close"
            ? "needs_revision"
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
        deliverableStatus: currentApprovedPostVersionId ? "review" : "review",
        approvedPostVersionId: null
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
