import type {
  ApprovalEventRecord,
  BrandPersonaRecord,
  CalendarItemRecord,
  CampaignDeliverablePlanRecord,
  CampaignRecord,
  ChannelAccountRecord,
  ContentPillarRecord,
  DeliverableDetail,
  DeliverableRecord,
  HomeOverview,
  ObjectiveCode,
  PlanOverview,
  PostingWindowRecord,
  PostVersionAssetRecord,
  PostVersionRecord,
  PublicationRecord,
  QueueEntry,
  QueueStatusGroup,
  ReviewQueueEntry,
  SeriesRecord,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import { supabaseAdmin } from "./supabase.js";
import { createSignedUrl } from "./storage.js";
import { deriveLegacyCreativeFormat, mapDeliverableStatusToCalendarStatus } from "./deliverable-utils.js";
import { getOrPopulateRuntimeCache } from "./runtime-cache.js";

const WORKSPACE_MEMBERS_TTL_MS = 30_000;
const HOME_OVERVIEW_TTL_MS = 5_000;
const PLAN_OVERVIEW_TTL_MS = 5_000;
const QUEUE_TTL_MS = 5_000;

type BrandPersonaRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  attributes_json: Record<string, unknown> | null;
  active: boolean;
};

type ContentPillarRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};

type ChannelAccountRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  platform: ChannelAccountRecord["platform"];
  handle: string;
  display_name: string | null;
  timezone: string | null;
  external_account_id: string | null;
  config_json: Record<string, unknown> | null;
  active: boolean;
};

type PostingWindowRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  channel: PostingWindowRecord["channel"];
  weekday: PostingWindowRecord["weekday"];
  local_time: string;
  timezone: string | null;
  label: string | null;
  active: boolean;
  sort_order: number;
};

type CampaignRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  name: string;
  objective_code: CampaignRecord["objectiveCode"];
  target_persona_id: string | null;
  primary_project_id: string | null;
  key_message: string;
  cta_text: string | null;
  start_at: string | null;
  end_at: string | null;
  owner_user_id: string | null;
  kpi_goal_json: Record<string, unknown> | null;
  status: CampaignRecord["status"];
  notes_json: Record<string, unknown> | null;
};

type CampaignProjectRow = {
  campaign_id: string;
  project_id: string;
};

type CampaignPlanRow = {
  id: string;
  campaign_id: string;
  name: string;
  post_type_id: string;
  template_id: string | null;
  channel_account_id: string | null;
  placement_code: CampaignDeliverablePlanRecord["placementCode"];
  content_format: CampaignDeliverablePlanRecord["contentFormat"];
  objective_override: CampaignDeliverablePlanRecord["objectiveOverride"];
  cta_override: string | null;
  brief_override: string | null;
  scheduled_offset_days: number | null;
  sort_order: number;
  active: boolean;
};

type SeriesRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  content_pillar_id: string | null;
  name: string;
  description: string | null;
  objective_code: ObjectiveCode | null;
  post_type_id: string | null;
  creative_template_id: string | null;
  channel_account_id: string | null;
  placement_code: DeliverableRecord["placementCode"] | null;
  content_format: DeliverableRecord["contentFormat"] | null;
  owner_user_id: string | null;
  cadence_json: Record<string, unknown> | null;
  start_at: string | null;
  end_at: string | null;
  status: SeriesRecord["status"];
  source_brief_json: Record<string, unknown> | null;
};

type DeliverableRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  campaign_id: string | null;
  series_id: string | null;
  persona_id: string | null;
  content_pillar_id: string | null;
  post_type_id: string;
  creative_template_id: string | null;
  channel_account_id: string | null;
  planning_mode: DeliverableRecord["planningMode"];
  objective_code: DeliverableRecord["objectiveCode"];
  placement_code: DeliverableRecord["placementCode"];
  content_format: DeliverableRecord["contentFormat"];
  title: string;
  brief_text: string | null;
  cta_text: string | null;
  scheduled_for: string;
  due_at: string | null;
  owner_user_id: string | null;
  reviewer_user_id: string | null;
  priority: DeliverableRecord["priority"];
  status: DeliverableRecord["status"];
  approved_post_version_id: string | null;
  latest_post_version_id: string | null;
  series_occurrence_date: string | null;
  source_json: Record<string, unknown> | null;
};

type PostVersionRow = {
  id: string;
  deliverable_id: string;
  version_number: number;
  status: PostVersionRecord["status"];
  headline: string | null;
  caption: string | null;
  body_json: Record<string, unknown> | null;
  cta_text: string | null;
  hashtags: string[] | null;
  notes_json: Record<string, unknown> | null;
  created_from_prompt_package_id: string | null;
  created_from_template_id: string | null;
  created_from_output_id: string | null;
};

type PostVersionPreviewRow = {
  id: string;
  storage_path: string;
};

type PostVersionAssetRow = {
  id: string;
  post_version_id: string;
  creative_output_id: string | null;
  brand_asset_id: string | null;
  asset_role: PostVersionAssetRecord["assetRole"];
  sort_order: number;
};

type ApprovalEventRow = {
  id: string;
  deliverable_id: string;
  post_version_id: string | null;
  reviewer_user_id: string | null;
  action: ApprovalEventRecord["action"];
  comment: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

type PublicationRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  deliverable_id: string;
  post_version_id: string;
  channel_account_id: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  status: PublicationRecord["status"];
  provider: string | null;
  provider_publication_id: string | null;
  provider_payload_json: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
};

type ReviewQueueRow = {
  id: string;
  deliverable_id: string;
  version_number: number;
  status: PostVersionRecord["status"];
  headline: string | null;
  caption: string | null;
  body_json: Record<string, unknown> | null;
  cta_text: string | null;
  hashtags: string[] | null;
  notes_json: Record<string, unknown> | null;
  created_from_prompt_package_id: string | null;
  created_from_template_id: string | null;
  created_from_output_id: string | null;
  deliverable: DeliverableRow | null;
};

type ProjectNameRow = {
  id: string;
  name: string;
};

type WorkspaceMembershipRow = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRecord["role"];
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
};

type ReviewPreviewOutputRow = {
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
};

const DELIVERABLE_SELECT =
  "id, workspace_id, brand_id, project_id, campaign_id, series_id, persona_id, content_pillar_id, post_type_id, creative_template_id, channel_account_id, planning_mode, objective_code, placement_code, content_format, title, brief_text, cta_text, scheduled_for, due_at, owner_user_id, reviewer_user_id, priority, status, approved_post_version_id, latest_post_version_id, series_occurrence_date, source_json";

type DeliverableListFilters = {
  brandId?: string;
  projectId?: string;
  campaignId?: string;
  seriesId?: string;
  ownerUserId?: string;
  reviewerUserId?: string;
  planningMode?: DeliverableRecord["planningMode"];
  status?: DeliverableRecord["status"];
  statusIn?: DeliverableRecord["status"][];
  scheduledFrom?: string;
  scheduledTo?: string;
  limit?: number;
  ascending?: boolean;
};

export async function listBrandPersonas(workspaceId: string, brandId?: string) {
  let query = supabaseAdmin
    .from("brand_personas")
    .select("id, workspace_id, brand_id, name, description, attributes_json, active")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query.returns<BrandPersonaRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapBrandPersonaRow);
}

export async function getBrandPersona(personaId: string) {
  const { data, error } = await supabaseAdmin
    .from("brand_personas")
    .select("id, workspace_id, brand_id, name, description, attributes_json, active")
    .eq("id", personaId)
    .maybeSingle();
  if (error) throw error;
  const row = data as BrandPersonaRow | null;
  if (!row) throw new Error("Brand persona not found");
  return mapBrandPersonaRow(row);
}

export async function listContentPillars(workspaceId: string, brandId?: string) {
  let query = supabaseAdmin
    .from("content_pillars")
    .select("id, workspace_id, brand_id, code, name, description, active")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (brandId) {
    query = query.eq("brand_id", brandId);
  }
  const { data, error } = await query.returns<ContentPillarRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapContentPillarRow);
}

export async function getContentPillar(pillarId: string) {
  const { data, error } = await supabaseAdmin
    .from("content_pillars")
    .select("id, workspace_id, brand_id, code, name, description, active")
    .eq("id", pillarId)
    .maybeSingle();
  if (error) throw error;
  const row = data as ContentPillarRow | null;
  if (!row) throw new Error("Content pillar not found");
  return mapContentPillarRow(row);
}

export async function listChannelAccounts(workspaceId: string, brandId?: string) {
  let query = supabaseAdmin
    .from("channel_accounts")
    .select("id, workspace_id, brand_id, platform, handle, display_name, timezone, external_account_id, config_json, active")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (brandId) {
    query = query.eq("brand_id", brandId);
  }
  const { data, error } = await query.returns<ChannelAccountRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapChannelAccountRow);
}

export async function getChannelAccount(channelAccountId: string) {
  const { data, error } = await supabaseAdmin
    .from("channel_accounts")
    .select("id, workspace_id, brand_id, platform, handle, display_name, timezone, external_account_id, config_json, active")
    .eq("id", channelAccountId)
    .maybeSingle();
  if (error) throw error;
  const row = data as ChannelAccountRow | null;
  if (!row) throw new Error("Channel account not found");
  return mapChannelAccountRow(row);
}

export async function listPostingWindows(workspaceId: string, brandId?: string) {
  let query = supabaseAdmin
    .from("posting_windows")
    .select("id, workspace_id, brand_id, channel, weekday, local_time, timezone, label, active, sort_order")
    .eq("workspace_id", workspaceId)
    .order("channel", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("weekday", { ascending: true })
    .order("local_time", { ascending: true });

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query.returns<PostingWindowRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapPostingWindowRow);
}

export async function getPostingWindow(postingWindowId: string) {
  const { data, error } = await supabaseAdmin
    .from("posting_windows")
    .select("id, workspace_id, brand_id, channel, weekday, local_time, timezone, label, active, sort_order")
    .eq("id", postingWindowId)
    .maybeSingle();
  if (error) throw error;
  const row = data as PostingWindowRow | null;
  if (!row) throw new Error("Posting window not found");
  return mapPostingWindowRow(row);
}

export async function listCampaigns(
  workspaceId: string,
  filters?: { brandId?: string; projectId?: string; status?: CampaignRecord["status"] }
) {
  let query = supabaseAdmin
    .from("campaigns")
    .select("id, workspace_id, brand_id, name, objective_code, target_persona_id, primary_project_id, key_message, cta_text, start_at, end_at, owner_user_id, kpi_goal_json, status, notes_json")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (filters?.brandId) {
    query = query.eq("brand_id", filters.brandId);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.returns<CampaignRow[]>();
  if (error) throw error;
  let campaigns = data ?? [];

  if (filters?.projectId) {
    const projectIdsByCampaign = await listCampaignProjectIds(campaigns.map((campaign) => campaign.id));
    campaigns = campaigns.filter((campaign) => projectIdsByCampaign.get(campaign.id)?.includes(filters.projectId!));
    return campaigns.map((row) => mapCampaignRow(row, projectIdsByCampaign.get(row.id) ?? []));
  }

  const projectIdsByCampaign = await listCampaignProjectIds(campaigns.map((campaign) => campaign.id));
  return campaigns.map((row) => mapCampaignRow(row, projectIdsByCampaign.get(row.id) ?? []));
}

export async function getCampaign(campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, workspace_id, brand_id, name, objective_code, target_persona_id, primary_project_id, key_message, cta_text, start_at, end_at, owner_user_id, kpi_goal_json, status, notes_json")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  const row = data as CampaignRow | null;
  if (!row) throw new Error("Campaign not found");
  const projectIds = (await listCampaignProjectIds([campaignId])).get(campaignId) ?? [];
  return mapCampaignRow(row, projectIds);
}

export async function listCampaignDeliverablePlans(campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("campaign_deliverable_plans")
    .select("id, campaign_id, name, post_type_id, template_id, channel_account_id, placement_code, content_format, objective_override, cta_override, brief_override, scheduled_offset_days, sort_order, active")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .returns<CampaignPlanRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapCampaignPlanRow);
}

export async function getCampaignDeliverablePlan(planId: string) {
  const { data, error } = await supabaseAdmin
    .from("campaign_deliverable_plans")
    .select("id, campaign_id, name, post_type_id, template_id, channel_account_id, placement_code, content_format, objective_override, cta_override, brief_override, scheduled_offset_days, sort_order, active")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  const row = data as CampaignPlanRow | null;
  if (!row) throw new Error("Campaign deliverable plan not found");
  return mapCampaignPlanRow(row);
}

export async function listSeries(
  workspaceId: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    status?: SeriesRecord["status"];
  }
) {
  let query = supabaseAdmin
    .from("series")
    .select("id, workspace_id, brand_id, project_id, content_pillar_id, name, description, objective_code, post_type_id, creative_template_id, channel_account_id, placement_code, content_format, owner_user_id, cadence_json, start_at, end_at, status, source_brief_json")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (filters?.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query.returns<SeriesRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapSeriesRow);
}

export async function getSeries(seriesId: string) {
  const { data, error } = await supabaseAdmin
    .from("series")
    .select("id, workspace_id, brand_id, project_id, content_pillar_id, name, description, objective_code, post_type_id, creative_template_id, channel_account_id, placement_code, content_format, owner_user_id, cadence_json, start_at, end_at, status, source_brief_json")
    .eq("id", seriesId)
    .maybeSingle();
  if (error) throw error;
  const row = data as SeriesRow | null;
  if (!row) throw new Error("Series not found");
  return mapSeriesRow(row);
}

export async function listDeliverables(
  workspaceId: string,
  filters?: DeliverableListFilters
) {
  let query = buildDeliverableQuery(workspaceId, filters);
  const { data, error } = await query.returns<DeliverableRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapDeliverableRow);
}

function buildDeliverableQuery(
  workspaceId: string,
  filters?: DeliverableListFilters,
  options?: { includeCount?: boolean }
) {
  let query = supabaseAdmin
    .from("deliverables")
    .select(DELIVERABLE_SELECT, options?.includeCount ? { count: "exact" } : undefined)
    .eq("workspace_id", workspaceId)
    .order("scheduled_for", { ascending: filters?.ascending ?? true });

  if (filters?.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);
  if (filters?.campaignId) query = query.eq("campaign_id", filters.campaignId);
  if (filters?.seriesId) query = query.eq("series_id", filters.seriesId);
  if (filters?.ownerUserId === "unassigned") {
    query = query.is("owner_user_id", null);
  } else if (filters?.ownerUserId) {
    query = query.eq("owner_user_id", filters.ownerUserId);
  }
  if (filters?.reviewerUserId === "unassigned") {
    query = query.is("reviewer_user_id", null);
  } else if (filters?.reviewerUserId) {
    query = query.eq("reviewer_user_id", filters.reviewerUserId);
  }
  if (filters?.planningMode) query = query.eq("planning_mode", filters.planningMode);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.statusIn && filters.statusIn.length > 0) {
    query = query.in("status", filters.statusIn);
  }
  if (filters?.scheduledFrom) query = query.gte("scheduled_for", filters.scheduledFrom);
  if (filters?.scheduledTo) query = query.lt("scheduled_for", filters.scheduledTo);
  if (filters?.limit) query = query.limit(filters.limit);

  return query;
}

type DeliverablePreviewVersionRow = {
  id: string;
  created_from_output_id: string | null;
};

type DeliverablePreviewOutputRow = {
  id: string;
  storage_path: string;
};

export async function attachDeliverablePreviews(deliverables: DeliverableRecord[]) {
  const versionIds = Array.from(
    new Set(
      deliverables
        .map((deliverable) => deliverable.approvedPostVersionId ?? deliverable.latestPostVersionId)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (versionIds.length === 0) {
    return deliverables;
  }

  const { data: versionRows, error: versionError } = await supabaseAdmin
    .from("post_versions")
    .select("id, created_from_output_id")
    .in("id", versionIds)
    .returns<DeliverablePreviewVersionRow[]>();

  if (versionError) throw versionError;

  const outputIds = Array.from(
    new Set((versionRows ?? []).map((row) => row.created_from_output_id).filter((value): value is string => Boolean(value)))
  );

  if (outputIds.length === 0) {
    return deliverables;
  }

  const { data: outputRows, error: outputError } = await supabaseAdmin
    .from("creative_outputs")
    .select("id, storage_path")
    .in("id", outputIds)
    .returns<DeliverablePreviewOutputRow[]>();

  if (outputError) throw outputError;

  const previewEntries = await Promise.all(
    (outputRows ?? []).map(async (row) => {
      const previewUrl = await createSignedUrl(row.storage_path).catch(() => null);
      return [row.id, previewUrl] as const;
    })
  );

  const previewByOutputId = new Map(previewEntries);
  const previewByVersionId = new Map(
    (versionRows ?? []).map((row) => [row.id, row.created_from_output_id ? previewByOutputId.get(row.created_from_output_id) ?? undefined : undefined])
  );

  return deliverables.map((deliverable) => {
    const versionId = deliverable.approvedPostVersionId ?? deliverable.latestPostVersionId;
    if (!versionId) {
      return deliverable;
    }

    return {
      ...deliverable,
      previewUrl: previewByVersionId.get(versionId) ?? undefined
    };
  });
}

export async function getDeliverable(deliverableId: string) {
  const { data, error } = await supabaseAdmin
    .from("deliverables")
    .select(DELIVERABLE_SELECT)
    .eq("id", deliverableId)
    .maybeSingle();
  if (error) throw error;
  const row = data as DeliverableRow | null;
  if (!row) throw new Error("Deliverable not found");
  return mapDeliverableRow(row);
}

export async function listPostVersions(deliverableId: string) {
  const { data, error } = await supabaseAdmin
    .from("post_versions")
    .select("id, deliverable_id, version_number, status, headline, caption, body_json, cta_text, hashtags, notes_json, created_from_prompt_package_id, created_from_template_id, created_from_output_id")
    .eq("deliverable_id", deliverableId)
    .order("version_number", { ascending: false })
    .returns<PostVersionRow[]>();
  if (error) throw error;
  return attachPostVersionPreviews((data ?? []).map(mapPostVersionRow));
}

export async function getPostVersion(postVersionId: string) {
  const { data, error } = await supabaseAdmin
    .from("post_versions")
    .select("id, deliverable_id, version_number, status, headline, caption, body_json, cta_text, hashtags, notes_json, created_from_prompt_package_id, created_from_template_id, created_from_output_id")
    .eq("id", postVersionId)
    .maybeSingle();
  if (error) throw error;
  const row = data as PostVersionRow | null;
  if (!row) throw new Error("Post version not found");
  const [postVersion] = await attachPostVersionPreviews([mapPostVersionRow(row)]);
  if (!postVersion) throw new Error("Post version not found");
  return postVersion;
}

export async function listPostVersionAssets(postVersionId: string) {
  const { data, error } = await supabaseAdmin
    .from("post_version_assets")
    .select("id, post_version_id, creative_output_id, brand_asset_id, asset_role, sort_order")
    .eq("post_version_id", postVersionId)
    .order("sort_order", { ascending: true })
    .returns<PostVersionAssetRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapPostVersionAssetRow);
}

export async function listApprovalEvents(deliverableId: string) {
  const { data, error } = await supabaseAdmin
    .from("approval_events")
    .select("id, deliverable_id, post_version_id, reviewer_user_id, action, comment, metadata_json, created_at")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false })
    .returns<ApprovalEventRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapApprovalEventRow);
}

export async function listPublications(
  workspaceId: string,
  filters?: { deliverableId?: string; status?: PublicationRecord["status"] }
) {
  let query = supabaseAdmin
    .from("publications")
    .select("id, workspace_id, brand_id, deliverable_id, post_version_id, channel_account_id, scheduled_for, published_at, status, provider, provider_publication_id, provider_payload_json, error_json")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (filters?.deliverableId) query = query.eq("deliverable_id", filters.deliverableId);
  if (filters?.status) query = query.eq("status", filters.status);
  const { data, error } = await query.returns<PublicationRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapPublicationRow);
}

export async function getPublication(publicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("publications")
    .select("id, workspace_id, brand_id, deliverable_id, post_version_id, channel_account_id, scheduled_for, published_at, status, provider, provider_publication_id, provider_payload_json, error_json")
    .eq("id", publicationId)
    .maybeSingle();
  if (error) throw error;
  const row = data as PublicationRow | null;
  if (!row) throw new Error("Publication not found");
  return mapPublicationRow(row);
}

export async function getDeliverableDetail(deliverableId: string): Promise<DeliverableDetail> {
  const deliverable = await getDeliverable(deliverableId);

  const [series, postVersions, publications] = await Promise.all([
    deliverable.seriesId ? getSeries(deliverable.seriesId).catch(() => null) : Promise.resolve(null),
    listPostVersions(deliverableId),
    listPublicationsForDeliverable(deliverableId)
  ]);

  return {
    deliverable,
    series,
    postVersions,
    publications
  };
}

export async function listReviewQueue(
  workspaceId: string,
  brandId?: string,
  deliverableId?: string,
  filters?: { scope?: "my" | "team" | "unassigned"; reviewerUserId?: string }
): Promise<ReviewQueueEntry[]> {
  let query = supabaseAdmin
    .from("post_versions")
    .select(`
      id,
      deliverable_id,
      version_number,
      status,
      headline,
      caption,
      body_json,
      cta_text,
      hashtags,
      notes_json,
      created_from_prompt_package_id,
      created_from_template_id,
      created_from_output_id,
      deliverable:deliverables!post_versions_deliverable_id_fkey(
        id,
        workspace_id,
        brand_id,
        project_id,
        campaign_id,
        series_id,
        persona_id,
        content_pillar_id,
        post_type_id,
        creative_template_id,
        channel_account_id,
        planning_mode,
        objective_code,
        placement_code,
        content_format,
        title,
        brief_text,
        cta_text,
        scheduled_for,
        due_at,
        owner_user_id,
        reviewer_user_id,
        priority,
        status,
        approved_post_version_id,
        latest_post_version_id,
        series_occurrence_date,
        source_json
      )
    `)
    .eq("deliverable.workspace_id", workspaceId)
    .in("status", ["draft", "in_review"])
    .order("created_at", { ascending: false });

  if (brandId) {
    query = query.eq("deliverable.brand_id", brandId);
  }
  if (deliverableId) {
    query = query.eq("deliverable_id", deliverableId);
  }
  if (filters?.scope === "my" && filters.reviewerUserId) {
    query = query.eq("deliverable.reviewer_user_id", filters.reviewerUserId);
  }
  if (filters?.scope === "unassigned") {
    query = query.is("deliverable.reviewer_user_id", null);
  }

  const { data, error } = await query.returns<ReviewQueueRow[]>();
  if (error) throw error;

  const rows = (data ?? []).filter((row): row is ReviewQueueRow & { deliverable: DeliverableRow } => Boolean(row.deliverable));
  const postVersionIds = rows.map((row) => row.id);

  let previewOutputsByPostVersion = new Map<string, ReviewPreviewOutputRow>();

  if (postVersionIds.length > 0) {
    const { data: previewData, error: previewError } = await supabaseAdmin
      .from("creative_outputs")
      .select(`
        id,
        workspace_id,
        brand_id,
        deliverable_id,
        project_id,
        post_type_id,
        creative_template_id,
        calendar_item_id,
        job_id,
        post_version_id,
        kind,
        storage_path,
        provider_url,
        output_index,
        review_state,
        latest_feedback_verdict,
        reviewed_at
      `)
      .in("post_version_id", postVersionIds)
      .eq("kind", "final")
      .order("created_at", { ascending: false })
      .returns<ReviewPreviewOutputRow[]>();

    if (previewError) throw previewError;

    previewOutputsByPostVersion = new Map(
      (previewData ?? [])
        .filter((row) => row.post_version_id)
        .map((row) => [row.post_version_id!, row])
    );
  }

  return rows.map((row) => ({
    deliverable: mapDeliverableRow(row.deliverable),
    postVersion: mapPostVersionRow(row),
    previewOutput: mapReviewOutputRow(previewOutputsByPostVersion.get(row.id) ?? null)
  }));
}

export async function buildDeliverableSnapshot(deliverableId: string) {
  const deliverable = await getDeliverable(deliverableId);

  const [
    persona,
    contentPillar,
    channelAccount,
    campaign,
    series,
    latestPostVersion
  ] = await Promise.all([
    deliverable.personaId ? getBrandPersona(deliverable.personaId).catch(() => null) : Promise.resolve(null),
    deliverable.contentPillarId ? getContentPillar(deliverable.contentPillarId).catch(() => null) : Promise.resolve(null),
    deliverable.channelAccountId ? getChannelAccount(deliverable.channelAccountId).catch(() => null) : Promise.resolve(null),
    deliverable.campaignId ? getCampaign(deliverable.campaignId).catch(() => null) : Promise.resolve(null),
    deliverable.seriesId ? getSeries(deliverable.seriesId).catch(() => null) : Promise.resolve(null),
    deliverable.latestPostVersionId ? getPostVersion(deliverable.latestPostVersionId).catch(() => null) : Promise.resolve(null)
  ]);

  return {
    deliverable,
    persona,
    contentPillar,
    channelAccount,
    campaign,
    series,
    latestPostVersion
  };
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
  return getOrPopulateRuntimeCache(`workspace-members:${workspaceId}`, WORKSPACE_MEMBERS_TTL_MS, async () => {
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("workspace_memberships")
      .select("workspace_id, user_id, role")
      .eq("workspace_id", workspaceId)
      .returns<WorkspaceMembershipRow[]>();

    if (membershipError) throw membershipError;

    const userIds = Array.from(new Set((memberships ?? []).map((membership) => membership.user_id)));
    if (userIds.length === 0) {
      return [];
    }

    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds)
      .returns<ProfileRow[]>();

    if (profileError) throw profileError;

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return (memberships ?? [])
      .map((membership) => {
        const profile = profileMap.get(membership.user_id);
        if (!profile) return null;
        return {
          id: membership.user_id,
          workspaceId: membership.workspace_id,
          email: profile.email,
          displayName: profile.display_name,
          role: membership.role
        } satisfies WorkspaceMemberRecord;
      })
      .filter((member): member is WorkspaceMemberRecord => Boolean(member));
  });
}

export async function getHomeOverview(workspaceId: string, brandId?: string): Promise<HomeOverview> {
  return getOrPopulateRuntimeCache(`home-overview:${workspaceId}:${brandId ?? "all"}`, HOME_OVERVIEW_TTL_MS, async () => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = addDays(dayStart, 1);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [dueToday, needsReview, approvedNotScheduled, thisWeek, blocked] = await Promise.all([
      fetchDeliverableSectionWithCustomQuery(
        supabaseAdmin
          .from("deliverables")
          .select(DELIVERABLE_SELECT, { count: "exact" })
          .eq("workspace_id", workspaceId)
          .or(
            `and(due_at.gte.${dayStart.toISOString()},due_at.lt.${dayEnd.toISOString()}),and(due_at.is.null,scheduled_for.gte.${dayStart.toISOString()},scheduled_for.lt.${dayEnd.toISOString()})`
          )
          .not("status", "in", "(published,archived)")
          .order("scheduled_for", { ascending: true }),
        brandId
      ),
      fetchDeliverableSection(workspaceId, {
        ...(brandId ? { brandId } : {}),
        status: "review"
      }),
      fetchDeliverableSection(workspaceId, {
        ...(brandId ? { brandId } : {}),
        status: "approved"
      }),
      fetchDeliverableSection(workspaceId, {
        ...(brandId ? { brandId } : {}),
        statusIn: ["approved", "scheduled", "published"],
        scheduledFrom: now.toISOString(),
        scheduledTo: weekEnd.toISOString()
      }),
      fetchDeliverableSection(workspaceId, {
        ...(brandId ? { brandId } : {}),
        status: "blocked"
      })
    ]);

    return {
      dueToday,
      needsReview,
      approvedNotScheduled,
      thisWeek,
      blocked
    };
  });
}

export async function getPlanOverview(workspaceId: string, brandId?: string): Promise<PlanOverview> {
  return getOrPopulateRuntimeCache(`plan-overview:${workspaceId}:${brandId ?? "all"}`, PLAN_OVERVIEW_TTL_MS, async () => {
    const [campaigns, series, unscheduledPostTasks, upcomingPostTasks] = await Promise.all([
      listCampaigns(workspaceId, { ...(brandId ? { brandId } : {}), status: "active" }),
      listSeries(workspaceId, { ...(brandId ? { brandId } : {}), status: "active" }),
      listDeliverables(workspaceId, {
        ...(brandId ? { brandId } : {}),
        statusIn: ["planned", "brief_ready", "generating", "review", "approved", "blocked"],
        limit: 12
      }),
      listDeliverables(workspaceId, {
        ...(brandId ? { brandId } : {}),
        statusIn: ["planned", "brief_ready", "generating", "review", "approved", "scheduled", "published", "blocked"],
        scheduledFrom: new Date().toISOString(),
        scheduledTo: addDays(new Date(), 30).toISOString(),
        limit: 18
      })
    ]);

    return {
      activeCampaigns: campaigns,
      activeSeries: series,
      unscheduledPostTasks: unscheduledPostTasks
        .filter((deliverable) => !["scheduled", "published", "archived"].includes(deliverable.status))
        .sort((left, right) => new Date(left.dueAt ?? left.scheduledFor).getTime() - new Date(right.dueAt ?? right.scheduledFor).getTime())
        .slice(0, 12),
      upcomingPostTasks: await attachDeliverablePreviews(
        upcomingPostTasks
          .sort((left, right) => new Date(left.dueAt ?? left.scheduledFor).getTime() - new Date(right.dueAt ?? right.scheduledFor).getTime())
          .slice(0, 18)
      )
    };
  });
}

export async function listQueueEntries(
  workspaceId: string,
  viewerUserId: string,
  filters?: {
    scope?: "my" | "team" | "unassigned";
    brandId?: string;
    projectId?: string;
    statusGroup?: QueueStatusGroup;
    planningMode?: DeliverableRecord["planningMode"];
    dueWindow?: "today" | "week" | "overdue";
  }
): Promise<QueueEntry[]> {
  return getOrPopulateRuntimeCache(
    `queue:${workspaceId}:${viewerUserId}:${serializeQueueFilters(filters)}`,
    QUEUE_TTL_MS,
    async () => {
      const statusIn = filters?.statusGroup
        ? QUEUE_STATUS_GROUPS[filters.statusGroup]
        : ["planned", "brief_ready", "generating", "review", "approved", "scheduled", "blocked"] satisfies DeliverableRecord["status"][];

      let deliverables = await listDeliverables(workspaceId, {
        ...(filters?.brandId ? { brandId: filters.brandId } : {}),
        ...(filters?.projectId ? { projectId: filters.projectId } : {}),
        ...(filters?.planningMode ? { planningMode: filters.planningMode } : {}),
        ...(filters?.scope === "my" ? { ownerUserId: viewerUserId } : {}),
        ...(filters?.scope === "unassigned" ? { ownerUserId: "unassigned" } : {}),
        statusIn
      });

      if (filters?.dueWindow) {
        const now = new Date();
        const today = dateKey(now);
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);

        deliverables = deliverables.filter((deliverable) => {
          const dueBasis = new Date(deliverable.dueAt ?? deliverable.scheduledFor);
          if (filters.dueWindow === "today") return dateKey(dueBasis) === today;
          if (filters.dueWindow === "overdue") return dueBasis < now;
          return dueBasis >= now && dueBasis <= weekEnd;
        });
      }

      if (deliverables.length === 0) {
        return [];
      }

      deliverables = await attachDeliverablePreviews(deliverables);

      const ownerIds = Array.from(
        new Set(deliverables.map((deliverable) => deliverable.ownerUserId).filter((value): value is string => Boolean(value)))
      );
      const projectIds = deliverables.map((deliverable) => deliverable.projectId);
      const campaignIds = deliverables.map((deliverable) => deliverable.campaignId).filter(Boolean) as string[];
      const seriesIds = deliverables.map((deliverable) => deliverable.seriesId).filter(Boolean) as string[];

      const [members, projectMap, campaignMap, seriesMap] = await Promise.all([
        ownerIds.length > 0 ? listWorkspaceMembers(workspaceId) : Promise.resolve([]),
        listProjectNames(projectIds),
        loadCampaignMap(workspaceId, campaignIds),
        loadSeriesMap(workspaceId, seriesIds)
      ]);

      const memberMap = new Map(members.map((member) => [member.id, member]));

      return deliverables
        .sort((left, right) => {
          const leftDate = new Date(left.dueAt ?? left.scheduledFor).getTime();
          const rightDate = new Date(right.dueAt ?? right.scheduledFor).getTime();
          return leftDate - rightDate;
        })
        .map((deliverable) => ({
          deliverable,
          assignee: deliverable.ownerUserId ? memberMap.get(deliverable.ownerUserId) ?? null : null,
          campaign: deliverable.campaignId ? campaignMap.get(deliverable.campaignId) ?? null : null,
          series: deliverable.seriesId ? seriesMap.get(deliverable.seriesId) ?? null : null,
          projectName: deliverable.projectId ? projectMap.get(deliverable.projectId) ?? null : null,
          nextActionLabel: getNextActionLabel(deliverable.status),
          statusGroup: mapQueueStatusGroup(deliverable.status)
        }));
    }
  );
}

async function fetchDeliverableSection(workspaceId: string, filters: DeliverableListFilters) {
  const query = buildDeliverableQuery(workspaceId, { ...filters, limit: 5 }, { includeCount: true });
  const { data, error, count } = await query.returns<DeliverableRow[]>();
  if (error) throw error;
  return createHomeSection((data ?? []).map(mapDeliverableRow), count ?? (data ?? []).length);
}

async function fetchDeliverableSectionWithCustomQuery(query: unknown, brandId?: string) {
  let scopedQuery: any = query;
  if (brandId) {
    scopedQuery = scopedQuery.eq("brand_id", brandId);
  }

  const { data, error, count } = (await scopedQuery.limit(5).returns()) as {
    data: DeliverableRow[] | null;
    error: unknown;
    count: number | null;
  };
  if (error) throw error;
  return createHomeSection((data ?? []).map(mapDeliverableRow), count ?? (data ?? []).length);
}

export function mapDeliverableToCalendarItem(deliverable: DeliverableRecord): CalendarItemRecord {
  return {
    id: deliverable.id,
    deliverableId: deliverable.id,
    workspaceId: deliverable.workspaceId,
    brandId: deliverable.brandId,
    projectId: deliverable.projectId ?? null,
    postTypeId: deliverable.postTypeId,
    creativeTemplateId: deliverable.creativeTemplateId,
    approvedOutputId: null,
    title: deliverable.title,
    objective: deliverable.briefText,
    channel: deliverable.placementCode,
    format: deriveLegacyCreativeFormat(deliverable.placementCode, deliverable.contentFormat, deliverable.sourceJson),
    scheduledFor: deliverable.scheduledFor,
    status: mapDeliverableStatusToCalendarStatus(deliverable.status),
    ownerUserId: deliverable.ownerUserId,
    notesJson: deliverable.sourceJson ?? {}
  };
}

async function listCampaignProjectIds(campaignIds: string[]) {
  const map = new Map<string, string[]>();

  if (campaignIds.length === 0) {
    return map;
  }

  const { data, error } = await supabaseAdmin
    .from("campaign_projects")
    .select("campaign_id, project_id")
    .in("campaign_id", campaignIds)
    .returns<CampaignProjectRow[]>();
  if (error) throw error;

  for (const row of data ?? []) {
    const current = map.get(row.campaign_id);
    if (current) {
      current.push(row.project_id);
    } else {
      map.set(row.campaign_id, [row.project_id]);
    }
  }

  return map;
}

async function listPublicationsForDeliverable(deliverableId: string) {
  const { data, error } = await supabaseAdmin
    .from("publications")
    .select("id, workspace_id, brand_id, deliverable_id, post_version_id, channel_account_id, scheduled_for, published_at, status, provider, provider_publication_id, provider_payload_json, error_json")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false })
    .returns<PublicationRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapPublicationRow);
}

function mapBrandPersonaRow(row: BrandPersonaRow): BrandPersonaRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    name: row.name,
    description: row.description,
    attributesJson: row.attributes_json ?? {},
    active: row.active
  };
}

function mapContentPillarRow(row: ContentPillarRow): ContentPillarRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    code: row.code,
    name: row.name,
    description: row.description,
    active: row.active
  };
}

function mapChannelAccountRow(row: ChannelAccountRow): ChannelAccountRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    platform: row.platform,
    handle: row.handle,
    displayName: row.display_name,
    timezone: row.timezone,
    externalAccountId: row.external_account_id,
    configJson: row.config_json ?? {},
    active: row.active
  };
}

function mapPostingWindowRow(row: PostingWindowRow): PostingWindowRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    channel: row.channel,
    weekday: row.weekday,
    localTime: row.local_time,
    timezone: row.timezone,
    label: row.label,
    active: row.active,
    sortOrder: row.sort_order
  };
}

function mapCampaignRow(row: CampaignRow, projectIds: string[]): CampaignRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    name: row.name,
    objectiveCode: row.objective_code,
    targetPersonaId: row.target_persona_id,
    primaryProjectId: row.primary_project_id,
    projectIds,
    keyMessage: row.key_message,
    ctaText: row.cta_text,
    startAt: row.start_at,
    endAt: row.end_at,
    ownerUserId: row.owner_user_id,
    kpiGoalJson: row.kpi_goal_json ?? {},
    status: row.status,
    notesJson: row.notes_json ?? {}
  };
}

function mapCampaignPlanRow(row: CampaignPlanRow): CampaignDeliverablePlanRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    postTypeId: row.post_type_id,
    templateId: row.template_id,
    channelAccountId: row.channel_account_id,
    placementCode: row.placement_code,
    contentFormat: row.content_format,
    objectiveOverride: row.objective_override,
    ctaOverride: row.cta_override,
    briefOverride: row.brief_override,
    scheduledOffsetDays: row.scheduled_offset_days,
    sortOrder: row.sort_order,
    active: row.active
  };
}

function mapSeriesRow(row: SeriesRow): SeriesRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    contentPillarId: row.content_pillar_id,
    name: row.name,
    description: row.description,
    objectiveCode: row.objective_code,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    channelAccountId: row.channel_account_id,
    placementCode: row.placement_code,
    contentFormat: row.content_format,
    ownerUserId: row.owner_user_id,
    cadence: {
      frequency: "weekly",
      interval: Number(row.cadence_json?.interval ?? 1),
      weekdays: Array.isArray(row.cadence_json?.weekdays) ? (row.cadence_json?.weekdays as SeriesRecord["cadence"]["weekdays"]) : [],
      occurrencesAhead: Number(row.cadence_json?.occurrencesAhead ?? 30)
    },
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    sourceBriefJson: row.source_brief_json ?? {}
  };
}

function mapDeliverableRow(row: DeliverableRow): DeliverableRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    campaignId: row.campaign_id,
    seriesId: row.series_id,
    personaId: row.persona_id,
    contentPillarId: row.content_pillar_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    channelAccountId: row.channel_account_id,
    planningMode: row.planning_mode,
    objectiveCode: row.objective_code,
    placementCode: row.placement_code,
    contentFormat: row.content_format,
    title: row.title,
    briefText: row.brief_text,
    ctaText: row.cta_text,
    scheduledFor: row.scheduled_for,
    dueAt: row.due_at,
    ownerUserId: row.owner_user_id,
    reviewerUserId: row.reviewer_user_id,
    priority: row.priority,
    status: row.status,
    approvedPostVersionId: row.approved_post_version_id,
    latestPostVersionId: row.latest_post_version_id,
    seriesOccurrenceDate: row.series_occurrence_date,
    sourceJson: row.source_json ?? {}
  };
}

function mapPostVersionRow(row: PostVersionRow): PostVersionRecord {
  return {
    id: row.id,
    deliverableId: row.deliverable_id,
    versionNumber: row.version_number,
    status: row.status,
    headline: row.headline,
    caption: row.caption,
    bodyJson: row.body_json ?? {},
    ctaText: row.cta_text,
    hashtags: row.hashtags ?? [],
    notesJson: row.notes_json ?? {},
    createdFromPromptPackageId: row.created_from_prompt_package_id,
    createdFromTemplateId: row.created_from_template_id,
    createdFromOutputId: row.created_from_output_id
  };
}

async function attachPostVersionPreviews(postVersions: PostVersionRecord[]) {
  const outputIds = Array.from(
    new Set(postVersions.map((postVersion) => postVersion.createdFromOutputId).filter((value): value is string => Boolean(value)))
  );

  if (outputIds.length === 0) {
    return postVersions;
  }

  const { data, error } = await supabaseAdmin
    .from("creative_outputs")
    .select("id, storage_path")
    .in("id", outputIds)
    .returns<PostVersionPreviewRow[]>();

  if (error) throw error;

  const previewEntries = await Promise.all(
    (data ?? []).map(async (row) => {
      const previewUrl = await createSignedUrl(row.storage_path).catch(() => null);
      return [row.id, previewUrl] as const;
    })
  );

  const previewMap = new Map(previewEntries);

  return postVersions.map((postVersion) => ({
    ...postVersion,
    previewUrl: postVersion.createdFromOutputId ? previewMap.get(postVersion.createdFromOutputId) ?? undefined : undefined
  }));
}

function mapPostVersionAssetRow(row: PostVersionAssetRow): PostVersionAssetRecord {
  return {
    id: row.id,
    postVersionId: row.post_version_id,
    creativeOutputId: row.creative_output_id,
    brandAssetId: row.brand_asset_id,
    assetRole: row.asset_role,
    sortOrder: row.sort_order
  };
}

function mapApprovalEventRow(row: ApprovalEventRow): ApprovalEventRecord {
  return {
    id: row.id,
    deliverableId: row.deliverable_id,
    postVersionId: row.post_version_id,
    reviewerUserId: row.reviewer_user_id,
    action: row.action,
    comment: row.comment,
    metadataJson: row.metadata_json ?? {},
    createdAt: row.created_at
  };
}

function mapPublicationRow(row: PublicationRow): PublicationRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    postVersionId: row.post_version_id,
    channelAccountId: row.channel_account_id,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    status: row.status,
    provider: row.provider,
    providerPublicationId: row.provider_publication_id,
    providerPayloadJson: row.provider_payload_json ?? {},
    errorJson: row.error_json ?? null
  };
}

function mapReviewOutputRow(row: ReviewPreviewOutputRow | null) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    calendarItemId: row.calendar_item_id,
    jobId: row.job_id,
    postVersionId: row.post_version_id,
    kind: row.kind,
    storagePath: row.storage_path,
    providerUrl: row.provider_url,
    outputIndex: row.output_index,
    reviewState: row.review_state,
    latestVerdict: row.latest_feedback_verdict,
    reviewedAt: row.reviewed_at
  };
}

function createHomeSection(items: DeliverableRecord[], count = items.length) {
  return {
    count,
    items: items.slice(0, 6)
  };
}

const QUEUE_STATUS_GROUPS: Record<QueueStatusGroup, DeliverableRecord["status"][]> = {
  todo: ["planned", "brief_ready"],
  in_progress: ["generating", "review"],
  ready_to_ship: ["approved", "scheduled"],
  done: ["published", "archived"],
  blocked: ["blocked"]
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function mapQueueStatusGroup(status: DeliverableRecord["status"]): QueueStatusGroup {
  switch (status) {
    case "planned":
    case "brief_ready":
      return "todo";
    case "generating":
    case "review":
      return "in_progress";
    case "approved":
    case "scheduled":
      return "ready_to_ship";
    case "published":
    case "archived":
      return "done";
    case "blocked":
      return "blocked";
  }
}

function getNextActionLabel(status: DeliverableRecord["status"]) {
  switch (status) {
    case "planned":
    case "brief_ready":
      return "Create options";
    case "generating":
      return "Open create";
    case "review":
      return "Open review";
    case "approved":
      return "Schedule";
    case "scheduled":
      return "Edit schedule";
    case "published":
    case "archived":
      return "Open post task";
    case "blocked":
      return "Edit details";
  }
}

async function listProjectNames(projectIds: Array<string | null | undefined>) {
  const uniqueIds = Array.from(
    new Set(projectIds.filter((projectId): projectId is string => Boolean(projectId)))
  );
  if (uniqueIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .in("id", uniqueIds)
    .returns<ProjectNameRow[]>();

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

async function loadCampaignMap(workspaceId: string, campaignIds: string[]) {
  const uniqueIds = Array.from(new Set(campaignIds));
  if (uniqueIds.length === 0) {
    return new Map<string, CampaignRecord>();
  }

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, workspace_id, brand_id, name, objective_code, target_persona_id, primary_project_id, key_message, cta_text, start_at, end_at, owner_user_id, kpi_goal_json, status, notes_json")
    .eq("workspace_id", workspaceId)
    .in("id", uniqueIds)
    .returns<CampaignRow[]>();

  if (error) throw error;

  const projectIdsByCampaign = await listCampaignProjectIds(uniqueIds);
  return new Map(
    (data ?? []).map((campaign) => [campaign.id, mapCampaignRow(campaign, projectIdsByCampaign.get(campaign.id) ?? [])])
  );
}

async function loadSeriesMap(workspaceId: string, seriesIds: string[]) {
  const uniqueIds = Array.from(new Set(seriesIds));
  if (uniqueIds.length === 0) {
    return new Map<string, SeriesRecord>();
  }

  const { data, error } = await supabaseAdmin
    .from("series")
    .select("id, workspace_id, brand_id, project_id, content_pillar_id, name, description, objective_code, post_type_id, creative_template_id, channel_account_id, placement_code, content_format, owner_user_id, cadence_json, start_at, end_at, status, source_brief_json")
    .eq("workspace_id", workspaceId)
    .in("id", uniqueIds)
    .returns<SeriesRow[]>();

  if (error) throw error;

  return new Map((data ?? []).map((series) => [series.id, mapSeriesRow(series)]));
}

function serializeQueueFilters(
  filters:
    | {
        scope?: "my" | "team" | "unassigned";
        brandId?: string;
        projectId?: string;
        statusGroup?: QueueStatusGroup;
        planningMode?: DeliverableRecord["planningMode"];
        dueWindow?: "today" | "week" | "overdue";
      }
    | undefined
) {
  if (!filters) {
    return "default";
  }

  return [
    filters.scope ?? "team",
    filters.brandId ?? "all-brands",
    filters.projectId ?? "all-projects",
    filters.statusGroup ?? "all-statuses",
    filters.planningMode ?? "all-modes",
    filters.dueWindow ?? "all-dates"
  ].join(":");
}
