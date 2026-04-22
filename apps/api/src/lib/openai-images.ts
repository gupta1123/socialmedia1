import { env } from "./config.js";
import { downloadStorageBlob } from "./storage.js";

export type OpenAiGeneratedImage = {
  url: string;
  content_type?: string | null;
  file_name?: string | null;
};

type OpenAiRequestOptions = {
  model: string;
  prompt: string;
  aspectRatio: string;
  count: number;
  referencePaths?: string[];
};

type OpenAiEditFile = {
  buffer: Buffer;
  contentType: string;
  fileName?: string;
};

type OpenAiMaskedEditOptions = {
  prompt: string;
  image: OpenAiEditFile;
  mask: OpenAiEditFile;
  width?: number;
  height?: number;
  model?: string;
};

type OpenAiMaskedEditResult = {
  imageUrl: string;
  imageDataUrl?: string;
  model: string;
  width?: number;
  height?: number;
};

export async function generateOpenAiImages({
  model,
  prompt,
  aspectRatio,
  count,
  referencePaths = []
}: OpenAiRequestOptions) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when IMAGE_GENERATION_PROVIDER=openai");
  }

  const response =
    referencePaths.length > 0
      ? await submitOpenAiEditRequest({
          model,
          prompt,
          aspectRatio,
          count,
          referencePaths
        })
      : await fetch(`${resolveOpenAiBaseUrl()}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            prompt,
            n: count,
            size: resolveOpenAiImageSize(aspectRatio),
            quality: env.OPENAI_IMAGE_QUALITY,
            output_format: env.OPENAI_IMAGE_OUTPUT_FORMAT,
            background: env.OPENAI_IMAGE_BACKGROUND
          })
        });

  const raw = await response.text();
  const payload = raw.length > 0 ? safeParseJson(raw) : null;

  if (!response.ok) {
    throw new Error(extractOpenAiErrorMessage(payload) ?? `OpenAI image generation failed (${response.status})`);
  }

  const images = extractOpenAiGeneratedImages(payload);
  if (images.length === 0) {
    throw new Error("OpenAI image generation returned no images");
  }

  return {
    request_id: response.headers.get("x-request-id") ?? `openai-image-${Date.now()}`,
    images
  };
}

export async function applyOpenAiMaskedEdit({
  prompt,
  image,
  mask,
  width,
  height,
  model = env.AI_EDIT_EXPERIMENTAL_MODEL
}: OpenAiMaskedEditOptions): Promise<OpenAiMaskedEditResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for GPT image edit fallback");
  }

  const body = new FormData();
  body.append("model", model);
  body.append("prompt", prompt);
  body.append("image", toBlob(image), image.fileName ?? "source.png");
  body.append("mask", toBlob(mask), mask.fileName ?? "mask.png");

  const response = await fetch(`${resolveOpenAiBaseUrl()}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body
  });

  const raw = await response.text();
  const payload = raw.length > 0 ? safeParseJson(raw) : null;

  if (!response.ok) {
    throw new Error(extractOpenAiErrorMessage(payload) ?? `OpenAI image edit failed (${response.status})`);
  }

  const firstImage = extractFirstEditedImage(payload);
  if (!firstImage) {
    throw new Error("OpenAI image edit returned no edited image");
  }

  const imageDataUrl = firstImage.b64_json
    ? `data:${firstImage.mimeType};base64,${firstImage.b64_json}`
    : undefined;
  const imageUrl = imageDataUrl ?? firstImage.url;

  return {
    imageUrl,
    ...(imageDataUrl ? { imageDataUrl } : {}),
    model,
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {})
  };
}

async function submitOpenAiEditRequest({
  model,
  prompt,
  aspectRatio,
  count,
  referencePaths
}: {
  model: string;
  prompt: string;
  aspectRatio: string;
  count: number;
  referencePaths: string[];
}) {
  const body = new FormData();
  body.append("model", model);
  body.append("prompt", prompt);
  body.append("n", String(count));
  body.append("size", resolveOpenAiImageSize(aspectRatio));
  body.append("quality", env.OPENAI_IMAGE_QUALITY);
  body.append("output_format", env.OPENAI_IMAGE_OUTPUT_FORMAT);
  body.append("background", env.OPENAI_IMAGE_BACKGROUND);
  if (supportsOpenAiInputFidelity(model)) {
    body.append("input_fidelity", env.OPENAI_IMAGE_INPUT_FIDELITY);
  }

  for (const referencePath of referencePaths) {
    const blob = await downloadStorageBlob(referencePath);
    body.append("image", blob, fileNameFromStoragePath(referencePath, blob.type));
  }

  return fetch(`${resolveOpenAiBaseUrl()}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body
  });
}

function supportsOpenAiInputFidelity(model: string) {
  return !model.startsWith("gpt-image-2");
}

function resolveOpenAiImageSize(aspectRatio: string) {
  switch (aspectRatio) {
    case "16:9":
    case "3:2":
      return "1536x1024";
    case "4:5":
    case "9:16":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}

function fileNameFromStoragePath(storagePath: string, contentType: string) {
  const candidate = storagePath.split("/").filter(Boolean).at(-1);
  if (candidate) {
    return candidate;
  }

  if (contentType === "image/webp") {
    return "reference.webp";
  }

  if (contentType === "image/jpeg") {
    return "reference.jpg";
  }

  return "reference.png";
}

function resolveOpenAiBaseUrl() {
  const configured = env.OPENAI_BASE_URL?.trim();
  if (!configured) {
    return "https://api.openai.com/v1";
  }

  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

function toBlob(file: OpenAiEditFile) {
  return new Blob([Uint8Array.from(file.buffer)], { type: file.contentType || "image/png" });
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractOpenAiErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const error = isRecord(payload.error) ? payload.error : null;
  if (!error || typeof error.message !== "string" || error.message.length === 0) {
    return null;
  }

  return error.message;
}

function extractOpenAiGeneratedImages(payload: unknown): OpenAiGeneratedImage[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return [];
  }

  const outputFormat =
    typeof payload.output_format === "string" && payload.output_format.length > 0
      ? payload.output_format
      : env.OPENAI_IMAGE_OUTPUT_FORMAT;
  const mimeType = outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
  const images: OpenAiGeneratedImage[] = [];

  for (const item of payload.data) {
    if (!isRecord(item)) {
      continue;
    }

    const b64Json = typeof item.b64_json === "string" && item.b64_json.length > 0 ? item.b64_json : null;
    const url = typeof item.url === "string" && item.url.length > 0 ? item.url : null;

    if (b64Json) {
      images.push({
        url: `data:${mimeType};base64,${b64Json}`,
        content_type: mimeType,
        file_name: null
      });
      continue;
    }

    if (url) {
      images.push({
        url,
        content_type: mimeType,
        file_name: null
      });
    }
  }

  return images;
}

function extractFirstEditedImage(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  for (const item of payload.data) {
    if (!isRecord(item)) {
      continue;
    }

    const b64Json = typeof item.b64_json === "string" && item.b64_json.length > 0 ? item.b64_json : null;
    const url = typeof item.url === "string" && item.url.length > 0 ? item.url : null;

    if (!b64Json && !url) {
      continue;
    }

    return {
      b64_json: b64Json,
      url: url ?? "data:image/png;base64,",
      mimeType: typeof item.mime_type === "string" && item.mime_type.length > 0 ? item.mime_type : "image/png"
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
