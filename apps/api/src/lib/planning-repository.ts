import type {
  CalendarItemRecord,
  CreativeTemplateAssetRecord,
  CreativeTemplateDetail,
  CreativeTemplateRecord,
  FestivalRecord,
  PostTypeRecord,
  ProjectProfile,
  ProjectProfileVersionRecord,
  ProjectRecord
} from "@image-lab/contracts";
import { supabaseAdmin } from "./supabase.js";
import { getOrPopulateRuntimeCache } from "./runtime-cache.js";

const WORKSPACE_PROJECTS_TTL_MS = 20_000;
const WORKSPACE_FESTIVALS_TTL_MS = 60_000;
const WORKSPACE_POST_TYPES_TTL_MS = 60_000;
const WORKSPACE_TEMPLATE_LIST_TTL_MS = 12_000;

type ProjectRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  name: string;
  slug: string;
  city: string | null;
  micro_location: string | null;
  project_type: string | null;
  stage: ProjectRecord["stage"];
  status: ProjectRecord["status"];
  description: string | null;
  current_profile_version_id: string | null;
};

type ProjectProfileRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  version_number: number;
  profile_json: ProjectProfile;
};

type PostTypeRow = {
  id: string;
  workspace_id: string | null;
  code: string;
  name: string;
  description: string | null;
  config_json: PostTypeRecord["config"];
  is_system: boolean;
  active: boolean;
};

type FestivalRow = {
  id: string;
  workspace_id: string | null;
  code: string;
  name: string;
  category: FestivalRecord["category"];
  community: string | null;
  regions_json: unknown;
  meaning: string;
  date_label: string | null;
  next_occurs_on: string | null;
  active: boolean;
  sort_order: number;
};

type CreativeTemplateRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  post_type_id: string | null;
  name: string;
  status: CreativeTemplateRecord["status"];
  channel: CreativeTemplateRecord["channel"];
  format: CreativeTemplateRecord["format"];
  base_prompt: string;
  preview_storage_path: string | null;
  created_from_output_id: string | null;
  template_json: CreativeTemplateRecord["config"];
};

type CreativeTemplateAssetRow = {
  id: string;
  template_id: string;
  asset_id: string;
  role: CreativeTemplateAssetRecord["role"];
  sort_order: number;
};

type CalendarItemRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  post_type_id: string;
  creative_template_id: string | null;
  approved_output_id: string | null;
  title: string;
  objective: string | null;
  channel: CalendarItemRecord["channel"];
  format: CalendarItemRecord["format"];
  scheduled_for: string;
  status: CalendarItemRecord["status"];
  owner_user_id: string | null;
  notes_json: Record<string, unknown> | null;
};

export async function listWorkspaceProjects(workspaceId: string, brandId?: string): Promise<ProjectRecord[]> {
  return getOrPopulateRuntimeCache(
    `workspace-projects:${workspaceId}:${brandId ?? "all"}`,
    WORKSPACE_PROJECTS_TTL_MS,
    async () => {
      let query = supabaseAdmin
        .from("projects")
        .select("id, workspace_id, brand_id, name, slug, city, micro_location, project_type, stage, status, description, current_profile_version_id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (brandId) {
        query = query.eq("brand_id", brandId);
      }

      const { data, error } = await query.returns<ProjectRow[]>();

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapProjectRow);
    }
  );
}

export async function getProject(projectId: string): Promise<ProjectRecord> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, workspace_id, brand_id, name, slug, city, micro_location, project_type, stage, status, description, current_profile_version_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as ProjectRow | null;

  if (!row) {
    throw new Error("Project not found");
  }

  return mapProjectRow(row);
}

export async function getProjectProfileVersion(profileVersionId: string): Promise<ProjectProfileVersionRecord> {
  const { data, error } = await supabaseAdmin
    .from("project_profile_versions")
    .select("id, workspace_id, project_id, version_number, profile_json")
    .eq("id", profileVersionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as ProjectProfileRow | null;

  if (!row) {
    throw new Error("Project profile version not found");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    profile: row.profile_json
  };
}

export async function getActiveProjectProfile(projectId: string): Promise<ProjectProfileVersionRecord> {
  const project = await getProject(projectId);

  if (!project.currentProfileVersionId) {
    throw new Error("Project does not have an active profile");
  }

  return getProjectProfileVersion(project.currentProfileVersionId);
}

export async function listWorkspaceFestivals(workspaceId: string): Promise<FestivalRecord[]> {
  return getOrPopulateRuntimeCache(`workspace-festivals:${workspaceId}`, WORKSPACE_FESTIVALS_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("festivals")
      .select("id, workspace_id, code, name, category, community, regions_json, meaning, date_label, next_occurs_on, active, sort_order")
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("next_occurs_on", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .returns<FestivalRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapFestivalRow);
  });
}

export async function getFestival(festivalId: string): Promise<FestivalRecord> {
  const { data, error } = await supabaseAdmin
    .from("festivals")
    .select("id, workspace_id, code, name, category, community, regions_json, meaning, date_label, next_occurs_on, active, sort_order")
    .eq("id", festivalId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as FestivalRow | null;

  if (!row) {
    throw new Error("Festival not found");
  }

  return mapFestivalRow(row);
}

export async function listWorkspacePostTypes(workspaceId: string): Promise<PostTypeRecord[]> {
  return getOrPopulateRuntimeCache(`workspace-post-types:${workspaceId}`, WORKSPACE_POST_TYPES_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("post_types")
      .select("id, workspace_id, code, name, description, config_json, is_system, active")
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .eq("active", true)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true })
      .returns<PostTypeRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapPostTypeRow);
  });
}

export async function getPostType(postTypeId: string): Promise<PostTypeRecord> {
  const { data, error } = await supabaseAdmin
    .from("post_types")
    .select("id, workspace_id, code, name, description, config_json, is_system, active")
    .eq("id", postTypeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as PostTypeRow | null;

  if (!row) {
    throw new Error("Post type not found");
  }

  return mapPostTypeRow(row);
}

export async function listWorkspaceCreativeTemplates(
  workspaceId: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    postTypeId?: string;
    status?: CreativeTemplateRecord["status"];
  }
): Promise<CreativeTemplateRecord[]> {
  return getOrPopulateRuntimeCache(
    `workspace-templates:${workspaceId}:${filters?.brandId ?? "all"}:${filters?.projectId ?? "all"}:${filters?.postTypeId ?? "all"}:${filters?.status ?? "all"}`,
    WORKSPACE_TEMPLATE_LIST_TTL_MS,
    async () => {
      let query = supabaseAdmin
        .from("creative_templates")
        .select("id, workspace_id, brand_id, project_id, post_type_id, name, status, channel, format, base_prompt, preview_storage_path, created_from_output_id, template_json")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (filters?.brandId) {
        query = query.eq("brand_id", filters.brandId);
      }

      if (filters?.projectId) {
        query = query.eq("project_id", filters.projectId);
      }

      if (filters?.postTypeId) {
        query = query.eq("post_type_id", filters.postTypeId);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query.returns<CreativeTemplateRow[]>();

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapCreativeTemplateRow);
    }
  );
}

export async function listWorkspaceCreativeTemplateOptions(
  workspaceId: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    postTypeId?: string;
    status?: CreativeTemplateRecord["status"];
  }
) {
  return getOrPopulateRuntimeCache(
    `workspace-template-options:${workspaceId}:${filters?.brandId ?? "all"}:${filters?.projectId ?? "all"}:${filters?.postTypeId ?? "all"}:${filters?.status ?? "all"}`,
    WORKSPACE_TEMPLATE_LIST_TTL_MS,
    async () => {
      let query = supabaseAdmin
        .from("creative_templates")
        .select("id, workspace_id, brand_id, project_id, post_type_id, name, status, channel, format")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (filters?.brandId) {
        query = query.eq("brand_id", filters.brandId);
      }

      if (filters?.projectId) {
        query = query.eq("project_id", filters.projectId);
      }

      if (filters?.postTypeId) {
        query = query.eq("post_type_id", filters.postTypeId);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query.returns<
        Array<Pick<CreativeTemplateRow, "id" | "workspace_id" | "brand_id" | "project_id" | "post_type_id" | "name" | "status" | "channel" | "format">>
      >();

      if (error) {
        throw error;
      }

      return (data ?? []).map((template) => ({
        id: template.id,
        workspaceId: template.workspace_id,
        brandId: template.brand_id,
        projectId: template.project_id,
        postTypeId: template.post_type_id,
        name: template.name,
        status: template.status,
        channel: template.channel,
        format: template.format
      }));
    }
  );
}

export async function getCreativeTemplate(templateId: string): Promise<CreativeTemplateRecord> {
  const { data, error } = await supabaseAdmin
    .from("creative_templates")
    .select("id, workspace_id, brand_id, project_id, post_type_id, name, status, channel, format, base_prompt, preview_storage_path, created_from_output_id, template_json")
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as CreativeTemplateRow | null;

  if (!row) {
    throw new Error("Creative template not found");
  }

  return mapCreativeTemplateRow(row);
}

export async function listCreativeTemplateAssets(templateId: string): Promise<CreativeTemplateAssetRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("creative_template_assets")
    .select("id, template_id, asset_id, role, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .returns<CreativeTemplateAssetRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    assetId: row.asset_id,
    role: row.role,
    sortOrder: row.sort_order
  }));
}

export async function getCreativeTemplateDetail(templateId: string): Promise<CreativeTemplateDetail> {
  const [template, assets] = await Promise.all([
    getCreativeTemplate(templateId),
    listCreativeTemplateAssets(templateId)
  ]);

  return {
    template,
    assets
  };
}

export async function listCalendarItems(
  workspaceId: string,
  filters?: {
    brandId?: string;
    projectId?: string;
    status?: CalendarItemRecord["status"];
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<CalendarItemRecord[]> {
  let query = supabaseAdmin
    .from("calendar_items")
    .select("id, workspace_id, brand_id, project_id, post_type_id, creative_template_id, approved_output_id, title, objective, channel, format, scheduled_for, status, owner_user_id, notes_json")
    .eq("workspace_id", workspaceId)
    .order("scheduled_for", { ascending: true });

  if (filters?.brandId) {
    query = query.eq("brand_id", filters.brandId);
  }

  if (filters?.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.dateFrom) {
    query = query.gte("scheduled_for", filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte("scheduled_for", filters.dateTo);
  }

  const { data, error } = await query.returns<CalendarItemRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapCalendarItemRow);
}

export async function getCalendarItem(calendarItemId: string): Promise<CalendarItemRecord> {
  const { data, error } = await supabaseAdmin
    .from("calendar_items")
    .select("id, workspace_id, brand_id, project_id, post_type_id, creative_template_id, approved_output_id, title, objective, channel, format, scheduled_for, status, owner_user_id, notes_json")
    .eq("id", calendarItemId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as CalendarItemRow | null;

  if (!row) {
    throw new Error("Calendar item not found");
  }

  return mapCalendarItemRow(row);
}

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    microLocation: row.micro_location,
    projectType: row.project_type,
    stage: row.stage,
    status: row.status,
    description: row.description,
    currentProfileVersionId: row.current_profile_version_id
  };
}

function mapPostTypeRow(row: PostTypeRow): PostTypeRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    code: row.code,
    name: row.name,
    description: row.description,
    config: row.config_json ?? {
      defaultChannels: [],
      allowedFormats: [],
      recommendedTemplateTypes: [],
      requiredBriefFields: [],
      safeZoneGuidance: []
    },
    isSystem: row.is_system,
    active: row.active
  };
}

function mapFestivalRow(row: FestivalRow): FestivalRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    code: row.code,
    name: row.name,
    category: row.category,
    community: row.community,
    regions: Array.isArray(row.regions_json)
      ? row.regions_json.filter((value): value is string => typeof value === "string")
      : [],
    meaning: row.meaning,
    dateLabel: row.date_label,
    nextOccursOn: row.next_occurs_on,
    active: row.active,
    sortOrder: row.sort_order
  };
}

function mapCreativeTemplateRow(row: CreativeTemplateRow): CreativeTemplateRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    name: row.name,
    status: row.status,
    channel: row.channel,
    format: row.format,
    basePrompt: row.base_prompt,
    previewStoragePath: row.preview_storage_path,
    createdFromOutputId: row.created_from_output_id,
    config: row.template_json ?? {
      promptScaffold: "",
      safeZoneNotes: [],
      approvedUseCases: [],
      templateFamily: "",
      outputKinds: [],
      defaultSlideCount: null,
      allowedSlideCounts: [],
      seriesUseCases: [],
      carouselRecipe: [],
      notes: [],
      textZones: []
    }
  };
}

function mapCalendarItemRow(row: CalendarItemRow): CalendarItemRecord {
  return {
    id: row.id,
    deliverableId: null,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    approvedOutputId: row.approved_output_id,
    title: row.title,
    objective: row.objective,
    channel: row.channel,
    format: row.format,
    scheduledFor: row.scheduled_for,
    status: row.status,
    ownerUserId: row.owner_user_id,
    notesJson: row.notes_json ?? {}
  };
}
