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
const OWNER_EMAIL = "demo@imagelab.local";
const TEMPLATE_POST_TYPE_CODE = "location-advantage";
const FILES = [
  {
    kind: "asset",
    fileName: "zoy.jpg",
    label: "Zoy tower aerial view"
  },
  {
    kind: "template",
    fileName: "template1.png",
    label: "Zoy editorial grid · cover",
    family: "Zoy editorial grid",
    basePrompt:
      "Use a clean editorial cover layout with oversized bold headline blocks, strong margins, subtle grid texture, and restrained premium composition. Keep the image secondary to the text hierarchy.",
    notes: ["Best for carousel cover slides and high-clarity headline-led posts."],
    recipe: [
      "Slide 1: oversized headline with one accent block",
      "Keep CTA minimal and low on the page",
      "Maintain generous whitespace and grid discipline"
    ]
  },
  {
    kind: "template",
    fileName: "template2.png",
    label: "Zoy editorial grid · detail",
    family: "Zoy editorial grid",
    basePrompt:
      "Use a dark editorial information layout with strong text hierarchy, highlighted key phrase blocks, and premium restrained accents. Keep the composition modular and carousel-friendly.",
    notes: ["Best for interior carousel slides or single-post explainers with richer supporting copy."],
    recipe: [
      "Use left-aligned body copy blocks",
      "Highlight one key phrase in an accent block",
      "Keep page ornaments subtle and structured"
    ]
  }
];

const ARCHIVED_ROOT_ASSET_DIR = path.resolve(process.cwd(), "archive/legacy/root-assets");
const ARCHIVED_ASSET_SECTION_BY_FILE = new Map([
  ["zoy.jpg", "project-images"],
  ["template1.png", "template-images"],
  ["template2.png", "template-images"]
]);

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
  const ownerUserId = await fetchUserIdByEmail(OWNER_EMAIL);
  const postTypeId = await fetchPostTypeId(TEMPLATE_POST_TYPE_CODE);

  const zoyAsset = await upsertReferenceAsset({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    createdBy: ownerUserId,
    fileName: "zoy.jpg",
    label: "Zoy tower aerial view"
  });

  for (const item of FILES) {
    if (item.kind !== "template") continue;
    const asset = await upsertReferenceAsset({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      createdBy: ownerUserId,
      fileName: item.fileName,
      label: item.label
    });

    await upsertTemplate({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      createdBy: ownerUserId,
      postTypeId,
      name: item.label,
      family: item.family,
      basePrompt: item.basePrompt,
      previewStoragePath: asset.storagePath,
      assetId: asset.id,
      notes: item.notes,
      carouselRecipe: item.recipe
    });
  }

  console.log(`Imported Zoy asset: ${zoyAsset.label}`);
  console.log("Imported template1.png and template2.png as live creative templates.");
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

async function fetchUserIdByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((item) => item.email === email);
  if (!user) throw new Error(`User not found: ${email}`);
  return user.id;
}

async function fetchPostTypeId(code) {
  const { data, error } = await supabase
    .from("post_types")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error(`Post type not found: ${code}`);
  return data.id;
}

async function upsertReferenceAsset({ workspaceId, brandId, createdBy, fileName, label }) {
  const fileSection = ARCHIVED_ASSET_SECTION_BY_FILE.get(fileName);
  if (!fileSection) {
    throw new Error(`No archived asset mapping found for ${fileName}`);
  }

  const filePath = path.resolve(ARCHIVED_ROOT_ASSET_DIR, fileSection, fileName);
  const fileBuffer = await fs.readFile(filePath);
  const mimeType = getMimeType(fileName);

  const { data: existingAsset } = await supabase
    .from("brand_assets")
    .select("id, storage_path")
    .eq("brand_id", brandId)
    .eq("label", label)
    .maybeSingle();

  const assetId = existingAsset?.id ?? crypto.randomUUID();
  const storagePath =
    existingAsset?.storage_path ??
    buildStoragePath({
      workspaceId,
      brandId,
      section: "references",
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
    kind: "reference",
    label,
    file_name: fileName,
    mime_type: mimeType,
    storage_path: storagePath,
    created_by: createdBy
  });

  if (insertError) throw insertError;

  return { id: assetId, storagePath, label };
}

async function upsertTemplate({
  workspaceId,
  brandId,
  createdBy,
  postTypeId,
  name,
  family,
  basePrompt,
  previewStoragePath,
  assetId,
  notes,
  carouselRecipe
}) {
  const { data: existingTemplate } = await supabase
    .from("creative_templates")
    .select("id")
    .eq("brand_id", brandId)
    .eq("name", name)
    .maybeSingle();

  const templateId = existingTemplate?.id ?? crypto.randomUUID();

  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    project_id: null,
    post_type_id: postTypeId,
    name,
    status: "approved",
    channel: "instagram-feed",
    format: "portrait",
    base_prompt: basePrompt,
    preview_storage_path: previewStoragePath,
    template_json: {
      promptScaffold: basePrompt,
      templateFamily: family,
      outputKinds: ["single_image", "carousel"],
      defaultSlideCount: 5,
      allowedSlideCounts: [4, 5, 6],
      seriesUseCases: ["City facts", "Project education", "Location story"],
      carouselRecipe,
      safeZoneNotes: [
        "Preserve a strong headline zone in the upper-left half.",
        "Keep CTA and small support text in the lower third."
      ],
      approvedUseCases: ["Series cover", "Educational carousel", "Project story"],
      notes,
      textZones: [{ name: "headline" }, { name: "body" }, { name: "cta" }]
    },
    created_by: createdBy
  };

  if (existingTemplate) {
    const { error: updateError } = await supabase
      .from("creative_templates")
      .update(payload)
      .eq("id", existingTemplate.id);
    if (updateError) throw updateError;

    await supabase
      .from("creative_template_assets")
      .delete()
      .eq("template_id", existingTemplate.id);

    const { error: assetLinkError } = await supabase.from("creative_template_assets").insert({
      id: crypto.randomUUID(),
      template_id: existingTemplate.id,
      asset_id: assetId,
      role: "primary_ref",
      sort_order: 0
    });
    if (assetLinkError) throw assetLinkError;
    return existingTemplate.id;
  }

  const { error: insertError } = await supabase.from("creative_templates").insert({
    id: templateId,
    ...payload
  });
  if (insertError) throw insertError;

  const { error: assetLinkError } = await supabase.from("creative_template_assets").insert({
    id: crypto.randomUUID(),
    template_id: templateId,
    asset_id: assetId,
    role: "primary_ref",
    sort_order: 0
  });
  if (assetLinkError) throw assetLinkError;

  return templateId;
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
