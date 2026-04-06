import type { FastifyBaseLogger } from "fastify";
import type {
  BrandProfile,
  BrandProfileVersionRecord,
  BrandRecord,
  BrandAssetRecord,
  CreativeJobRecord,
  CreativeOutputRecord,
  PromptPackage,
  StyleTemplateRecord,
  WorkspaceRole,
  WorkspaceSummary
} from "@image-lab/contracts";
import { supabaseAdmin } from "./supabase.js";
import type { AuthenticatedViewer } from "./viewer.js";

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
  provider_url: string | null;
  output_index: number;
  review_state: CreativeOutputRecord["reviewState"];
  latest_feedback_verdict: CreativeOutputRecord["latestVerdict"];
  reviewed_at: string | null;
};

export async function getPrimaryWorkspace(viewer: AuthenticatedViewer): Promise<WorkspaceSummary | null> {
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
}

export async function assertWorkspaceRole(
  viewer: AuthenticatedViewer,
  workspaceId: string,
  allowedRoles: WorkspaceRole[],
  logger?: FastifyBaseLogger
) {
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

  if (!row || !allowedRoles.includes(row.role)) {
    throw new Error("You do not have access to this workspace");
  }

  return row.role;
}

export async function listWorkspaceBrands(workspaceId: string): Promise<BrandRecord[]> {
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
    .select("id, workspace_id, brand_id, project_id, kind, label, file_name, mime_type, storage_path")
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
    storagePath: asset.storage_path
  }));
}

export async function getBrandAssetCounts(brandId: string) {
  const countByKind = async (kind?: BrandAssetRecord["kind"]) => {
    const query = supabaseAdmin
      .from("brand_assets")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId);

    if (kind) {
      query.eq("kind", kind);
    }

    const { count, error } = await query;

    if (error) {
      throw error;
    }

    return count ?? 0;
  };

  const [total, reference, logo, product, inspiration] = await Promise.all([
    countByKind(),
    countByKind("reference"),
    countByKind("logo"),
    countByKind("product"),
    countByKind("inspiration")
  ]);

  return {
    total,
    reference,
    logo,
    product,
    inspiration
  };
}

export async function listWorkspaceAssets(workspaceId: string, brandId?: string): Promise<BrandAssetRecord[]> {
  let query = supabaseAdmin
    .from("brand_assets")
    .select("id, workspace_id, brand_id, project_id, kind, label, file_name, mime_type, storage_path")
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
    storagePath: asset.storage_path
  }));
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
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, provider_url, output_index, review_state, latest_feedback_verdict, reviewed_at"
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
    providerUrl: output.provider_url,
    outputIndex: output.output_index,
    reviewState: output.review_state,
    latestVerdict: output.latest_feedback_verdict,
    reviewedAt: output.reviewed_at
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
    seedPrompt: row.seed_prompt,
    finalPrompt: row.final_prompt,
    aspectRatio: row.aspect_ratio,
    chosenModel: row.chosen_model,
    templateType: row.template_type ?? undefined,
    referenceStrategy: row.reference_strategy,
    referenceAssetIds: row.reference_asset_ids ?? [],
    resolvedConstraints: row.resolved_constraints ?? {},
    compilerTrace: row.compiler_trace ?? {}
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
