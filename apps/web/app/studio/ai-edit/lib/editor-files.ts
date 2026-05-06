import { useState, useEffect } from "react";
import type { EditableImage } from "./editor-types";
export { renderCompositionToFile } from "./editor-renderer";

export async function createEditableImage(file: File): Promise<EditableImage> {
  const dimensions = await loadImageDimensions(file);
  return { file, width: dimensions.width, height: dimensions.height };
}

export async function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Unable to read image dimensions."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadImageSourceDimensions(source: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(source);
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

export async function sourceToFile(source: string, fileName: string, fallbackType: string): Promise<File> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load the edited image (${response.status}).`);
  }

  const blob = await response.blob();
  const contentType = blob.type || fallbackType;
  return new File([blob], ensureExtension(fileName, contentType), { type: contentType });
}

export function cloneFileWithName(file: File, fileName: string): File {
  const contentType = file.type || "image/png";
  return new File([file], ensureExtension(fileName, contentType), {
    type: contentType,
    lastModified: file.lastModified,
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read image layer."));
    };
    reader.onerror = () => reject(new Error("Unable to read image layer."));
    reader.readAsDataURL(file);
  });
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function buildEditedFileName(fileName: string): string {
  return `${stripFileExtension(fileName)}-edit.png`;
}

export function buildComposedFileName(fileName: string): string {
  return `${stripFileExtension(fileName)}-composition.png`;
}

export function buildNormalizedSourceFileName(fileName: string): string {
  return `${stripFileExtension(fileName)}-source.png`;
}

export function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "image";
}

export function ensureExtension(fileName: string, contentType: string): string {
  const baseName = stripFileExtension(fileName);
  if (contentType === "image/svg+xml") return `${baseName}.svg`;
  if (contentType === "image/webp") return `${baseName}.webp`;
  if (contentType === "image/jpeg") return `${baseName}.jpg`;
  return `${baseName}.png`;
}

export function useObjectUrl(file: File | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  return objectUrl;
}

export async function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}
