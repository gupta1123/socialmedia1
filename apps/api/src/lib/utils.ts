import crypto from "node:crypto";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export function randomId() {
  return crypto.randomUUID();
}

export function deriveAspectRatio(format: string) {
  switch (format) {
    case "story":
      return "9:16";
    case "landscape":
      return "16:9";
    case "portrait":
      return "4:5";
    case "cover":
      return "3:2";
    case "square":
    default:
      return "1:1";
  }
}

export function sanitizeFileName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

export function buildStoragePath(input: {
  workspaceId: string;
  brandId: string;
  section: "references" | "logos" | "compliance" | "product" | "inspiration" | "templates" | "outputs";
  id: string;
  fileName: string;
}) {
  return `${input.workspaceId}/${input.brandId}/${input.section}/${input.id}/${sanitizeFileName(input.fileName)}`;
}

export function buildThumbnailStoragePath(storagePath: string) {
  const segments = storagePath.split("/").filter(Boolean);
  const fileName = segments.pop();

  if (!fileName) {
    throw new Error("Cannot build thumbnail path for empty storage path");
  }

  const baseName = fileName.replace(/\.[^.]+$/, "");
  return [...segments, "thumb", `${sanitizeFileName(baseName)}.webp`].join("/");
}

export function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
