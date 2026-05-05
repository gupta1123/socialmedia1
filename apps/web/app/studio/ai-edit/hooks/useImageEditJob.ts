import { useState, useCallback } from "react";
import {
  startImageEditJob,
  getImageEditJobStatus,
  composeImageEditPrompt,
} from "../lib/api";
import type { ImageEditPreset } from "../lib/api";
import type { AiImageEditResponse } from "@image-lab/contracts";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface UseImageEditJobOptions {
  sessionToken: string;
  brandId: string;
  onError?: (error: string) => void;
}

export type ImageEditJobResult = AiImageEditResponse & {
  jobId: string;
  submittedPrompt: string;
};

export function useImageEditJob({ sessionToken, brandId, onError }: UseImageEditJobOptions) {
  const [isApplying, setIsApplying] = useState(false);
  const [isComposingPrompt, setIsComposingPrompt] = useState(false);
  const [composedPrompt, setComposedPrompt] = useState<string>("");
  const [composedPromptKey, setComposedPromptKey] = useState<string>("");

  const resolveActivePrompt = useCallback(async (
    promptMode: "normal" | "list",
    prompt: string,
    listPromptItems: string[],
    activeBrandId: string
  ): Promise<string | null> => {
    if (promptMode === "normal") {
      const trimmed = prompt.trim();
      if (!trimmed) {
        onError?.("Describe the edit before applying AI changes.");
        return null;
      }
      return trimmed;
    }

    const normalizedItems = listPromptItems.map((item) => item.trim()).filter((item) => item.length > 0);
    if (normalizedItems.length === 0) {
      onError?.("Add at least one edit item in list mode.");
      return null;
    }

    const key = normalizedItems.join("\n");
    if (composedPromptKey === key && composedPrompt.trim().length > 0) {
      return composedPrompt.trim();
    }

    setIsComposingPrompt(true);
    try {
      const composed = await composeImageEditPrompt(sessionToken, {
        brandId: activeBrandId,
        changes: normalizedItems,
      });
      const nextPrompt = composed.prompt.trim();
      setComposedPrompt(nextPrompt);
      setComposedPromptKey(key);
      return nextPrompt;
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : "Unable to compose list-mode prompt.");
      return null;
    } finally {
      setIsComposingPrompt(false);
    }
  }, [sessionToken, composedPrompt, composedPromptKey, onError]);

  const applyEdit = useCallback(async (
    prompt: string,
    image: File,
    width: number,
    height: number,
    imageFileName: string,
    editPreset: ImageEditPreset,
    listPromptItems?: string[],
    promptMode?: "normal" | "list"
  ): Promise<ImageEditJobResult | null> => {
    if (!sessionToken) {
      onError?.("Your session is missing. Refresh the page and try again.");
      return null;
    }

    if (!brandId) {
      onError?.("Select an active brand before applying an edit.");
      return null;
    }

    setIsApplying(true);

    try {
      const resolvedPrompt = await resolveActivePrompt(
        promptMode ?? "normal",
        prompt,
        listPromptItems ?? [],
        brandId
      );
      if (!resolvedPrompt) return null;

      const job = await startImageEditJob(sessionToken, {
        brandId,
        prompt: resolvedPrompt,
        editPreset,
        width,
        height,
        image,
        imageFileName,
      });

      const startedAt = Date.now();
      const timeoutMs = 10 * 60 * 1000;

      while (Date.now() - startedAt < timeoutMs) {
        await wait(2_500);
        const jobStatus = await getImageEditJobStatus(sessionToken, job.jobId);

        if (jobStatus.status === "completed") {
          if (!jobStatus.result) {
            throw new Error("AI edit completed without an image.");
          }
          return {
            ...jobStatus.result,
            jobId: job.jobId,
            submittedPrompt: resolvedPrompt,
          };
        }

        if (jobStatus.status === "failed") {
          throw new Error(jobStatus.error?.message ?? "AI edit failed.");
        }
      }

      throw new Error("AI edit is taking longer than expected. Please try again shortly.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (/payment required|insufficient|credit/i.test(message)) {
        onError?.(message);
      } else {
        onError?.("AI edit failed. Please try again with a simpler edit or a smaller image.");
      }
      return null;
    } finally {
      setIsApplying(false);
    }
  }, [sessionToken, brandId, resolveActivePrompt, onError]);

  return {
    isApplying,
    isComposingPrompt,
    composedPrompt,
    composedPromptKey,
    applyEdit,
    resolveActivePrompt,
  };
}

export function getUserSafeImageEditError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/payment required|insufficient|credit/i.test(message)) {
    return message;
  }
  return "AI edit failed. Please try again with a simpler edit or a smaller image.";
}
