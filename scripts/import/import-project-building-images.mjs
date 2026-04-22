import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
}

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "creative-assets";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BRAND_NAME = "Asteria Developers";
const IMPORTS = [
  {
    projectName: "41 Luxovert",
    fileName: "Luxovert.jpg",
    label: "41 Luxovert building view"
  },
  {
    projectName: "41 Zillenia Phase 2",
    fileName: "zillenia2.png",
    label: "41 Zillenia Phase 2 building view"
  },
  {
    projectName: "Aventis",
    fileName: "Aventis-View-05-Straight-View-scaled.jpg",
    label: "Aventis building view"
  }
];

const ARCHIVED_PROJECT_ASSET_DIR = path.resolve(
  process.cwd(),
  "archive/legacy/root-assets/project-images"
);

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const brand = await fetchBrand(BRAND_NAME);
  const ownerUserId = await fetchWorkspaceOwner(brand.workspace_id);

  for (const item of IMPORTS) {
    const project = await fetchProject(brand.id, item.projectName);
    const asset = await upsertProjectAsset({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      projectId: project.id,
      createdBy: ownerUserId,
      fileName: item.fileName,
      label: item.label
    });

    const currentProfile = await fetchCurrentProjectProfile(project.current_profile_version_id, project.id);
    const existingIds = Array.isArray(currentProfile.profile_json?.actualProjectImageIds)
      ? currentProfile.profile_json.actualProjectImageIds
      : [];

    if (!existingIds.includes(asset.id)) {
      const nextProfileId = crypto.randomUUID();
      const nextProfile = {
        ...currentProfile.profile_json,
        actualProjectImageIds: [...existingIds, asset.id],
        sampleFlatImageIds: Array.isArray(currentProfile.profile_json?.sampleFlatImageIds)
          ? currentProfile.profile_json.sampleFlatImageIds
          : []
      };

      const { error: insertProfileError } = await supabase.from("project_profile_versions").insert({
        id: nextProfileId,
        workspace_id: brand.workspace_id,
        project_id: project.id,
        version_number: currentProfile.version_number + 1,
        profile_json: nextProfile,
        created_by: ownerUserId
      });

      if (insertProfileError) throw insertProfileError;

      const { error: updateProjectError } = await supabase
        .from("projects")
        .update({ current_profile_version_id: nextProfileId })
        .eq("id", project.id);

      if (updateProjectError) throw updateProjectError;
    }

    console.log(`Linked ${item.fileName} to ${item.projectName}`);
  }
}

async function fetchBrand(name) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, workspace_id, name")
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Brand not found: ${name}`);
  return data;
}

async function fetchWorkspaceOwner(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id) throw new Error(`No workspace owner found for ${workspaceId}`);
  return data.user_id;
}

async function fetchProject(brandId, name) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, current_profile_version_id")
    .eq("brand_id", brandId)
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Project not found: ${name}`);
  return data;
}

async function fetchCurrentProjectProfile(currentProfileVersionId, projectId) {
  if (currentProfileVersionId) {
    const { data, error } = await supabase
      .from("project_profile_versions")
      .select("id, version_number, profile_json")
      .eq("id", currentProfileVersionId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("project_profile_versions")
    .select("id, version_number, profile_json")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      id: null,
      version_number: 0,
      profile_json: {}
    };
  }

  return data;
}

async function upsertProjectAsset({ workspaceId, brandId, projectId, createdBy, fileName, label }) {
  const filePath = path.resolve(ARCHIVED_PROJECT_ASSET_DIR, fileName);
  const fileBuffer = await fs.readFile(filePath);
  const mimeType = getMimeType(fileName);

  const { data: existingAsset, error: existingAssetError } = await supabase
    .from("brand_assets")
    .select("id, storage_path")
    .eq("brand_id", brandId)
    .eq("project_id", projectId)
    .eq("label", label)
    .maybeSingle();

  if (existingAssetError) throw existingAssetError;

  const assetId = existingAsset?.id ?? crypto.randomUUID();
  const storagePath =
    existingAsset?.storage_path ??
    buildStoragePath({
      workspaceId,
      brandId,
      section: "project-images",
      id: assetId,
      fileName
    });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

  if (uploadError) throw uploadError;

  if (existingAsset) {
    const { error: updateError } = await supabase
      .from("brand_assets")
      .update({
        project_id: projectId,
        kind: "product",
        file_name: fileName,
        mime_type: mimeType,
        storage_path: storagePath
      })
      .eq("id", existingAsset.id);

    if (updateError) throw updateError;
    return { id: existingAsset.id, storagePath, label };
  }

  const { error: insertError } = await supabase.from("brand_assets").insert({
    id: assetId,
    workspace_id: workspaceId,
    brand_id: brandId,
    project_id: projectId,
    kind: "product",
    label,
    file_name: fileName,
    mime_type: mimeType,
    storage_path: storagePath,
    created_by: createdBy
  });

  if (insertError) throw insertError;

  return { id: assetId, storagePath, label };
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`Unsupported image type: ${fileName}`);
  }
  return mime;
}

function buildStoragePath({ workspaceId, brandId, section, id, fileName }) {
  return `${workspaceId}/${brandId}/${section}/${id}/${fileName.toLowerCase()}`;
}
