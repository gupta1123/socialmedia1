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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "creative-assets";
const uploadRoot = path.resolve(process.cwd(), "Eastworld/upload-prep");

const adminEmailInput = "admin@SanklaBuildcoon.com";
const adminEmail = adminEmailInput.trim().toLowerCase();
const adminPassword = "Sankla@123";
const displayName = "Sankla Buildcoon Admin";
const workspaceName = "Sankla Buildcoon";
const brandName = "Sankla Buildcoon";
const projectName = "East World";
const reraNumber = "P52100054774";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const brandDraft = JSON.parse(
    await fs.readFile(path.join(uploadRoot, "brand-profile-draft.json"), "utf8")
  );
  const projectDraft = JSON.parse(
    await fs.readFile(path.join(uploadRoot, "project-profile-draft.json"), "utf8")
  );
  const manifestRows = parseCsv(await fs.readFile(path.join(uploadRoot, "asset-manifest.csv"), "utf8"));

  const user = await ensureAdminUser();
  const workspace = await ensureWorkspace(user.id);
  const brand = await ensureBrand({
    workspaceId: workspace.id,
    userId: user.id,
    draft: brandDraft
  });
  const project = await ensureProject({
    workspaceId: workspace.id,
    brandId: brand.id,
    userId: user.id,
    draft: projectDraft
  });

  const assets = await syncAssets({
    workspaceId: workspace.id,
    brandId: brand.id,
    projectId: project.id,
    userId: user.id,
    manifestRows
  });

  await syncBrandProfile({
    brand,
    workspaceId: workspace.id,
    userId: user.id,
    draft: brandDraft,
    assets
  });

  await syncProjectProfile({
    project,
    workspaceId: workspace.id,
    userId: user.id,
    draft: projectDraft,
    assets
  });

  await syncReraRegistration({
    workspaceId: workspace.id,
    brandId: brand.id,
    projectId: project.id,
    userId: user.id,
    qrAssetId:
      assets.byUploadFilename.get("eastworld-qr.png")?.id ??
      assets.byRelativePath.get("compliance/eastworld-qr.png")?.id ??
      null
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId: workspace.id,
        brandId: brand.id,
        projectId: project.id,
        adminEmail,
        assetCount: assets.rows.length,
        reraNumber
      },
      null,
      2
    )
  );
}

async function ensureAdminUser() {
  const existing = await findUserByEmail(adminEmail);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName
      }
    });
    if (error) throw error;
    await supabase.from("profiles").update({ display_name: displayName }).eq("id", existing.id);
    return { id: existing.id, email: adminEmail };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName
    }
  });

  if (error) throw error;
  if (!data.user?.id) {
    throw new Error("Auth user creation returned no user id");
  }

  await supabase.from("profiles").update({ display_name: displayName }).eq("id", data.user.id);
  return { id: data.user.id, email: adminEmail };
}

async function ensureWorkspace(userId) {
  let workspace = await waitForWorkspace(userId);
  const desiredSlug = await ensureUniqueWorkspaceSlug(slugify(workspaceName), workspace.id);

  const { error } = await supabase
    .from("workspaces")
    .update({
      name: workspaceName,
      slug: desiredSlug
    })
    .eq("id", workspace.id);

  if (error) throw error;

  const { data, error: refetchError } = await supabase
    .from("workspaces")
    .select("id, name, slug, created_by")
    .eq("id", workspace.id)
    .maybeSingle();

  if (refetchError) throw refetchError;
  if (!data) throw new Error("Workspace disappeared after update");
  return data;
}

async function waitForWorkspace(userId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, created_by")
      .eq("created_by", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
    await sleep(500);
  }

  throw new Error(`No workspace found for user ${userId}`);
}

async function ensureUniqueWorkspaceSlug(baseSlug, workspaceId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.id === workspaceId) return candidate;
  }

  return `${baseSlug}-${Date.now().toString().slice(-6)}`;
}

async function ensureBrand({ workspaceId, userId, draft }) {
  const { data: existing, error: fetchError } = await supabase
    .from("brands")
    .select("id, current_profile_version_id")
    .eq("workspace_id", workspaceId)
    .eq("name", brandName)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("brands")
      .update({
        slug: slugify(draft.brandSlug || brandName),
        description: draft.description ?? null
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing;
  }

  const brandId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("brands").insert({
    id: brandId,
    workspace_id: workspaceId,
    name: brandName,
    slug: slugify(draft.brandSlug || brandName),
    description: draft.description ?? null,
    created_by: userId
  });

  if (insertError) throw insertError;
  return { id: brandId, current_profile_version_id: null };
}

async function ensureProject({ workspaceId, brandId, userId, draft }) {
  const { data: existing, error: fetchError } = await supabase
    .from("projects")
    .select("id, current_profile_version_id")
    .eq("workspace_id", workspaceId)
    .eq("brand_id", brandId)
    .eq("name", projectName)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    name: projectName,
    slug: slugify(draft.projectSlug || projectName),
    city: draft.city ?? null,
    micro_location: draft.microLocation ?? null,
    project_type: draft.projectType ?? null,
    stage: draft.stage ?? "launch",
    status: "active",
    description: draft.description ?? null,
    created_by: userId
  };

  if (existing) {
    const { error: updateError } = await supabase.from("projects").update(payload).eq("id", existing.id);
    if (updateError) throw updateError;
    return existing;
  }

  const projectId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("projects").insert({
    id: projectId,
    ...payload
  });

  if (insertError) throw insertError;
  return { id: projectId, current_profile_version_id: null };
}

async function syncAssets({ workspaceId, brandId, projectId, userId, manifestRows }) {
  const { data: existingRows, error: fetchError } = await supabase
    .from("brand_assets")
    .select("id, project_id, kind, label, file_name, storage_path, metadata_json")
    .eq("brand_id", brandId);

  if (fetchError) throw fetchError;

  const existingByFileName = new Map((existingRows ?? []).map((row) => [row.file_name, row]));
  const results = [];

  for (const row of manifestRows) {
    const relativePath = row.local_path;
    const absolutePath = path.join(uploadRoot, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);
    const mimeType = getMimeType(row.upload_filename);
    const existing = existingByFileName.get(row.upload_filename);
    const assetId = existing?.id ?? crypto.randomUUID();
    const storagePath =
      existing?.storage_path ??
      buildStoragePath({
        workspaceId,
        brandId,
        projectId,
        section: getStorageSection(relativePath, row.asset_kind),
        id: assetId,
        fileName: row.upload_filename
      });

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;

    const payload = {
      workspace_id: workspaceId,
      brand_id: brandId,
      project_id: row.project_name ? projectId : null,
      kind: row.asset_kind,
      label: buildAssetLabel(row),
      file_name: row.upload_filename,
      mime_type: mimeType,
      storage_path: storagePath,
      metadata_json: buildAssetMetadata(row),
      created_by: userId
    };

    if (existing) {
      const { error: updateError } = await supabase.from("brand_assets").update(payload).eq("id", existing.id);
      if (updateError) throw updateError;
      results.push({ ...payload, id: existing.id, relativePath });
      continue;
    }

    const { error: insertError } = await supabase.from("brand_assets").insert({
      id: assetId,
      ...payload
    });
    if (insertError) throw insertError;
    results.push({ ...payload, id: assetId, relativePath });
  }

  return {
    rows: results,
    byUploadFilename: new Map(results.map((row) => [row.file_name, row])),
    byRelativePath: new Map(results.map((row) => [row.relativePath, row]))
  };
}

async function syncBrandProfile({ brand, workspaceId, userId, draft, assets }) {
  const referenceAssetIds = assets.rows
    .filter((asset) => asset.kind === "reference" && asset.metadata_json.subjectType === "project_exterior")
    .filter((asset) => asset.metadata_json.usageIntent === "truth_anchor")
    .filter((asset) => asset.metadata_json.qualityTier === "hero" || asset.metadata_json.qualityTier === "usable")
    .map((asset) => asset.id);

  const profile = {
    ...draft.profile,
    referenceAssetIds
  };

  await upsertBrandProfileVersion({
    workspaceId,
    brandId: brand.id,
    userId,
    profile
  });
}

async function syncProjectProfile({ project, workspaceId, userId, draft, assets }) {
  const actualProjectImageIds = assets.rows
    .filter((asset) => asset.kind === "reference" && asset.metadata_json.subjectType === "project_exterior")
    .filter((asset) => asset.metadata_json.usageIntent === "truth_anchor")
    .map((asset) => asset.id);

  const sampleFlatImageIds = assets.rows
    .filter((asset) => asset.mime_type.startsWith("image/"))
    .filter((asset) => asset.metadata_json.subjectType === "interior" && asset.metadata_json.assetClass === "sample_flat")
    .map((asset) => asset.id);

  const credibilityFacts = dedupeStrings([
    ...(draft.profile.credibilityFacts ?? []),
    `Site address: ${draft.siteAddress}`,
    `Corporate office address: ${draft.corporateOfficeAddress}`,
    `Sales phone: ${draft.salesPhone}`,
    `Sales email: ${draft.salesEmail}`,
    `Website: ${draft.website}`,
    `Partner entity visible on brochure: ${draft.partnerEntity}`
  ]);

  const legalNotes = dedupeStrings([
    ...(draft.profile.legalNotes ?? []),
    `Brochure-sourced site address: ${draft.siteAddress}`,
    `Brochure-sourced corporate office address: ${draft.corporateOfficeAddress}`,
    `Brochure-sourced sales contact: ${draft.salesPhone}`,
    `Brochure-sourced sales email: ${draft.salesEmail}`,
    `Brochure-sourced website: ${draft.website}`
  ]);

  const profile = {
    ...draft.profile,
    credibilityFacts,
    legalNotes,
    actualProjectImageIds,
    sampleFlatImageIds
  };

  await upsertProjectProfileVersion({
    workspaceId,
    projectId: project.id,
    userId,
    profile
  });
}

async function upsertBrandProfileVersion({ workspaceId, brandId, userId, profile }) {
  const current = await fetchCurrentBrandProfile(brandId);
  if (jsonEquals(current?.profile_json ?? null, profile)) {
    return current?.id ?? null;
  }

  const nextVersionNumber = (current?.version_number ?? 0) + 1;
  const profileId = crypto.randomUUID();

  const { error: insertError } = await supabase.from("brand_profile_versions").insert({
    id: profileId,
    workspace_id: workspaceId,
    brand_id: brandId,
    version_number: nextVersionNumber,
    profile_json: profile,
    created_by: userId
  });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from("brands")
    .update({ current_profile_version_id: profileId })
    .eq("id", brandId);
  if (updateError) throw updateError;

  return profileId;
}

async function upsertProjectProfileVersion({ workspaceId, projectId, userId, profile }) {
  const current = await fetchCurrentProjectProfile(projectId);
  if (jsonEquals(current?.profile_json ?? null, profile)) {
    return current?.id ?? null;
  }

  const nextVersionNumber = (current?.version_number ?? 0) + 1;
  const profileId = crypto.randomUUID();

  const { error: insertError } = await supabase.from("project_profile_versions").insert({
    id: profileId,
    workspace_id: workspaceId,
    project_id: projectId,
    version_number: nextVersionNumber,
    profile_json: profile,
    created_by: userId
  });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from("projects")
    .update({ current_profile_version_id: profileId })
    .eq("id", projectId);
  if (updateError) throw updateError;

  return profileId;
}

async function fetchCurrentBrandProfile(brandId) {
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("current_profile_version_id")
    .eq("id", brandId)
    .maybeSingle();
  if (brandError) throw brandError;

  if (brand?.current_profile_version_id) {
    const { data, error } = await supabase
      .from("brand_profile_versions")
      .select("id, version_number, profile_json")
      .eq("id", brand.current_profile_version_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("brand_profile_versions")
    .select("id, version_number, profile_json")
    .eq("brand_id", brandId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function fetchCurrentProjectProfile(projectId) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("current_profile_version_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;

  if (project?.current_profile_version_id) {
    const { data, error } = await supabase
      .from("project_profile_versions")
      .select("id, version_number, profile_json")
      .eq("id", project.current_profile_version_id)
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
  return data ?? null;
}

async function syncReraRegistration({ workspaceId, brandId, projectId, userId, qrAssetId }) {
  const { data: existing, error: fetchError } = await supabase
    .from("project_rera_registrations")
    .select("id")
    .eq("project_id", projectId)
    .eq("registration_number", reraNumber)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    project_id: projectId,
    registration_number: reraNumber,
    label: "MahaRERA",
    qr_asset_id: qrAssetId,
    is_default: true,
    metadata_json: {
      source: "Eastworld brochure and supplied QR asset",
      brochurePage: 13,
      notes: [
        "QR target still unverified",
        "Registration number sourced from public project materials"
      ]
    },
    created_by: userId
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from("project_rera_registrations")
      .update(payload)
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const registrationId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("project_rera_registrations").insert({
    id: registrationId,
    ...payload
  });
  if (insertError) throw insertError;
  return registrationId;
}

async function findUserByEmail(email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) throw error;

    const users = data.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (users.length < 200) return null;
    page += 1;
  }
}

function buildAssetMetadata(row) {
  const tags = row.tags
    ? row.tags
        .split("|")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  const subjectType = row.subject_type === "sample_flat" ? "interior" : row.subject_type || null;

  return {
    source: "eastworld-upload-prep",
    originalRelativePath: row.local_path,
    subjectType,
    assetClass: row.subject_type || null,
    viewType: row.view_type || null,
    usageIntent: row.usage_intent || null,
    preserveIdentity: parseBoolean(row.preserve_identity),
    qualityTier: row.quality_tier || null,
    amenityName: row.amenity_name || null,
    tags,
    notes: row.notes || null
  };
}

function buildAssetLabel(row) {
  if (row.asset_kind === "logo") {
    return row.upload_filename.includes("source") ? "East World logo source" : "East World project logo";
  }
  if (row.asset_kind === "rera_qr") {
    return "East World RERA QR";
  }
  return humanizeFileName(row.upload_filename);
}

function buildStoragePath({ workspaceId, brandId, projectId, section, id, fileName }) {
  return `${workspaceId}/${brandId}/${projectId ?? "brand"}/${section}/${id}/${fileName.toLowerCase()}`;
}

function getStorageSection(relativePath, assetKind) {
  const [topLevel] = relativePath.split("/");
  if (assetKind === "logo") return "logos";
  if (assetKind === "rera_qr") return "compliance";
  return topLevel.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`Unsupported file type: ${fileName}`);
  }
  return mime;
}

function parseCsv(input) {
  const lines = input.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function humanizeFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function jsonEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4"
};
