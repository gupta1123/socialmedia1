import type { CreativeJobRecord, PromptPackage } from "@image-lab/contracts";
import { env } from "./config.js";
import { submitFinalGeneration as submitFalFinalGeneration, submitStyleSeedGeneration as submitFalStyleSeedGeneration, uploadStoragePathToFal } from "./fal.js";
import { generateOpenRouterImages, type OpenRouterGeneratedImage } from "./openrouter.js";

export type ImageGenerationProvider = "fal" | "openrouter";

export type ProviderGeneratedImage = OpenRouterGeneratedImage;

export type ImageProviderSubmission = {
  provider: ImageGenerationProvider;
  providerModel: string;
  request_id: string;
  images?: ProviderGeneratedImage[];
};

export function resolveImageGenerationProvider(): ImageGenerationProvider {
  return env.IMAGE_GENERATION_PROVIDER;
}

export function getStyleSeedProviderModel(referenceCount: number) {
  if (env.IMAGE_GENERATION_PROVIDER === "openrouter") {
    return referenceCount > 0 ? env.OPENROUTER_FINAL_MODEL : env.OPENROUTER_STYLE_SEED_MODEL;
  }

  return referenceCount > 0 ? env.FAL_FINAL_MODEL : env.FAL_STYLE_SEED_MODEL;
}

export function getFinalProviderModel() {
  return env.IMAGE_GENERATION_PROVIDER === "openrouter" ? env.OPENROUTER_FINAL_MODEL : env.FAL_FINAL_MODEL;
}

export async function submitStyleSeedGeneration(
  job: CreativeJobRecord,
  promptPackage: Pick<PromptPackage, "seedPrompt" | "aspectRatio"> | { prompt: string; aspectRatio: string },
  referencePaths: string[] = []
): Promise<ImageProviderSubmission> {
  const provider = resolveImageGenerationProvider();
  const providerModel = getStyleSeedProviderModel(referencePaths.length);

  if (provider === "openrouter") {
    const result = await generateOpenRouterImages({
      model: providerModel,
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.seedPrompt,
      aspectRatio: promptPackage.aspectRatio,
      count: job.requestedCount,
      referencePaths
    });

    return {
      provider,
      providerModel,
      request_id: result.request_id,
      images: result.images
    };
  }

  const referenceUrls =
    referencePaths.length > 0
      ? await Promise.all(referencePaths.map((storagePath) => uploadStoragePathToFal(storagePath)))
      : [];
  const result = await submitFalStyleSeedGeneration(job, promptPackage, referenceUrls);

  return {
    provider,
    providerModel,
    request_id: result.request_id ?? `fal-style-seed-${job.id}`
  };
}

export async function submitFinalGeneration(
  job: CreativeJobRecord,
  promptPackage: Pick<PromptPackage, "finalPrompt" | "aspectRatio"> | { prompt: string; aspectRatio: string },
  referencePaths: string[]
): Promise<ImageProviderSubmission> {
  const provider = resolveImageGenerationProvider();
  const providerModel = getFinalProviderModel();

  if (provider === "openrouter") {
    const result = await generateOpenRouterImages({
      model: providerModel,
      prompt: "prompt" in promptPackage ? promptPackage.prompt : promptPackage.finalPrompt,
      aspectRatio: promptPackage.aspectRatio,
      count: job.requestedCount,
      referencePaths
    });

    return {
      provider,
      providerModel,
      request_id: result.request_id,
      images: result.images
    };
  }

  const referenceUrls = await Promise.all(referencePaths.map((storagePath) => uploadStoragePathToFal(storagePath)));
  const result = await submitFalFinalGeneration(job, promptPackage, referenceUrls);

  return {
    provider,
    providerModel,
    request_id: result.request_id ?? `fal-final-${job.id}`
  };
}
