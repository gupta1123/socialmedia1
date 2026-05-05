import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

config({ path: "apps/api/.env" });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const OUT_DIR = path.resolve(process.cwd(), "tmp/pride-vision-assets");
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "creative-assets";
const CELL_W = 260;
const CELL_H = 240;
const THUMB_W = 240;
const THUMB_H = 170;
const COLS = 4;
const MAX_PER_SHEET = 20;
const DOWNLOAD_TIMEOUT_MS = Number(process.env.PRIDE_ASSET_DOWNLOAD_TIMEOUT_MS || 30000);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeFileName(value) {
  return String(value || "asset").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 120);
}

function labelLines(asset, index) {
  const parts = [
    `${index}. ${asset.scene_type || asset.metadata_json?.subjectType || asset.kind}`,
    asset.metadata_json?.amenityName || asset.metadata_json?.viewType || "",
    asset.label,
  ].filter(Boolean);
  return parts.join("\n");
}

function labelSvg(text, width, height) {
  const lines = String(text).split("\n").slice(0, 4);
  const tspans = lines
    .map((line, idx) => {
      const clean = line.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
      return `<tspan x="10" dy="${idx === 0 ? 16 : 15}">${clean}</tspan>`;
    })
    .join("");
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="10" y="4" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#111" font-weight="600">${tspans}</text>
    </svg>
  `);
}

async function downloadAsset(asset, index) {
  const ext = path.extname(asset.storage_path || asset.file_name || ".jpg") || ".jpg";
  const filePath = path.join(OUT_DIR, `${String(index).padStart(2, "0")}-${safeFileName(asset.label)}${ext}`);
  try {
    await fs.access(filePath);
    console.error(`[${index}] cached ${asset.label}`);
    return filePath;
  } catch {}
  console.error(`[${index}] downloading ${asset.label}`);
  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(asset.storage_path, 60);
  if (signedError) throw new Error(`Signed URL failed for ${asset.label}: ${signedError.message}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(signed.signedUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Download failed for ${asset.label}: ${response.status} ${response.statusText}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  console.error(`[${index}] saved ${asset.label}`);
  return filePath;
}

async function makeCell(asset) {
  const thumb = await sharp(asset.local_path)
    .resize(THUMB_W, THUMB_H, { fit: "cover", position: "attention" })
    .jpeg({ quality: 84 })
    .toBuffer();
  const label = labelSvg(labelLines(asset, asset.vision_index), CELL_W, CELL_H - THUMB_H);
  return sharp({
    create: {
      width: CELL_W,
      height: CELL_H,
      channels: 4,
      background: "#f7f6f2",
    },
  })
    .composite([
      { input: thumb, left: 10, top: 10 },
      { input: label, left: 0, top: THUMB_H + 8 },
    ])
    .png()
    .toBuffer();
}

async function makeSheet(groupName, assets, sheetIndex) {
  const rows = Math.ceil(assets.length / COLS);
  const width = COLS * CELL_W;
  const height = rows * CELL_H + 54;
  const title = Buffer.from(`
    <svg width="${width}" height="54" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111"/>
      <text x="18" y="34" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#fff" font-weight="700">
        Pride / Miami vision sheet: ${groupName} ${sheetIndex + 1}
      </text>
    </svg>
  `);
  const composites = [{ input: title, left: 0, top: 0 }];
  for (const [idx, asset] of assets.entries()) {
    const cell = await makeCell(asset);
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    composites.push({ input: cell, left: col * CELL_W, top: 54 + row * CELL_H });
  }
  const outPath = path.join(OUT_DIR, `contact-${safeFileName(groupName)}-${String(sheetIndex + 1).padStart(2, "0")}.jpg`);
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(outPath);
  return outPath;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const { data: brands, error: brandError } = await supabase
    .from("brands")
    .select("id,name,slug")
    .or("name.ilike.%pride%,slug.ilike.%pride%");
  if (brandError) throw brandError;
  const brand = (brands || []).find((row) => /pride/i.test(`${row.name} ${row.slug}`));
  if (!brand) throw new Error("Pride brand not found");

  const { data: rows, error } = await supabase
    .from("brand_assets")
    .select("id,kind,label,file_name,mime_type,storage_path,thumbnail_storage_path,asset_description,truth_status,scene_type,visual_use,safe_claims,do_not_claim,metadata_json")
    .eq("brand_id", brand.id)
    .eq("kind", "reference")
    .order("scene_type")
    .order("label");
  if (error) throw error;

  const assets = [];
  let index = 1;
  for (const asset of rows || []) {
    const localPath = await downloadAsset(asset, index);
    assets.push({ ...asset, local_path: localPath, vision_index: index });
    index += 1;
  }

  const groups = new Map();
  for (const asset of assets) {
    const key = asset.scene_type || asset.metadata_json?.subjectType || "reference";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }

  const sheets = [];
  for (const [groupName, groupAssets] of groups.entries()) {
    for (let i = 0; i < groupAssets.length; i += MAX_PER_SHEET) {
      console.error(`building contact sheet ${groupName} ${Math.floor(i / MAX_PER_SHEET) + 1}`);
      sheets.push(await makeSheet(groupName, groupAssets.slice(i, i + MAX_PER_SHEET), Math.floor(i / MAX_PER_SHEET)));
    }
  }

  const manifest = {
    brand,
    generated_at: new Date().toISOString(),
    count: assets.length,
    sheets,
    assets: assets.map((asset) => ({
      index: asset.vision_index,
      id: asset.id,
      label: asset.label,
      kind: asset.kind,
      scene_type: asset.scene_type,
      visual_use: asset.visual_use,
      metadata_json: asset.metadata_json,
      local_path: asset.local_path,
    })),
  };
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ outDir: OUT_DIR, manifestPath, sheets }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
