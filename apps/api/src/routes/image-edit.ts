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
import { applyOpenAiDirectEdit } from "../lib/openai-images.js";
import {
  isInsufficientWorkspaceCreditsError,
  releaseWorkspaceCreditReservation,
  reserveWorkspaceCredits,
  settleWorkspaceCreditReservation
} from "../lib/credits.js";
import { assertWorkspaceRole, getActiveBrandProfile, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import { createSignedImageUrls, createSignedUrl, downloadStorageBlob, uploadBufferToStorage } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createThumbnailFromBufferOrNull } from "../lib/thumbnails.js";
import { ensurePostVersionForOutput } from "../lib/deliverable-flow.js";
import { buildStoragePath, deriveAspectRatio, randomId, slugify } from "../lib/utils.js";
import {
  buildProtectedImageEditPrompt,
  detectProtectedImageEditPermissions
} from "../lib/image-edit-prompt-protection.js";
import sharp from "sharp";

const ImageEditFieldsSchema = z.object({
  brandId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  editPreset: z.enum(["v1_low", "v1_high", "v2_low", "v2_medium", "v2_high"]).optional(),
  width: z.coerce.number().int().positive().max(10000).optional(),
  height: z.coerce.number().int().positive().max(10000).optional()
});

type ImageEditPreset = NonNullable<z.infer<typeof ImageEditFieldsSchema>["editPreset"]>;
type OpenAiImageQuality = "low" | "medium" | "high";

const AsyncImageEditJobInputSchema = z.object({
  type: z.literal("image-edit"),
  brandId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  protectedPrompt: z.string().trim().min(3).max(12000).optional(),
  editPlan: z.record(z.unknown()).optional(),
  promptStrategy: z.string().max(100).optional(),
  plannerModel: z.string().max(200).nullable().optional(),
  aiWrittenPrompt: z.string().max(6000).optional(),
  guardrails: z.array(z.string().max(1000)).max(40).optional(),
  negativePrompt: z.string().max(6000).optional(),
  promptValidation: z.record(z.unknown()).optional(),
  sourceStoragePath: z.string().min(1),
  sourceContentType: z.string().min(1),
  sourceFileName: z.string().min(1),
  actorUserId: z.string().nullable(),
  reservationId: z.string().nullable(),
  editPreset: z.enum(["v1_low", "v1_high", "v2_low", "v2_medium", "v2_high"]).optional(),
  provider: z.string(),
  model: z.string(),
  quality: z.enum(["low", "medium", "high"]).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

const EditorSaveFieldsSchema = z.object({
  brandId: z.string().uuid(),
  saveMode: z.enum(["new", "version", "replace"]).default("new"),
  sourceOutputId: z.string().uuid().optional()
});

const AiEditSaveMetadataSchema = z
  .object({
    source: z.literal("ai-edit"),
    promptMode: z.enum(["normal", "list", "pins"]),
    exactInput: z
      .object({
        prompt: z.string().max(5000).optional(),
        globalPrompt: z.string().max(5000).optional(),
        pins: z
          .array(
            z
              .object({
                id: z.string().max(120).optional(),
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                comment: z.string().max(1000)
              })
              .passthrough()
          )
          .max(30)
          .optional(),
        items: z.array(z.string().max(1000)).max(20).optional(),
        normalizedItems: z.array(z.string().max(1000)).max(40).optional()
      })
      .passthrough()
      .optional(),
    submittedPrompt: z.string().max(2000).optional(),
    jobId: z.string().uuid().optional(),
    editPreset: z.enum(["v1_low", "v1_high", "v2_low", "v2_medium", "v2_high"]).optional(),
    resultModel: z.string().max(200).optional(),
    resultWidth: z.number().int().positive().optional(),
    resultHeight: z.number().int().positive().optional(),
    mergedLayerCount: z.number().int().min(0).max(1000).optional(),
    preservedLayerCount: z.number().int().min(0).max(1000).optional()
  })
  .passthrough();

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
  metadata_json: Record<string, unknown> | null;
};

type ImageEditJobInput = z.infer<typeof AsyncImageEditJobInputSchema>;

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
  return "AI image edit failed. Please try again with a simpler edit or a smaller image.";
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

function resolveDefaultImageEditPreset(): ImageEditPreset {
  if (env.IMAGE_GENERATION_PROVIDER === "fal") {
    return "v1_high";
  }

  if (env.IMAGE_GENERATION_PROVIDER === "openai") {
    if (env.OPENAI_IMAGE_QUALITY === "low") return "v2_low";
    if (env.OPENAI_IMAGE_QUALITY === "medium") return "v2_medium";
    return "v2_high";
  }

  return "v1_high";
}

function resolveImageEditPreset(editPreset?: ImageEditPreset) {
  const preset = editPreset ?? resolveDefaultImageEditPreset();

  if (preset === "v1_low") {
    return {
      editPreset: preset,
      provider: "fal" as const,
      model: env.AI_EDIT_GOOGLE_LOW_MODEL
    };
  }

  if (preset === "v1_high") {
    return {
      editPreset: preset,
      provider: "fal" as const,
      model: env.AI_EDIT_GOOGLE_HIGH_MODEL
    };
  }

  const qualityByPreset: Record<Extract<ImageEditPreset, "v2_low" | "v2_medium" | "v2_high">, OpenAiImageQuality> = {
    v2_low: "low",
    v2_medium: "medium",
    v2_high: "high"
  };

  return {
    editPreset: preset,
    provider: "openai" as const,
    model: env.AI_EDIT_OPENAI_MODEL || env.OPENAI_FINAL_MODEL,
    quality: qualityByPreset[preset]
  };
}

function normalizeImageEditProvider(provider: string): "fal" | "openai" {
  return provider === "openai" ? "openai" : "fal";
}

async function getImageDimensions(buffer: Buffer) {
  const metadata = await sharp(buffer, { animated: false }).metadata();
  const width = metadata.width ?? undefined;
  const height = metadata.height ?? undefined;
  const orientation = metadata.orientation ?? 1;

  if (!width || !height) {
    return { width: undefined, height: undefined };
  }

  const needsSwap = orientation >= 5 && orientation <= 8;
  return needsSwap ? { width: height, height: width } : { width, height };
}

async function applyConfiguredImageEdit(input: {
  prompt: string;
  image: {
    buffer: Buffer;
    contentType: string;
    fileName: string;
  };
  provider: "fal" | "openai";
  model: string;
  quality?: OpenAiImageQuality;
  protectedPrompt?: string;
  width?: number;
  height?: number;
}) {
  const protectedPrompt = input.protectedPrompt ?? buildProtectedImageEditPrompt(input.prompt);

  return input.provider === "openai"
    ? applyOpenAiDirectEdit({
        prompt: protectedPrompt,
        image: input.image,
        model: input.model,
        ...(input.quality ? { quality: input.quality } : {}),
        ...(typeof input.width === "number" ? { width: input.width } : {}),
        ...(typeof input.height === "number" ? { height: input.height } : {})
      })
    : applyFalDirectEdit({
        prompt: protectedPrompt,
        image: input.image,
        model: input.model,
        ...(typeof input.width === "number" ? { width: input.width } : {}),
        ...(typeof input.height === "number" ? { height: input.height } : {})
      });
}

async function reserveImageEditCredits(params: {
  workspaceId: string;
  actorUserId: string | null;
  endpoint: string;
}) {
  const reservationAmount = Math.max(0, env.CREDITS_IMAGE_EDIT_PER_REQUEST);
  if (reservationAmount <= 0) {
    return null;
  }

  const reservation = await reserveWorkspaceCredits({
    workspaceId: params.workspaceId,
    source: "image_edit_request",
    sourceRef: `image-edit:${randomId()}`,
    amount: reservationAmount,
    actorUserId: params.actorUserId,
    metadata: {
      endpoint: params.endpoint
    }
  });

  return reservation.reservationId;
}

async function releaseImageEditReservationIfPresent(params: {
  reservationId: string | null;
  actorUserId: string | null;
  endpoint: string;
  log?: { warn: (payload: unknown, message?: string) => void };
}) {
  if (!params.reservationId) {
    return;
  }

  await releaseWorkspaceCreditReservation({
    reservationId: params.reservationId,
    actorUserId: params.actorUserId,
    note: "image edit failed",
    metadata: {
      endpoint: params.endpoint,
      reason: "provider_error"
    }
  }).catch((releaseError) => {
    params.log?.warn({ releaseError }, "failed to release image edit credit reservation");
  });
}

async function settleImageEditReservationIfPresent(params: {
  reservationId: string | null;
  endpoint: string;
}) {
  if (!params.reservationId) {
    return;
  }

  await settleWorkspaceCreditReservation({
    reservationId: params.reservationId,
    metadata: {
      endpoint: params.endpoint,
      status: "completed"
    }
  });
}

async function processImageEditJobLocally(params: {
  jobId: string;
  log: {
    error: (payload: unknown, message?: string) => void;
    warn: (payload: unknown, message?: string) => void;
  };
}) {
  const endpoint = "/api/creative/image-edit-async";
  const { data: claimedJob, error: claimError } = await supabaseAdmin
    .from("compile_jobs")
    .update({
      status: "processing",
      updated_at: new Date().toISOString()
    })
    .eq("id", params.jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError) {
    params.log.error({ error: claimError, jobId: params.jobId }, "failed to claim async image edit job locally");
    return;
  }

  if (!claimedJob) {
    return;
  }

  let jobInput: ImageEditJobInput | null = null;

  try {
    jobInput = AsyncImageEditJobInputSchema.parse(claimedJob.input_brief);
    const sourceBlob = await downloadStorageBlob(jobInput.sourceStoragePath);
    const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
    const result = await applyConfiguredImageEdit({
      prompt: jobInput.prompt,
      image: {
        buffer: sourceBuffer,
        contentType: jobInput.sourceContentType,
        fileName: jobInput.sourceFileName
      },
      provider: normalizeImageEditProvider(jobInput.provider),
      model: jobInput.model,
      ...(jobInput.protectedPrompt ? { protectedPrompt: jobInput.protectedPrompt } : {}),
      ...(jobInput.quality ? { quality: jobInput.quality } : {}),
      ...(typeof jobInput.width === "number" ? { width: jobInput.width } : {}),
      ...(typeof jobInput.height === "number" ? { height: jobInput.height } : {})
    });

    await settleImageEditReservationIfPresent({
      reservationId: jobInput.reservationId,
      endpoint
    });

    await supabaseAdmin
      .from("compile_jobs")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId);
  } catch (error) {
    params.log.error({ error, jobId: params.jobId }, "async image edit job failed locally");
    await releaseImageEditReservationIfPresent({
      reservationId: jobInput?.reservationId ?? null,
      actorUserId: jobInput?.actorUserId ?? null,
      endpoint,
      log: params.log
    });
    await supabaseAdmin
      .from("compile_jobs")
      .update({
        status: "failed",
        error_json: {
          message: extractImageEditErrorMessage(error)
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId);
  }
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
  aiEditMetadata?: Record<string, unknown> | null;
}) {
  const brandProfileVersion = await getActiveBrandProfile(params.brandId);
  const creativeRequestId = randomId();
  const promptPackageId = randomId();
  const jobId = randomId();
  const format = inferFormatFromDimensions(params.width, params.height);
  const aiEditPromptText = extractAiEditPromptText(params.aiEditMetadata);
  const promptSummary = aiEditPromptText
    ? `AI edit: ${truncateText(aiEditPromptText, 160)}`
    : params.sourceOutputId
    ? `Editor save from output ${params.sourceOutputId}`
    : "Editor save";
  const editorSavePrompt = aiEditPromptText ?? "Persist the current editor composition as a saved output.";

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
      prompt: editorSavePrompt,
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
    seed_prompt: editorSavePrompt,
    final_prompt: editorSavePrompt,
    aspect_ratio: deriveAspectRatio(format),
    chosen_model: "editor-save",
    template_type: null,
    reference_strategy: "uploaded-references",
    reference_asset_ids: [],
    variations: [],
    resolved_constraints: {
      source: "editor-save",
      saveMode: params.saveMode,
      sourceOutputId: params.sourceOutputId ?? null,
      aiEditJobId: typeof params.aiEditMetadata?.jobId === "string" ? params.aiEditMetadata.jobId : null
    },
    compiler_trace: {
      pipeline: "editor-save",
      createdByRoute: "/api/creative/editor-save",
      ...(params.aiEditMetadata ? { aiEdit: params.aiEditMetadata } : {})
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
      saveMode: params.saveMode,
      aiEditJobId: typeof params.aiEditMetadata?.jobId === "string" ? params.aiEditMetadata.jobId : null
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

const ImageEditPromptPlanRequestSchema = z.object({
  brandId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  editPreset: z.enum(["v1_low", "v1_high", "v2_low", "v2_medium", "v2_high"]).optional(),
  width: z.coerce.number().int().positive().max(10000).optional(),
  height: z.coerce.number().int().positive().max(10000).optional()
});

const ImageEditAiPlanSchema = z.object({
  intentSummary: z.string().trim().min(3).max(800),
  allowedTargets: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  protectedTargets: z.array(z.string().trim().min(1).max(160)).max(40).default([]),
  requiresBuildingChange: z.boolean().default(false),
  requiresLogoChange: z.boolean().default(false),
  requiresTextComplianceChange: z.boolean().default(false),
  requiresLayoutChange: z.boolean().default(false),
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  clarificationRequired: z.boolean().default(false),
  aiWrittenPrompt: z.string().trim().min(3).max(4000),
  guardrails: z.array(z.string().trim().min(3).max(600)).max(30).default([]),
  negativePrompt: z.string().trim().max(3000).default("")
});

type ImageEditAiPlan = z.infer<typeof ImageEditAiPlanSchema>;

type ImageEditPromptPlanResult = {
  protectedPrompt: string;
  editPlan: ImageEditAiPlan | Record<string, unknown>;
  promptStrategy: "ai_planner" | "fixed_guardrail_fallback";
  plannerModel: string | null;
  aiWrittenPrompt: string;
  guardrails: string[];
  negativePrompt: string;
  promptValidation: {
    explicitPermissions: ReturnType<typeof detectProtectedImageEditPermissions>;
    warnings: string[];
    patchedGuardrailCount: number;
  };
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
            "You are an expert real-estate image edit prompt writer. Combine the provided edit changes into one concise prompt for an image editor. Preserve the source image as a locked document: exact building shape, structure, elevation, facade, floor count, windows, balconies, construction progress, camera angle, crop, subject scale, layout, logos, brand marks, RERA/QR/compliance blocks, and existing readable text unless a requested change explicitly names that exact protected item. Do not broaden the edit into redesign, beautification, cleanup, architecture changes, elevation changes, perspective changes, crop changes, layout changes, spacing changes, or brand changes. If a requested change needs space, instruct the editor to modify only the named non-building element and not move/resize/reframe the building. Output only the final prompt text."
        },
        {
          role: "user",
          content: [
            "Combine these requested image edits into one coherent prompt.",
            "Keep all requested changes.",
            "Do not infer extra building, structure, elevation, facade, construction, camera, crop, layout, scale, logo, brand, RERA, QR, compliance, or text changes.",
            "Do not ask the image editor to make room by changing the building, changing the camera, resizing the building, cropping the image, or shifting the whole composition.",
            "If a requested edit is ambiguous, preserve those protected details exactly.",
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
    `Apply all of the following edits in one coherent pass as localized in-place changes. Preserve existing composition, crop, camera angle, subject scale, lighting, style, building structure, elevation truth, facade, floor count, windows, balconies, logos, brand marks, RERA/QR/compliance blocks, and readable text unless a listed edit explicitly changes those exact items. Do not move, resize, reframe, redraw, or distort the building to accommodate the edit: ${normalizedChanges.join(
      "; "
    )}.`
  );

  return {
    prompt: prompt ?? "Apply the requested list of edits in one coherent pass.",
    strategy: "fallback",
    model: null
  };
}

async function createImageEditPromptPlan(input: {
  prompt: string;
  editPreset?: ImageEditPreset;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
}): Promise<ImageEditPromptPlanResult> {
  const explicitPermissions = detectProtectedImageEditPermissions(input.prompt);
  const aiPlan = await planImageEditWithAi(input).catch(() => null);
  if (!aiPlan) {
    const protectedPrompt = buildProtectedImageEditPrompt(input.prompt);
    return {
      protectedPrompt,
      editPlan: {
        intentSummary: "Fallback protected prompt was used because AI edit planning was unavailable.",
        allowedTargets: [],
        protectedTargets: [
          "building/elevation truth",
          "logos and brand marks",
          "RERA, QR, compliance, contact details, and readable text",
          "canvas, crop, camera angle, and global composition"
        ],
        requiresBuildingChange: explicitPermissions.buildingTruth,
        requiresLogoChange: explicitPermissions.brandMarks,
        requiresTextComplianceChange: explicitPermissions.textAndCompliance,
        requiresLayoutChange: false,
        riskLevel: "medium",
        clarificationRequired: false,
        aiWrittenPrompt: normalizeUserInstruction(input.prompt),
        guardrails: [],
        negativePrompt: ""
      },
      promptStrategy: "fixed_guardrail_fallback",
      plannerModel: null,
      aiWrittenPrompt: normalizeUserInstruction(input.prompt),
      guardrails: [],
      negativePrompt: "",
      promptValidation: {
        explicitPermissions,
        warnings: ["AI planner unavailable; used fixed protected edit prompt fallback."],
        patchedGuardrailCount: 0
      }
    };
  }

  const validation = validateAndPatchImageEditPlan(aiPlan.plan, input.prompt);
  const protectedPrompt = buildImageEditProviderPrompt({
    userPrompt: input.prompt,
    plan: aiPlan.plan,
    guardrails: validation.guardrails,
    negativePrompt: validation.negativePrompt
  });

  return {
    protectedPrompt,
    editPlan: aiPlan.plan,
    promptStrategy: "ai_planner",
    plannerModel: aiPlan.model,
    aiWrittenPrompt: aiPlan.plan.aiWrittenPrompt,
    guardrails: validation.guardrails,
    negativePrompt: validation.negativePrompt,
    promptValidation: {
      explicitPermissions: validation.explicitPermissions,
      warnings: validation.warnings,
      patchedGuardrailCount: validation.patchedGuardrailCount
    }
  };
}

async function planImageEditWithAi(input: {
  prompt: string;
  editPreset?: ImageEditPreset;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
}): Promise<{ plan: ImageEditAiPlan; model: string } | null> {
  if (!env.OPENROUTER_API_KEY) {
    return null;
  }

  const model = env.OPENROUTER_PROMPT_COMPOSER_MODEL;
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are the intent planner and prompt writer for a real-estate AI image editor.",
            "Your goal is to convert a user's edit request into a precise image-model prompt that preserves real-world property truth.",
            "Think like a careful editor: identify what the user actually wants changed, what must stay locked, and what guardrails are needed for this specific request.",
            "Protected content includes building architecture, elevation, facade, floor count, windows, balconies, construction progress, camera angle, crop, subject scale, logos, brand marks, RERA/QR/compliance blocks, phone/email/website details, and readable text.",
            "Do not use generic blanket wording as the main solution. Write contextual instructions tied to the user's request.",
            "If the user explicitly asks to change a protected item, allow only that exact item and preserve the rest of the protected content.",
            "If the user asks for space, layout, color, background, or a new box, do not solve it by moving, resizing, redrawing, re-angling, cropping, or changing the building unless they explicitly asked for that.",
            "If the request is ambiguous, preserve protected content and write the safest localized edit.",
            "Return strict JSON only. No markdown, no code fences, no explanations outside JSON.",
            "JSON shape: {\"intentSummary\":\"...\",\"allowedTargets\":[\"...\"],\"protectedTargets\":[\"...\"],\"requiresBuildingChange\":false,\"requiresLogoChange\":false,\"requiresTextComplianceChange\":false,\"requiresLayoutChange\":false,\"riskLevel\":\"low|medium|high\",\"clarificationRequired\":false,\"aiWrittenPrompt\":\"...\",\"guardrails\":[\"...\"],\"negativePrompt\":\"...\"}."
          ].join(" ")
        },
        {
          role: "user",
          content: [
            "Raw user edit instruction:",
            normalizeUserInstruction(input.prompt),
            "",
            "Available technical context:",
            `Edit preset: ${input.editPreset ?? "default"}`,
            `Image edit provider: ${input.provider ?? "default"}`,
            `Image edit model label: ${input.model ?? "default"}`,
            `Canvas width: ${typeof input.width === "number" ? input.width : "unknown"}`,
            `Canvas height: ${typeof input.height === "number" ? input.height : "unknown"}`,
            "",
            "Write the image-model prompt for this exact edit. The prompt must be directly usable by an image edit model."
          ].join("\n")
        }
      ]
    })
  });

  const text = await response.text();
  const parsed = text.length > 0 ? safeParseJson(text) : null;
  if (!response.ok) {
    throw new Error(`Image edit prompt planning failed (${response.status})`);
  }

  const content = extractOpenRouterTextContent(parsed);
  const planPayload = content ? safeParseJson(stripJsonFences(content)) : null;
  const result = ImageEditAiPlanSchema.safeParse(planPayload);
  if (!result.success) {
    throw new Error("Image edit prompt planner returned invalid JSON.");
  }

  return { plan: result.data, model };
}

function validateAndPatchImageEditPlan(plan: ImageEditAiPlan, rawPrompt: string) {
  const explicitPermissions = detectProtectedImageEditPermissions(rawPrompt);
  const warnings: string[] = [];
  const guardrails = dedupeStrings(plan.guardrails);

  const addGuardrail = (value: string) => {
    guardrails.push(value);
  };

  const initialGuardrailCount = guardrails.length;

  if (!explicitPermissions.buildingTruth) {
    if (plan.requiresBuildingChange) {
      warnings.push("Planner marked building changes as required, but the raw user request did not explicitly ask for building/elevation changes.");
    }
    addGuardrail(
      "Do not alter the building/elevation truth: preserve the exact architecture, facade, floor count, windows, balconies, construction progress, materials, camera angle, subject scale, and building position."
    );
  } else {
    addGuardrail(
      "Building/elevation change is allowed only for the exact building detail named by the user; preserve all other architectural and site details."
    );
  }

  if (!explicitPermissions.brandMarks) {
    if (plan.requiresLogoChange) {
      warnings.push("Planner marked logo/brand changes as required, but the raw user request did not explicitly ask for logo or brand mark changes.");
    }
    addGuardrail("Do not remove, redraw, simplify, recolor, resize, or move any logo, wordmark, watermark, or brand mark.");
  } else {
    addGuardrail("Logo/brand change is allowed only for the exact logo or brand mark named by the user; preserve every other brand mark.");
  }

  if (!explicitPermissions.textAndCompliance) {
    if (plan.requiresTextComplianceChange) {
      warnings.push("Planner marked text/compliance changes as required, but the raw user request did not explicitly ask for text, RERA, QR, or contact changes.");
    }
    addGuardrail(
      "Do not alter RERA details, QR codes, compliance blocks, phone numbers, emails, websites, CTAs, headlines, captions, disclaimers, or any existing readable text."
    );
  } else {
    addGuardrail(
      "Text/compliance changes are allowed only for the exact text, RERA, QR, contact, CTA, or compliance item named by the user; preserve all other readable text."
    );
  }

  if (!explicitPermissions.buildingTruth && plan.requiresLayoutChange) {
    addGuardrail(
      "For layout or spacing changes, modify only the named editable non-building element; do not make room by resizing, moving, cropping, reframing, or redrawing the building."
    );
  }

  addGuardrail("Apply only the requested edit. Do not add extra beautification, redesign, cleanup, new objects, or creative reinterpretation.");

  const patchedGuardrails = dedupeStrings(guardrails);
  const negativePrompt = dedupeStrings([
    plan.negativePrompt,
    !explicitPermissions.buildingTruth
      ? "No building redraw, no elevation change, no facade change, no floor-count change, no window/balcony changes, no camera/crop/scale change."
      : "",
    !explicitPermissions.brandMarks ? "No logo or brand mark changes." : "",
    !explicitPermissions.textAndCompliance ? "No RERA, QR, compliance, contact, CTA, headline, caption, or readable text changes." : ""
  ])
    .filter(Boolean)
    .join(" ");

  return {
    explicitPermissions,
    warnings,
    guardrails: patchedGuardrails,
    negativePrompt,
    patchedGuardrailCount: Math.max(0, patchedGuardrails.length - initialGuardrailCount)
  };
}

function buildImageEditProviderPrompt(input: {
  userPrompt: string;
  plan: ImageEditAiPlan;
  guardrails: string[];
  negativePrompt: string;
}) {
  const prompt = [
    "User edit request:",
    normalizeUserInstruction(input.userPrompt),
    "",
    "Interpreted goal:",
    input.plan.intentSummary,
    "",
    "Image edit instruction:",
    input.plan.aiWrittenPrompt,
    "",
    "Allowed edit targets:",
    ...(input.plan.allowedTargets.length > 0 ? input.plan.allowedTargets.map((item) => `- ${item}`) : ["- Only the exact target described by the user."]),
    "",
    "Protected targets for this edit:",
    ...(input.plan.protectedTargets.length > 0 ? input.plan.protectedTargets.map((item) => `- ${item}`) : ["- All image content not named by the user."]),
    "",
    "Mandatory guardrails:",
    ...input.guardrails.map((item) => `- ${item}`),
    "",
    "Negative constraints:",
    input.negativePrompt || "No unrequested changes."
  ].join("\n");

  return prompt.slice(0, 12000);
}

function normalizeUserInstruction(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
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

function stripJsonFences(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseEditorState(value: string | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const parsed = safeParseJson(value);
  return isRecord(parsed) ? parsed : null;
}

function parseAiEditSaveMetadata(value: string | undefined):
  | { ok: true; value: Record<string, unknown> | null }
  | { ok: false; message: string } {
  if (!value) {
    return { ok: true, value: null };
  }

  const parsed = safeParseJson(value);
  const result = AiEditSaveMetadataSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues[0]?.message ?? "aiEditMetadata must be valid AI edit metadata"
    };
  }

  return { ok: true, value: result.data };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function extractAiEditPromptText(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return null;
  }

  const exactInput = isRecord(metadata.exactInput) ? metadata.exactInput : null;
  if (metadata.promptMode === "normal" && exactInput && typeof exactInput.prompt === "string") {
    const prompt = exactInput.prompt.trim();
    return prompt || null;
  }

  if (metadata.promptMode === "list" && exactInput && Array.isArray(exactInput.items)) {
    const prompt = exactInput.items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
    return prompt || null;
  }

  if (metadata.promptMode === "pins" && exactInput) {
    const globalPrompt = typeof exactInput.globalPrompt === "string" ? exactInput.globalPrompt.trim() : "";
    const pinPrompts = Array.isArray(exactInput.pins)
      ? exactInput.pins
          .filter(isRecord)
          .map((pin, index) => {
            const comment = typeof pin.comment === "string" ? pin.comment.trim() : "";
            if (!comment) return "";
            const x = typeof pin.x === "number" ? Math.round(pin.x * 100) : null;
            const y = typeof pin.y === "number" ? Math.round(pin.y * 100) : null;
            return `Pinned edit ${index + 1}${x !== null && y !== null ? ` at x=${x}%, y=${y}%` : ""}: ${comment}`;
          })
          .filter(Boolean)
      : [];
    const prompt = [globalPrompt ? `Global edit context: ${globalPrompt}` : "", ...pinPrompts].filter(Boolean).join("\n");
    return prompt || null;
  }

  if (typeof metadata.submittedPrompt === "string") {
    const prompt = metadata.submittedPrompt.trim();
    return prompt || null;
  }

  return null;
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function getAiEditHistory(metadataJson: Record<string, unknown> | null | undefined) {
  if (!metadataJson) {
    return [];
  }

  if (Array.isArray(metadataJson.aiEditHistory)) {
    return metadataJson.aiEditHistory
      .filter(isRecord)
      .map((item) => cloneRecord(item));
  }

  return isRecord(metadataJson.aiEdit) ? [cloneRecord(metadataJson.aiEdit)] : [];
}

function extractOutputReferenceMetadata(metadataJson: Record<string, unknown> | null | undefined) {
  if (!metadataJson) {
    return {};
  }

  const metadata = cloneRecord(metadataJson);
  const referenceKeys = [
    "reference_asset_ids",
    "reference_storage_paths",
    "provider_reference_asset_ids",
    "provider_reference_storage_paths",
    "render_package"
  ];
  const result: Record<string, unknown> = {};

  for (const key of referenceKeys) {
    if (metadata[key] !== undefined) {
      result[key] = metadata[key];
    }
  }

  return result;
}

async function hydrateAiEditMetadataWithProviderPrompt(
  metadata: Record<string, unknown> | null,
  log?: { warn: (payload: unknown, message?: string) => void }
) {
  if (!metadata) {
    return null;
  }

  if (typeof metadata.protectedPrompt === "string" && metadata.protectedPrompt.trim()) {
    return metadata;
  }

  const jobId = typeof metadata.jobId === "string" ? metadata.jobId : null;
  if (!jobId) {
    return metadata;
  }

  const { data, error } = await supabaseAdmin
    .from("compile_jobs")
    .select("input_brief")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    log?.warn({ error, jobId }, "failed to hydrate ai edit provider prompt");
    return metadata;
  }

  const inputBrief = isRecord(data?.input_brief) ? data.input_brief : null;
  const protectedPrompt = typeof inputBrief?.protectedPrompt === "string" ? inputBrief.protectedPrompt.trim() : "";
  if (!protectedPrompt) {
    return metadata;
  }

  const hydrated: Record<string, unknown> = {
    ...metadata,
    protectedPrompt
  };
  const passthroughKeys = [
    "editPlan",
    "promptStrategy",
    "plannerModel",
    "aiWrittenPrompt",
    "guardrails",
    "negativePrompt",
    "promptValidation"
  ];
  for (const key of passthroughKeys) {
    if (inputBrief && hydrated[key] === undefined && inputBrief[key] !== undefined) {
      hydrated[key] = inputBrief[key];
    }
  }

  return hydrated;
}

async function resolveOriginalGenerationBrief(sourceOutput: EditorSourceOutputRow | null) {
  const sourceMetadata = sourceOutput?.metadata_json ?? null;
  if (sourceMetadata && typeof sourceMetadata.originalGenerationBrief === "string" && sourceMetadata.originalGenerationBrief.trim()) {
    return sourceMetadata.originalGenerationBrief.trim();
  }

  if (!sourceOutput?.deliverable_id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("deliverables")
    .select("brief_text")
    .eq("id", sourceOutput.deliverable_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const briefText = (data as { brief_text?: string | null } | null)?.brief_text;
  return typeof briefText === "string" && briefText.trim() ? briefText.trim() : null;
}

function sanitizeEditorStateForStorage(
  editorState: Record<string, unknown> | null,
  sourceStoragePath: string | null,
  layerStoragePaths: Map<string, string>
): Record<string, unknown> | null {
  if (!editorState) {
    return null;
  }

  const next = cloneRecord(editorState);
  const source = isRecord(next.source) ? next.source : {};

  if (sourceStoragePath) {
    source.storagePath = sourceStoragePath;
  }
  delete source.url;
  next.source = source;

  if (Array.isArray(next.layers)) {
    next.layers = next.layers.map((layer) => {
      if (!isRecord(layer)) {
        return layer;
      }

      if (layer.type !== "image") {
        return layer;
      }

      const layerId = typeof layer.id === "string" ? layer.id : null;
      const storagePath = layerId ? layerStoragePaths.get(layerId) : null;
      if (storagePath) {
        layer.sourceStoragePath = storagePath;
      }
      delete layer.src;
      return layer;
    });
  }

  return next;
}

async function hydrateEditorStateForResponse(metadataJson: Record<string, unknown> | null | undefined) {
  const metadata = cloneRecord(metadataJson ?? {});
  const editorState = isRecord(metadata.editorState) ? metadata.editorState : null;

  if (!editorState) {
    return metadata;
  }

  const source = isRecord(editorState.source) ? editorState.source : null;
  if (source && typeof source.storagePath === "string") {
    const url = await createSignedUrl(source.storagePath).catch(() => null);
    if (url) {
      source.url = url;
    }
  }

  if (Array.isArray(editorState.layers)) {
    await Promise.all(
      editorState.layers.map(async (layer) => {
        if (!isRecord(layer) || layer.type !== "image" || typeof layer.sourceStoragePath !== "string") {
          return;
        }

        const url = await createSignedUrl(layer.sourceStoragePath).catch(() => null);
        if (url) {
          layer.src = url;
        }
      })
    );
  }

  return metadata;
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
    let editorStateValue: string | undefined;
    let aiEditMetadataValue: string | undefined;
    let imagePart: UploadedImagePart | null = null;
    let sourceImagePart: UploadedImagePart | null = null;
    const layerImageParts = new Map<string, UploadedImagePart>();

    for await (const part of request.parts({ limits: { ...multipartLimits(32), parts: 80, fields: 20 } })) {
      if (part.type === "file") {
        const uploadedPart: UploadedImagePart = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer()
        };

        if (part.fieldname === "image") {
          imagePart = uploadedPart;
        }
        if (part.fieldname === "sourceImage") {
          sourceImagePart = uploadedPart;
        }
        if (part.fieldname.startsWith("layerImage:")) {
          const layerId = part.fieldname.slice("layerImage:".length);
          if (layerId) {
            layerImageParts.set(layerId, uploadedPart);
          }
        }

        continue;
      }

      if (part.fieldname === "brandId") brandIdValue = readFieldValue(part.value);
      if (part.fieldname === "saveMode") saveModeValue = readFieldValue(part.value);
      if (part.fieldname === "sourceOutputId") sourceOutputIdValue = readFieldValue(part.value);
      if (part.fieldname === "editorState") editorStateValue = readFieldValue(part.value);
      if (part.fieldname === "aiEditMetadata") aiEditMetadataValue = readFieldValue(part.value);
    }

    if (!imagePart) {
      return reply.badRequest("Saved image is required");
    }

    if (!imagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Saved upload must be an image");
    }
    if (sourceImagePart && !sourceImagePart.mimetype.startsWith("image/")) {
      return reply.badRequest("Editor source upload must be an image");
    }
    for (const part of layerImageParts.values()) {
      if (!part.mimetype.startsWith("image/")) {
        return reply.badRequest("Editor layer uploads must be images");
      }
    }

    const parsedEditorState = parseEditorState(editorStateValue);
    const parsedAiEditMetadata = parseAiEditSaveMetadata(aiEditMetadataValue);
    if (!parsedAiEditMetadata.ok) {
      return reply.badRequest(parsedAiEditMetadata.message);
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
          "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by, metadata_json"
        )
        .eq("id", parsedFields.data.sourceOutputId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      sourceOutput = (data as EditorSourceOutputRow | null) ?? null;
      if (!sourceOutput) {
        return reply.notFound("Source output not found");
      }
      if (sourceOutput && sourceOutput.workspace_id !== workspace.id) {
        return reply.badRequest("Source output does not belong to this workspace");
      }
      if (sourceOutput.brand_id !== brand.id) {
        return reply.badRequest("Source output does not belong to the selected brand");
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

    let editorSourceStoragePath: string | null = null;
    if (sourceImagePart && parsedEditorState) {
      editorSourceStoragePath = buildStoragePath({
        workspaceId: workspace.id,
        brandId: brand.id,
        section: "outputs",
        id: outputId,
        fileName: `editor-source-${sourceImagePart.filename || `${slugify(outputId)}.png`}`
      });
      await uploadBufferToStorage(editorSourceStoragePath, sourceImagePart.buffer, sourceImagePart.mimetype, true);
    } else if (parsedEditorState && isRecord(parsedEditorState.source) && typeof parsedEditorState.source.storagePath === "string") {
      editorSourceStoragePath = parsedEditorState.source.storagePath;
    }

    const editorLayerStoragePaths = new Map<string, string>();
    for (const [layerId, layerPart] of layerImageParts.entries()) {
      const layerStoragePath = buildStoragePath({
        workspaceId: workspace.id,
        brandId: brand.id,
        section: "outputs",
        id: outputId,
        fileName: `editor-layer-${slugify(layerId)}-${layerPart.filename || "image.png"}`
      });
      await uploadBufferToStorage(layerStoragePath, layerPart.buffer, layerPart.mimetype, true);
      editorLayerStoragePaths.set(layerId, layerStoragePath);
    }

    const now = new Date().toISOString();
    const previousAiEditHistory = getAiEditHistory(sourceOutput?.metadata_json ?? null);
    const baseCurrentAiEditMetadata = parsedAiEditMetadata.value
      ? {
          ...cloneRecord(parsedAiEditMetadata.value),
          savedAt: now,
          sourceOutputId: sourceOutput?.id ?? null,
          outputId
        }
      : null;
    const currentAiEditMetadata = await hydrateAiEditMetadataWithProviderPrompt(
      baseCurrentAiEditMetadata,
      request.log
    );
    const aiEditHistory = currentAiEditMetadata
      ? [...previousAiEditHistory, currentAiEditMetadata].slice(-50)
      : previousAiEditHistory.slice(-50);
    const lastAiEditMetadata = currentAiEditMetadata ?? (aiEditHistory.length > 0 ? aiEditHistory[aiEditHistory.length - 1] : null);
    const originalGenerationBrief = await resolveOriginalGenerationBrief(sourceOutput);
    const sourceReferenceMetadata = extractOutputReferenceMetadata(sourceOutput?.metadata_json ?? null);
    const editorStateForStorage = sanitizeEditorStateForStorage(parsedEditorState, editorSourceStoragePath, editorLayerStoragePaths);
    const editorMetadataJson = {
      source: "editor-save",
      saveMode: resolvedMode,
      ...(originalGenerationBrief ? { originalGenerationBrief } : {}),
      ...sourceReferenceMetadata,
      ...(editorStateForStorage ? { editorState: editorStateForStorage } : {}),
      ...(lastAiEditMetadata ? { aiEdit: lastAiEditMetadata, aiEditHistory } : {})
    };

    await uploadBufferToStorage(storagePath, imagePart.buffer, imagePart.mimetype, true);
    const thumbnail = await createThumbnailFromBufferOrNull(storagePath, imagePart.buffer, {
      source: "image_edit_save",
      mimeType: imagePart.mimetype
    });
    const dimensions = await getImageDimensions(imagePart.buffer).catch(() => ({
      width: undefined,
      height: undefined
    }));

    if (resolvedMode === "replace" && sourceOutput) {
      const jobArtifacts = await createEditorSaveArtifacts({
        workspaceId: workspace.id,
        brandId: brand.id,
        deliverableId: sourceOutput.deliverable_id ?? null,
        projectId: sourceOutput.project_id ?? null,
        postTypeId: sourceOutput.post_type_id ?? null,
        creativeTemplateId: sourceOutput.creative_template_id ?? null,
        calendarItemId: sourceOutput.calendar_item_id ?? null,
        sourceOutputId: sourceOutput.id,
        ...(typeof dimensions.width === "number" ? { width: dimensions.width } : {}),
        ...(typeof dimensions.height === "number" ? { height: dimensions.height } : {}),
        createdBy: viewer.userId,
        fileName: imagePart.filename,
        saveMode: resolvedMode,
        aiEditMetadata: currentAiEditMetadata
      });
      const { error } = await supabaseAdmin
        .from("creative_outputs")
        .update({
          job_id: jobArtifacts.jobId,
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
          edited_from_output_id: sourceOutput.edited_from_output_id,
          metadata_json: editorMetadataJson
        })
        .eq("id", sourceOutput.id);

      if (error) {
        throw error;
      }

      if (sourceOutput.deliverable_id && !sourceOutput.post_version_id) {
        await ensurePostVersionForOutput(sourceOutput.id, {
          status: "draft",
          createdBy: viewer.userId
        });
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
        ...(typeof dimensions.width === "number" ? { width: dimensions.width } : {}),
        ...(typeof dimensions.height === "number" ? { height: dimensions.height } : {}),
        createdBy: viewer.userId,
        fileName: imagePart.filename,
        saveMode: resolvedMode,
        aiEditMetadata: currentAiEditMetadata
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
        metadata_json: editorMetadataJson,
        created_by: viewer.userId
      });

      if (error) {
        throw error;
      }

      if (sourceOutput?.deliverable_id) {
        await ensurePostVersionForOutput(outputId, {
          status: "draft",
          createdBy: viewer.userId
        });
      }
    }

    const { data: savedOutput, error: savedOutputError } = await supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by, created_at, metadata_json"
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
    const metadataJson = await hydrateEditorStateForResponse(
      (savedOutput as { metadata_json?: Record<string, unknown> | null }).metadata_json ?? null
    );

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
        createdAt: savedOutput.created_at,
        metadataJson,
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

  app.post("/api/creative/image-edit-plan", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const parsedBody = ImageEditPromptPlanRequestSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues[0]?.message ?? "Invalid image edit plan request");
    }

    const brand = await getBrand(parsedBody.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const resolvedPreset = resolveImageEditPreset(parsedBody.data.editPreset);
    const plan = await createImageEditPromptPlan({
      prompt: parsedBody.data.prompt,
      editPreset: resolvedPreset.editPreset,
      provider: resolvedPreset.provider,
      model: resolvedPreset.model,
      ...(typeof parsedBody.data.width === "number" ? { width: parsedBody.data.width } : {}),
      ...(typeof parsedBody.data.height === "number" ? { height: parsedBody.data.height } : {})
    });

    return {
      prompt: parsedBody.data.prompt,
      protectedPrompt: plan.protectedPrompt,
      editPlan: plan.editPlan,
      promptStrategy: plan.promptStrategy,
      plannerModel: plan.plannerModel,
      aiWrittenPrompt: plan.aiWrittenPrompt,
      guardrails: plan.guardrails,
      negativePrompt: plan.negativePrompt,
      promptValidation: plan.promptValidation
    };
  });

  app.post("/api/creative/image-edit-async", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let brandIdValue: string | undefined;
    let promptValue: string | undefined;
    let editPresetValue: string | undefined;
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
      if (part.fieldname === "editPreset") editPresetValue = readFieldValue(part.value);
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
      editPreset: editPresetValue,
      width: widthValue,
      height: heightValue
    });

    if (!parsedFields.success) {
      return reply.badRequest(parsedFields.error.issues[0]?.message ?? "Invalid image edit request");
    }

    const brand = await getBrand(parsedFields.data.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const endpoint = "/api/creative/image-edit-async";
    let reservationId: string | null = null;
    const resolvedPreset = resolveImageEditPreset(parsedFields.data.editPreset);

    try {
      reservationId = await reserveImageEditCredits({
        workspaceId: brand.workspaceId,
        actorUserId: viewer.userId,
        endpoint
      });
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

    const jobId = randomId();
    const sourceStoragePath = buildStoragePath({
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      section: "outputs",
      id: `image-edit-${jobId}`,
      fileName: imagePart.filename || "source.png"
    });

    try {
      await uploadBufferToStorage(sourceStoragePath, imagePart.buffer, imagePart.mimetype, true);
      const promptPlan = await createImageEditPromptPlan({
        prompt: parsedFields.data.prompt,
        editPreset: resolvedPreset.editPreset,
        provider: resolvedPreset.provider,
        model: resolvedPreset.model,
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
      });

      const jobInput: ImageEditJobInput = {
        type: "image-edit",
        brandId: brand.id,
        workspaceId: brand.workspaceId,
        prompt: parsedFields.data.prompt,
        protectedPrompt: promptPlan.protectedPrompt,
        editPlan: promptPlan.editPlan,
        promptStrategy: promptPlan.promptStrategy,
        plannerModel: promptPlan.plannerModel,
        aiWrittenPrompt: promptPlan.aiWrittenPrompt,
        guardrails: promptPlan.guardrails,
        negativePrompt: promptPlan.negativePrompt,
        promptValidation: promptPlan.promptValidation,
        sourceStoragePath,
        sourceContentType: imagePart.mimetype,
        sourceFileName: imagePart.filename || "source.png",
        actorUserId: viewer.userId ?? null,
        reservationId,
        editPreset: resolvedPreset.editPreset,
        provider: resolvedPreset.provider,
        model: resolvedPreset.model,
        ...(resolvedPreset.quality ? { quality: resolvedPreset.quality } : {}),
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
      };

      const { error: jobError } = await supabaseAdmin
        .from("compile_jobs")
        .insert({
          id: jobId,
          workspace_id: brand.workspaceId,
          brand_id: brand.id,
          status: "pending",
          input_brief: jobInput,
          session_token: request.headers.authorization?.replace("Bearer ", "") || ""
        });

      if (jobError) {
        throw jobError;
      }

      void processImageEditJobLocally({
        jobId,
        log: request.log.child({ jobId, route: "image-edit-async" })
      });

      return { jobId, status: "pending" };
    } catch (error) {
      await releaseImageEditReservationIfPresent({
        reservationId,
        actorUserId: viewer.userId,
        endpoint,
        log: request.log
      });
      request.log.error({ error }, "failed to create async image edit job");
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Unable to start the image edit. Please try again."
      });
    }
  });

  app.get("/api/creative/image-edit-async/:jobId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const { jobId } = request.params as { jobId: string };
    const { data: job, error: jobError } = await supabaseAdmin
      .from("compile_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return reply.notFound();
    }

    const parsedJobInput = AsyncImageEditJobInputSchema.safeParse(job.input_brief);
    if (!parsedJobInput.success || parsedJobInput.data.type !== "image-edit") {
      return reply.notFound();
    }

    const brand = await getBrand(job.brand_id);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    if (job.status === "completed") {
      return {
        status: "completed",
        result: job.result
      };
    }

    if (job.status === "failed") {
      return {
        status: "failed",
        error: job.error_json ?? {
          message: "AI image edit failed. Please try again with a simpler edit or a smaller image."
        }
      };
    }

    return { status: job.status as "pending" | "processing" };
  });

  app.post("/api/creative/image-edit", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    let brandIdValue: string | undefined;
    let promptValue: string | undefined;
    let editPresetValue: string | undefined;
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
      if (part.fieldname === "editPreset") editPresetValue = readFieldValue(part.value);
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
      editPreset: editPresetValue,
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
      const resolvedPreset = resolveImageEditPreset(parsedFields.data.editPreset);
      const promptPlan = await createImageEditPromptPlan({
        prompt: parsedFields.data.prompt,
        editPreset: resolvedPreset.editPreset,
        provider: resolvedPreset.provider,
        model: resolvedPreset.model,
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
      });
      const editInput = {
        prompt: parsedFields.data.prompt,
        image: {
          buffer: imagePart.buffer,
          contentType: imagePart.mimetype,
          fileName: imagePart.filename
        }
      };
      const response = await applyConfiguredImageEdit({
        ...editInput,
        provider: resolvedPreset.provider,
        model: resolvedPreset.model,
        protectedPrompt: promptPlan.protectedPrompt,
        ...(resolvedPreset.quality ? { quality: resolvedPreset.quality } : {}),
        ...(typeof parsedFields.data.width === "number" ? { width: parsedFields.data.width } : {}),
        ...(typeof parsedFields.data.height === "number" ? { height: parsedFields.data.height } : {})
      });

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
