import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../lib/config.js";
import { submitFalAutoSegment } from "../lib/fal.js";
import { applyOpenRouterMaskedEdit } from "../lib/openrouter.js";
import { assertWorkspaceRole, getBrand } from "../lib/repository.js";

const ImageEditFieldsSchema = z.object({
  brandId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  objectLabel: z.string().trim().min(1).max(120).optional(),
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

export async function registerImageEditRoutes(app: FastifyInstance) {
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

    if (!maskPart) {
      return reply.badRequest("Mask image is required");
    }

    if (!imagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Source upload must be an image");
    }

    if (!maskPart.mimetype.startsWith("image/")) {
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

    try {
      const editInput = {
        prompt: parsedFields.data.prompt,
        image: {
          buffer: imagePart.buffer,
          contentType: imagePart.mimetype
        },
        mask: {
          buffer: maskPart.buffer,
          contentType: maskPart.mimetype
        }
      };

      return await applyOpenRouterMaskedEdit({
        ...editInput,
        ...(parsedFields.data.objectLabel ? { objectLabel: parsedFields.data.objectLabel } : {}),
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
      });
    } catch (error) {
      request.log.error({ error }, "failed to apply masked image edit");

      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        message: error instanceof Error ? error.message : "AI image edit failed"
      });
    }
  });
}
