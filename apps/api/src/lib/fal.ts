import { fal } from "@fal-ai/client";
import type { CreativeJobRecord, PromptPackage } from "@image-lab/contracts";
import { env } from "./config.js";
import { downloadStorageBlob } from "./storage.js";

type ImageEditFile = {
  buffer: Buffer;
  contentType: string;
  fileName?: string;
};

type FalMaskedFillResult = {
  imageUrl: string;
  imageDataUrl?: string;
  model: string;
  width?: number;
  height?: number;
};

type FalDirectEditOptions = {
  prompt: string;
  image: ImageEditFile;
  width?: number;
  height?: number;
  model?: string;
};

type UntypedFalSubscribeClient = {
  subscribe(endpointId: string, options: { input: Record<string, unknown>; logs?: boolean }): Promise<{ data: unknown }>;
};

fal.config({
  credentials: env.FAL_KEY
});

type FalImageSizePreset =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9"
  | "auto";

type FalImageSize = FalImageSizePreset | { width: number; height: number };

function isGptImage2Model(model: string) {
  return model.includes("gpt-image-2");
}

function resolveGptImage2Size(aspectRatio: string): FalImageSize {
  switch (aspectRatio) {
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return { width: 1024, height: 1824 };
    case "4:5":
      return { width: 1088, height: 1360 };
    case "3:2":
      return { width: 1536, height: 1024 };
    case "1:1":
    default:
      return "square_hd";
  }
}

function buildFalGenerationInput(input: {
  model: string;
  prompt: string;
  aspectRatio: string;
  numImages: number;
  referenceUrls?: string[];
}) {
  const referenceUrls = input.referenceUrls ?? [];

  if (isGptImage2Model(input.model)) {
    return {
      prompt: input.prompt,
      num_images: input.numImages,
      image_size: resolveGptImage2Size(input.aspectRatio),
      quality: "high" as const,
      output_format: "png" as const,
      ...(referenceUrls.length > 0 ? { image_urls: referenceUrls } : {})
    };
  }

  return {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    num_images: input.numImages,
    ...(referenceUrls.length > 0 ? { image_urls: referenceUrls } : {})
  };
}

export async function submitStyleSeedGeneration(
  job: CreativeJobRecord,
  promptPackage: Pick<PromptPackage, "finalPrompt" | "aspectRatio"> | { prompt: string; aspectRatio: string },
  referenceUrls: string[] = []
) {
  console.log(`[submitStyleSeedGeneration] jobId=${job.id}, refCount=${referenceUrls.length}, refs=${JSON.stringify(referenceUrls)}`);
  if (!env.FAL_KEY) {
    return { request_id: `mock-style-seed-${job.id}` };
  }

  const model = referenceUrls.length > 0 ? env.FAL_FINAL_MODEL : env.FAL_STYLE_SEED_MODEL;
  const options: { input: Record<string, unknown>; webhookUrl?: string } = {
    input: buildFalGenerationInput({
      model,
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.finalPrompt,
      aspectRatio: promptPackage.aspectRatio,
      numImages: job.requestedCount,
      referenceUrls
    })
  };

  if (env.FAL_WEBHOOK_URL) {
    options.webhookUrl = `${env.FAL_WEBHOOK_URL}?jobId=${job.id}`;
  }

  return fal.queue.submit(model, options);
}

export async function submitFinalGeneration(
  job: CreativeJobRecord,
  promptPackage: Pick<PromptPackage, "finalPrompt" | "aspectRatio"> | { prompt: string; aspectRatio: string },
  referenceUrls: string[]
) {
  console.log(`[submitFinalGeneration] jobId=${job.id}, refCount=${referenceUrls.length}, refs=${JSON.stringify(referenceUrls)}`);
  if (!env.FAL_KEY) {
    return { request_id: `mock-final-${job.id}` };
  }

  const model = referenceUrls.length > 0 ? env.FAL_FINAL_MODEL : env.FAL_STYLE_SEED_MODEL;
  const options: { input: Record<string, unknown>; webhookUrl?: string } = {
    input: buildFalGenerationInput({
      model,
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.finalPrompt,
      aspectRatio: promptPackage.aspectRatio,
      numImages: job.requestedCount,
      referenceUrls
    })
  };

  if (env.FAL_WEBHOOK_URL) {
    options.webhookUrl = `${env.FAL_WEBHOOK_URL}?jobId=${job.id}`;
  }

  return fal.queue.submit(model, options);
}

export async function getFalStatus(endpoint: string, requestId: string) {
  if (!env.FAL_KEY) {
    return { status: "COMPLETED" };
  }

  return fal.queue.status(endpoint, { requestId });
}

export async function getFalResult(endpoint: string, requestId: string) {
  if (!env.FAL_KEY) {
    return {
      requestId,
      data: {
        images: [
          {
            url: "https://placehold.co/1024x1024/png?text=Mock+Creative"
          }
        ]
      }
    };
  }

  return fal.queue.result(endpoint, { requestId });
}

export async function uploadStoragePathToFal(path: string) {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY is required to upload references to Fal storage");
  }

  const blob = await downloadStorageBlob(path);
  return fal.storage.upload(blob, {
    lifecycle: {
      expiresIn: "1d"
    }
  });
}

export async function applyFalDirectEdit({
  prompt,
  image,
  width,
  height,
  model = env.AI_EDIT_DIRECT_MODEL
}: FalDirectEditOptions): Promise<FalMaskedFillResult> {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY is required for direct AI edit");
  }

  const subscribeClient = fal as unknown as UntypedFalSubscribeClient;
  const result = await subscribeClient.subscribe(model, {
    input: {
      prompt,
      image_urls: [new Blob([toBlobBytes(image.buffer)], { type: image.contentType || "image/png" })],
      num_images: 1,
      sync_mode: true
    },
    logs: false
  });

  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  if (!data) {
    throw new Error("Direct AI edit returned an invalid payload");
  }

  const firstImage = Array.isArray(data.images) ? data.images.find(isRecord) : null;
  if (!firstImage) {
    throw new Error("Direct AI edit returned no image");
  }

  const imageUrl = resolveImageUrl(firstImage);
  if (!imageUrl) {
    throw new Error("Direct AI edit returned no image URL");
  }

  const imageDataUrl =
    imageUrl.startsWith("data:") ? imageUrl : await fetchImageAsDataUrl(imageUrl, firstImage.content_type);

  return {
    imageUrl,
    ...(imageDataUrl ? { imageDataUrl } : {}),
    model,
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {})
  };
}

function resolveImageUrl(value: Record<string, unknown>) {
  if (typeof value.url === "string" && value.url.length > 0) {
    return value.url;
  }

  return toImageDataUrl(value) ?? null;
}

function toImageDataUrl(value: Record<string, unknown>) {
  if (typeof value.file_data !== "string" || value.file_data.length === 0) {
    return undefined;
  }

  if (value.file_data.startsWith("data:")) {
    return value.file_data;
  }

  const contentType =
    typeof value.content_type === "string" && value.content_type.length > 0
      ? value.content_type
      : "image/png";

  return `data:${contentType};base64,${value.file_data}`;
}

async function fetchImageAsDataUrl(url: string, fallbackContentType: unknown) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch generated image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType =
    typeof fallbackContentType === "string" && fallbackContentType.length > 0
      ? fallbackContentType
      : response.headers.get("content-type") || "image/png";

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toBlobBytes(buffer: Buffer) {
  return Uint8Array.from(buffer);
}
