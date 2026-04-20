import { fal } from "@fal-ai/client";
import type { CreativeJobRecord, PromptPackage } from "@image-lab/contracts";
import { env } from "./config.js";
import { downloadStorageBlob } from "./storage.js";

const FAL_AUTO_SEGMENT_MODEL = "fal-ai/moondream3-preview/segment";

type ImageEditFile = {
  buffer: Buffer;
  contentType: string;
  fileName?: string;
};

type SegmentReferencePoint = {
  x: number;
  y: number;
};

type AutoSegmentInput = {
  objectName: string;
  image: ImageEditFile;
  targetPoint?: SegmentReferencePoint | null;
};

type AutoSegmentBBox = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

type AutoSegmentResult = {
  maskUrl: string;
  maskDataUrl?: string;
  model: string;
  path?: string;
  bbox?: AutoSegmentBBox;
};

type FalMaskedFillOptions = {
  prompt: string;
  image: ImageEditFile;
  mask: ImageEditFile;
  width?: number;
  height?: number;
  model?: string;
};

type FalMaskedFillResult = {
  imageUrl: string;
  imageDataUrl?: string;
  model: string;
  width?: number;
  height?: number;
};

type BriaMaskedEditOptions = {
  instruction: string;
  image: ImageEditFile;
  mask: ImageEditFile;
  width?: number;
  height?: number;
  model?: string;
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

export async function submitStyleSeedGeneration(
  job: CreativeJobRecord,
  promptPackage: Pick<PromptPackage, "finalPrompt" | "aspectRatio"> | { prompt: string; aspectRatio: string },
  referenceUrls: string[] = []
) {
  console.log(`[submitStyleSeedGeneration] jobId=${job.id}, refCount=${referenceUrls.length}, refs=${JSON.stringify(referenceUrls)}`);
  if (!env.FAL_KEY) {
    return { request_id: `mock-style-seed-${job.id}` };
  }

  const options: {
    input: {
      prompt: string;
      aspect_ratio: string;
      num_images: number;
      image_urls?: string[];
    };
    webhookUrl?: string;
  } = {
    input: {
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.finalPrompt,
      aspect_ratio: promptPackage.aspectRatio,
      num_images: job.requestedCount
    }
  };

  if (referenceUrls.length > 0) {
    options.input.image_urls = referenceUrls;
  }

  if (env.FAL_WEBHOOK_URL) {
    options.webhookUrl = `${env.FAL_WEBHOOK_URL}?jobId=${job.id}`;
  }

  return fal.queue.submit(referenceUrls.length > 0 ? env.FAL_FINAL_MODEL : env.FAL_STYLE_SEED_MODEL, options);
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

  const options: {
    input: {
      prompt: string;
      image_urls: string[];
      num_images: number;
      aspect_ratio: string;
    };
    webhookUrl?: string;
  } = {
    input: {
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.finalPrompt,
      image_urls: referenceUrls,
      num_images: job.requestedCount,
      aspect_ratio: promptPackage.aspectRatio
    }
  };

  if (env.FAL_WEBHOOK_URL) {
    options.webhookUrl = `${env.FAL_WEBHOOK_URL}?jobId=${job.id}`;
  }

  const model = referenceUrls.length > 0 ? env.FAL_FINAL_MODEL : env.FAL_STYLE_SEED_MODEL;
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

export async function submitFalAutoSegment(input: AutoSegmentInput): Promise<AutoSegmentResult> {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY is required for auto segmentation");
  }

  const subscribeClient = fal as unknown as UntypedFalSubscribeClient;
  const result = await subscribeClient.subscribe(FAL_AUTO_SEGMENT_MODEL, {
    input: {
      image_url: new Blob([toBlobBytes(input.image.buffer)], { type: input.image.contentType || "image/png" }),
      object: input.objectName,
      preview: true,
      ...(input.targetPoint ? { spatial_references: [input.targetPoint] } : {})
    },
    logs: false
  });

  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  if (!data) {
    throw new Error("FAL segmentation returned an invalid payload");
  }

  const maskImage = isRecord(data.image) ? data.image : null;
  if (!maskImage) {
    throw new Error(`No segmentation mask was returned for "${input.objectName}"`);
  }

  const maskUrl = resolveImageUrl(maskImage);
  if (!maskUrl) {
    throw new Error("FAL segmentation returned no mask image URL");
  }

  const maskDataUrl = toImageDataUrl(maskImage);
  const bbox = isRecord(data.bbox) ? normalizeSegmentBBox(data.bbox) : undefined;
  const segmentResult: AutoSegmentResult = {
    maskUrl,
    model: FAL_AUTO_SEGMENT_MODEL
  };

  if (maskDataUrl) {
    segmentResult.maskDataUrl = maskDataUrl;
  }

  if (typeof data.path === "string") {
    segmentResult.path = data.path;
  }

  if (bbox) {
    segmentResult.bbox = bbox;
  }

  return segmentResult;
}

export async function applyFalMaskedFill({
  prompt,
  image,
  mask,
  width,
  height,
  model = env.AI_EDIT_PRIMARY_MODEL
}: FalMaskedFillOptions): Promise<FalMaskedFillResult> {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY is required for masked AI edit");
  }

  const subscribeClient = fal as unknown as UntypedFalSubscribeClient;
  const inputPayload: Record<string, unknown> = {
    prompt,
    image_url: new Blob([toBlobBytes(image.buffer)], { type: image.contentType || "image/png" }),
    mask_url: new Blob([toBlobBytes(mask.buffer)], { type: mask.contentType || "image/png" }),
    num_images: 1,
    sync_mode: true
  };

  const result = await subscribeClient.subscribe(model, {
    input: inputPayload,
    logs: false
  });

  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  if (!data) {
    throw new Error("FAL masked edit returned an invalid payload");
  }

  const firstImage = Array.isArray(data.images) ? data.images.find(isRecord) : null;
  if (!firstImage) {
    throw new Error("FAL masked edit returned no image");
  }

  const imageUrl = resolveImageUrl(firstImage);
  if (!imageUrl) {
    throw new Error("FAL masked edit returned no image URL");
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

export async function applyBriaMaskedEdit({
  instruction,
  image,
  mask,
  width,
  height,
  model = env.AI_EDIT_PRIMARY_MODEL
}: BriaMaskedEditOptions): Promise<FalMaskedFillResult> {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY is required for masked AI edit");
  }

  const subscribeClient = fal as unknown as UntypedFalSubscribeClient;
  const result = await subscribeClient.subscribe(model, {
    input: {
      instruction,
      image_url: new Blob([toBlobBytes(image.buffer)], { type: image.contentType || "image/png" }),
      mask_url: new Blob([toBlobBytes(mask.buffer)], { type: mask.contentType || "image/png" }),
      sync_mode: true
    },
    logs: false
  });

  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  if (!data) {
    throw new Error("Bria masked edit returned an invalid payload");
  }

  const firstImage = isRecord(data.image) ? data.image : Array.isArray(data.images) ? data.images.find(isRecord) : null;
  if (!firstImage) {
    throw new Error("Bria masked edit returned no image");
  }

  const imageUrl = resolveImageUrl(firstImage);
  if (!imageUrl) {
    throw new Error("Bria masked edit returned no image URL");
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

function normalizeSegmentBBox(value: Record<string, unknown>): AutoSegmentBBox | undefined {
  const xMin = toFiniteNumber(value.x_min);
  const yMin = toFiniteNumber(value.y_min);
  const xMax = toFiniteNumber(value.x_max);
  const yMax = toFiniteNumber(value.y_max);

  if (xMin === undefined || yMin === undefined || xMax === undefined || yMax === undefined) {
    return undefined;
  }

  return { xMin, yMin, xMax, yMax };
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
