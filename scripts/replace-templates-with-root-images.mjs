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

const TEMPLATE_IMAGES = [
  {
    fileName: "1280w-xF-qSTXV154.webp",
    assetLabel: "Elevate residences launch hero",
    templateName: "Elevate residences · launch hero",
    postTypeCode: "project-launch",
    channel: "instagram-feed",
    format: "portrait",
    approvedUseCases: ["Project launch", "Property spotlight"],
    safeZoneNotes: [
      "Keep the headline in the upper third.",
      "Protect the lower info strip for price, location, and contact."
    ],
    notes: ["Use for premium project reveal or hero-led listing posts."],
    textZones: ["headline", "subcopy", "price", "location", "contact"]
  },
  {
    fileName: "1280w-6gGv9XdwLmg.jpg",
    assetLabel: "Elevate residences pricing card",
    templateName: "Elevate residences · pricing card",
    postTypeCode: "site-visit-invite",
    channel: "instagram-feed",
    format: "portrait",
    approvedUseCases: ["Site visit invite", "Pricing highlight"],
    safeZoneNotes: [
      "Keep the headline block high and left-aligned.",
      "Preserve the orange callout and info row as structured CTA space."
    ],
    notes: ["Best for lead-gen or enquiry-led property creatives."],
    textZones: ["headline", "subcopy", "price", "property info", "location", "contact"]
  }
];

const ARCHIVED_TEMPLATE_ASSET_DIR = path.resolve(
  process.cwd(),
  "archive/legacy/root-assets/template-images"
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
  const brand = await fetchBrand("Asteria Developers");
  const ownerUserId = await fetchWorkspaceOwner(brand.workspace_id);
  const postTypes = await fetchPostTypes(brand.workspace_id);
  const campaignIds = await fetchCampaignIds(brand.id);

  await removeCurrentTemplates(brand.id);
  await removePriorImageAssets(brand.id);

  const createdTemplates = [];

  for (const item of TEMPLATE_IMAGES) {
    const filePath = path.resolve(ARCHIVED_TEMPLATE_ASSET_DIR, item.fileName);
    const fileBuffer = await fs.readFile(filePath);
    const assetId = crypto.randomUUID();
    const templateId = crypto.randomUUID();
    const mimeType = getMimeType(item.fileName);
    const storagePath = buildStoragePath({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      section: "references",
      id: assetId,
      fileName: item.fileName
    });

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { error: assetError } = await supabase.from("brand_assets").insert({
      id: assetId,
      workspace_id: brand.workspace_id,
      brand_id: brand.id,
      kind: "reference",
      label: item.assetLabel,
      file_name: item.fileName,
      mime_type: mimeType,
      storage_path: storagePath,
      created_by: ownerUserId
    });

    if (assetError) {
      throw assetError;
    }

    const postTypeId = postTypes.get(item.postTypeCode) ?? null;

    const { error: templateError } = await supabase.from("creative_templates").insert({
      id: templateId,
      workspace_id: brand.workspace_id,
      brand_id: brand.id,
      project_id: null,
      post_type_id: postTypeId,
      name: item.templateName,
      status: "approved",
      channel: item.channel,
      format: item.format,
      base_prompt: "",
      preview_storage_path: storagePath,
      template_json: {
        promptScaffold: "",
        safeZoneNotes: item.safeZoneNotes,
        approvedUseCases: item.approvedUseCases,
        notes: item.notes,
        textZones: item.textZones.map((name) => ({ name }))
      },
      created_by: ownerUserId
    });

    if (templateError) {
      throw templateError;
    }

    const { error: templateAssetError } = await supabase.from("creative_template_assets").insert({
      id: crypto.randomUUID(),
      template_id: templateId,
      asset_id: assetId,
      role: "primary_ref",
      sort_order: 0
    });

    if (templateAssetError) {
      throw templateAssetError;
    }

    createdTemplates.push({
      templateId,
      postTypeId,
      name: item.templateName
    });
  }

  for (const created of createdTemplates) {
    if (!created.postTypeId) continue;

    const { error: planError } = await supabase
      .from("campaign_deliverable_plans")
      .update({ template_id: created.templateId })
      .in("campaign_id", campaignIds)
      .eq("post_type_id", created.postTypeId);

    if (planError) {
      throw planError;
    }

    const { error: deliverableError } = await supabase
      .from("deliverables")
      .update({ creative_template_id: created.templateId })
      .eq("brand_id", brand.id)
      .eq("post_type_id", created.postTypeId);

    if (deliverableError) {
      throw deliverableError;
    }
  }

  console.log(`Replaced templates for ${brand.name}.`);
  for (const created of createdTemplates) {
    console.log(`- ${created.name}`);
  }
}

async function fetchBrand(name) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, workspace_id, name")
    .eq("name", name)
    .limit(1)
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
  if (!data?.user_id) throw new Error("No workspace owner found.");
  return data.user_id;
}

async function fetchPostTypes(workspaceId) {
  const { data, error } = await supabase
    .from("post_types")
    .select("id, code, workspace_id")
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);

  if (error) throw error;

  const map = new Map();
  for (const row of data ?? []) {
    if (!map.has(row.code) || row.workspace_id === workspaceId) {
      map.set(row.code, row.id);
    }
  }
  return map;
}

async function fetchCampaignIds(brandId) {
  const { data, error } = await supabase.from("campaigns").select("id").eq("brand_id", brandId);
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

async function removeCurrentTemplates(brandId) {
  const { error } = await supabase.from("creative_templates").delete().eq("brand_id", brandId);
  if (error) throw error;
}

async function removePriorImageAssets(brandId) {
  const targetNames = TEMPLATE_IMAGES.map((item) => item.fileName);
  const { data, error } = await supabase
    .from("brand_assets")
    .select("id, storage_path")
    .eq("brand_id", brandId)
    .in("file_name", targetNames);

  if (error) throw error;
  if (!data?.length) return;

  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove(data.map((row) => row.storage_path));

  if (storageError) {
    throw storageError;
  }

  const { error: deleteError } = await supabase
    .from("brand_assets")
    .delete()
    .eq("brand_id", brandId)
    .in("id", data.map((row) => row.id));

  if (deleteError) {
    throw deleteError;
  }
}

function getMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[extension] ?? "application/octet-stream";
}

function sanitizeFileName(fileName) {
  return fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function buildStoragePath({ workspaceId, brandId, section, id, fileName }) {
  return `${workspaceId}/${brandId}/${section}/${id}/${sanitizeFileName(fileName)}`;
}
