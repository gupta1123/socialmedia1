import { env } from "./config.js";
import { downloadStorageBlob } from "./storage.js";

export type OpenRouterGeneratedImage = {
  url: string;
  content_type?: string | null;
  file_name?: string | null;
};

type OpenRouterRequestOptions = {
  model: string;
  prompt: string;
  aspectRatio: string;
  count: number;
  referencePaths?: string[];
};

export async function generateOpenRouterImages({
  model,
  prompt,
  aspectRatio,
  count,
  referencePaths = []
}: OpenRouterRequestOptions) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required when IMAGE_GENERATION_PROVIDER=openrouter");
  }

  const imageInputs = await Promise.all(referencePaths.map(storagePathToDataUrl));
  const images: OpenRouterGeneratedImage[] = [];
  const requestIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildOpenRouterHeaders(),
      body: JSON.stringify(buildRequestBody(model, prompt, aspectRatio, imageInputs))
    });

    const text = await response.text();
    const json = text.length > 0 ? safeParseJson(text) : null;

    if (!response.ok) {
      throw new Error(extractOpenRouterErrorMessage(json) ?? `OpenRouter image generation failed (${response.status})`);
    }

    const batchImages = extractOpenRouterImages(json);

    if (batchImages.length === 0) {
      throw new Error("OpenRouter returned no images");
    }

    const firstImage = batchImages[0];

    if (!firstImage) {
      throw new Error("OpenRouter returned no usable image");
    }

    images.push(firstImage);

    const requestId = extractOpenRouterRequestId(json) ?? `openrouter-${Date.now()}-${index + 1}`;
    requestIds.push(requestId);
  }

  return {
    request_id: requestIds.join(","),
    images
  };
}

function buildOpenRouterHeaders() {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json"
  };

  if (env.OPENROUTER_HTTP_REFERER) {
    headers["HTTP-Referer"] = env.OPENROUTER_HTTP_REFERER;
  }

  if (env.OPENROUTER_X_TITLE) {
    headers["X-Title"] = env.OPENROUTER_X_TITLE;
  }

  return headers;
}

function buildRequestBody(model: string, prompt: string, aspectRatio: string, imageInputs: string[]) {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${prompt} Render exactly one image only. Target aspect ratio: ${aspectRatio}.`
    },
    ...imageInputs.map((url) => ({
      type: "image_url",
      image_url: {
        url
      }
    }))
  ];

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content
      }
    ],
    modalities: env.OPENROUTER_IMAGE_MODALITIES ?? ["image", "text"]
  };

  if (env.OPENROUTER_IMAGE_SIZE) {
    body.image = {
      size: env.OPENROUTER_IMAGE_SIZE
    };
  }

  return body;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractOpenRouterRequestId(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.id === "string" && payload.id.length > 0) {
    return payload.id;
  }

  return null;
}

function extractOpenRouterErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return null;
}

export function extractOpenRouterImages(payload: unknown): OpenRouterGeneratedImage[] {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return [];
  }

  const images: OpenRouterGeneratedImage[] = [];

  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const message = choice.message;

    if (Array.isArray(message.images)) {
      for (const image of message.images) {
        const normalized = normalizeOpenRouterImage(image);
        if (normalized) {
          images.push(normalized);
        }
      }
    }

    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        const normalized = normalizeOpenRouterContentImage(item);
        if (normalized) {
          images.push(normalized);
        }
      }
    }
  }

  return images;
}

function normalizeOpenRouterImage(image: unknown): OpenRouterGeneratedImage | null {
  if (!isRecord(image)) {
    return null;
  }

  const directUrl =
    typeof image.url === "string"
      ? image.url
      : isRecord(image.image_url) && typeof image.image_url.url === "string"
        ? image.image_url.url
        : isRecord(image.imageUrl) && typeof image.imageUrl.url === "string"
          ? image.imageUrl.url
          : null;

  if (!directUrl) {
    return null;
  }

  return {
    url: directUrl,
    content_type: typeof image.content_type === "string" ? image.content_type : null,
    file_name: typeof image.file_name === "string" ? image.file_name : null
  };
}

function normalizeOpenRouterContentImage(item: unknown): OpenRouterGeneratedImage | null {
  if (!isRecord(item)) {
    return null;
  }

  if (item.type !== "image_url" && item.type !== "output_image") {
    return null;
  }

  return normalizeOpenRouterImage(item);
}

async function storagePathToDataUrl(storagePath: string) {
  const blob = await downloadStorageBlob(storagePath);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type || "image/png";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
