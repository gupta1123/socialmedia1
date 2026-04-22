import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const API_ENV_PATH = path.join(ROOT, "apps/api/.env");

function parseEnvFile(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    env[key] = rest.join("=");
  }
  return env;
}

function inferContentType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function uniqueByPath(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry.path) continue;
    if (!map.has(entry.path)) map.set(entry.path, entry);
  }
  return [...map.values()];
}

async function ensureRemoteBucket(remote, bucket) {
  const { data, error } = await remote.storage.listBuckets();
  if (error) throw error;
  if (data?.some((item) => item.name === bucket || item.id === bucket)) return;
  const { error: createError } = await remote.storage.createBucket(bucket, { public: false });
  if (createError && !String(createError.message || "").includes("already exists")) {
    throw createError;
  }
}

async function collectReferencedPaths(local) {
  const entries = [];

  const { data: brandAssets, error: brandError } = await local
    .from("brand_assets")
    .select("storage_path, mime_type, label")
    .not("storage_path", "is", null);
  if (brandError) throw brandError;
  for (const asset of brandAssets ?? []) {
    if (!asset.storage_path) continue;
    entries.push({
      path: asset.storage_path,
      contentType: asset.mime_type || inferContentType(asset.storage_path),
      label: asset.label || asset.storage_path,
      source: "brand_asset"
    });
  }

  const { data: templates, error: templateError } = await local
    .from("creative_templates")
    .select("preview_storage_path, name")
    .not("preview_storage_path", "is", null);
  if (templateError) throw templateError;
  for (const template of templates ?? []) {
    if (!template.preview_storage_path) continue;
    entries.push({
      path: template.preview_storage_path,
      contentType: inferContentType(template.preview_storage_path),
      label: template.name || template.preview_storage_path,
      source: "creative_template_preview"
    });
  }

  return uniqueByPath(entries);
}

async function remoteObjectExists(remote, bucket, filePath) {
  const folder = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  const fileName = filePath.includes("/") ? filePath.slice(filePath.lastIndexOf("/") + 1) : filePath;
  const { data, error } = await remote.storage.from(bucket).list(folder, {
    limit: 1000,
    search: fileName
  });
  if (error) throw error;
  return Boolean(data?.some((item) => item.name === fileName));
}

async function main() {
  const localEnv = parseEnvFile(await fs.readFile(API_ENV_PATH, "utf8"));
  const localUrl = localEnv.SUPABASE_URL;
  const localServiceRoleKey = localEnv.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = localEnv.SUPABASE_STORAGE_BUCKET || "creative-assets";

  if (!localUrl || !localServiceRoleKey) {
    throw new Error("Local Supabase URL/service role key missing in apps/api/.env");
  }

  const rl = readline.createInterface({ input, output });
  try {
    const remoteUrl =
      process.env.REMOTE_SUPABASE_URL ||
      (await rl.question("Remote SUPABASE_URL: ")).trim();
    const remoteServiceRoleKey =
      process.env.REMOTE_SUPABASE_SERVICE_ROLE_KEY ||
      (await rl.question("Remote SUPABASE_SERVICE_ROLE_KEY: ")).trim();

    if (!remoteUrl || !remoteServiceRoleKey) {
      throw new Error("Remote Supabase URL/service role key are required");
    }

    const local = createClient(localUrl, localServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const remote = createClient(remoteUrl, remoteServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    await ensureRemoteBucket(remote, bucket);
    const entries = await collectReferencedPaths(local);

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    console.log(`Syncing ${entries.length} referenced assets to bucket "${bucket}"...`);

    for (const entry of entries) {
      try {
        const exists = await remoteObjectExists(remote, bucket, entry.path);
        if (exists) {
          skipped += 1;
          console.log(`skip  ${entry.path}`);
          continue;
        }

        const { data: fileBlob, error: downloadError } = await local.storage.from(bucket).download(entry.path);
        if (downloadError) throw downloadError;
        if (!fileBlob) throw new Error(`No blob returned for ${entry.path}`);

        const arrayBuffer = await fileBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = fileBlob.type || entry.contentType || inferContentType(entry.path);

        const { error: uploadError } = await remote.storage.from(bucket).upload(entry.path, buffer, {
          contentType,
          upsert: true
        });
        if (uploadError) throw uploadError;

        uploaded += 1;
        console.log(`upload ${entry.path}`);
      } catch (error) {
        failed += 1;
        console.error(`fail  ${entry.path}`);
        console.error(error instanceof Error ? error.message : String(error));
      }
    }

    console.log("");
    console.log(`done uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
