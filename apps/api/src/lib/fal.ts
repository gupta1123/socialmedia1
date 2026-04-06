import { fal } from "@fal-ai/client";
import type { CreativeJobRecord, PromptPackage } from "@image-lab/contracts";
import { env } from "./config.js";
import { downloadStorageBlob } from "./storage.js";

fal.config({
  credentials: env.FAL_KEY
});

export async function submitStyleSeedGeneration(
  job: CreativeJobRecord,
  promptPackage: Pick<PromptPackage, "seedPrompt" | "aspectRatio"> | { prompt: string; aspectRatio: string },
  referenceUrls: string[] = []
) {
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
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.seedPrompt,
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

  return fal.queue.submit(env.FAL_FINAL_MODEL, options);
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
