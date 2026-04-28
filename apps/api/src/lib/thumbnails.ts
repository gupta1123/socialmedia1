import sharp from "sharp";
import { downloadStorageBlob, uploadBufferToStorage } from "./storage.js";
import { buildThumbnailStoragePath } from "./utils.js";

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_QUALITY = 78;
const THUMBNAIL_ALPHA_QUALITY = 82;
const THUMBNAIL_CONTENT_TYPE = "image/webp";

export type ThumbnailMetadata = {
  thumbnailStoragePath: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailBytes: number;
};

type ThumbnailFailureContext = {
  source: string;
  storagePath: string;
  mimeType?: string | null;
};

export function isSupportedThumbnailMimeType(mimeType?: string | null) {
  if (!mimeType) {
    return true;
  }

  return mimeType.toLowerCase().startsWith("image/");
}

export function logThumbnailFailure(context: ThumbnailFailureContext, error: unknown) {
  console.warn("[thumbnail] failed", {
    source: context.source,
    storagePath: context.storagePath,
    mimeType: context.mimeType ?? null,
    error: error instanceof Error ? error.message : error
  });
}

export async function createThumbnailFromBufferOrNull(
  storagePath: string,
  buffer: Buffer,
  context: Omit<ThumbnailFailureContext, "storagePath">
): Promise<ThumbnailMetadata | null> {
  if (!isSupportedThumbnailMimeType(context.mimeType)) {
    return null;
  }

  try {
    return await createThumbnailFromBuffer(storagePath, buffer);
  } catch (error) {
    logThumbnailFailure({ ...context, storagePath }, error);
    return null;
  }
}

export async function createThumbnailFromStorageOrNull(
  storagePath: string,
  context: Omit<ThumbnailFailureContext, "storagePath">
): Promise<ThumbnailMetadata | null> {
  if (!isSupportedThumbnailMimeType(context.mimeType)) {
    return null;
  }

  try {
    return await createThumbnailFromStorage(storagePath);
  } catch (error) {
    logThumbnailFailure({ ...context, storagePath }, error);
    return null;
  }
}

export async function createThumbnailFromBuffer(storagePath: string, buffer: Buffer): Promise<ThumbnailMetadata> {
  const thumbnailStoragePath = buildThumbnailStoragePath(storagePath);
  const transformed = sharp(buffer, { animated: false })
    .rotate()
    .resize({
      width: THUMBNAIL_WIDTH,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({
      quality: THUMBNAIL_QUALITY,
      alphaQuality: THUMBNAIL_ALPHA_QUALITY,
      effort: 4
    });

  const { data, info } = await transformed.toBuffer({ resolveWithObject: true });
  await uploadBufferToStorage(thumbnailStoragePath, data, THUMBNAIL_CONTENT_TYPE, true);

  return {
    thumbnailStoragePath,
    thumbnailWidth: info.width,
    thumbnailHeight: info.height,
    thumbnailBytes: data.byteLength
  };
}

export async function createThumbnailFromStorage(storagePath: string): Promise<ThumbnailMetadata> {
  const blob = await downloadStorageBlob(storagePath);
  const buffer = Buffer.from(await blob.arrayBuffer());
  return createThumbnailFromBuffer(storagePath, buffer);
}
