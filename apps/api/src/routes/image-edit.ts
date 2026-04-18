import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ImageEditPromptComposerRequestSchema,
  ImageEditPromptComposerResponseSchema
} from "@image-lab/contracts";
import { env } from "../lib/config.js";
import { planImageEdit } from "../lib/ai-edit-director.js";
import { applyBriaMaskedEdit, applyFalDirectEdit, applyFalMaskedFill, submitFalAutoSegment } from "../lib/fal.js";
import { applyOpenAiMaskedEdit } from "../lib/openai-images.js";
import {
  isInsufficientWorkspaceCreditsError,
  releaseWorkspaceCreditReservation,
  reserveWorkspaceCredits,
  settleWorkspaceCreditReservation
} from "../lib/credits.js";
import { assertWorkspaceRole, getBrand } from "../lib/repository.js";
import { randomId } from "../lib/utils.js";

const ImageEditFieldsSchema = z.object({
  brandId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  objectLabel: z.string().trim().min(1).max(120).optional(),
  width: z.coerce.number().int().positive().max(10000).optional(),
  height: z.coerce.number().int().positive().max(10000).optional()
});

const ImageEditPlanFieldsSchema = z.object({
  brandId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  width: z.coerce.number().int().positive().max(10000).optional(),
  height: z.coerce.number().int().positive().max(10000).optional()
});

const ImageSegmentFieldsSchema = z
  .object({
    brandId: z.string().uuid(),
    object: z.string().trim().min(2).max(120),
    targetX: z.coerce.number().min(0).max(1).optional(),
    targetY: z.coerce.number().min(0).max(1).optional()
  })
  .superRefine((value, ctx) => {
    const hasX = typeof value.targetX === "number";
    const hasY = typeof value.targetY === "number";

    if (hasX !== hasY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasX ? "targetY" : "targetX"],
        message: "Both target coordinates are required when guiding segmentation"
      });
    }
  });

type UploadedImagePart = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

function multipartLimits(files: number) {
  return {
    fileSize: env.API_UPLOAD_MAX_FILE_MB * 1024 * 1024,
    files,
    parts: 10,
    fields: 8
  };
}

function readFieldValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

function extractImageEditErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "body" in error &&
    error.body &&
    typeof error.body === "object" &&
    "detail" in error.body &&
    typeof (error.body as { detail?: unknown }).detail === "string"
  ) {
    return (error.body as { detail: string }).detail;
  }

  if (
    error &&
    typeof error === "object" &&
    "body" in error &&
    error.body &&
    typeof error.body === "object" &&
    "message" in error.body &&
    typeof (error.body as { message?: unknown }).message === "string"
  ) {
    return (error.body as { message: string }).message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "AI image edit failed";
}

function insufficientCreditsMessage(error: unknown) {
  if (isInsufficientWorkspaceCreditsError(error)) {
    if (typeof error.required === "number" && typeof error.available === "number") {
      return `Not enough credits. Required ${error.required}, available ${error.available}.`;
    }

    return "Not enough credits for this image edit.";
  }

  return "Not enough credits for this image edit.";
}

type PromptComposerResult = {
  prompt: string;
  strategy: "gemini" | "fallback";
  model: string | null;
};

async function composePromptWithGemini(changes: string[]): Promise<PromptComposerResult | null> {
  if (!env.OPENROUTER_API_KEY) {
    return null;
  }

  const model = env.OPENROUTER_PROMPT_COMPOSER_MODEL;
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an expert image edit prompt writer. Combine the provided edit changes into one concise prompt for an image editor. Output only the final prompt text."
        },
        {
          role: "user",
          content: [
            "Combine these requested image edits into one coherent prompt.",
            "Keep all requested changes.",
            "Do not use numbering, bullets, or markdown.",
            "Do not mention model names or tool names.",
            "Be specific and directly actionable.",
            "",
            ...changes.map((change, index) => `${index + 1}. ${change}`)
          ].join("\n")
        }
      ]
    })
  });

  const text = await response.text();
  const parsed = text.length > 0 ? safeParseJson(text) : null;
  if (!response.ok) {
    throw new Error(`Prompt composition failed (${response.status})`);
  }

  const prompt = normalizeComposedPrompt(extractOpenRouterTextContent(parsed));
  if (!prompt) {
    throw new Error("Prompt composition returned an empty prompt.");
  }

  return {
    prompt,
    strategy: "gemini",
    model
  };
}

function composePromptFallback(changes: string[]): PromptComposerResult {
  const normalizedChanges = changes
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/\s+/g, " "));

  const prompt = normalizeComposedPrompt(
    `Apply all of the following edits in one coherent pass while preserving existing composition, lighting, and style unless explicitly changed: ${normalizedChanges.join(
      "; "
    )}.`
  );

  return {
    prompt: prompt ?? "Apply the requested list of edits in one coherent pass.",
    strategy: "fallback",
    model: null
  };
}

function normalizeComposedPrompt(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`-]+/, "")
    .replace(/[\s"'`-]+$/, "")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 2000);
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

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractOpenRouterTextContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  for (const choice of payload.choices) {
    if (!choice || typeof choice !== "object" || !("message" in choice)) {
      continue;
    }

    const message = choice.message;
    if (!message || typeof message !== "object" || !("content" in message)) {
      continue;
    }

    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (!part || typeof part !== "object") {
          continue;
        }

        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
      }
    }
  }

  return null;
}

export async function registerImageEditRoutes(app: FastifyInstance) {
  app.post("/api/creative/image-edit-compose-prompt", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const parsedBody = ImageEditPromptComposerRequestSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues[0]?.message ?? "Invalid prompt composition request");
    }

    const brand = await getBrand(parsedBody.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    try {
      const result = (await composePromptWithGemini(parsedBody.data.changes)) ?? composePromptFallback(parsedBody.data.changes);
      return ImageEditPromptComposerResponseSchema.parse(result);
    } catch (error) {
      request.log.warn({ error }, "failed to compose list-mode prompt with model, using fallback");
      return ImageEditPromptComposerResponseSchema.parse(composePromptFallback(parsedBody.data.changes));
    }
  });

  app.post("/api/creative/image-edit-plan", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let brandIdValue: string | undefined;
    let promptValue: string | undefined;
    let widthValue: string | undefined;
    let heightValue: string | undefined;
    let imagePart: UploadedImagePart | null = null;

    for await (const part of request.parts({ limits: multipartLimits(1) })) {
      if (part.type === "file") {
        const uploadedPart: UploadedImagePart = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer()
        };

        if (part.fieldname === "image") {
          imagePart = uploadedPart;
        }

        continue;
      }

      if (part.fieldname === "brandId") brandIdValue = readFieldValue(part.value);
      if (part.fieldname === "prompt") promptValue = readFieldValue(part.value);
      if (part.fieldname === "width") widthValue = readFieldValue(part.value);
      if (part.fieldname === "height") heightValue = readFieldValue(part.value);
    }

    if (!imagePart) {
      return reply.badRequest("Source image is required");
    }

    if (!imagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Source upload must be an image");
    }

    const parsedFields = ImageEditPlanFieldsSchema.safeParse({
      brandId: brandIdValue,
      prompt: promptValue,
      width: widthValue,
      height: heightValue
    });

    if (!parsedFields.success) {
      return reply.badRequest(parsedFields.error.issues[0]?.message ?? "Invalid image edit planning request");
    }

    const brand = await getBrand(parsedFields.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    try {
      return await planImageEdit({
        brandName: brand.name,
        prompt: parsedFields.data.prompt,
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {}),
        fileName: imagePart.filename,
        mimeType: imagePart.mimetype
      });
    } catch (error) {
      request.log.error({ error }, "failed to plan AI image edit");

      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        message: error instanceof Error ? error.message : "AI image edit planning failed"
      });
    }
  });

  app.post("/api/creative/image-segment", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let brandIdValue: string | undefined;
    let objectValue: string | undefined;
    let targetXValue: string | undefined;
    let targetYValue: string | undefined;
    let imagePart: UploadedImagePart | null = null;

    for await (const part of request.parts({ limits: multipartLimits(1) })) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();

        if (part.fieldname === "image") {
          imagePart = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer
          };
        }

        continue;
      }

      if (part.fieldname === "brandId") brandIdValue = readFieldValue(part.value);
      if (part.fieldname === "object") objectValue = readFieldValue(part.value);
      if (part.fieldname === "targetX") targetXValue = readFieldValue(part.value);
      if (part.fieldname === "targetY") targetYValue = readFieldValue(part.value);
    }

    if (!imagePart) {
      return reply.badRequest("Source image is required");
    }

    if (!imagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Source upload must be an image");
    }

    const parsedFields = ImageSegmentFieldsSchema.safeParse({
      brandId: brandIdValue,
      object: objectValue,
      targetX: targetXValue,
      targetY: targetYValue
    });

    if (!parsedFields.success) {
      return reply.badRequest(parsedFields.error.issues[0]?.message ?? "Invalid image segmentation request");
    }

    const brand = await getBrand(parsedFields.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    try {
      return await submitFalAutoSegment({
        objectName: parsedFields.data.object,
        targetPoint:
          typeof parsedFields.data.targetX === "number" && typeof parsedFields.data.targetY === "number"
            ? { x: parsedFields.data.targetX, y: parsedFields.data.targetY }
            : null,
        image: {
          buffer: imagePart.buffer,
          contentType: imagePart.mimetype
        }
      });
    } catch (error) {
      request.log.error({ error }, "failed to auto-segment image");

      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        message: error instanceof Error ? error.message : "Auto segmentation failed"
      });
    }
  });

  app.post("/api/creative/image-edit", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let brandIdValue: string | undefined;
    let promptValue: string | undefined;
    let objectLabelValue: string | undefined;
    let widthValue: string | undefined;
    let heightValue: string | undefined;
    let imagePart: UploadedImagePart | null = null;
    let maskPart: UploadedImagePart | null = null;

    for await (const part of request.parts({ limits: multipartLimits(2) })) {
      if (part.type === "file") {
        const uploadedPart: UploadedImagePart = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer()
        };

        if (part.fieldname === "image") imagePart = uploadedPart;
        if (part.fieldname === "mask") maskPart = uploadedPart;

        continue;
      }

      if (part.fieldname === "brandId") brandIdValue = readFieldValue(part.value);
      if (part.fieldname === "prompt") promptValue = readFieldValue(part.value);
      if (part.fieldname === "objectLabel") objectLabelValue = readFieldValue(part.value);
      if (part.fieldname === "width") widthValue = readFieldValue(part.value);
      if (part.fieldname === "height") heightValue = readFieldValue(part.value);
    }

    if (!imagePart) {
      return reply.badRequest("Source image is required");
    }

    if (env.AI_EDIT_FLOW === "mask" && !maskPart) {
      return reply.badRequest("Mask image is required");
    }

    if (!imagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Source upload must be an image");
    }

    if (maskPart && !maskPart.mimetype.startsWith("image/")) {
      return reply.badRequest("Mask upload must be an image");
    }

    const parsedFields = ImageEditFieldsSchema.safeParse({
      brandId: brandIdValue,
      prompt: promptValue,
      objectLabel: objectLabelValue,
      width: widthValue,
      height: heightValue
    });

    if (!parsedFields.success) {
      return reply.badRequest(parsedFields.error.issues[0]?.message ?? "Invalid image edit request");
    }

    const brand = await getBrand(parsedFields.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const reservationAmount = Math.max(0, env.CREDITS_IMAGE_EDIT_PER_REQUEST);
    const reservationSourceRef = `image-edit:${randomId()}`;
    let reservationId: string | null = null;

    if (reservationAmount > 0) {
      try {
        const reservation = await reserveWorkspaceCredits({
          workspaceId: brand.workspaceId,
          source: "image_edit_request",
          sourceRef: reservationSourceRef,
          amount: reservationAmount,
          actorUserId: viewer.userId,
          metadata: {
            endpoint: "/api/creative/image-edit",
            flow: env.AI_EDIT_FLOW
          }
        });
        reservationId = reservation.reservationId;
      } catch (error) {
        if (isInsufficientWorkspaceCreditsError(error)) {
          return reply.code(402).send({
            statusCode: 402,
            error: "Payment Required",
            message: insufficientCreditsMessage(error)
          });
        }

        throw error;
      }
    }

    try {
      const editInput = {
        prompt: parsedFields.data.prompt,
        image: {
          buffer: imagePart.buffer,
          contentType: imagePart.mimetype,
          fileName: imagePart.filename
        },
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
      };

      const primaryModel = env.AI_EDIT_PRIMARY_MODEL.trim();
      const useOpenAiFallback =
        primaryModel === env.AI_EDIT_EXPERIMENTAL_MODEL || primaryModel.startsWith("gpt-image");
      const useBriaEdit = primaryModel.startsWith("bria/fibo-edit/");

      let response;

      if (env.AI_EDIT_FLOW === "direct") {
        response = await applyFalDirectEdit({
          prompt: parsedFields.data.prompt,
          image: editInput.image,
          ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
          ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
        });
      } else if (useOpenAiFallback) {
        response = await applyOpenAiMaskedEdit({
          ...editInput,
          mask: {
            buffer: maskPart!.buffer,
            contentType: maskPart!.mimetype,
            fileName: maskPart!.filename
          },
          model: primaryModel
        });
      } else if (useBriaEdit) {
        response = await applyBriaMaskedEdit({
          instruction: parsedFields.data.prompt,
          ...editInput,
          mask: {
            buffer: maskPart!.buffer,
            contentType: maskPart!.mimetype,
            fileName: maskPart!.filename
          },
          model: primaryModel
        });
      } else {
        response = await applyFalMaskedFill({
          ...editInput,
          mask: {
            buffer: maskPart!.buffer,
            contentType: maskPart!.mimetype,
            fileName: maskPart!.filename
          },
          model: primaryModel
        });
      }

      if (reservationId) {
        await settleWorkspaceCreditReservation({
          reservationId,
          metadata: {
            endpoint: "/api/creative/image-edit",
            status: "completed"
          }
        });
      }

      return response;
    } catch (error) {
      if (reservationId) {
        await releaseWorkspaceCreditReservation({
          reservationId,
          actorUserId: viewer.userId,
          note: "image edit failed",
          metadata: {
            endpoint: "/api/creative/image-edit",
            reason: "provider_error"
          }
        }).catch((releaseError) => {
          request.log.warn({ releaseError }, "failed to release image edit credit reservation");
        });
      }

      request.log.error({ error }, "failed to apply masked image edit");

      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        message: extractImageEditErrorMessage(error)
      });
    }
  });
}
