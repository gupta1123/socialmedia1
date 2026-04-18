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
