import { env } from "./config.js";

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
  body.append("image[]", toBlob(image), image.fileName ?? "source.png");
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
