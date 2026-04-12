import { env } from "./config.js";
import { downloadStorageBlob } from "./storage.js";

export type OpenRouterGeneratedImage = {
  url: string;
  content_type?: string | null;
  file_name?: string | null;
};

type OpenRouterEditFile = {
  buffer: Buffer;
  contentType: string;
};

type OpenRouterRequestOptions = {
  model: string;
  prompt: string;
  aspectRatio: string;
  count: number;
  referencePaths?: string[];
};

type OpenRouterMaskedEditOptions = {
  prompt: string;
  objectLabel?: string;
  image: OpenRouterEditFile;
  mask: OpenRouterEditFile;
  width?: number;
  height?: number;
};

export type OpenRouterMaskedEditResult = {
  imageUrl: string;
  imageDataUrl?: string;
  model: string;
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

export async function applyOpenRouterMaskedEdit({
  prompt,
  objectLabel,
  image,
  mask,
  width,
  height
}: OpenRouterMaskedEditOptions): Promise<OpenRouterMaskedEditResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for AI image edit");
  }

  const model = env.OPENROUTER_IMAGE_EDIT_MODEL;
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: bufferToDataUrl(image)
              }
            },
            {
              type: "image_url",
              image_url: {
                url: bufferToDataUrl(mask)
              }
            },
            {
              type: "text",
              text: buildMaskedEditInstruction(prompt, width, height, objectLabel)
            }
          ]
        }
      ],
      modalities: env.OPENROUTER_IMAGE_MODALITIES ?? ["image", "text"]
    })
  });

  const text = await response.text();
  const json = text.length > 0 ? safeParseJson(text) : null;

  if (!response.ok) {
    throw new Error(extractOpenRouterErrorMessage(json) ?? `OpenRouter image edit failed (${response.status})`);
  }

  const firstImage = extractFirstOpenRouterImage(json);
  if (!firstImage) {
    throw new Error("OpenRouter returned no edited image");
  }

  return {
    imageUrl: firstImage.url,
    ...(firstImage.url.startsWith("data:") ? { imageDataUrl: firstImage.url } : {}),
    model
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

function buildMaskedEditInstruction(prompt: string, width?: number, height?: number, objectLabel?: string) {
  const dimensionLine =
    typeof width === "number" && typeof height === "number"
      ? `The output image must match the exact dimensions of the base image (${width}x${height}). Do not crop, resize, or reframe.`
      : "Preserve the original framing and aspect ratio of the base image. Do not crop, resize, or reframe.";

  const objectLine =
    typeof objectLabel === "string" && objectLabel.trim().length > 0
      ? `The masked region corresponds to the object labeled "${objectLabel.trim()}". Apply the request only to that masked object.`
      : "Treat the mask as the exact target region. Do not infer or edit a different target from the prompt.";

  return [
    "STRICT MASKED IMAGE EDIT INSTRUCTIONS:",
    "The first image is the base image.",
    "The second image is a black/white mask. White pixels are the only editable region. Black pixels must remain unchanged.",
    `Edit request: ${normalizeMaskedEditPrompt(prompt, objectLabel)}`,
    "Apply the edit only inside the white mask area.",
    "Preserve all unmasked pixels, colors, text, logos, layout, framing, lighting, shadows, and background exactly unless the prompt explicitly asks for a change inside the mask.",
    "Return exactly one final edited image. Do not return a grid, collage, before/after comparison, or multiple panels.",
    dimensionLine,
    objectLine,
    "If the request is about color or material, change only the masked target and do not recolor any other object or background area."
  ].join("\n");
}

function normalizeMaskedEditPrompt(prompt: string, objectLabel?: string) {
  const trimmedPrompt = prompt.trim();
  const normalizedObjectLabel = objectLabel?.trim();

  if (!normalizedObjectLabel) {
    return trimmedPrompt;
  }

  const looksLikeColorEdit = /(re-?colou?r|colou?r|change.+to|make.+(?:red|blue|green|pink|yellow|orange|purple|black|white|gold|silver|brown|teal|cyan))/i.test(
    trimmedPrompt
  );

  if (!looksLikeColorEdit) {
    return trimmedPrompt;
  }

  return `Change only the color or appearance of the masked ${normalizedObjectLabel} based on this request: ${trimmedPrompt}. Preserve the shape, material, perspective, shadows, reflections, and all unmasked regions.`;
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

  if (isRecord(item.inline_data) && typeof item.inline_data.data === "string") {
    const mimeType = typeof item.inline_data.mime_type === "string" ? item.inline_data.mime_type : "image/png";

    return {
      url: `data:${mimeType};base64,${item.inline_data.data}`,
      content_type: mimeType,
      file_name: null
    };
  }

  if (item.type === "image_url" && typeof item.url === "string") {
    return {
      url: item.url,
      content_type: null,
      file_name: null
    };
  }

  if (item.type !== "image_url" && item.type !== "output_image") {
    return null;
  }

  return normalizeOpenRouterImage(item);
}

function extractFirstOpenRouterImage(payload: unknown) {
  const directImages = extractOpenRouterImages(payload);
  if (directImages.length > 0) {
    return directImages[0] ?? null;
  }

  if (!payload) {
    return null;
  }

  const inlineMatch = JSON.stringify(payload).match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/);

  if (!inlineMatch) {
    return null;
  }

  return {
    url: inlineMatch[0],
    content_type: null,
    file_name: null
  } satisfies OpenRouterGeneratedImage;
}

function bufferToDataUrl(file: OpenRouterEditFile) {
  const contentType = file.contentType || "image/png";
  return `data:${contentType};base64,${file.buffer.toString("base64")}`;
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
