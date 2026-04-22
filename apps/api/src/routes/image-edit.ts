import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreativeOutputSchema,
  EditorSaveOutputResponseSchema,
  ImageEditPromptComposerRequestSchema,
  ImageEditPromptComposerResponseSchema
} from "@image-lab/contracts";
import { env } from "../lib/config.js";
import { applyFalDirectEdit } from "../lib/fal.js";
import {
  isInsufficientWorkspaceCreditsError,
  releaseWorkspaceCreditReservation,
  reserveWorkspaceCredits,
  settleWorkspaceCreditReservation
} from "../lib/credits.js";
import { assertWorkspaceRole, getActiveBrandProfile, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import { createSignedImageUrls, uploadBufferToStorage } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createThumbnailFromBuffer } from "../lib/thumbnails.js";
import { buildStoragePath, deriveAspectRatio, randomId, slugify } from "../lib/utils.js";

const ImageEditFieldsSchema = z.object({
  brandId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  width: z.coerce.number().int().positive().max(10000).optional(),
  height: z.coerce.number().int().positive().max(10000).optional()
});

const EditorSaveFieldsSchema = z.object({
  brandId: z.string().uuid(),
  saveMode: z.enum(["new", "version", "replace"]).default("new"),
  sourceOutputId: z.string().uuid().optional()
});

type UploadedImagePart = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

type EditorSourceOutputRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  deliverable_id: string | null;
  project_id: string | null;
  post_type_id: string | null;
  creative_template_id: string | null;
  calendar_item_id: string | null;
  job_id: string;
  post_version_id: string | null;
  kind: "style_seed" | "final";
  storage_path: string;
  thumbnail_storage_path: string | null;
  provider_url: string | null;
  output_index: number;
  parent_output_id: string | null;
  root_output_id: string | null;
  edited_from_output_id: string | null;
  version_number: number;
  is_latest_version: boolean;
  review_state: "pending_review" | "approved" | "needs_revision" | "closed";
  latest_feedback_verdict: "approved" | "close" | "off-brand" | "wrong-layout" | "wrong-text" | null;
  reviewed_at: string | null;
  created_by: string | null;
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

function inferFormatFromDimensions(width?: number, height?: number) {
  if (!width || !height) {
    return "square" as const;
  }

  const ratio = width / height;
  if (ratio <= 0.68) return "story" as const;
  if (ratio <= 0.85) return "portrait" as const;
  if (ratio >= 1.35) return "landscape" as const;
  return "square" as const;
}

function canReplaceSourceOutput(reviewState: EditorSourceOutputRow["review_state"]) {
  return reviewState === "pending_review" || reviewState === "needs_revision";
}

async function createEditorSaveArtifacts(params: {
  workspaceId: string;
  brandId: string;
  deliverableId?: string | null;
  projectId?: string | null;
  postTypeId?: string | null;
  creativeTemplateId?: string | null;
  calendarItemId?: string | null;
  sourceOutputId?: string | null;
  width?: number;
  height?: number;
  createdBy: string;
  fileName: string;
  saveMode: "new" | "version" | "replace";
}) {
  const brandProfileVersion = await getActiveBrandProfile(params.brandId);
  const creativeRequestId = randomId();
  const promptPackageId = randomId();
  const jobId = randomId();
  const format = inferFormatFromDimensions(params.width, params.height);
  const promptSummary = params.sourceOutputId
    ? `Editor save from output ${params.sourceOutputId}`
    : "Editor save";

  await supabaseAdmin.from("creative_requests").insert({
    id: creativeRequestId,
    workspace_id: params.workspaceId,
    brand_id: params.brandId,
    deliverable_id: params.deliverableId ?? null,
    project_id: params.projectId ?? null,
    post_type_id: params.postTypeId ?? null,
    creative_template_id: params.creativeTemplateId ?? null,
    status: "compiled",
    brief_json: {
      brandId: params.brandId,
      createMode: "post",
      ...(params.deliverableId ? { deliverableId: params.deliverableId } : {}),
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.postTypeId ? { postTypeId: params.postTypeId } : {}),
      ...(params.creativeTemplateId ? { creativeTemplateId: params.creativeTemplateId } : {}),
      ...(params.calendarItemId ? { calendarItemId: params.calendarItemId } : {}),
      ...(params.sourceOutputId ? { sourceOutputId: params.sourceOutputId } : {}),
      channel: "instagram-feed",
      format,
      goal: "Save edited output from editor",
      prompt: "Persist the current editor composition as a saved output.",
      copyMode: "manual",
      referenceAssetIds: [],
      includeBrandLogo: false,
      includeReraQr: false,
      logoAssetId: null
    },
    created_by: params.createdBy
  });

  await supabaseAdmin.from("prompt_packages").insert({
    id: promptPackageId,
    workspace_id: params.workspaceId,
    brand_id: params.brandId,
    deliverable_id: params.deliverableId ?? null,
    project_id: params.projectId ?? null,
    post_type_id: params.postTypeId ?? null,
    creative_template_id: params.creativeTemplateId ?? null,
    calendar_item_id: params.calendarItemId ?? null,
    creative_request_id: creativeRequestId,
    brand_profile_version_id: brandProfileVersion.id,
    prompt_summary: promptSummary,
    seed_prompt: promptSummary,
    final_prompt: promptSummary,
    aspect_ratio: deriveAspectRatio(format),
    chosen_model: "editor-save",
    template_type: null,
    reference_strategy: "uploaded-references",
    reference_asset_ids: [],
    variations: [],
    resolved_constraints: {
      source: "editor-save",
      saveMode: params.saveMode,
      sourceOutputId: params.sourceOutputId ?? null
    },
    compiler_trace: {
      pipeline: "editor-save",
      createdByRoute: "/api/creative/editor-save"
    },
    created_by: params.createdBy
  });

  await supabaseAdmin.from("creative_jobs").insert({
    id: jobId,
    workspace_id: params.workspaceId,
    brand_id: params.brandId,
    deliverable_id: params.deliverableId ?? null,
    project_id: params.projectId ?? null,
    post_type_id: params.postTypeId ?? null,
    creative_template_id: params.creativeTemplateId ?? null,
    calendar_item_id: params.calendarItemId ?? null,
    prompt_package_id: promptPackageId,
    selected_template_id: null,
    job_type: "final",
    status: "completed",
    provider: "editor-save",
    provider_model: params.fileName,
    provider_request_id: null,
    requested_count: 1,
    request_payload: {
      source: "editor-save",
      sourceOutputId: params.sourceOutputId ?? null,
      saveMode: params.saveMode
    },
    webhook_payload: {},
    submitted_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    created_by: params.createdBy
  });

  return { creativeRequestId, promptPackageId, jobId };
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
  app.post("/api/creative/editor-save", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let brandIdValue: string | undefined;
    let saveModeValue: string | undefined;
    let sourceOutputIdValue: string | undefined;
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
      if (part.fieldname === "saveMode") saveModeValue = readFieldValue(part.value);
      if (part.fieldname === "sourceOutputId") sourceOutputIdValue = readFieldValue(part.value);
    }

    if (!imagePart) {
      return reply.badRequest("Saved image is required");
    }

    if (!imagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Saved upload must be an image");
    }

    const parsedFields = EditorSaveFieldsSchema.safeParse({
      brandId: brandIdValue,
      saveMode: saveModeValue,
      sourceOutputId: sourceOutputIdValue
    });

    if (!parsedFields.success) {
      return reply.badRequest(parsedFields.error.issues[0]?.message ?? "Invalid editor save request");
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return reply.badRequest("Workspace not found");
    }

    const brand = await getBrand(parsedFields.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    let sourceOutput: EditorSourceOutputRow | null = null;
    if (parsedFields.data.sourceOutputId) {
      const { data, error } = await supabaseAdmin
        .from("creative_outputs")
        .select(
          "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by"
        )
        .eq("id", parsedFields.data.sourceOutputId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      sourceOutput = (data as EditorSourceOutputRow | null) ?? null;
      if (sourceOutput && sourceOutput.workspace_id !== workspace.id) {
        return reply.badRequest("Source output does not belong to this workspace");
      }
    }

    let resolvedMode: "new" | "version" | "replace" = parsedFields.data.saveMode;
    const replaceAllowed = sourceOutput ? canReplaceSourceOutput(sourceOutput.review_state) : false;
    if (resolvedMode === "replace" && !replaceAllowed) {
      resolvedMode = sourceOutput ? "version" : "new";
    }
    if (resolvedMode === "version" && !sourceOutput) {
      resolvedMode = "new";
    }

    const outputId = resolvedMode === "replace" && sourceOutput ? sourceOutput.id : randomId();
    const storagePath =
      resolvedMode === "replace" && sourceOutput
        ? sourceOutput.storage_path
        : buildStoragePath({
            workspaceId: workspace.id,
            brandId: brand.id,
            section: "outputs",
            id: outputId,
            fileName: imagePart.filename || `${slugify(outputId)}.png`
          });

    await uploadBufferToStorage(storagePath, imagePart.buffer, imagePart.mimetype, true);
    const thumbnail = await createThumbnailFromBuffer(storagePath, imagePart.buffer).catch(() => null);

    const now = new Date().toISOString();

    if (resolvedMode === "replace" && sourceOutput) {
      const { error } = await supabaseAdmin
        .from("creative_outputs")
        .update({
          storage_path: storagePath,
          thumbnail_storage_path: thumbnail?.thumbnailStoragePath ?? null,
          thumbnail_width: thumbnail?.thumbnailWidth ?? null,
          thumbnail_height: thumbnail?.thumbnailHeight ?? null,
          thumbnail_bytes: thumbnail?.thumbnailBytes ?? null,
          provider_url: null,
          review_state: "pending_review",
          latest_feedback_verdict: null,
          reviewed_at: null,
          created_by: viewer.userId,
          edited_from_output_id: sourceOutput.id,
          metadata_json: {
            source: "editor-save",
            saveMode: "replace"
          }
        })
        .eq("id", sourceOutput.id);

      if (error) {
        throw error;
      }
    } else {
      const jobArtifacts = await createEditorSaveArtifacts({
        workspaceId: workspace.id,
        brandId: brand.id,
        deliverableId: sourceOutput?.deliverable_id ?? null,
        projectId: sourceOutput?.project_id ?? null,
        postTypeId: sourceOutput?.post_type_id ?? null,
        creativeTemplateId: sourceOutput?.creative_template_id ?? null,
        calendarItemId: sourceOutput?.calendar_item_id ?? null,
        sourceOutputId: sourceOutput?.id ?? null,
        createdBy: viewer.userId,
        fileName: imagePart.filename,
        saveMode: resolvedMode
      });

      const rootOutputId = resolvedMode === "version" && sourceOutput
        ? sourceOutput.root_output_id ?? sourceOutput.id
        : outputId;
      const versionNumber = resolvedMode === "version" && sourceOutput
        ? Math.max(1, sourceOutput.version_number + 1)
        : 1;

      if (resolvedMode === "version" && sourceOutput) {
        const { error: latestVersionError } = await supabaseAdmin
          .from("creative_outputs")
          .update({ is_latest_version: false })
          .or(`id.eq.${rootOutputId},root_output_id.eq.${rootOutputId}`);
        if (latestVersionError) {
          throw latestVersionError;
        }
      }

      const { error } = await supabaseAdmin.from("creative_outputs").insert({
        id: outputId,
        workspace_id: workspace.id,
        brand_id: brand.id,
        deliverable_id: sourceOutput?.deliverable_id ?? null,
        project_id: sourceOutput?.project_id ?? null,
        post_type_id: sourceOutput?.post_type_id ?? null,
        creative_template_id: sourceOutput?.creative_template_id ?? null,
        calendar_item_id: sourceOutput?.calendar_item_id ?? null,
        job_id: jobArtifacts.jobId,
        post_version_id: null,
        kind: "final",
        storage_path: storagePath,
        thumbnail_storage_path: thumbnail?.thumbnailStoragePath ?? null,
        thumbnail_width: thumbnail?.thumbnailWidth ?? null,
        thumbnail_height: thumbnail?.thumbnailHeight ?? null,
        thumbnail_bytes: thumbnail?.thumbnailBytes ?? null,
        provider_url: null,
        output_index: sourceOutput?.output_index ?? 0,
        parent_output_id: resolvedMode === "version" && sourceOutput ? sourceOutput.id : null,
        root_output_id: rootOutputId,
        edited_from_output_id: sourceOutput?.id ?? null,
        version_number: versionNumber,
        is_latest_version: true,
        review_state: "pending_review",
        latest_feedback_verdict: null,
        reviewed_at: null,
        metadata_json: {
          source: "editor-save",
          saveMode: resolvedMode
        },
        created_by: viewer.userId
      });

      if (error) {
        throw error;
      }
    }

    const { data: savedOutput, error: savedOutputError } = await supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by"
      )
      .eq("id", outputId)
      .maybeSingle();

    if (savedOutputError) {
      throw savedOutputError;
    }

    if (!savedOutput) {
      return reply.notFound("Saved output not found");
    }

    const signedUrls = await createSignedImageUrls(savedOutput.storage_path, savedOutput.thumbnail_storage_path);

    return EditorSaveOutputResponseSchema.parse({
      output: CreativeOutputSchema.parse({
        id: savedOutput.id,
        workspaceId: savedOutput.workspace_id,
        brandId: savedOutput.brand_id,
        deliverableId: savedOutput.deliverable_id,
        projectId: savedOutput.project_id,
        postTypeId: savedOutput.post_type_id,
        creativeTemplateId: savedOutput.creative_template_id,
        calendarItemId: savedOutput.calendar_item_id,
        jobId: savedOutput.job_id,
        postVersionId: savedOutput.post_version_id,
        kind: savedOutput.kind,
        storagePath: savedOutput.storage_path,
        thumbnailStoragePath: savedOutput.thumbnail_storage_path,
        providerUrl: savedOutput.provider_url,
        outputIndex: savedOutput.output_index,
        parentOutputId: savedOutput.parent_output_id,
        rootOutputId: savedOutput.root_output_id,
        editedFromOutputId: savedOutput.edited_from_output_id,
        versionNumber: savedOutput.version_number,
        isLatestVersion: savedOutput.is_latest_version,
        reviewState: savedOutput.review_state,
        latestVerdict: savedOutput.latest_feedback_verdict,
        reviewedAt: savedOutput.reviewed_at,
        createdBy: savedOutput.created_by,
        previewUrl: signedUrls.originalUrl,
        thumbnailUrl: signedUrls.thumbnailUrl,
        originalUrl: signedUrls.originalUrl
      }),
      resolvedMode,
      canReplaceSource: replaceAllowed
    });
  });

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

  app.post("/api/creative/image-edit", { preHandler: app.authenticate }, async (request, reply) => {
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

        if (part.fieldname === "image") imagePart = uploadedPart;

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

    const parsedFields = ImageEditFieldsSchema.safeParse({
      brandId: brandIdValue,
      prompt: promptValue,
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
            endpoint: "/api/creative/image-edit"
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
      const response = await applyFalDirectEdit(editInput);

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

      request.log.error({ error }, "failed to apply direct image edit");

      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        message: extractImageEditErrorMessage(error)
      });
    }
  });
}
