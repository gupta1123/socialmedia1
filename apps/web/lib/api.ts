import type {
  AiImageEditResponse,
  AdminAuditResponse,
  AdminCreditAdjustRequest,
  AdminCreditGrantRequest,
  AdminCreditMutationResponse,
  AdminCreditWorkspaceListResponse,
  AdminOpsSummary,
  AdminOrgDetail,
  AdminOrgListResponse,
  AdminOverview,
  AdminPlatformAdminListResponse,
  AdminPlatformAdminMutationResponse,
  AdminPlatformAdminUpdateRequest,
  AdminPlatformAdminUpsertRequest,
  WorkspaceCreditLedgerResponse,
  WorkspaceCreditWallet,
  ImageEditPromptComposerResponse,
  AiSegmentationResponse,
  CampaignDeliverablePlanRecord,
  CampaignRecord,
  BrandDetail,
  BrandPersonaRecord,
  BootstrapResponse,
  CalendarItemRecord,
  ChannelAccountRecord,
  ContentPillarRecord,
  CreateWorkspaceMemberInput,
  SetWorkspaceMemberPasswordInput,
  CreateCampaignDeliverablePlanInput,
  CreateCampaignInput,
  CreateSeriesInput,
  CreateCalendarItemInput,
  CreateBrandInput,
  CreateCreativeTemplateInput,
  CreateDeliverableInput,
  CreatePublicationInput,
  CreateProjectInput,
  CreativeJobRecord,
  CreativeOutputRecord,
  CreativeRunDetail,
  CreativeRunSummary,
  CreativeTemplateDetail,
  CreativeTemplateRecord,
  CreativeBrief,
  DeliverableDetail,
  DeliverableRecord,
  ExternalPostReviewMode,
  ExternalPostUploadResponse,
  FestivalRecord,
  FeedbackRequest,
  FeedbackResult,
  FinalGenerationRequest,
  ImageEditPlanResponse,
  CreatePostingWindowInput,
  HomeOverview,
  PlanOverview,
  PostVersionRecord,
  PostTypeRecord,
  PostingWindowRecord,
  PromptPackage,
  ProjectDetail,
  ProjectRecord,
  PublicationRecord,
  QueueEntry,
  ReviewQueueEntry,
  SeriesRecord,
  StyleTemplateRecord,
  ApprovalDecisionInput,
  BrandAssetRecord,
  UpdateCampaignDeliverablePlanInput,
  UpdateCampaignInput,
  UpdateBrandInput,
  UpdateCalendarItemInput,
  UpdateCreativeTemplateInput,
  UpdateDeliverableInput,
  UpdatePostingWindowInput,
  UpdatePublicationInput,
  UpdateProjectInput,
  UpdateSeriesInput,
  UpdateWorkspaceMemberRoleInput,
  WorkspaceMemberDeleteResponse,
  WorkspaceMemberPasswordSetResponse,
  WorkspaceMemberRecord,
  WorkspaceMemberRoleUpdateResponse,
  WorkspaceMemberUpsertResponse,
  StyleSeedRequest
} from "@image-lab/contracts";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const rawCreativeFlowVersion = process.env.NEXT_PUBLIC_CREATIVE_FLOW_VERSION;
const rawStyleVariationCount = Number(process.env.NEXT_PUBLIC_STYLE_VARIATION_COUNT ?? "3");

export type CreativeFlowVersion = "v1" | "v2";
export type BootstrapMode = "full" | "light" | "create";
export const creativeFlowVersion: CreativeFlowVersion = rawCreativeFlowVersion === "v2" ? "v2" : "v1";
export const styleVariationLimit = creativeFlowVersion === "v2" ? 3 : 4;
export const defaultStyleVariationCount = creativeFlowVersion === "v2" ? 1 : clampInt(rawStyleVariationCount, 1, styleVariationLimit, 3);
export type PlanningTemplateOption = {
  id: string;
  workspaceId: string;
  brandId: string;
  projectId: string | null;
  postTypeId: string | null;
  name: string;
  status: CreativeTemplateRecord["status"];
  channel: CreativeTemplateRecord["channel"];
  format: CreativeTemplateRecord["format"];
};

export type CompileCreativeV2Payload = CreativeBrief & {
  variationCount?: number;
};

export type StyleSeedV2Request = {
  promptPackage: PromptPackage;
  variationCount?: number;
};

export type StyleSeedV2Response = {
  promptPackageId: string;
  jobs: Array<{
    id: string;
    variationId: string;
    variationTitle: string;
    requestId: string | null;
  }>;
};

export type ExternalPostUploadPayload = {
  file: File;
  workspaceId?: string | undefined;
  brandId: string;
  projectId?: string | null | undefined;
  campaignId?: string | undefined;
  seriesId?: string | undefined;
  postTypeId: string;
  creativeTemplateId?: string | undefined;
  channelAccountId?: string | undefined;
  placementCode: string;
  contentFormat: string;
  creativeFormat: string;
  objectiveCode?: string | undefined;
  priority?: string | undefined;
  reviewMode?: ExternalPostReviewMode | undefined;
  title: string;
  briefText?: string | undefined;
  caption?: string | undefined;
  ctaText?: string | undefined;
  scheduledFor?: string | undefined;
  dueAt?: string | undefined;
  ownerUserId?: string | undefined;
  reviewerUserId?: string | undefined;
};

const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
const inflightRequests = new Map<string, Promise<unknown>>();

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function getCacheTtlMs(path: string) {
  if (path.startsWith("/api/session/bootstrap")) {
    if (path.includes("view=light")) {
      return 20_000;
    }

    if (path.includes("view=create")) {
      return 12_000;
    }

    return 12_000;
  }

  if (path.startsWith("/api/home")) {
    return 10_000;
  }

  if (path.startsWith("/api/plan/overview")) {
    return 10_000;
  }

  if (path.startsWith("/api/queue")) {
    return 8_000;
  }

  if (path.startsWith("/api/workspace-members")) {
    return 20_000;
  }

  if (path.startsWith("/api/credits")) {
    return 10_000;
  }

  if (path.startsWith("/api/admin/credits")) {
    return 6_000;
  }

  if (path.startsWith("/api/admin/")) {
    return 6_000;
  }

  if (path.startsWith("/api/brands/") && !path.includes("/assets")) {
    return 10_000;
  }

  if (path.startsWith("/api/brands/") && path.includes("/assets")) {
    return 12_000;
  }

  if (path.startsWith("/api/projects")) {
    return 20_000;
  }

  if (path.startsWith("/api/post-types")) {
    return 60_000;
  }

  if (path.startsWith("/api/festivals")) {
    return 60_000;
  }

  if (path.startsWith("/api/campaigns")) {
    return 12_000;
  }

  if (path.startsWith("/api/series")) {
    return 12_000;
  }

  if (path.startsWith("/api/templates")) {
    return 12_000;
  }

  if (path.startsWith("/api/deliverables")) {
    return 8_000;
  }

  if (path.startsWith("/api/review-queue")) {
    return 8_000;
  }

  if (path.startsWith("/api/channel-accounts")) {
    return 20_000;
  }

  if (path.startsWith("/api/posting-windows")) {
    return 20_000;
  }

  return 0;
}

function clearResponseCache() {
  responseCache.clear();
  inflightRequests.clear();
}

function appendFormField(body: FormData, key: string, value: string | null | undefined) {
  if (typeof value === "string" && value.trim().length > 0) {
    body.append(key, value);
  }
}

async function request<T>(path: string, token: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const cacheTtlMs = method === "GET" ? getCacheTtlMs(path) : 0;
  const cacheKey = cacheTtlMs > 0 ? `${token}:${path}` : null;

  if (method !== "GET") {
    clearResponseCache();
  } else if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const inflight = inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const execute = async () => {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(extractApiErrorMessage(text, response.status));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  };

  const requestPromise = execute().then((data) => {
    if (cacheKey && cacheTtlMs > 0) {
      responseCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + cacheTtlMs
      });
    }

    return data;
  });

  if (cacheKey) {
    inflightRequests.set(cacheKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (cacheKey) {
      inflightRequests.delete(cacheKey);
    }
  }
}

function extractApiErrorMessage(text: string, status: number) {
  if (!text) {
    return `Request failed: ${status}`;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const normalized = normalizeApiErrorMessage(parsed);
    if (normalized) {
      return normalized;
    }
  } catch {
    // Non-JSON error body; use raw text below.
  }

  return text;
}

function normalizeApiErrorMessage(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        return normalizeApiErrorMessage(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeApiErrorMessage(item);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    const issuePath = Array.isArray(record.path)
      ? record.path.filter((part): part is string => typeof part === "string").join(".")
      : null;
    const issueMessage = typeof record.message === "string" ? record.message.trim() : null;

    if (issuePath && issueMessage) {
      return `${startCase(issuePath)}: ${issueMessage}`;
    }

    if (issueMessage) {
      const nested = normalizeApiErrorMessage(issueMessage);
      if (nested) {
        return nested;
      }
    }

    if (typeof record.error === "string" && record.error.trim().length > 0) {
      return record.error.trim();
    }

    if (record.error) {
      const normalized = normalizeApiErrorMessage(record.error);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function startCase(value: string) {
  if (!value) {
    return value;
  }

  return value
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function withQuery(path: string, params: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function bootstrapSession(token: string, mode: BootstrapMode = "full", brandId?: string) {
  const params = new URLSearchParams();
  if (mode === "light") {
    params.set("view", "light");
  } else if (mode === "create") {
    params.set("view", "create");
  }
  if (brandId) {
    params.set("brandId", brandId);
  }

  const query = params.toString();
  return request<BootstrapResponse>(`/api/session/bootstrap${query ? `?${query}` : ""}`, token);
}

export function createBrand(token: string, payload: CreateBrandInput) {
  return request<{ id: string; currentProfileVersionId: string }>("/api/brands", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getBrandDetail(token: string, brandId: string) {
  return request<BrandDetail>(`/api/brands/${brandId}`, token);
}

export function getBrandAssets(token: string, brandId: string) {
  return request<BrandAssetRecord[]>(`/api/brands/${brandId}/assets`, token);
}

export function getProjects(token: string, filters?: { brandId?: string }) {
  return request<ProjectRecord[]>(withQuery("/api/projects", { brandId: filters?.brandId }), token);
}

export function getProjectDetail(token: string, projectId: string) {
  return request<ProjectDetail>(`/api/projects/${projectId}`, token);
}

export function createProject(token: string, payload: CreateProjectInput) {
  return request<ProjectDetail>("/api/projects", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateProject(token: string, projectId: string, payload: UpdateProjectInput) {
  return request<ProjectDetail>(`/api/projects/${projectId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getPostTypes(token: string) {
  return request<PostTypeRecord[]>("/api/post-types", token);
}

export function getFestivals(token: string) {
  return request<FestivalRecord[]>("/api/festivals", token);
}

export function getBrandPersonas(token: string, brandId?: string) {
  return request<BrandPersonaRecord[]>(withQuery("/api/brand-personas", { brandId }), token);
}

export function getContentPillars(token: string, brandId?: string) {
  return request<ContentPillarRecord[]>(withQuery("/api/content-pillars", { brandId }), token);
}

export function getChannelAccounts(token: string, brandId?: string) {
  return request<ChannelAccountRecord[]>(withQuery("/api/channel-accounts", { brandId }), token);
}

export function getPostingWindows(token: string, brandId?: string) {
  return request<PostingWindowRecord[]>(withQuery("/api/posting-windows", { brandId }), token);
}

export function createPostingWindow(token: string, payload: CreatePostingWindowInput) {
  return request<PostingWindowRecord>("/api/posting-windows", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updatePostingWindow(token: string, postingWindowId: string, payload: UpdatePostingWindowInput) {
  return request<PostingWindowRecord>(`/api/posting-windows/${postingWindowId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function deletePostingWindow(token: string, postingWindowId: string) {
  return request<void>(`/api/posting-windows/${postingWindowId}`, token, {
    method: "DELETE"
  });
}

export function getCampaigns(
  token: string,
  filters?: { brandId?: string; projectId?: string; status?: string }
) {
  return request<CampaignRecord[]>(
    withQuery("/api/campaigns", {
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      status: filters?.status
    }),
    token
  );
}

export function getCampaign(token: string, campaignId: string) {
  return request<CampaignRecord>(`/api/campaigns/${campaignId}`, token);
}

export function createCampaign(token: string, payload: CreateCampaignInput) {
  return request<CampaignRecord>("/api/campaigns", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateCampaign(token: string, campaignId: string, payload: UpdateCampaignInput) {
  return request<CampaignRecord>(`/api/campaigns/${campaignId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getCampaignPlans(token: string, campaignId: string) {
  return request<CampaignDeliverablePlanRecord[]>(`/api/campaigns/${campaignId}/plans`, token);
}

export function createCampaignPlan(
  token: string,
  campaignId: string,
  payload: CreateCampaignDeliverablePlanInput
) {
  return request<CampaignDeliverablePlanRecord>(`/api/campaigns/${campaignId}/plans`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateCampaignPlan(
  token: string,
  campaignId: string,
  planId: string,
  payload: UpdateCampaignDeliverablePlanInput
) {
  return request<CampaignDeliverablePlanRecord>(`/api/campaigns/${campaignId}/plans/${planId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function materializeCampaignDeliverables(
  token: string,
  campaignId: string,
  payload?: { projectId?: string; startAt?: string }
) {
  return request<DeliverableRecord[]>(`/api/campaigns/${campaignId}/materialize-deliverables`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
}

export function getDeliverables(
  token: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    campaignId?: string;
    seriesId?: string;
    ownerUserId?: string;
    reviewerUserId?: string;
    planningMode?: "campaign" | "series" | "one_off" | "always_on" | "ad_hoc";
    status?: string;
    statusIn?: string[];
    scheduledFrom?: string;
    scheduledTo?: string;
    limit?: number;
    includePreviews?: boolean;
  }
) {
  return request<DeliverableRecord[]>(
    withQuery("/api/deliverables", {
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      campaignId: filters?.campaignId,
      seriesId: filters?.seriesId,
      ownerUserId: filters?.ownerUserId,
      reviewerUserId: filters?.reviewerUserId,
      planningMode: filters?.planningMode,
      status: filters?.status,
      statusIn: filters?.statusIn?.join(","),
      scheduledFrom: filters?.scheduledFrom,
      scheduledTo: filters?.scheduledTo,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      includePreviews: filters?.includePreviews ? "1" : undefined
    }),
    token
  );
}

export function getDeliverable(token: string, deliverableId: string) {
  return request<DeliverableDetail>(`/api/deliverables/${deliverableId}`, token);
}

export function createDeliverable(token: string, payload: CreateDeliverableInput) {
  return request<DeliverableRecord>("/api/deliverables", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function uploadExternalPost(token: string, payload: ExternalPostUploadPayload) {
  const body = new FormData();
  body.append("file", payload.file);
  body.append("brandId", payload.brandId);
  body.append("postTypeId", payload.postTypeId);
  body.append("placementCode", payload.placementCode);
  body.append("contentFormat", payload.contentFormat);
  body.append("creativeFormat", payload.creativeFormat);
  body.append("title", payload.title);

  appendFormField(body, "workspaceId", payload.workspaceId);
  appendFormField(body, "projectId", payload.projectId ?? undefined);
  appendFormField(body, "campaignId", payload.campaignId);
  appendFormField(body, "seriesId", payload.seriesId);
  appendFormField(body, "creativeTemplateId", payload.creativeTemplateId);
  appendFormField(body, "channelAccountId", payload.channelAccountId);
  appendFormField(body, "objectiveCode", payload.objectiveCode);
  appendFormField(body, "priority", payload.priority);
  appendFormField(body, "reviewMode", payload.reviewMode);
  appendFormField(body, "briefText", payload.briefText);
  appendFormField(body, "caption", payload.caption);
  appendFormField(body, "ctaText", payload.ctaText);
  appendFormField(body, "scheduledFor", payload.scheduledFor);
  appendFormField(body, "dueAt", payload.dueAt);
  appendFormField(body, "ownerUserId", payload.ownerUserId);
  appendFormField(body, "reviewerUserId", payload.reviewerUserId);

  return request<ExternalPostUploadResponse>("/api/deliverables/external-upload", token, {
    method: "POST",
    body
  });
}

export function generateAutoMask(
  token: string,
  payload: {
    brandId: string;
    object: string;
    targetX?: number;
    targetY?: number;
    image: File | Blob;
    imageFileName?: string;
  }
) {
  const body = new FormData();
  body.append("brandId", payload.brandId);
  body.append("object", payload.object);

  if (typeof payload.targetX === "number") {
    body.append("targetX", String(payload.targetX));
  }

  if (typeof payload.targetY === "number") {
    body.append("targetY", String(payload.targetY));
  }

  body.append("image", payload.image, payload.imageFileName ?? "source.png");

  return request<AiSegmentationResponse>("/api/creative/image-segment", token, {
    method: "POST",
    body
  });
}

export function planImageEdit(
  token: string,
  payload: {
    brandId: string;
    prompt: string;
    width?: number;
    height?: number;
    image: File | Blob;
    imageFileName?: string;
  }
) {
  const body = new FormData();
  body.append("brandId", payload.brandId);
  body.append("prompt", payload.prompt);

  if (typeof payload.width === "number") {
    body.append("width", String(payload.width));
  }

  if (typeof payload.height === "number") {
    body.append("height", String(payload.height));
  }

  body.append("image", payload.image, payload.imageFileName ?? "source.png");

  return request<ImageEditPlanResponse>("/api/creative/image-edit-plan", token, {
    method: "POST",
    body
  });
}

export function composeImageEditPrompt(
  token: string,
  payload: {
    brandId: string;
    changes: string[];
  }
) {
  return request<ImageEditPromptComposerResponse>("/api/creative/image-edit-compose-prompt", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function applyMaskedImageEdit(
  token: string,
  payload: {
    brandId: string;
    prompt: string;
    objectLabel?: string;
    width?: number;
    height?: number;
    image: File | Blob;
    mask?: File | Blob;
    imageFileName?: string;
    maskFileName?: string;
  }
) {
  const body = new FormData();
  body.append("brandId", payload.brandId);
  body.append("prompt", payload.prompt);

  if (payload.objectLabel) {
    body.append("objectLabel", payload.objectLabel);
  }

  if (typeof payload.width === "number") {
    body.append("width", String(payload.width));
  }

  if (typeof payload.height === "number") {
    body.append("height", String(payload.height));
  }

  body.append("image", payload.image, payload.imageFileName ?? "source.png");
  if (payload.mask) {
    body.append("mask", payload.mask, payload.maskFileName ?? "mask.png");
  }

  return request<AiImageEditResponse>("/api/creative/image-edit", token, {
    method: "POST",
    body
  });
}

export function updateDeliverable(token: string, deliverableId: string, payload: UpdateDeliverableInput) {
  return request<DeliverableRecord>(`/api/deliverables/${deliverableId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function deleteDeliverable(token: string, deliverableId: string) {
  return request<void>(`/api/deliverables/${deliverableId}`, token, {
    method: "DELETE"
  });
}

export function compileDeliverable(token: string, deliverableId: string) {
  return request<PromptPackage>(`/api/deliverables/${deliverableId}/compile`, token, {
    method: "POST"
  });
}

export function getDeliverablePostVersions(token: string, deliverableId: string) {
  return request<PostVersionRecord[]>(`/api/deliverables/${deliverableId}/post-versions`, token);
}

export function approvePostVersion(
  token: string,
  deliverableId: string,
  postVersionId: string,
  payload: ApprovalDecisionInput
) {
  return request<{ deliverable: DeliverableRecord; postVersion: PostVersionRecord }>(
    `/api/deliverables/${deliverableId}/post-versions/${postVersionId}/approval`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}

export function getReviewQueue(
  token: string,
  filters?: { brandId?: string; deliverableId?: string; scope?: "my" | "team" | "unassigned" }
) {
  return request<ReviewQueueEntry[]>(
    withQuery("/api/review-queue", {
      brandId: filters?.brandId,
      deliverableId: filters?.deliverableId,
      scope: filters?.scope
    }),
    token
  );
}

export function getSeries(
  token: string,
  filters?: { brandId?: string; projectId?: string; status?: "draft" | "active" | "paused" | "archived" }
) {
  return request<SeriesRecord[]>(
    withQuery("/api/series", {
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      status: filters?.status
    }),
    token
  );
}

export function getSeriesDetail(token: string, seriesId: string) {
  return request<SeriesRecord>(`/api/series/${seriesId}`, token);
}

export function createSeries(token: string, payload: CreateSeriesInput) {
  return request<SeriesRecord>("/api/series", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateSeries(token: string, seriesId: string, payload: UpdateSeriesInput) {
  return request<SeriesRecord>(`/api/series/${seriesId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function materializeSeries(
  token: string,
  seriesId: string,
  payload?: { startAt?: string; endAt?: string }
) {
  return request<DeliverableRecord[]>(`/api/series/${seriesId}/materialize`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
}

export function getHomeOverview(token: string, brandId?: string) {
  return request<HomeOverview>(withQuery("/api/home", { brandId }), token);
}

export function getPlanOverview(token: string, brandId?: string) {
  return request<PlanOverview>(withQuery("/api/plan/overview", { brandId }), token);
}

export function getQueue(
  token: string,
  filters?: {
    scope?: "my" | "team" | "unassigned";
    brandId?: string;
    projectId?: string;
    statusGroup?: "todo" | "in_progress" | "ready_to_ship" | "done" | "blocked";
    planningMode?: "campaign" | "series" | "one_off" | "always_on" | "ad_hoc";
    dueWindow?: "today" | "week" | "overdue";
  }
) {
  return request<QueueEntry[]>(
    withQuery("/api/queue", {
      scope: filters?.scope,
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      statusGroup: filters?.statusGroup,
      planningMode: filters?.planningMode,
      dueWindow: filters?.dueWindow
    }),
    token
  );
}

export function getWorkspaceMembers(token: string) {
  return request<WorkspaceMemberRecord[]>("/api/workspace-members", token);
}

export function addWorkspaceMember(token: string, payload: CreateWorkspaceMemberInput) {
  return request<WorkspaceMemberUpsertResponse>("/api/workspace-members", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateWorkspaceMemberRole(token: string, userId: string, payload: UpdateWorkspaceMemberRoleInput) {
  return request<WorkspaceMemberRoleUpdateResponse>(`/api/workspace-members/${userId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function removeWorkspaceMember(token: string, userId: string) {
  return request<WorkspaceMemberDeleteResponse>(`/api/workspace-members/${userId}`, token, {
    method: "DELETE"
  });
}

export function setWorkspaceMemberPassword(token: string, userId: string, payload: SetWorkspaceMemberPasswordInput) {
  return request<WorkspaceMemberPasswordSetResponse>(`/api/workspace-members/${userId}/password-reset`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getWorkspaceCreditWallet(token: string) {
  return request<WorkspaceCreditWallet>("/api/credits/wallet", token);
}

export function getWorkspaceCreditLedger(
  token: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  return request<WorkspaceCreditLedgerResponse>(
    withQuery("/api/credits/ledger", {
      limit: typeof options?.limit === "number" ? String(options.limit) : undefined,
      offset: typeof options?.offset === "number" ? String(options.offset) : undefined
    }),
    token
  );
}

export function getAdminCreditWorkspaces(
  token: string,
  options?: {
    query?: string;
    limit?: number;
  }
) {
  return request<AdminCreditWorkspaceListResponse>(
    withQuery("/api/admin/credits/workspaces", {
      query: options?.query,
      limit: typeof options?.limit === "number" ? String(options.limit) : undefined
    }),
    token
  );
}

export function getAdminWorkspaceCreditWallet(token: string, workspaceId: string) {
  return request<WorkspaceCreditWallet>(`/api/admin/credits/workspaces/${workspaceId}/wallet`, token);
}

export function getAdminWorkspaceCreditLedger(
  token: string,
  workspaceId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  return request<WorkspaceCreditLedgerResponse>(
    withQuery(`/api/admin/credits/workspaces/${workspaceId}/ledger`, {
      limit: typeof options?.limit === "number" ? String(options.limit) : undefined,
      offset: typeof options?.offset === "number" ? String(options.offset) : undefined
    }),
    token
  );
}

export function grantAdminWorkspaceCredits(token: string, payload: AdminCreditGrantRequest) {
  return request<AdminCreditMutationResponse>("/api/admin/credits/grant", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function adjustAdminWorkspaceCredits(token: string, payload: AdminCreditAdjustRequest) {
  return request<AdminCreditMutationResponse>("/api/admin/credits/adjust", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getSuperAdminOverview(token: string) {
  return request<AdminOverview>("/api/admin/overview", token);
}

export function getSuperAdminOrgs(
  token: string,
  options?: {
    query?: string;
    limit?: number;
    offset?: number;
  }
) {
  return request<AdminOrgListResponse>(
    withQuery("/api/admin/orgs", {
      query: options?.query,
      limit: typeof options?.limit === "number" ? String(options.limit) : undefined,
      offset: typeof options?.offset === "number" ? String(options.offset) : undefined
    }),
    token
  );
}

export function getSuperAdminOrgDetail(token: string, workspaceId: string) {
  return request<AdminOrgDetail>(`/api/admin/orgs/${workspaceId}`, token);
}

export function getSuperAdminCreditLedger(
  token: string,
  options?: {
    workspaceId?: string;
    limit?: number;
    offset?: number;
  }
) {
  return request<WorkspaceCreditLedgerResponse>(
    withQuery("/api/admin/credits/ledger", {
      workspaceId: options?.workspaceId,
      limit: typeof options?.limit === "number" ? String(options.limit) : undefined,
      offset: typeof options?.offset === "number" ? String(options.offset) : undefined
    }),
    token
  );
}

export function getSuperAdminPlatformAdmins(token: string) {
  return request<AdminPlatformAdminListResponse>("/api/admin/platform-admins", token);
}

export function createSuperAdminPlatformAdmin(token: string, payload: AdminPlatformAdminUpsertRequest) {
  return request<AdminPlatformAdminMutationResponse>("/api/admin/platform-admins", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateSuperAdminPlatformAdmin(
  token: string,
  userId: string,
  payload: AdminPlatformAdminUpdateRequest
) {
  return request<AdminPlatformAdminMutationResponse>(`/api/admin/platform-admins/${userId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getSuperAdminOps(token: string) {
  return request<AdminOpsSummary>("/api/admin/ops", token);
}

export function getSuperAdminAudit(
  token: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  return request<AdminAuditResponse>(
    withQuery("/api/admin/audit", {
      limit: typeof options?.limit === "number" ? String(options.limit) : undefined,
      offset: typeof options?.offset === "number" ? String(options.offset) : undefined
    }),
    token
  );
}

export function getPublications(
  token: string,
  filters?: { deliverableId?: string; status?: string }
) {
  return request<PublicationRecord[]>(
    withQuery("/api/publications", {
      deliverableId: filters?.deliverableId,
      status: filters?.status
    }),
    token
  );
}

export function createPublication(token: string, payload: CreatePublicationInput) {
  return request<PublicationRecord>("/api/publications", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updatePublication(token: string, publicationId: string, payload: UpdatePublicationInput) {
  return request<PublicationRecord>(`/api/publications/${publicationId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getPlanningTemplates(
  token: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    postTypeId?: string;
    status?: "draft" | "approved" | "archived";
  }
) {
  return request<CreativeTemplateRecord[]>(
    withQuery("/api/templates", {
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      postTypeId: filters?.postTypeId,
      status: filters?.status
    }),
    token
  );
}

export function getPlanningTemplateOptions(
  token: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    postTypeId?: string;
    status?: "draft" | "approved" | "archived";
  }
) {
  return request<PlanningTemplateOption[]>(
    withQuery("/api/templates", {
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      postTypeId: filters?.postTypeId,
      status: filters?.status,
      view: "picker"
    }),
    token
  );
}

export function getPlanningTemplate(token: string, templateId: string) {
  return request<CreativeTemplateDetail>(`/api/templates/${templateId}`, token);
}

export function createPlanningTemplate(token: string, payload: CreateCreativeTemplateInput) {
  return request<CreativeTemplateDetail>("/api/templates", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updatePlanningTemplate(
  token: string,
  templateId: string,
  payload: UpdateCreativeTemplateInput
) {
  return request<CreativeTemplateDetail>(`/api/templates/${templateId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getCalendarItems(
  token: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }
) {
  return request<CalendarItemRecord[]>(
    withQuery("/api/calendar-items", {
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      status: filters?.status,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo
    }),
    token
  );
}

export function getCalendarItem(token: string, calendarItemId: string) {
  return request<CalendarItemRecord>(`/api/calendar-items/${calendarItemId}`, token);
}

export function createCalendarItem(token: string, payload: CreateCalendarItemInput) {
  return request<CalendarItemRecord>("/api/calendar-items", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateCalendarItem(
  token: string,
  calendarItemId: string,
  payload: UpdateCalendarItemInput
) {
  return request<CalendarItemRecord>(`/api/calendar-items/${calendarItemId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateBrand(token: string, brandId: string, payload: UpdateBrandInput) {
  return request<{ id: string; currentProfileVersionId: string }>(`/api/brands/${brandId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function uploadBrandAsset(
  token: string,
  brandId: string,
  payload: { file: File; kind: string; label: string }
) {
  const body = new FormData();
  body.append("kind", payload.kind);
  body.append("label", payload.label);
  body.append("file", payload.file);

  return request<{ id: string; storagePath: string }>(`/api/brands/${brandId}/assets`, token, {
    method: "POST",
    body
  });
}

export function deleteBrandAsset(token: string, brandId: string, assetId: string) {
  return request<{ success: boolean }>(`/api/brands/${brandId}/assets/${assetId}`, token, {
    method: "DELETE"
  });
}

export function compileCreative(token: string, payload: CreativeBrief) {
  return request<PromptPackage>("/api/creative/compile", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function compileCreativeV2(token: string, payload: CompileCreativeV2Payload) {
  return request<PromptPackage>("/api/creative/compile-v2", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function compileCreativeV2Async(token: string, payload: CompileCreativeV2Payload) {
  return request<{ jobId: string; status: string }>("/api/creative/compile-v2-async", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getCompileV2AsyncStatus(token: string, jobId: string) {
  return request<{ status: string; result?: PromptPackage; error?: unknown }>(
    `/api/creative/compile-v2-async/${jobId}`,
    token
  );
}

export function generateStyleSeeds(token: string, payload: StyleSeedRequest) {
  return request<{ id: string; requestId: string | null }>("/api/creative/style-seeds", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function generateStyleSeedsV2(token: string, payload: StyleSeedV2Request) {
  return request<StyleSeedV2Response>("/api/creative/style-seeds-v2", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function generateFinals(token: string, payload: FinalGenerationRequest) {
  return request<{ id: string; requestId: string | null }>("/api/creative/finals", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getCreativeJob(token: string, jobId: string) {
  return request<CreativeJobRecord>(`/api/creative/jobs/${jobId}`, token);
}

export function getCreativeRuns(token: string) {
  return request<CreativeRunSummary[]>("/api/creative/runs", token);
}

export function getCreativeRun(token: string, runId: string) {
  return request<CreativeRunDetail>(`/api/creative/runs/${runId}`, token);
}

export function getStyleTemplate(token: string, templateId: string) {
  return request<StyleTemplateRecord>(`/api/creative/templates/${templateId}`, token);
}

export function getCreativeOutput(token: string, outputId: string) {
  return request<CreativeOutputRecord>(`/api/creative/outputs/${outputId}`, token);
}

export function getCreativeOutputs(
  token: string,
  filters?: {
    brandId?: string;
    reviewState?: CreativeOutputRecord["reviewState"];
    limit?: number;
    offset?: number;
  }
) {
  return request<CreativeOutputRecord[]>(
    withQuery("/api/creative/outputs", {
      brandId: filters?.brandId,
      reviewState: filters?.reviewState,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      offset: typeof filters?.offset === "number" ? String(filters.offset) : undefined
    }),
    token
  );
}

export function submitFeedback(token: string, outputId: string, payload: FeedbackRequest) {
  return request<FeedbackResult>(`/api/creative/outputs/${outputId}/feedback`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
