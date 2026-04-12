import { env } from "./config.js";
import { supabaseAdmin } from "./supabase.js";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function uploadBufferToStorage(
  path: string,
  buffer: Buffer,
  contentType: string,
  upsert = false
) {
  const { error } = await supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(path, buffer, {
    upsert,
    contentType
  });

  if (error) {
    throw error;
  }
}

export async function removeStorageObjects(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).remove(uniquePaths);

  if (error) {
    throw error;
  }
}

export async function downloadStorageBlob(path: string) {
  const { data, error } = await supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).download(path);

  if (error) {
    throw error;
  }

  return data;
}

export async function createSignedUrl(path: string, expiresIn = 3600) {
  const cacheKey = `${path}:${expiresIn}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw error;
  }

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: now + Math.max(30, Math.min(expiresIn - 30, 300)) * 1000
  });

  return data.signedUrl;
}

export async function ingestRemoteImageToStorage(path: string, sourceUrl: string) {
  if (sourceUrl.startsWith("data:")) {
    const { buffer, contentType } = parseDataUrl(sourceUrl);
    await uploadBufferToStorage(path, buffer, contentType, true);
    return;
  }

  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch provider image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/png";

  await uploadBufferToStorage(path, buffer, contentType, true);
}

function parseDataUrl(sourceUrl: string) {
  const match = sourceUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid data URL image payload");
  }

  const contentType = match[1] ?? "image/png";
  const encoded = match[2];

  if (!encoded) {
    throw new Error("Invalid data URL image payload");
  }

  return {
    contentType,
    buffer: Buffer.from(encoded, "base64")
  };
}
