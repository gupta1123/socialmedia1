import type { FastifyBaseLogger } from "fastify";
import type {
  BrandProfile,
  BrandProfileVersionRecord,
  BrandRecord,
  BrandAssetRecord,
  CreativeJobRecord,
  CreativeOutputRecord,
  ProjectReraRegistrationRecord,
  PromptPackage,
  StyleTemplateRecord,
  WorkspaceComplianceSettings,
  WorkspaceRole,
  WorkspaceSummary
} from "@image-lab/contracts";
import { supabaseAdmin } from "./supabase.js";
import type { AuthenticatedViewer } from "./viewer.js";
import { getOrPopulateRuntimeCache } from "./runtime-cache.js";

const PRIMARY_WORKSPACE_TTL_MS = 30_000;
const WORKSPACE_ROLE_TTL_MS = 30_000;
const WORKSPACE_BRANDS_TTL_MS = 30_000;
const BRAND_ASSET_COUNTS_TTL_MS = 15_000;

type MembershipRow = {
  workspace_id: string;
  role: WorkspaceRole;
  workspaces: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type BrandRow = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  current_profile_version_id: string | null;
};

type BrandProfileRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  version_number: number;
  profile_json: BrandProfile;
};

type AssetRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  kind: BrandAssetRecord["kind"];
  label: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  thumbnail_bytes: number | null;
  metadata_json: Record<string, unknown> | null;
};

type ProjectReraRegistrationRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  registration_number: string | null;
  label: string;
  qr_asset_id: string | null;
  is_default: boolean;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceComplianceSettingsRow = {
  workspace_id: string;
  rera_authority_label: string;
  rera_website_url: string;
  rera_text_color: string;
  updated_at: string | null;
};

type StyleTemplateRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  deliverable_id: string | null;
  project_id: string | null;
  post_type_id: string | null;
  creative_template_id: string | null;
  calendar_item_id: string | null;
  source: StyleTemplateRecord["source"];
  label: string;
  storage_path: string;
  creative_output_id: string | null;
};

type JobRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  deliverable_id: string | null;
  project_id: string | null;
  post_type_id: string | null;
  creative_template_id: string | null;
  calendar_item_id: string | null;
  prompt_package_id: string;
  selected_template_id: string | null;
  job_type: CreativeJobRecord["jobType"];
  status: CreativeJobRecord["status"];
  provider: string;
  provider_model: string;
  provider_request_id: string | null;
  requested_count: number;
  error_json: Record<string, unknown> | null;
};

type OutputRow = {
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
  kind: CreativeOutputRecord["kind"];
  storage_path: string;
  thumbnail_storage_path: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  thumbnail_bytes: number | null;
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
};

export async function getPrimaryWorkspace(viewer: AuthenticatedViewer): Promise<WorkspaceSummary | null> {
  return getOrPopulateRuntimeCache(`primary-workspace:${viewer.userId}`, PRIMARY_WORKSPACE_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("workspace_memberships")
      .select("workspace_id, role, workspaces(id, name, slug)")
      .eq("user_id", viewer.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = data as MembershipRow | null;

    if (!row?.workspaces) {
      return null;
    }

    return {
      id: row.workspaces.id,
      name: row.workspaces.name,
      slug: row.workspaces.slug,
      role: row.role
    };
  });
}

export async function assertWorkspaceRole(
  viewer: AuthenticatedViewer,
  workspaceId: string,
  allowedRoles: WorkspaceRole[],
  logger?: FastifyBaseLogger
) {
  const role = await getOrPopulateRuntimeCache(
    `workspace-role:${viewer.userId}:${workspaceId}`,
    WORKSPACE_ROLE_TTL_MS,
    async () => {
      const { data, error } = await supabaseAdmin
        .from("workspace_memberships")
        .select("role")
        .eq("user_id", viewer.userId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) {
        logger?.error(error, "membership lookup failed");
        throw error;
      }

      const row = data as { role: WorkspaceRole } | null;
      return row?.role ?? null;
    }
  );

  if (!role || !allowedRoles.includes(role)) {
    throw new Error("You do not have access to this workspace");
  }

  return role;
}

const DEFAULT_RERA_AUTHORITY_LABEL = "MahaRERA";
const DEFAULT_RERA_WEBSITE_URL = "https://maharera.maharashtra.gov.in";
const DEFAULT_RERA_TEXT_COLOR = "#111111";

export function getDefaultWorkspaceComplianceSettings(workspaceId: string): WorkspaceComplianceSettings {
  return {
    workspaceId,
    reraAuthorityLabel: DEFAULT_RERA_AUTHORITY_LABEL,
    reraWebsiteUrl: DEFAULT_RERA_WEBSITE_URL,
    reraTextColor: DEFAULT_RERA_TEXT_COLOR,
    updatedAt: null
  };
}

export async function getWorkspaceComplianceSettings(workspaceId: string): Promise<WorkspaceComplianceSettings> {
  const { data, error } = await supabaseAdmin
    .from("workspace_compliance_settings")
    .select("workspace_id, rera_authority_label, rera_website_url, rera_text_color, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle<WorkspaceComplianceSettingsRow>();

  if (error) {
    if (error.code === "42P01" || error.code === "42703") {
      return getDefaultWorkspaceComplianceSettings(workspaceId);
    }
    throw error;
  }

  if (!data) {
    return getDefaultWorkspaceComplianceSettings(workspaceId);
  }

  return mapWorkspaceComplianceSettingsRow(data);
}

export async function updateWorkspaceComplianceSettings(params: {
  workspaceId: string;
  reraAuthorityLabel: string;
  reraWebsiteUrl: string;
  reraTextColor: string;
  userId: string;
}): Promise<WorkspaceComplianceSettings> {
  const { data, error } = await supabaseAdmin
    .from("workspace_compliance_settings")
    .upsert(
      {
        workspace_id: params.workspaceId,
        rera_authority_label: params.reraAuthorityLabel.trim() || DEFAULT_RERA_AUTHORITY_LABEL,
        rera_website_url: params.reraWebsiteUrl.trim() || DEFAULT_RERA_WEBSITE_URL,
        rera_text_color: params.reraTextColor.trim() || DEFAULT_RERA_TEXT_COLOR,
        created_by: params.userId
      },
      { onConflict: "workspace_id" }
    )
    .select("workspace_id, rera_authority_label, rera_website_url, rera_text_color, updated_at")
    .single<WorkspaceComplianceSettingsRow>();

  if (error) {
    throw error;
  }

  return mapWorkspaceComplianceSettingsRow(data);
}

function mapWorkspaceComplianceSettingsRow(row: WorkspaceComplianceSettingsRow): WorkspaceComplianceSettings {
  return {
    workspaceId: row.workspace_id,
    reraAuthorityLabel: row.rera_authority_label,
    reraWebsiteUrl: row.rera_website_url,
    reraTextColor: row.rera_text_color || DEFAULT_RERA_TEXT_COLOR,
    updatedAt: row.updated_at
  };
}

export async function listWorkspaceBrands(workspaceId: string): Promise<BrandRecord[]> {
  return getOrPopulateRuntimeCache(`workspace-brands:${workspaceId}`, WORKSPACE_BRANDS_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("brands")
      .select("id, workspace_id, name, slug, description, current_profile_version_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .returns<BrandRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map((brand) => ({
      id: brand.id,
      workspaceId: brand.workspace_id,
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      currentProfileVersionId: brand.current_profile_version_id
    }));
  });
}

export async function getBrand(brandId: string) {
  const { data, error } = await supabaseAdmin
    .from("brands")
    .select("id, workspace_id, name, slug, description, current_profile_version_id")
    .eq("id", brandId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as BrandRow | null;

  if (!row) {
    throw new Error("Brand not found");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    currentProfileVersionId: row.current_profile_version_id
  } satisfies BrandRecord;
}

export async function getActiveBrandProfile(brandId: string) {
  const brand = await getBrand(brandId);

  if (!brand.currentProfileVersionId) {
    throw new Error("Brand does not have an active profile");
  }

  return getBrandProfileVersion(brand.currentProfileVersionId);
}

export async function getBrandProfileVersion(profileVersionId: string) {
  const { data, error } = await supabaseAdmin
    .from("brand_profile_versions")
    .select("id, workspace_id, brand_id, version_number, profile_json")
    .eq("id", profileVersionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as BrandProfileRow | null;

  if (!row) {
    throw new Error("Brand profile version not found");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    versionNumber: row.version_number,
    profile: row.profile_json
  } satisfies BrandProfileVersionRecord;
}

export async function listBrandAssets(brandId: string): Promise<BrandAssetRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_assets")
    .select("id, workspace_id, brand_id, project_id, kind, label, file_name, mime_type, storage_path, thumbnail_storage_path, thumbnail_width, thumbnail_height, thumbnail_bytes, metadata_json")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .returns<AssetRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((asset) => ({
    id: asset.id,
    workspaceId: asset.workspace_id,
    brandId: asset.brand_id,
    projectId: asset.project_id,
    kind: asset.kind,
    label: asset.label,
    fileName: asset.file_name,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    thumbnailStoragePath: asset.thumbnail_storage_path,
    metadataJson: asset.metadata_json ?? {}
  }));
}

export async function getBrandAssetCounts(brandId: string) {
  return getOrPopulateRuntimeCache(`brand-asset-counts:${brandId}`, BRAND_ASSET_COUNTS_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("brand_assets")
      .select("kind")
      .eq("brand_id", brandId)
      .returns<Array<Pick<AssetRow, "kind">>>();

    if (error) {
      throw error;
    }

    const counts = {
      total: 0,
      reference: 0,
      logo: 0,
      reraQr: 0,
      product: 0,
      inspiration: 0
    };

    for (const row of data ?? []) {
      counts.total += 1;
      switch (row.kind) {
        case "reference":
          counts.reference += 1;
          break;
        case "logo":
          counts.logo += 1;
          break;
        case "rera_qr":
          counts.reraQr += 1;
          break;
        case "product":
          counts.product += 1;
          break;
        case "inspiration":
          counts.inspiration += 1;
          break;
      }
    }

    return counts;
  });
}

export async function listWorkspaceAssets(workspaceId: string, brandId?: string): Promise<BrandAssetRecord[]> {
  let query = supabaseAdmin
    .from("brand_assets")
    .select("id, workspace_id, brand_id, project_id, kind, label, file_name, mime_type, storage_path, thumbnail_storage_path, thumbnail_width, thumbnail_height, thumbnail_bytes, metadata_json")
    .eq("workspace_id", workspaceId);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).returns<AssetRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((asset) => ({
    id: asset.id,
    workspaceId: asset.workspace_id,
    brandId: asset.brand_id,
    projectId: asset.project_id,
    kind: asset.kind,
    label: asset.label,
    fileName: asset.file_name,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    thumbnailStoragePath: asset.thumbnail_storage_path,
    metadataJson: asset.metadata_json ?? {}
  }));
}

export async function listProjectReraRegistrations(
  workspaceId: string,
  brandId?: string
): Promise<ProjectReraRegistrationRecord[]> {
  let query = supabaseAdmin
    .from("project_rera_registrations")
    .select("id, workspace_id, brand_id, project_id, registration_number, label, qr_asset_id, is_default, metadata_json, created_at, updated_at")
    .eq("workspace_id", workspaceId);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<ProjectReraRegistrationRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapProjectReraRegistrationRow);
}

export async function createProjectReraRegistration(params: {
  workspaceId: string;
  brandId: string;
  projectId: string | null;
  registrationNumber: string | null;
  label: string;
  qrAssetId: string | null;
  createdBy: string | null;
}) {
  const shouldBecomeDefault = params.projectId ? await shouldUseAsDefaultReraRegistration(params.projectId) : false;

  if (shouldBecomeDefault) {
    await supabaseAdmin
      .from("project_rera_registrations")
      .update({ is_default: false })
      .eq("project_id", params.projectId);
  }

  const { data, error } = await supabaseAdmin
    .from("project_rera_registrations")
    .insert({
      workspace_id: params.workspaceId,
      brand_id: params.brandId,
      project_id: params.projectId,
      registration_number: params.registrationNumber?.trim() || null,
      label: params.label.trim() || params.registrationNumber?.trim() || "RERA registration",
      qr_asset_id: params.qrAssetId,
      is_default: shouldBecomeDefault,
      created_by: params.createdBy
    })
    .select("id, workspace_id, brand_id, project_id, registration_number, label, qr_asset_id, is_default, metadata_json, created_at, updated_at")
    .single<ProjectReraRegistrationRow>();

  if (error) {
    throw error;
  }

  return mapProjectReraRegistrationRow(data);
}

export async function setDefaultProjectReraRegistration(registrationId: string): Promise<ProjectReraRegistrationRecord> {
  const { data: current, error: currentError } = await supabaseAdmin
    .from("project_rera_registrations")
    .select("id, project_id")
    .eq("id", registrationId)
    .single<{ id: string; project_id: string | null }>();

  if (currentError) {
    throw currentError;
  }

  if (!current.project_id) {
    throw new Error("Only project-linked RERA registrations can be default");
  }

  await supabaseAdmin
    .from("project_rera_registrations")
    .update({ is_default: false })
    .eq("project_id", current.project_id);

  const { data, error } = await supabaseAdmin
    .from("project_rera_registrations")
    .update({ is_default: true })
    .eq("id", registrationId)
    .select("id, workspace_id, brand_id, project_id, registration_number, label, qr_asset_id, is_default, metadata_json, created_at, updated_at")
    .single<ProjectReraRegistrationRow>();

  if (error) {
    throw error;
  }

  return mapProjectReraRegistrationRow(data);
}

export async function updateProjectReraRegistration(params: {
  registrationId: string;
  registrationNumber: string | null;
  label: string;
  qrAssetId: string | null;
}): Promise<ProjectReraRegistrationRecord> {
  const { data, error } = await supabaseAdmin
    .from("project_rera_registrations")
    .update({
      registration_number: params.registrationNumber?.trim() || null,
      label: params.label.trim(),
      qr_asset_id: params.qrAssetId
    })
    .eq("id", params.registrationId)
    .select("id, workspace_id, brand_id, project_id, registration_number, label, qr_asset_id, is_default, metadata_json, created_at, updated_at")
    .single<ProjectReraRegistrationRow>();

  if (error) {
    throw error;
  }

  return mapProjectReraRegistrationRow(data);
}

export async function deleteProjectReraRegistration(registrationId: string): Promise<void> {
  const { data: current, error: currentError } = await supabaseAdmin
    .from("project_rera_registrations")
    .select("id, project_id, is_default")
    .eq("id", registrationId)
    .single<{ id: string; project_id: string | null; is_default: boolean }>();

  if (currentError) {
    throw currentError;
  }

  const { error } = await supabaseAdmin
    .from("project_rera_registrations")
    .delete()
    .eq("id", registrationId);

  if (error) {
    throw error;
  }

  if (current.is_default && current.project_id) {
    const { data: fallback } = await supabaseAdmin
      .from("project_rera_registrations")
      .select("id")
      .eq("project_id", current.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<Array<{ id: string }>>();

    const nextId = fallback?.[0]?.id;
    if (nextId) {
      await supabaseAdmin
        .from("project_rera_registrations")
        .update({ is_default: true })
        .eq("id", nextId);
    }
  }
}

async function shouldUseAsDefaultReraRegistration(projectId: string) {
  const { count, error } = await supabaseAdmin
    .from("project_rera_registrations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error) {
    throw error;
  }

  return (count ?? 0) === 0;
}

function mapProjectReraRegistrationRow(row: ProjectReraRegistrationRow): ProjectReraRegistrationRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    registrationNumber: row.registration_number,
    label: row.label,
    qrAssetId: row.qr_asset_id,
    isDefault: row.is_default,
    metadataJson: row.metadata_json ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listWorkspaceTemplates(workspaceId: string, brandId?: string): Promise<StyleTemplateRecord[]> {
  let query = supabaseAdmin
    .from("style_templates")
    .select("id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, source, label, storage_path, creative_output_id")
    .eq("workspace_id", workspaceId);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).returns<StyleTemplateRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((template) => ({
    id: template.id,
    workspaceId: template.workspace_id,
    brandId: template.brand_id,
    deliverableId: template.deliverable_id,
    projectId: template.project_id,
    postTypeId: template.post_type_id,
    creativeTemplateId: template.creative_template_id,
    calendarItemId: template.calendar_item_id,
    source: template.source,
    label: template.label,
    storagePath: template.storage_path,
    creativeOutputId: template.creative_output_id,
    jobId: null
  }));
}

export async function listWorkspaceJobs(workspaceId: string, brandId?: string): Promise<CreativeJobRecord[]> {
  let query = supabaseAdmin
    .from("creative_jobs")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, prompt_package_id, selected_template_id, job_type, status, provider, provider_model, provider_request_id, requested_count, error_json"
    )
    .eq("workspace_id", workspaceId);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<JobRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((job) => ({
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
    briefContext: null,
    outputs: [],
    error: job.error_json
  }));
}

export async function listWorkspaceOutputs(workspaceId: string, brandId?: string): Promise<CreativeOutputRecord[]> {
  let query = supabaseAdmin
    .from("creative_outputs")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, provider_url, output_index, review_state, latest_feedback_verdict, reviewed_at, created_by"
      + ", thumbnail_storage_path, thumbnail_width, thumbnail_height, thumbnail_bytes, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version"
    )
    .eq("workspace_id", workspaceId);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(24)
    .returns<OutputRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((output) => ({
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
    createdBy: output.created_by
  }));
}

export async function getPromptPackage(promptPackageId: string): Promise<PromptPackage> {
  const { data, error } = await supabaseAdmin
    .from("prompt_packages")
    .select("*")
    .eq("id", promptPackageId)
    .maybeSingle();

  const row = data as
    | {
        id: string;
        workspace_id: string;
        brand_id: string;
        deliverable_id: string | null;
        project_id: string | null;
        post_type_id: string | null;
        creative_template_id: string | null;
        calendar_item_id: string | null;
        creative_request_id: string;
        brand_profile_version_id: string;
        prompt_summary: string;
        seed_prompt: string;
        final_prompt: string;
        aspect_ratio: string;
        chosen_model: string;
        template_type: PromptPackage["templateType"];
        reference_strategy: PromptPackage["referenceStrategy"];
        reference_asset_ids: string[];
        variations: PromptPackage["variations"] | null;
        resolved_constraints: Record<string, unknown>;
        compiler_trace: Record<string, unknown> | null;
      }
    | null;

  if (error) {
    throw error;
  }

  if (!row) {
    throw new Error("Prompt package not found");
  }

  const compilerTrace = row.compiler_trace ?? {};
  const variations = Array.isArray(row.variations)
    ? row.variations
    : Array.isArray(compilerTrace.variations)
      ? compilerTrace.variations
      : [];

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    calendarItemId: row.calendar_item_id,
    creativeRequestId: row.creative_request_id,
    brandProfileVersionId: row.brand_profile_version_id,
    promptSummary: row.prompt_summary,
    finalPrompt: row.final_prompt,
    aspectRatio: row.aspect_ratio,
    chosenModel: row.chosen_model,
    templateType: row.template_type ?? undefined,
    referenceStrategy: row.reference_strategy,
    referenceAssetIds: row.reference_asset_ids ?? [],
    variations,
    resolvedConstraints: row.resolved_constraints ?? {},
    compilerTrace
  };
}

export async function getStyleTemplate(templateId: string): Promise<StyleTemplateRecord> {
  const { data, error } = await supabaseAdmin
    .from("style_templates")
    .select("id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, source, label, storage_path, creative_output_id")
    .eq("id", templateId)
    .maybeSingle();

  const row = data as StyleTemplateRow | null;

  if (error) {
    throw error;
  }

  if (!row) {
    throw new Error("Style template not found");
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
    source: row.source,
    label: row.label,
    storagePath: row.storage_path,
    creativeOutputId: row.creative_output_id,
    jobId: null
  };
}
