import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import {
  assertWorkspaceRole,
  getActiveBrandProfile,
  getBrand,
  getWorkspaceComplianceSettings,
  listBrandAssets,
  listProjectReraRegistrations
} from "../lib/repository.js";
import { getActiveProjectProfile, getFestival, getPostType, getProject } from "../lib/planning-repository.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { env } from "../lib/config.js";
import { generateFalImages, type FalGeneratedImage } from "../lib/fal.js";
import { generateOpenAiImages } from "../lib/openai-images.js";
import type { OpenAiImageQuality } from "../lib/openai-images.js";
import { createSignedUrl, downloadStorageBlob, ingestRemoteImageToStorage, removeStorageObjects, uploadBufferToStorage } from "../lib/storage.js";
import { buildStoragePath, randomId } from "../lib/utils.js";
import type { AuthenticatedViewer } from "../lib/viewer.js";
import { createThumbnailFromStorageOrNull } from "../lib/thumbnails.js";
import { ensurePostVersionForOutput } from "../lib/deliverable-flow.js";
import { localizeCreativeV3PromptCopy } from "../lib/prompt-localization.js";
import {
  isInsufficientWorkspaceCreditsError,
  releaseWorkspaceCreditReservation,
  reserveWorkspaceCredits,
  settleWorkspaceCreditReservation
} from "../lib/credits.js";

const CopySchema = z.object({
  headline: z.string().optional().nullable(),
  subheadline: z.string().optional().nullable(),
  cta: z.string().optional().nullable()
}).default({});

const CreativeModeSchema = z.enum([
  "auto",
  "image_led",
  "copy_led",
  "asset_led",
  "template_led",
  "proof_led",
  "offer_led",
  "lifestyle_led",
  "brand_led",
  "graphic_led"
]);

const TextStrategySchema = z.enum([
  "auto",
  "render_exact_text",
  "reserve_editable_space",
  "minimal_text",
  "typography_dominant",
  "no_text_visual_only",
  "proof_badges",
  "poster_copy_block"
]);
type CreativeV3TextStrategy = z.infer<typeof TextStrategySchema>;

const ConstructionVisualModeSchema = z.enum(["auto", "actual_progress_reference", "visualized_progress_from_project_truth"]);
const FestivalVisualScopeSchema = z.enum(["auto", "brand_only", "project_supported", "building_led"]);
const CreativeV3RenderPresetSchema = z.enum(["v1_low", "v1_high", "v2_low", "v2_medium", "v2_high"]);

const CreativeV3CompileRequestSchema = z.object({
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  postTypeId: z.string().uuid().optional().nullable(),
  festivalId: z.string().uuid().optional().nullable(),
  brief: z.string().min(10),
  audience: z.string().optional().nullable(),
  format: z.string().default("portrait"),
  variantCount: z.number().int().min(1).max(3).default(1),
  variationStrategy: z.string().default("auto"),
  assetVariation: z.boolean().default(false),
  creativeMode: CreativeModeSchema.default("auto"),
  textStrategy: TextStrategySchema.default("auto"),
  noveltyLevel: z.number().min(0).max(1).default(0.7),
  constructionVisualMode: ConstructionVisualModeSchema.default("auto"),
  constructionProgressPercent: z.number().int().min(25).max(90).default(50),
  festivalVisualScope: FestivalVisualScopeSchema.default("auto"),
  copyMode: z.enum(["auto", "manual"]).default("auto"),
  copyLanguage: z.string().default("en"),
  copy: CopySchema,
  brandPresetId: z.string().optional().nullable(),
  visualTemplateId: z.string().optional().nullable(),
  visualTemplateIds: z.array(z.string()).default([]),
  selectedAssetIds: z.array(z.string().uuid()).default([]),
  renderPreset: CreativeV3RenderPresetSchema.optional().nullable(),
  includeLogo: z.boolean().default(false),
  logoAssetId: z.string().uuid().optional().nullable(),
  additionalLogoAssetIds: z.array(z.string().uuid()).default([]),
  includeReraQr: z.boolean().default(false),
  reraQrAssetId: z.string().uuid().optional().nullable(),
  contactItems: z.array(z.enum(["phone", "email", "website", "whatsapp"])).default([]),
  options: z.record(z.string(), z.unknown()).default({})
});

const CREATIVE_V3_GENERATION_JOBS_TABLE = "creative_v3_generation_jobs";

const CreativeV3BrandPresetMutationSchema = z.object({
  brandId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  presetKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  presetJson: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true)
});

type CreativeV3CompileRequest = z.infer<typeof CreativeV3CompileRequestSchema>;
type CreativeV3BrandPresetMutation = z.infer<typeof CreativeV3BrandPresetMutationSchema>;
type CreativeV3RenderPreset = z.infer<typeof CreativeV3RenderPresetSchema>;
type CreativeV3RenderProvider = "fal" | "openai";
type CreativeV3GeneratedImage = FalGeneratedImage;
type CreativeV3GenerateJobInput = {
  type: "creative-v3-generate";
  body: CreativeV3CompileRequest;
  actorUserId: string | null;
};

const CREATIVE_V3_ASYNC_STALE_MS = 10 * 60 * 1000;

const POST_TYPE_TO_CONTENT_JOB: Record<string, string> = {
  "project-launch": "project_launch",
  "amenity-spotlight": "amenity_spotlight",
  "site-visit-invite": "site_visit",
  "location-advantage": "location_advantage",
  "construction-update": "construction_update",
  "festive-greeting": "festive_greeting",
  ad: "pricing_ad",
  offer: "pricing_ad",
  testimonial: "testimonial_story"
};

function resolveCreativeV3RenderPreset(requestedPreset?: CreativeV3RenderPreset | null): CreativeV3RenderPreset {
  if (env.CREATE_V3_ALLOW_CLIENT_RENDER_PRESET === "1" && requestedPreset) {
    return requestedPreset;
  }
  return env.CREATE_V3_DEFAULT_RENDER_PRESET;
}

function resolveCreativeV3RenderConfig(renderPreset: CreativeV3RenderPreset): {
  renderPreset: CreativeV3RenderPreset;
  provider: CreativeV3RenderProvider;
  model: string;
  quality?: OpenAiImageQuality;
} {
  if (renderPreset === "v1_low") {
    return {
      renderPreset,
      provider: "fal",
      model: env.CREATE_V3_GOOGLE_LOW_MODEL
    };
  }

  if (renderPreset === "v1_high") {
    return {
      renderPreset,
      provider: "fal",
      model: env.CREATE_V3_GOOGLE_HIGH_MODEL
    };
  }

  const qualityByPreset: Record<Extract<CreativeV3RenderPreset, "v2_low" | "v2_medium" | "v2_high">, OpenAiImageQuality> = {
    v2_low: "low",
    v2_medium: "medium",
    v2_high: "high"
  };
  const openAiPreset = renderPreset as Extract<CreativeV3RenderPreset, "v2_low" | "v2_medium" | "v2_high">;

  return {
    renderPreset,
    provider: "openai",
    model: env.CREATE_V3_OPENAI_MODEL || env.OPENAI_FINAL_MODEL,
    quality: qualityByPreset[openAiPreset]
  };
}

function creativeV3GenerationCreditAmount(requestedVariantCount: number) {
  const units = Math.max(0, Math.trunc(requestedVariantCount));
  return units * Math.max(0, env.CREDITS_FINAL_PER_IMAGE);
}

function insufficientCreativeV3CreditsMessage(error: unknown) {
  if (isInsufficientWorkspaceCreditsError(error)) {
    if (typeof error.required === "number" && typeof error.available === "number") {
      return `Not enough credits. Required ${error.required}, available ${error.available}.`;
    }

    return "Not enough credits for this V3 generation.";
  }

  return "Not enough credits for this V3 generation.";
}

async function reserveCreativeV3GenerationCredits(params: {
  workspaceId: string;
  jobId: string;
  actorUserId: string | null;
  requestedVariantCount: number;
}) {
  const amount = creativeV3GenerationCreditAmount(params.requestedVariantCount);
  if (amount <= 0) {
    return null;
  }

  const reservation = await reserveWorkspaceCredits({
    workspaceId: params.workspaceId,
    source: "creative_v3_generation",
    sourceRef: params.jobId,
    amount,
    actorUserId: params.actorUserId,
    metadata: {
      endpoint: "/api/creative-v3/generate-async",
      requestedVariantCount: params.requestedVariantCount
    }
  });

  return reservation.reservationId;
}

async function settleCreativeV3ReservationIfPresent(
  reservationId: string | null | undefined,
  metadata?: Record<string, unknown>
) {
  if (!reservationId) {
    return;
  }

  await settleWorkspaceCreditReservation({
    reservationId,
    metadata: metadata ?? {}
  });
}

async function releaseCreativeV3ReservationIfPresent(params: {
  reservationId: string | null | undefined;
  actorUserId: string | null;
  note: string;
  metadata?: Record<string, unknown>;
  log?: FastifyBaseLogger;
}) {
  if (!params.reservationId) {
    return;
  }

  try {
    await releaseWorkspaceCreditReservation({
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      note: params.note,
      metadata: params.metadata ?? {}
    });
  } catch (error) {
    params.log?.warn({ error, reservationId: params.reservationId }, "failed to release creative v3 credit reservation");
  }
}

function resolveCreativeV3FalModelForReferences(model: string, referenceCount: number) {
  return referenceCount === 0 ? model.replace(/\/edit\/?$/, "") : model;
}

const FORMAT_TO_NOTEBOOK: Record<string, string> = {
  portrait: "4:5",
  square: "1:1",
  story: "9:16",
  landscape: "16:9"
};

function toNotebookFormat(format: string) {
  return FORMAT_TO_NOTEBOOK[format] ?? format;
}

function toContentJobId(postTypeCode?: string | null) {
  if (!postTypeCode) return null;
  return POST_TYPE_TO_CONTENT_JOB[postTypeCode] ?? postTypeCode.replaceAll("-", "_");
}

function normalizeAssetForEngine(asset: Awaited<ReturnType<typeof listBrandAssets>>[number]) {
  const metadata = asset.metadataJson ?? {};
  const description =
    asset.assetDescription ??
    (typeof metadata.assetDescription === "string" ? metadata.assetDescription : null) ??
    (typeof metadata.description === "string" ? metadata.description : null) ??
    (typeof metadata.notes === "string" ? metadata.notes : null);
  const tags = Array.isArray(metadata.tags) ? metadata.tags.map((tag) => String(tag).toLowerCase()) : [];
  const storagePath = asset.storagePath ?? "";
  const inferredTruthStatus =
    asset.truthStatus ??
    (typeof metadata.truthStatus === "string"
      ? metadata.truthStatus
      : tags.includes("render")
        ? "render"
        : null);

  return {
    asset_id: asset.id,
    project_id: asset.projectId ?? null,
    label: asset.label,
    role: asset.kind,
    storage_path: storagePath,
    description,
    truth_status: inferredTruthStatus,
    scene_type:
      asset.sceneType ??
      (typeof metadata.sceneType === "string" ? metadata.sceneType : null) ??
      (typeof metadata.subjectType === "string" ? metadata.subjectType : null) ??
      (typeof metadata.assetClass === "string" ? metadata.assetClass : null),
    visual_use:
      asset.visualUse ??
      (typeof metadata.visualUse === "string" ? metadata.visualUse : null) ??
      (typeof metadata.usageIntent === "string" ? metadata.usageIntent : null),
    safe_claims: asset.safeClaims ?? [],
    do_not_claim: asset.doNotClaim ?? [],
    visual_analysis: firstVisualAnalysis(metadata),
    visualAnalysis: firstVisualAnalysis(metadata),
    is_image: isImageStoragePath(storagePath),
    file_type: fileTypeFromStoragePath(storagePath),
    metadata
  };
}

function firstVisualAnalysis(metadata: Record<string, any>) {
  const keys = [
    "visualAnalysis",
    "visual_analysis",
    "assetAnalysis",
    "asset_analysis",
    "imageAnalysis",
    "image_analysis",
    "aiAnalysis",
    "ai_analysis",
    "vision",
    "analysis"
  ];
  for (const key of keys) {
    const value = metadata[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function isImageStoragePath(storagePath?: string | null) {
  return Boolean(storagePath && /\.(png|jpe?g|webp)$/i.test(storagePath));
}

function fileTypeFromStoragePath(storagePath?: string | null) {
  const match = storagePath?.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}

function isRenderableImageAsset(asset: Awaited<ReturnType<typeof listBrandAssets>>[number]) {
  return isImageStoragePath(asset.storagePath);
}

function selectReraRegistrationForProject(
  registrations: Awaited<ReturnType<typeof listProjectReraRegistrations>>,
  projectId?: string | null
) {
  if (projectId) {
    return (
      registrations.find((registration) => registration.projectId === projectId && registration.isDefault && registration.qrAssetId) ??
      registrations.find((registration) => registration.projectId === projectId && registration.qrAssetId)
    );
  }

  return registrations.find((registration) => registration.isDefault && registration.qrAssetId) ?? registrations.find((registration) => registration.qrAssetId);
}

async function createReraComplianceBlockReference(params: {
  workspaceId: string;
  brandId: string;
  projectId?: string | null;
  qrAsset: Awaited<ReturnType<typeof listBrandAssets>>[number];
  registration: NonNullable<ReturnType<typeof selectReraRegistrationForProject>>;
}) {
  const settings = await getWorkspaceComplianceSettings(params.workspaceId);
  const qrBlob = await downloadStorageBlob(params.qrAsset.storagePath);
  const qrBuffer = Buffer.from(await qrBlob.arrayBuffer());
  const png = await renderReraComplianceBlockPng({
    authorityLabel: settings.reraAuthorityLabel,
    registrationNumber: params.registration.registrationNumber ?? "QR only",
    websiteUrl: settings.reraWebsiteUrl,
    textColor: settings.reraTextColor,
    qrBuffer
  });
  const path = [
    "generated",
    "creative-v3",
    "rera-blocks",
    params.workspaceId,
    params.brandId,
    params.projectId ?? "brand",
    `${params.registration.id}.png`
  ].join("/");

  await uploadBufferToStorage(path, png, "image/png", true);
  return {
    storagePath: path,
    registrationNumber: params.registration.registrationNumber,
    authorityLabel: settings.reraAuthorityLabel,
    websiteUrl: settings.reraWebsiteUrl,
    textColor: settings.reraTextColor
  };
}

async function renderReraComplianceBlockPng(params: {
  authorityLabel: string;
  registrationNumber: string;
  websiteUrl: string;
  textColor: string;
  qrBuffer: Buffer;
}) {
  const width = 420;
  const height = 92;
  const paddingX = 8;
  const qrSize = 66;
  const qrX = width - qrSize - paddingX;
  const textMaxWidth = qrX - paddingX - 12;
  const qrPng = await sharp(params.qrBuffer)
    .resize(qrSize, qrSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const safeAuthority = escapeSvgText(params.authorityLabel);
  const safeRegistration = escapeSvgText(params.registrationNumber);
  const safeWebsite = escapeSvgText(params.websiteUrl);
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(params.textColor) ? params.textColor : "#111111";
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="none"/>
      <text x="${paddingX}" y="18" fill="${safeColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing=".4">${safeAuthority} REG NO.:</text>
      <line x1="132" y1="18" x2="${textMaxWidth}" y2="18" stroke="${safeColor}" stroke-width="2" stroke-linecap="round"/>
      <text x="${paddingX}" y="48" fill="${safeColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="27" font-weight="800">${safeRegistration}</text>
      <text x="${paddingX}" y="70" fill="${safeColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="11" font-weight="700">${safeWebsite}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .composite([{ input: qrPng, left: qrX, top: 13 }])
    .png()
    .toBuffer();
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function listCreativeV3BrandPresets(params: {
  workspaceId: string;
  brandId: string;
  projectId?: string | null;
  activeOnly?: boolean;
}) {
  let query = supabaseAdmin
    .from("creative_v3_brand_presets")
    .select("id, preset_key, name, description, preset_json, project_id, active, created_at, updated_at")
    .eq("workspace_id", params.workspaceId)
    .eq("brand_id", params.brandId)
    .order("created_at", { ascending: true });

  if (params.activeOnly !== false) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter((row: any) => !row.project_id || !params.projectId || row.project_id === params.projectId)
    .map((row: any) => ({
      preset_id: row.preset_key,
      db_id: row.id,
      name: row.name,
      description: row.description,
      preset_json: row.preset_json ?? {},
      project_id: row.project_id,
      active: row.active,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
}

async function assertCreativeV3PresetRelations(params: {
  viewer: AuthenticatedViewer;
  log: FastifyBaseLogger;
  payload: Pick<CreativeV3BrandPresetMutation, "brandId" | "projectId">;
  roles?: Array<"owner" | "admin" | "editor" | "viewer">;
}) {
  const brand = await getBrand(params.payload.brandId);
  await assertWorkspaceRole(params.viewer, brand.workspaceId, params.roles ?? ["owner", "admin", "editor"], params.log);
  if (params.payload.projectId) {
    const project = await getProject(params.payload.projectId);
    if (project.workspaceId !== brand.workspaceId || project.brandId !== brand.id) {
      throw new Error("Project does not belong to the selected brand/workspace");
    }
  }
  return brand;
}

function slugifyPresetKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || `preset_${Date.now()}`;
}

const CREATIVE_V3_PRESET_CONTACT_ITEMS = new Set(["phone", "email", "website", "whatsapp"]);
const CREATIVE_V3_PRESET_POSITIONS = new Set([
  "top_left",
  "top_right",
  "top_center",
  "top_left_near_primary",
  "bottom_left",
  "bottom_right",
  "bottom_center",
  "bottom_footer",
  "center",
  "left",
  "right"
]);

function validateCreativeV3BrandPresetConfig(params: {
  presetKey: string;
  name: string;
  description?: string | null;
  presetJson: Record<string, unknown>;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const json = params.presetJson;
  const logo = pickPresetSection(json, "logo", "logo_layer");
  const secondaryLogo = pickPresetSection(json, "secondary_logo", "secondary_logo_layer");
  const additionalLogos = collectPresetAdditionalLogoSections(json);
  const contact = pickPresetSection(json, "contact", "contact_layer");
  const location = pickPresetSection(json, "location", "location_layer");
  const clientRules = Array.isArray(json.client_rules) ? json.client_rules.map(String) : [];
  const text = [params.presetKey, params.name, params.description ?? "", ...clientRules].join("\n").toLowerCase();

  if (logo?.required && !logo.position) {
    errors.push("Required primary logo is missing a position.");
  }
  validatePresetPosition(errors, warnings, "logo.position", logo?.position);

  if (secondaryLogo?.required) {
    if (!secondaryLogo.position) errors.push("Required secondary logo is missing a position.");
    if (!secondaryLogo.brand_mark) warnings.push("Required secondary logo has no brand_mark; asset matching may be ambiguous.");
  }
  validatePresetPosition(errors, warnings, "secondary_logo.position", secondaryLogo?.position);

  additionalLogos.forEach((additionalLogo, index) => {
    const label = `additional_logos[${index}].position`;
    if (additionalLogo.required) {
      if (!additionalLogo.position) errors.push(`Required additional logo ${index + 1} is missing a position.`);
      if (!additionalLogo.brand_mark && !additionalLogo.brandMark && !additionalLogo.asset_id) {
        warnings.push(`Required additional logo ${index + 1} has no brand_mark or asset_id; asset matching may be ambiguous.`);
      }
    }
    validatePresetPosition(errors, warnings, label, additionalLogo.position);
  });

  if (location?.required && !location.position) {
    errors.push("Required location layer is missing a position.");
  }
  validatePresetPosition(errors, warnings, "location.position", location?.position);
  validatePresetPosition(errors, warnings, "location.fallback_position_without_contact", location?.fallback_position_without_contact);

  if (contact) {
    validatePresetPosition(errors, warnings, "contact.position", contact.position);
    if (Array.isArray(contact.items)) {
      for (const item of contact.items) {
        if (!CREATIVE_V3_PRESET_CONTACT_ITEMS.has(String(item))) {
          errors.push(`Unsupported contact item "${String(item)}".`);
        }
      }
    } else if (contact.required || contact.include_if_grounded) {
      warnings.push("Contact layer is enabled but contact.items is not an array.");
    }
  }

  if (logo?.position && secondaryLogo?.position && logo.position === secondaryLogo.position) {
    warnings.push(`Primary and secondary logos share the same exact position "${String(logo.position)}".`);
  }
  for (const [index, additionalLogo] of additionalLogos.entries()) {
    if (logo?.position && additionalLogo.position && logo.position === additionalLogo.position) {
      warnings.push(`Primary logo and additional logo ${index + 1} share the same exact position "${String(logo.position)}".`);
    }
  }

  expectPresetPositionFromText(errors, text, logo, "logo", "top-right", "top_right");
  expectPresetPositionFromText(errors, text, logo, "logo", "top-left", "top_left");
  expectPresetPositionFromText(errors, text, secondaryLogo, "secondary logo", "top-left", "top_left");
  expectPresetPositionFromText(errors, text, location, "location", "bottom-left", "bottom_left");
  expectPresetPositionFromText(errors, text, location, "location", "bottom-center", "bottom_center");
  expectPresetPositionFromText(errors, text, contact, "contact", "bottom-right", "bottom_right");
  expectPresetPositionFromText(errors, text, contact, "contact number", "bottom-right", "bottom_right");

  return { errors, warnings };
}

function pickPresetSection(json: Record<string, unknown>, key: string, fallbackKey: string) {
  const value = json[key];
  if (isPlainRecord(value)) return value;
  const fallback = json[fallbackKey];
  return isPlainRecord(fallback) ? fallback : null;
}

function collectPresetAdditionalLogoSections(json: Record<string, unknown>) {
  return ["additional_logos", "additional_logo_layers", "logo_layers"].flatMap((key) => {
    const value = json[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => {
      if (!isPlainRecord(item)) return false;
      const role = String(item.role ?? item.slot ?? item.kind ?? "").trim().toLowerCase();
      return role !== "primary" && role !== "primary_logo" && role !== "main_logo" && role !== "logo" && item.primary !== true;
    });
  });
}

function validatePresetPosition(errors: string[], warnings: string[], field: string, value: unknown) {
  if (!value) return;
  if (!CREATIVE_V3_PRESET_POSITIONS.has(String(value))) {
    warnings.push(`${field} uses non-standard position "${String(value)}".`);
  }
}

function expectPresetPositionFromText(
  errors: string[],
  text: string,
  rules: Record<string, unknown> | null,
  subject: string,
  phrase: string,
  expected: string
) {
  if (!rules || !textSaysPresetSubjectPosition(text, subject, phrase)) return;
  const position = typeof rules.position === "string" ? rules.position : null;
  if (position && !presetPositionMatches(position, expected)) {
    errors.push(`Text says ${subject} should be ${phrase}, but JSON has position "${position}".`);
  }
}

function textSaysPresetSubjectPosition(text: string, subject: string, phrase: string) {
  const escapedSubject = escapeRegExp(subject).replaceAll("\\ ", "\\s+");
  const escapedPhrase = escapeRegExp(phrase).replaceAll("\\-", "[-\\s]");
  return new RegExp(`${escapedSubject}[^.\\n]{0,90}${escapedPhrase}`, "i").test(text);
}

function presetPositionMatches(actual: string, expected: string) {
  if (actual === expected) return true;
  return expected === "top_left" && actual.startsWith("top_left");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function presetReraTriggerApplies(
  presetJson: Record<string, any>,
  params: { brief: string; project: unknown; postTypeCode: string | null }
) {
  const reraRules = isPlainRecord(presetJson.rera_qr)
    ? presetJson.rera_qr
    : isPlainRecord(presetJson.rera_qr_layer)
      ? presetJson.rera_qr_layer
      : null;
  if (reraPresetIsDisabled(presetJson)) {
    return false;
  }
  const triggerTypes = Array.isArray(reraRules?.trigger_required_when_fact_types)
    ? reraRules.trigger_required_when_fact_types
    : Array.isArray(reraRules?.required_when_fact_types)
      ? reraRules.required_when_fact_types
      : [];
  const triggers = new Set(triggerTypes.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  if (triggers.size === 0) return false;

  const brief = params.brief.toLowerCase();
  if (triggers.has("project") && params.project) return true;
  if (triggers.has("typology") && /\b(?:[1-9]\s*(?:bhk|bed)|typology|configuration|apartment|flat|residence|villa)\b/i.test(brief)) return true;
  if (triggers.has("pricing") && (params.postTypeCode === "pricing-ad" || /\b(?:price|pricing|emi|offer|starting at|starting from|lakh|lac|crore|cr)\b|₹|rs\.?|inr/i.test(brief))) return true;
  return false;
}

function reraPresetIsDisabled(presetJson: Record<string, any>) {
  const reraRules = isPlainRecord(presetJson.rera_qr)
    ? presetJson.rera_qr
    : isPlainRecord(presetJson.rera_qr_layer)
      ? presetJson.rera_qr_layer
      : null;
  return reraRules?.mode === "disabled" || reraRules?.enabled === false || reraRules?.disabled === true;
}

async function listCreativeV3VisualTemplates(params: {
  workspaceId: string;
  brandId: string;
  projectId?: string | null;
  postTypeId?: string | null;
  contentJobId?: string | null;
  format?: string | null;
}) {
  const [catalogResult, workspaceResult] = await Promise.all([
    supabaseAdmin
      .from("creative_v3_visual_template_catalog")
      .select("id, template_key, name, description, content_job_id, allowed_formats, lever_signature, template_json, status, preview_storage_path")
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("creative_v3_visual_templates")
      .select("id, template_key, name, description, content_job_id, allowed_formats, lever_signature, template_json, brand_id, project_id, post_type_id")
      .eq("workspace_id", params.workspaceId)
      .eq("status", "approved")
      .order("created_at", { ascending: true })
  ]);

  if (workspaceResult.error) {
    throw workspaceResult.error;
  }

  const rowsByKey = new Map<string, any>();
  if (catalogResult.error) {
    if (catalogResult.error.code !== "42P01") {
      throw catalogResult.error;
    }
    // Backward compatibility for deployments before the catalog migration.
  } else {
    for (const row of catalogResult.data ?? []) {
      rowsByKey.set(row.template_key, row);
    }
  }
  for (const row of workspaceResult.data ?? []) {
    if (row.brand_id && row.brand_id !== params.brandId) continue;
    if (row.project_id && row.project_id !== params.projectId) continue;
    if (row.post_type_id && row.post_type_id !== params.postTypeId) continue;
    rowsByKey.set(row.template_key, row);
  }

  return [...rowsByKey.values()]
    .filter((row: any) => !params.contentJobId || !row.content_job_id || row.content_job_id === params.contentJobId)
    .filter((row: any) => !params.format || !Array.isArray(row.allowed_formats) || row.allowed_formats.length === 0 || row.allowed_formats.includes(params.format))
    .map((row: any) => ({
      template_id: row.template_key,
      db_id: row.id,
      name: row.name,
      description: row.description,
      content_job_id: row.content_job_id,
      formats: Array.isArray(row.allowed_formats) ? row.allowed_formats : [],
      lever_signature: row.lever_signature ?? {},
      template_json: row.template_json ?? {},
      preview_storage_path: row.preview_storage_path ?? null
    }));
}

class PromptEngineHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PromptEngineHttpError";
  }
}

async function callPromptEngineV3(payload: Record<string, unknown>) {
  if (!env.PROMPT_ENGINE_V3_URL) {
    throw new Error("PROMPT_ENGINE_V3_URL is required for Creative V3 compile.");
  }

  const baseUrl = env.PROMPT_ENGINE_V3_URL.replace(/\/+$/, "");
  try {
    return await callPromptEngineV3Async(baseUrl, payload);
  } catch (error) {
    if (error instanceof PromptEngineHttpError && [404, 405].includes(error.status)) {
      return callPromptEngineV3Sync(baseUrl, payload);
    }
    throw error;
  }
}

async function callPromptEngineV3Sync(baseUrl: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.PROMPT_ENGINE_V3_TIMEOUT_SEC * 1000);
  timeout.unref?.();

  try {
    const response = await fetch(`${baseUrl}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) : null;
    if (!response.ok) {
      const message = parsed && typeof parsed === "object" && "detail" in parsed ? JSON.stringify(parsed.detail) : raw;
      throw new Error(`Prompt engine V3 failed with ${response.status}: ${message}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function callPromptEngineV3Async(baseUrl: string, payload: Record<string, unknown>) {
  const timeoutSeconds = env.PROMPT_ENGINE_V3_TIMEOUT_SEC;
  const deadline = Date.now() + timeoutSeconds * 1000;
  const start = await fetchPromptEngineJson(`${baseUrl}/compile-async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!start.response.ok) {
    throw new PromptEngineHttpError(
      `Prompt engine V3 async start failed with ${start.response.status}: ${extractPromptEngineError(start.parsed, start.raw)}`,
      start.response.status
    );
  }

  const jobId = readStringField(start.parsed, "job_id") ?? readStringField(start.parsed, "jobId");
  if (!jobId) {
    throw new Error("Prompt engine V3 async start did not return a job id.");
  }

  const statusUrl = `${baseUrl}/compile-async/${encodeURIComponent(jobId)}`;
  while (Date.now() < deadline) {
    await delay(2000);
    const statusResponse = await fetchPromptEngineJson(statusUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!statusResponse.response.ok) {
      throw new PromptEngineHttpError(
        `Prompt engine V3 async status failed with ${statusResponse.response.status}: ${extractPromptEngineError(
          statusResponse.parsed,
          statusResponse.raw
        )}`,
        statusResponse.response.status
      );
    }

    const status = readStringField(statusResponse.parsed, "status");
    if (status === "completed") {
      if (!isPlainObject(statusResponse.parsed) || !("result" in statusResponse.parsed)) {
        throw new Error("Prompt engine V3 async job completed without a result.");
      }
      return statusResponse.parsed.result;
    }

    if (status === "failed") {
      throw new Error(`Prompt engine V3 async job failed: ${extractPromptEngineError(statusResponse.parsed, statusResponse.raw)}`);
    }

    if (!["queued", "running", "pending", "processing"].includes(status ?? "")) {
      throw new Error(`Prompt engine V3 async job returned unknown status: ${status ?? "missing"}`);
    }
  }

  throw new Error(`Prompt engine V3 async job timed out after ${timeoutSeconds}s.`);
}

async function fetchPromptEngineJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  timeout.unref?.();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const raw = await response.text();

    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        if (response.ok) {
          throw new Error(`Prompt engine V3 returned invalid JSON from ${url}: ${raw.slice(0, 500)}`);
        }
      }
    }

    return { response, raw, parsed };
  } finally {
    clearTimeout(timeout);
  }
}

function extractPromptEngineError(parsed: unknown, raw: string) {
  if (isPlainObject(parsed)) {
    const error = parsed.error;
    if (typeof error === "string") {
      return error;
    }
    if (isPlainObject(error) && typeof error.message === "string") {
      return error.message;
    }
    const detail = parsed.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  }

  return raw.slice(0, 500);
}

function readStringField(value: unknown, key: string) {
  if (!isPlainObject(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCreativeV3CompileUserInputError(message: string) {
  return (
    message.includes("does not belong") ||
    message.includes("Choose a festival before creating a festive greeting.")
  );
}

async function localizeCreativeV3EngineResponse(params: {
  engineResponse: unknown;
  body: CreativeV3CompileRequest;
  brandName: string;
  projectName?: string | null;
  log: FastifyBaseLogger;
}) {
  if (!isPlainObject(params.engineResponse) || !Array.isArray(params.engineResponse.variants)) {
    return params.engineResponse;
  }

  try {
    return await localizeCreativeV3PromptCopy(params.engineResponse, {
      targetLanguageCode: params.body.copyLanguage,
      copyMode: params.body.copyMode,
      brandName: params.brandName,
      projectName: params.projectName ?? null
    });
  } catch (error) {
    params.log.warn({ error }, "failed to localize creative v3 prompt copy");
    return {
      ...params.engineResponse,
      debug: {
        ...(isPlainObject(params.engineResponse.debug) ? params.engineResponse.debug : {}),
        promptLocalization: {
          applied: false,
          reason: "localization-error",
          targetLanguage: params.body.copyLanguage,
          error: error instanceof Error ? error.message : "Unknown localization error"
        }
      }
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCreativeV3ColorPaletteOption(params: {
  raw: unknown;
  selectedPresetJson: Record<string, any>;
  brandProfile: unknown;
}) {
  const raw = isPlainObject(params.raw) ? params.raw : {};
  const mode = ["auto", "brand", "preset", "curated", "custom"].includes(String(raw.mode))
    ? String(raw.mode)
    : "auto";
  const strength = raw.strength === "hard" || raw.locked === true ? "hard" : "soft";
  const customColors = extractCreativeV3PaletteColors(raw.colors);
  const brandColors = extractCreativeV3PaletteColors(extractCreativeV3PaletteSource(params.brandProfile));
  const presetColors = extractCreativeV3PaletteColors(extractCreativeV3PaletteSource(params.selectedPresetJson));
  const colors = mode === "custom" || mode === "curated"
    ? customColors
    : mode === "brand"
      ? brandColors
      : mode === "preset"
        ? presetColors
        : [];
  return {
    mode,
    strength,
    locked: strength === "hard",
    source: mode,
    palette_id: typeof raw.paletteId === "string" ? raw.paletteId : null,
    palette_name: typeof raw.paletteName === "string" ? raw.paletteName : null,
    colors: colors.slice(0, 8)
  };
}

function extractCreativeV3PaletteSource(value: unknown): unknown {
  if (!isPlainObject(value)) return null;
  return value.palette ?? value.colorPalette ?? value.colors ?? null;
}

function extractCreativeV3PaletteColors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeCreativeV3HexColor).filter((color): color is string => Boolean(color))));
  }
  if (!isPlainObject(value)) {
    const color = normalizeCreativeV3HexColor(value);
    return color ? [color] : [];
  }
  return Array.from(new Set(
    Object.values(value).flatMap((item) => extractCreativeV3PaletteColors(item))
  ));
}

function normalizeCreativeV3HexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  const hex = match?.[1];
  return hex ? `#${hex.toUpperCase()}` : null;
}

async function runCreativeV3Compile(params: {
  body: CreativeV3CompileRequest;
  viewer: AuthenticatedViewer;
  log: FastifyBaseLogger;
}) {
  const body = params.body;
  const brand = await getBrand(body.brandId);
  await assertWorkspaceRole(params.viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], params.log);

  const [brandProfileVersion, assets, project, postType, festival, reraRegistrations, workspaceComplianceSettings] = await Promise.all([
    getActiveBrandProfile(brand.id).catch(() => null),
    listBrandAssets(brand.id),
    body.projectId ? getProject(body.projectId) : Promise.resolve(null),
    body.postTypeId ? getPostType(body.postTypeId) : Promise.resolve(null),
    body.festivalId ? getFestival(body.festivalId) : Promise.resolve(null),
    listProjectReraRegistrations(brand.workspaceId, brand.id).catch(() => []),
    getWorkspaceComplianceSettings(brand.workspaceId).catch(() => null)
  ]);

  if (project && (project.workspaceId !== brand.workspaceId || project.brandId !== brand.id)) {
    throw new Error("Project does not belong to the selected brand/workspace");
  }

  if (postType?.workspaceId && postType.workspaceId !== brand.workspaceId) {
    throw new Error("Post type does not belong to the selected workspace");
  }

  if (festival?.workspaceId && festival.workspaceId !== brand.workspaceId) {
    throw new Error("Festival does not belong to the selected workspace");
  }

  if (postType?.code === "festive-greeting" && !festival) {
    throw new Error("Choose a festival before creating a festive greeting.");
  }

  const projectProfile = project ? await getActiveProjectProfile(project.id).catch(() => null) : null;
  const [brandPresets, visualTemplates] = await Promise.all([
    listCreativeV3BrandPresets({
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      projectId: project?.id ?? null
    }).catch((error) => {
      params.log.warn({ error }, "failed to load creative v3 brand presets");
      return [];
    }),
    listCreativeV3VisualTemplates({
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      projectId: project?.id ?? null,
      postTypeId: postType?.id ?? null
    }).catch((error) => {
      params.log.warn({ error }, "failed to load creative v3 visual templates");
      return [];
    })
  ]);
  const projectLogoAssetId = project
    ? assets.find((asset) => asset.kind === "logo" && asset.projectId === project.id)?.id ?? null
    : null;
  const brandLogoAssetId = assets.find((asset) => asset.kind === "logo" && asset.projectId == null)?.id ?? null;
  const anyLogoAssetId = assets.find((asset) => asset.kind === "logo")?.id ?? null;
  const logoAssetId = body.logoAssetId ?? projectLogoAssetId ?? brandLogoAssetId ?? anyLogoAssetId ?? null;
  const selectedReraRegistration = selectReraRegistrationForProject(reraRegistrations, project?.id ?? null);
  const reraQrAssetId =
    body.reraQrAssetId ??
    selectedReraRegistration?.qrAssetId ??
    assets.find((asset) => asset.kind === "rera_qr" && (project ? asset.projectId === project.id || asset.projectId == null : true))?.id ??
    null;
  const selectedAssetIds = body.selectedAssetIds.length > 0 ? body.selectedAssetIds : [];
  const selectedPreset = body.brandPresetId
    ? brandPresets.find((preset) => preset.preset_id === body.brandPresetId || preset.db_id === body.brandPresetId)
    : null;
  const selectedPresetJson =
    selectedPreset?.preset_json && typeof selectedPreset.preset_json === "object"
      ? selectedPreset.preset_json as Record<string, any>
      : {};
  const presetRequiresLogo = Boolean(selectedPresetJson.logo?.required || selectedPresetJson.logo_layer?.required);
  const presetDisablesReraQr = reraPresetIsDisabled(selectedPresetJson);
  const presetRequiresReraQr = !presetDisablesReraQr && Boolean(selectedPresetJson.rera_qr?.required || selectedPresetJson.rera_qr_layer?.required);
  const presetTriggersReraQr = !presetDisablesReraQr && presetReraTriggerApplies(selectedPresetJson, {
    brief: body.brief,
    project,
    postTypeCode: postType?.code ?? null
  });
  const effectiveIncludeLogo = body.includeLogo || Boolean(body.logoAssetId) || presetRequiresLogo;
  const effectiveIncludeReraQr = presetDisablesReraQr
    ? false
    : body.includeReraQr || Boolean(body.reraQrAssetId) || presetRequiresReraQr || presetTriggersReraQr;
  const requestedAdditionalLogoAssetIds = Array.from(new Set(body.additionalLogoAssetIds.filter((assetId) => assetId !== logoAssetId)));
  const additionalLogoAssetIds = filterAdditionalLogoAssetIdsForPreset({
    requestedAdditionalLogoAssetIds,
    selectedPresetJson,
    log: params.log
  });
  const presetContactItems = Array.isArray(selectedPresetJson.contact?.items)
    ? selectedPresetJson.contact.items.map(String).filter(Boolean)
    : [];
  const effectiveContactItems = body.contactItems.length > 0 ? body.contactItems : presetContactItems;
  const explicitlyRequestedLayerIds = new Set([
    logoAssetId,
    ...additionalLogoAssetIds,
    reraQrAssetId
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
  const engineAssets = assets.filter((asset) => {
    if (selectedAssetIds.includes(asset.id)) return true;
    if (explicitlyRequestedLayerIds.has(asset.id)) return true;
    if (project) return asset.projectId === project.id || asset.projectId == null;
    return asset.projectId == null;
  });
  const effectiveAssetVariation = body.variantCount > 1 && body.assetVariation && selectedAssetIds.length === 0;
  const effectiveTextStrategy = resolveEffectiveTextStrategy(body);
  const selectedColorPalette = normalizeCreativeV3ColorPaletteOption({
    raw: body.options.colorPalette ?? body.options.color_palette,
    selectedPresetJson,
    brandProfile: brandProfileVersion?.profile ?? null
  });

  const enginePayload = {
    capability: "image_prompt_generation",
    brand_id: brand.id,
    project_id: project?.id ?? null,
    festival_id: festival?.id ?? null,
    content_job_id: toContentJobId(postType?.code),
    format: toNotebookFormat(body.format),
    brief: body.brief,
    audience: body.audience ?? null,
    variant_count: body.variantCount,
    variation_strategy: body.variationStrategy,
    asset_variation: effectiveAssetVariation,
    creative_mode: body.creativeMode,
    text_strategy: effectiveTextStrategy,
    novelty_level: body.noveltyLevel,
    construction_visual_mode: body.constructionVisualMode,
    construction_progress_percent: body.constructionProgressPercent,
    festival_visual_scope: body.festivalVisualScope,
    copy_mode: body.copyMode,
    copy_language: body.copyLanguage,
    copy: {
      headline: body.copy.headline ?? null,
      subheadline: body.copy.subheadline ?? null,
      cta: body.copy.cta ?? null
    },
    visual_template_id: body.visualTemplateId ?? null,
    visual_template_ids: body.visualTemplateIds,
    brand_preset_id: body.brandPresetId ?? null,
    selected_asset_ids: selectedAssetIds,
    include_logo: effectiveIncludeLogo,
    logo_asset_id: effectiveIncludeLogo ? logoAssetId : null,
    additional_logo_asset_ids: additionalLogoAssetIds,
    include_rera_qr: effectiveIncludeReraQr,
    rera_qr_asset_id: effectiveIncludeReraQr ? reraQrAssetId : null,
    contact_items: effectiveContactItems,
    options: {
      strict_grounding: true,
      ...body.options,
      generation_run_id: typeof body.options.generationRunId === "string" && body.options.generationRunId.trim()
        ? body.options.generationRunId.trim()
        : randomId(),
      text_treatment: effectiveTextStrategy === "reserve_editable_space" || effectiveTextStrategy === "no_text_visual_only" || body.options.textTreatment === "reserve_space" || body.options.text_treatment === "reserve_space"
        ? "reserve_space"
        : "render_text",
      construction_visual_mode: body.constructionVisualMode,
      construction_progress_percent: body.constructionProgressPercent,
      festival_visual_scope: body.festivalVisualScope,
      color_palette: selectedColorPalette
    },
    context: {
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        profile: brandProfileVersion?.profile ?? null
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            slug: project.slug,
            city: project.city,
            micro_location: project.microLocation,
            stage: project.stage,
            profile: projectProfile?.profile ?? null
          }
        : null,
      post_type: postType
        ? {
            id: postType.id,
            code: postType.code,
            name: postType.name,
            config: postType.config
          }
        : null,
      festival: festival
        ? {
            id: festival.id,
            code: festival.code,
            name: festival.name,
            category: festival.category,
            community: festival.community,
            regions: festival.regions,
            meaning: festival.meaning,
            dateLabel: festival.dateLabel,
            nextOccursOn: festival.nextOccursOn
          }
        : null,
      assets: engineAssets.map(normalizeAssetForEngine),
      rera_compliance_block: effectiveIncludeReraQr && selectedReraRegistration
        ? {
            registration_id: selectedReraRegistration.id,
            registration_number: selectedReraRegistration.registrationNumber,
            label: selectedReraRegistration.label,
            qr_asset_id: selectedReraRegistration.qrAssetId,
            authority_label: workspaceComplianceSettings?.reraAuthorityLabel ?? "MahaRERA",
            website_url: workspaceComplianceSettings?.reraWebsiteUrl ?? "https://maharera.maharashtra.gov.in",
            text_color: workspaceComplianceSettings?.reraTextColor ?? "#111111",
            render_mode: "composite_rera_block"
          }
        : null,
      brand_presets: brandPresets,
      selected_brand_preset: selectedPreset ?? null,
      selected_color_palette: selectedColorPalette,
      visual_templates: visualTemplates
    }
  };

  const rawEngineResponse = await callPromptEngineV3(enginePayload);
  const localizedEngineResponse = await localizeCreativeV3EngineResponse({
    engineResponse: rawEngineResponse,
    body,
    brandName: brand.name,
    projectName: project?.name ?? null,
    log: params.log
  }) as Record<string, any>;
  const engineResponseWithAdditionalLogos = applyManualAdditionalLogoFallback({
    engineResponse: localizedEngineResponse,
    additionalLogoAssetIds,
    primaryLogoAssetId: effectiveIncludeLogo ? logoAssetId : null,
    selectedPresetJson
  });
  const engineResponse = normalizeCreativeV3ComplianceLayout({
    engineResponse: engineResponseWithAdditionalLogos,
    reraRequired: effectiveIncludeReraQr,
    reraWebsiteUrl: workspaceComplianceSettings?.reraWebsiteUrl ?? "https://maharera.maharashtra.gov.in",
    preferredContactWebsite: resolvePreferredContactWebsite({
      projectProfile: projectProfile?.profile ?? null,
      brandProfile: brandProfileVersion?.profile ?? null
    }),
    log: params.log
  });
  const status = engineResponse && typeof engineResponse === "object" && "status" in engineResponse
    ? String((engineResponse as { status?: unknown }).status)
    : "failed";
  const renderPreset = resolveCreativeV3RenderPreset(body.renderPreset ?? null);
  const renderConfig = resolveCreativeV3RenderConfig(renderPreset);

  return {
    brand,
    brandProfileVersion,
    project,
    postType,
    requestBody: body,
    visualTemplates,
    status,
    enginePayload,
    engineResponse,
    renderPreset,
    renderConfig,
    response: {
      request: {
        brandId: brand.id,
        deliverableId: body.deliverableId ?? null,
        projectId: project?.id ?? null,
        postTypeId: postType?.id ?? null,
        renderPreset,
        clientRenderPresetAllowed: env.CREATE_V3_ALLOW_CLIENT_RENDER_PRESET === "1",
        enginePayload
      },
      result: engineResponse
    }
  };
}

function applyManualAdditionalLogoFallback(params: {
  engineResponse: Record<string, any>;
  additionalLogoAssetIds: string[];
  primaryLogoAssetId: string | null;
  selectedPresetJson?: Record<string, any> | null;
}) {
  if (params.additionalLogoAssetIds.length === 0) {
    return params.engineResponse;
  }
  const variants = Array.isArray(params.engineResponse?.variants) ? params.engineResponse.variants : [];
  if (variants.length === 0) {
    return params.engineResponse;
  }
  const patchedVariants = variants.map((variant) => patchVariantManualAdditionalLogos({
    variant: isPlainRecord(variant) ? variant : {},
    additionalLogoAssetIds: params.additionalLogoAssetIds,
    primaryLogoAssetId: params.primaryLogoAssetId,
    selectedPresetJson: params.selectedPresetJson ?? null
  }));
  return {
    ...params.engineResponse,
    variants: patchedVariants
  };
}

function filterAdditionalLogoAssetIdsForPreset(params: {
  requestedAdditionalLogoAssetIds: string[];
  selectedPresetJson: Record<string, any>;
  log: FastifyBaseLogger;
}) {
  if (params.requestedAdditionalLogoAssetIds.length === 0) {
    return [];
  }
  if (!isPlainRecord(params.selectedPresetJson) || Object.keys(params.selectedPresetJson).length === 0) {
    return params.requestedAdditionalLogoAssetIds;
  }
  if (presetAllowsAdditionalLogos(params.selectedPresetJson)) {
    return params.requestedAdditionalLogoAssetIds;
  }
  params.log.info(
    { requestedAdditionalLogoAssetIds: params.requestedAdditionalLogoAssetIds },
    "creative v3 ignored manually selected additional logos because selected preset does not allow secondary/additional logos"
  );
  return [];
}

function presetAllowsAdditionalLogos(presetJson: Record<string, unknown>) {
  if (presetJson.allow_additional_logos === true || presetJson.allowAdditionalLogos === true) return true;
  if (isPlainRecord(presetJson.logo_policy) && presetJson.logo_policy.allow_additional_logos === true) return true;
  if (getPresetSecondaryLogoRules(presetJson as Record<string, any>)) return true;
  if (Array.isArray(presetJson.additional_logos) && presetJson.additional_logos.length > 0) return true;
  if (Array.isArray(presetJson.additional_logo_layers) && presetJson.additional_logo_layers.length > 0) return true;
  if (Array.isArray(presetJson.logo_layers) && presetJson.logo_layers.some((item) => isPlainRecord(item) && item.primary !== true)) return true;
  return false;
}

function resolveEffectiveTextStrategy(body: z.infer<typeof CreativeV3CompileRequestSchema>): CreativeV3TextStrategy {
  if (body.textStrategy !== "auto") {
    return body.textStrategy;
  }

  const directOption =
    typeof body.options.textStrategy === "string"
      ? body.options.textStrategy
      : typeof body.options.text_strategy === "string"
        ? body.options.text_strategy
        : null;
  const normalizedDirectOption = normalizeTextStrategyValue(directOption);
  if (normalizedDirectOption) {
    return normalizedDirectOption;
  }

  const textTreatment =
    typeof body.options.textTreatment === "string"
      ? body.options.textTreatment
      : typeof body.options.text_treatment === "string"
        ? body.options.text_treatment
        : null;
  if (textTreatment === "render_text") {
    return "render_exact_text";
  }
  if (textTreatment === "reserve_space") {
    return "reserve_editable_space";
  }

  return "auto";
}

function normalizeTextStrategyValue(value: string | null): CreativeV3TextStrategy | null {
  if (!value) {
    return null;
  }
  if (value === "render_text") {
    return "render_exact_text";
  }
  if (value === "reserve_space") {
    return "reserve_editable_space";
  }
  const parsed = TextStrategySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeCreativeV3ComplianceLayout(params: {
  engineResponse: Record<string, any>;
  reraRequired: boolean;
  reraWebsiteUrl: string;
  preferredContactWebsite: { value: string; source: string } | null;
  log: FastifyBaseLogger;
}) {
  const variants = Array.isArray(params.engineResponse?.variants) ? params.engineResponse.variants : [];
  if (variants.length === 0) {
    return params.engineResponse;
  }

  const warnings: string[] = [];
  const patchedVariants = variants.map((variant, index) => {
    const result = patchVariantComplianceLayout({
      variant: isPlainRecord(variant) ? variant : {},
      reraRequired: params.reraRequired,
      reraWebsiteUrl: params.reraWebsiteUrl,
      preferredContactWebsite: params.preferredContactWebsite
    });
    warnings.push(...result.warnings.map((warning) => `variant_${index + 1}: ${warning}`));
    return result.variant;
  });

  if (warnings.length > 0) {
    params.log.info({ warnings }, "creative v3 compliance layout normalized");
  }

  return {
    ...params.engineResponse,
    variants: patchedVariants,
    validation: {
      ...(isPlainRecord(params.engineResponse.validation) ? params.engineResponse.validation : {}),
      policy_warnings: [
        ...readStringArray(isPlainRecord(params.engineResponse.validation) ? params.engineResponse.validation.policy_warnings : null),
        ...warnings
      ]
    }
  };
}

function patchVariantComplianceLayout(params: {
  variant: Record<string, any>;
  reraRequired: boolean;
  reraWebsiteUrl: string;
  preferredContactWebsite: { value: string; source: string } | null;
}) {
  const renderPackage = isPlainRecord(params.variant.render_package) ? params.variant.render_package : {};
  const reraRules = isPlainRecord(renderPackage.rera_qr_rules) ? renderPackage.rera_qr_rules : null;
  const hasReraLayer = params.reraRequired || Boolean(renderPackage.rera_qr_asset_id) || reraRules?.required === true;
  const reraPosition = hasReraLayer ? readPosition(reraRules, "top_right") : null;
  const warnings: string[] = [];
  let changed = false;

  let logoRules = isPlainRecord(renderPackage.logo_rules) ? { ...renderPackage.logo_rules } : null;
  const hasSecondaryLogoAsset = typeof renderPackage.secondary_logo_asset_id === "string" && renderPackage.secondary_logo_asset_id.trim().length > 0;
  let secondaryLogoRules = hasSecondaryLogoAsset && isPlainRecord(renderPackage.secondary_logo_rules) ? { ...renderPackage.secondary_logo_rules } : null;
  let contactRules = isPlainRecord(renderPackage.contact_rules) ? { ...renderPackage.contact_rules } : null;
  const promptPatch: ResolvedPromptPatch = {};
  const shouldDropStaleSecondaryLogoRules = !hasSecondaryLogoAsset && isPlainRecord(renderPackage.secondary_logo_rules);
  if (shouldDropStaleSecondaryLogoRules) {
    changed = true;
  }

  if (hasReraLayer && reraPosition && logoRules) {
    const currentLogoPosition = readPosition(logoRules, "top_left");
    if (positionsConflict(currentLogoPosition, reraPosition)) {
      const resolvedLogoPosition = resolveLogoPositionAwayFromRera(logoRules, reraPosition);
      if (resolvedLogoPosition !== currentLogoPosition) {
        logoRules = {
          ...logoRules,
          position: resolvedLogoPosition
        };
        promptPatch.logoPosition = resolvedLogoPosition;
        changed = true;
        warnings.push(`moved primary logo from ${currentLogoPosition} to ${resolvedLogoPosition} because RERA uses ${reraPosition}`);
      }
    }
  }

  if (hasReraLayer && reraPosition && secondaryLogoRules) {
    const primaryPosition = logoRules ? readPosition(logoRules, "top_left") : null;
    const secondaryPosition = readPosition(secondaryLogoRules, "top_left");
    if (
      positionsConflict(secondaryPosition, reraPosition) ||
      (primaryPosition && positionsConflict(secondaryPosition, primaryPosition))
    ) {
      const resolvedSecondaryPosition = resolveSecondaryLogoPosition({
        secondaryRules: secondaryLogoRules,
        primaryPosition,
        reraPosition
      });
      if (resolvedSecondaryPosition !== secondaryPosition) {
        secondaryLogoRules = {
          ...secondaryLogoRules,
          position: resolvedSecondaryPosition
        };
        promptPatch.secondaryLogoPosition = resolvedSecondaryPosition;
        changed = true;
        warnings.push(`moved secondary logo from ${secondaryPosition} to ${resolvedSecondaryPosition} to avoid brand/compliance overlap`);
      }
    }
  }

  if (contactRules) {
    const contactPatch = patchContactWebsiteSource({
      contactRules,
      reraWebsiteUrl: params.reraWebsiteUrl,
      preferredContactWebsite: params.preferredContactWebsite
    });
    if (contactPatch.changed && contactPatch.websiteReplacement) {
      contactRules = contactPatch.contactRules;
      promptPatch.websiteReplacement = contactPatch.websiteReplacement;
      changed = true;
      warnings.push("replaced RERA website in footer/contact with project or brand website");
    }
  }

  if (logoRules) {
    promptPatch.logoPosition ??= readPosition(logoRules, "top_left");
  }
  if (secondaryLogoRules) {
    promptPatch.secondaryLogoPosition ??= readPosition(secondaryLogoRules, "top_left");
  }
  const contactWebsite = readContactWebsiteValue(contactRules);
  if (
    contactWebsite &&
    params.preferredContactWebsite &&
    !isReraWebsiteValue(contactWebsite, params.reraWebsiteUrl, undefined)
  ) {
    promptPatch.websiteReplacement ??= {
      from: params.reraWebsiteUrl,
      to: contactWebsite
    };
  }

  if (!changed && !hasResolvedPromptPatch(promptPatch)) {
    return { variant: params.variant, warnings };
  }

  const sanitizedRenderPackage = shouldDropStaleSecondaryLogoRules
    ? omitRecordKeys(renderPackage, ["secondary_logo_rules", "secondary_logo_asset_id"])
    : renderPackage;
  const patchedRenderPackage = {
    ...sanitizedRenderPackage,
    ...(logoRules ? { logo_rules: logoRules } : {}),
    ...(secondaryLogoRules ? { secondary_logo_rules: secondaryLogoRules } : {}),
    ...(contactRules ? { contact_rules: contactRules } : {})
  };
  const patchedPromptFields = patchResolvedPromptFields(patchedRenderPackage, promptPatch);
  const layoutContract = patchLayoutContractForResolvedPolicy({
    layoutContract: isPlainRecord(params.variant.layout_contract) ? params.variant.layout_contract : null,
    logoRules,
    secondaryLogoRules,
    contactRules,
    warnings
  });

  return {
    variant: {
      ...params.variant,
      render_package: {
        ...patchedRenderPackage,
        ...patchedPromptFields
      },
      layout_contract: layoutContract
    },
    warnings
  };
}

type ResolvedPromptPatch = {
  logoPosition?: string;
  secondaryLogoPosition?: string;
  websiteReplacement?: { from: string; to: string };
};

function hasResolvedPromptPatch(patch: ResolvedPromptPatch) {
  return Boolean(patch.logoPosition || patch.secondaryLogoPosition || patch.websiteReplacement);
}

function readContactWebsiteValue(contactRules: Record<string, unknown> | null) {
  if (!contactRules || !isPlainRecord(contactRules.values)) {
    return null;
  }
  const value = contactRules.values.website;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function patchResolvedPromptFields(renderPackage: Record<string, unknown>, patch: ResolvedPromptPatch) {
  const promptFieldNames = ["prompt", "compiled_prompt", "provider_prompt", "draft_prompt"] as const;
  const patched: Record<string, unknown> = {};
  for (const fieldName of promptFieldNames) {
    const value = renderPackage[fieldName];
    if (typeof value !== "string" || !value.trim()) continue;
    patched[fieldName] = patchResolvedPromptText(value, patch);
  }
  if (patch.websiteReplacement) {
    const exactTextLayers = renderPackage.exact_text_layers;
    if (typeof exactTextLayers !== "undefined") {
      patched.exact_text_layers = replaceStringDeep(
        exactTextLayers,
        patch.websiteReplacement.from,
        patch.websiteReplacement.to
      );
    }
  }
  return patched;
}

function patchResolvedPromptText(value: string, patch: ResolvedPromptPatch) {
  let next = value;
  const isStructuredPrompt = next.includes("Brand, compliance, and contact rules:");
  if (patch.websiteReplacement) {
    next = next.split(patch.websiteReplacement.from).join(patch.websiteReplacement.to);
  }
  if (patch.logoPosition) {
    const positionText = formatLogoPosition(patch.logoPosition);
    next = next
      .replace(/Logo position:\s*top[-_ ]right/gi, `Logo position: ${positionText}`)
      .replace(/Logo position:\s*top[-_ ]left/gi, `Logo position: ${positionText}`)
      .replace(/Primary logo must be placed at top[-_ ]right/gi, `Primary logo must be placed at ${positionText}`)
      .replace(/Primary logo must be placed at top[-_ ]left/gi, `Primary logo must be placed at ${positionText}`)
      .replace(/supplied logo reference exactly once as a separate flat brand mark at top[-_ ]right/gi, `supplied logo reference exactly once as a separate flat brand mark at ${positionText}`)
      .replace(/supplied logo reference exactly once as a separate flat brand mark at top[-_ ]left/gi, `supplied logo reference exactly once as a separate flat brand mark at ${positionText}`)
      .replace(/primary logo reference exactly once as a separate flat brand mark at top[-_ ]right/gi, `primary logo reference exactly once as a separate flat brand mark at ${positionText}`)
      .replace(/primary logo reference exactly once as a separate flat brand mark at top[-_ ]left/gi, `primary logo reference exactly once as a separate flat brand mark at ${positionText}`);
  }
  if (patch.secondaryLogoPosition) {
    const positionText = formatLogoPosition(patch.secondaryLogoPosition);
    next = next
      .replace(/Secondary logo position:\s*top[-_ ]right/gi, `Secondary logo position: ${positionText}`)
      .replace(/Secondary logo position:\s*top[-_ ]left/gi, `Secondary logo position: ${positionText}`)
      .replace(/secondary logo reference exactly once at top right/gi, `secondary logo reference exactly once at ${positionText}`)
      .replace(/secondary logo reference exactly once at top_right/gi, `secondary logo reference exactly once at ${positionText}`)
      .replace(/secondary logo reference exactly once at top left/gi, `secondary logo reference exactly once at ${positionText}`)
      .replace(/secondary logo reference exactly once as a separate flat brand mark at top[-_ ]right/gi, `secondary logo reference exactly once as a separate flat brand mark at ${positionText}`)
      .replace(/secondary logo reference exactly once as a separate flat brand mark at top[-_ ]left/gi, `secondary logo reference exactly once as a separate flat brand mark at ${positionText}`);
  }

  const overrideLines: string[] = [];
  if (patch.logoPosition) {
    overrideLines.push(`Primary logo must be placed at ${formatLogoPosition(patch.logoPosition)}.`);
  }
  if (patch.secondaryLogoPosition) {
    overrideLines.push(`Secondary logo must be placed at ${formatLogoPosition(patch.secondaryLogoPosition)} with clear spacing from the primary logo and any approved contact/compliance areas.`);
  }
  if (patch.websiteReplacement) {
    overrideLines.push(`Footer/contact website must use ${patch.websiteReplacement.to}; MahaRERA URLs belong only inside the RERA compliance block.`);
  }

  if (overrideLines.length === 0) return next;
  if (isStructuredPrompt) return next;
  return `${next}\n\nResolved brand/compliance layout, highest priority: ${overrideLines.join(" ")}`;
}

function patchLayoutContractForResolvedPolicy(params: {
  layoutContract: Record<string, unknown> | null;
  logoRules: Record<string, unknown> | null;
  secondaryLogoRules: Record<string, unknown> | null;
  contactRules: Record<string, unknown> | null;
  warnings: string[];
}) {
  const layoutContract = params.layoutContract ?? {};
  const logoLayer = isPlainRecord(layoutContract.logo_layer) && params.logoRules
    ? { ...layoutContract.logo_layer, position: params.logoRules.position }
    : layoutContract.logo_layer;
  const secondaryLogoLayer = isPlainRecord(layoutContract.secondary_logo_layer) && params.secondaryLogoRules
    ? { ...layoutContract.secondary_logo_layer, position: params.secondaryLogoRules.position }
    : layoutContract.secondary_logo_layer;
  const contactLayer = isPlainRecord(layoutContract.contact_layer) && params.contactRules
    ? { ...layoutContract.contact_layer, position: params.contactRules.position, values: params.contactRules.values }
    : layoutContract.contact_layer;

  return {
    ...layoutContract,
    ...(typeof logoLayer !== "undefined" ? { logo_layer: logoLayer } : {}),
    ...(typeof secondaryLogoLayer !== "undefined" ? { secondary_logo_layer: secondaryLogoLayer } : {}),
    ...(typeof contactLayer !== "undefined" ? { contact_layer: contactLayer } : {}),
    prompt_audit: {
      ...(isPlainRecord(layoutContract.prompt_audit) ? layoutContract.prompt_audit : {}),
      compliance_layout_normalizer: {
        applied: true,
        warnings: params.warnings
      }
    }
  };
}

function patchContactWebsiteSource(params: {
  contactRules: Record<string, unknown>;
  reraWebsiteUrl: string;
  preferredContactWebsite: { value: string; source: string } | null;
}) {
  const values = isPlainRecord(params.contactRules.values) ? { ...params.contactRules.values } : {};
  const sources = isPlainRecord(params.contactRules.sources) ? { ...params.contactRules.sources } : {};
  const website = typeof values.website === "string" ? values.website.trim() : "";
  const websiteSource = typeof sources.website === "string" ? sources.website : "";
  if (!website || !params.preferredContactWebsite) {
    return { changed: false, contactRules: params.contactRules, websiteReplacement: null as null };
  }
  if (!isReraWebsiteValue(website, params.reraWebsiteUrl, websiteSource)) {
    return { changed: false, contactRules: params.contactRules, websiteReplacement: null as null };
  }
  const nextWebsite = params.preferredContactWebsite.value;
  if (normalizeUrlForComparison(nextWebsite) === normalizeUrlForComparison(website)) {
    return { changed: false, contactRules: params.contactRules, websiteReplacement: null as null };
  }
  return {
    changed: true,
    contactRules: {
      ...params.contactRules,
      values: {
        ...values,
        website: nextWebsite
      },
      sources: {
        ...sources,
        website: params.preferredContactWebsite.source
      }
    },
    websiteReplacement: {
      from: website,
      to: nextWebsite
    }
  };
}

function resolvePreferredContactWebsite(params: {
  projectProfile: unknown;
  brandProfile: unknown;
}) {
  const candidates = [
    readNestedString(params.projectProfile, ["contact", "website"], "project.profile.contact.website"),
    readNestedString(params.projectProfile, ["website"], "project.profile.website"),
    readNestedString(params.projectProfile, ["websiteUrl"], "project.profile.websiteUrl"),
    readNestedString(params.brandProfile, ["contact", "website"], "brand.profile.contact.website"),
    readNestedString(params.brandProfile, ["website"], "brand.profile.website"),
    readNestedString(params.brandProfile, ["websiteUrl"], "brand.profile.websiteUrl")
  ].filter((item): item is { value: string; source: string } => Boolean(item && item.value));
  return candidates.find((item) => !isReraWebsiteValue(item.value, "https://maharera.maharashtra.gov.in", item.source)) ?? null;
}

function readNestedString(value: unknown, path: string[], source: string) {
  let current: unknown = value;
  for (const key of path) {
    if (!isPlainRecord(current)) return null;
    current = current[key];
  }
  return typeof current === "string" && current.trim()
    ? { value: current.trim(), source }
    : null;
}

function isReraWebsiteValue(value: string, reraWebsiteUrl: string, source = "") {
  const normalizedValue = normalizeUrlForComparison(value);
  const normalizedRera = normalizeUrlForComparison(reraWebsiteUrl);
  return (
    normalizedValue === normalizedRera ||
    normalizedValue.includes("maharera.maharashtra.gov.in") ||
    /rera_compliance|maharera|rera/i.test(source)
  );
}

function normalizeUrlForComparison(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

function readPosition(rules: Record<string, unknown> | null | undefined, fallback: string) {
  return typeof rules?.position === "string" && rules.position.trim()
    ? rules.position.trim()
    : fallback;
}

function positionsConflict(a: string, b: string) {
  if (a === b) return true;
  const bucketA = positionBucket(a);
  const bucketB = positionBucket(b);
  if (bucketA !== bucketB) return false;
  return !(isNearPrimaryPosition(a) || isNearPrimaryPosition(b));
}

function positionBucket(position: string) {
  if (position.startsWith("top_left")) return "top_left";
  if (position.startsWith("top_right")) return "top_right";
  if (position.startsWith("bottom_left")) return "bottom_left";
  if (position.startsWith("bottom_right")) return "bottom_right";
  if (position.startsWith("bottom_center") || position === "bottom_footer" || position === "bottom_signature") return "bottom";
  return position;
}

function isNearPrimaryPosition(position: string) {
  return position === "top_left_near_primary" || position === "top_right_near_primary";
}

function resolveLogoPositionAwayFromRera(logoRules: Record<string, unknown>, reraPosition: string) {
  const allowedPositions = readStringArray(logoRules.allowed_positions);
  const candidates = allowedPositions.length > 0
    ? allowedPositions
    : ["top_left", "top_right", "bottom_signature", "bottom_left", "bottom_right", "top_center"];
  const preferred = reraPosition.startsWith("top_right")
    ? ["top_left", "bottom_signature", "bottom_left", "bottom_right", "top_center"]
    : reraPosition.startsWith("top_left")
      ? ["top_right", "bottom_signature", "bottom_right", "bottom_left", "top_center"]
      : ["top_left", "top_right", "bottom_signature", "bottom_left", "bottom_right", "top_center"];
  return preferred.find((position) => candidates.includes(position) && !positionsConflict(position, reraPosition))
    ?? candidates.find((position) => !positionsConflict(position, reraPosition))
    ?? "top_left";
}

function resolveSecondaryLogoPosition(params: {
  secondaryRules: Record<string, unknown>;
  primaryPosition: string | null;
  reraPosition: string;
}) {
  if (params.primaryPosition?.startsWith("top_left") && !params.reraPosition.startsWith("top_left")) {
    return "top_left_near_primary";
  }
  if (params.primaryPosition?.startsWith("top_right") && !params.reraPosition.startsWith("top_right")) {
    return "top_right_near_primary";
  }
  const candidates = [
    "top_left_near_primary",
    "top_right_near_primary",
    "top_center",
    "bottom_signature",
    "bottom_left",
    "bottom_right"
  ];
  return candidates.find((position) => (
    !positionsConflict(position, params.reraPosition) &&
    (!params.primaryPosition || !positionsConflict(position, params.primaryPosition))
  )) ?? "top_left_near_primary";
}

function replaceStringDeep(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((item) => replaceStringDeep(item, from, to));
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStringDeep(item, from, to)]));
  }
  return value;
}

function omitRecordKeys(source: Record<string, unknown>, keys: string[]) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(key)));
}

function patchVariantManualAdditionalLogos(params: {
  variant: Record<string, any>;
  additionalLogoAssetIds: string[];
  primaryLogoAssetId: string | null;
  selectedPresetJson?: Record<string, any> | null;
}) {
  const renderPackage = isPlainRecord(params.variant.render_package) ? params.variant.render_package : {};
  const logoAssetId = typeof renderPackage.logo_asset_id === "string" ? renderPackage.logo_asset_id : params.primaryLogoAssetId;
  const existingAdditionalLogoAssetIds = readStringArray(renderPackage.additional_logo_asset_ids);
  const existingProviderReferences = readRecordArray(renderPackage.provider_references);
  const requestedAdditionalLogoAssetIds = Array.from(new Set(params.additionalLogoAssetIds.filter((assetId) => assetId && assetId !== logoAssetId)));
  const existingSecondaryLogoAssetId = typeof renderPackage.secondary_logo_asset_id === "string"
    ? renderPackage.secondary_logo_asset_id
    : null;
  const presetSecondaryLogoRules = getPresetSecondaryLogoRules(params.selectedPresetJson);
  const presetSecondaryLogoAssetId = presetSecondaryLogoRules && !existingSecondaryLogoAssetId
    ? requestedAdditionalLogoAssetIds[0] ?? null
    : presetSecondaryLogoRules && existingSecondaryLogoAssetId && requestedAdditionalLogoAssetIds.includes(existingSecondaryLogoAssetId)
      ? existingSecondaryLogoAssetId
      : null;
  const existingSecondaryLogoRules = isPlainRecord(renderPackage.secondary_logo_rules)
    ? renderPackage.secondary_logo_rules
    : null;
  const shouldApplyPresetSecondaryLogoRules = Boolean(
    presetSecondaryLogoAssetId &&
      (!existingSecondaryLogoAssetId || !secondaryLogoRulesMatchPreset(existingSecondaryLogoRules, presetSecondaryLogoRules))
  );
  const generatedPresetSecondaryLogoRules = presetSecondaryLogoAssetId && shouldApplyPresetSecondaryLogoRules
    ? buildPresetSecondaryLogoRules(presetSecondaryLogoRules, presetSecondaryLogoAssetId)
    : null;
  const existingAdditionalLogoAssetIdsWithoutSecondary = existingAdditionalLogoAssetIds.filter((assetId) => (
    assetId !== existingSecondaryLogoAssetId && assetId !== presetSecondaryLogoAssetId
  ));
  const existingLogoIds = new Set([
    logoAssetId,
    existingSecondaryLogoAssetId,
    presetSecondaryLogoAssetId,
    ...existingAdditionalLogoAssetIdsWithoutSecondary
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
  const missingAdditionalLogoAssetIds = requestedAdditionalLogoAssetIds.filter((assetId) => (
    assetId !== presetSecondaryLogoAssetId && !existingLogoIds.has(assetId)
  ));
  const duplicateSecondaryLogoRemoved = existingAdditionalLogoAssetIdsWithoutSecondary.length !== existingAdditionalLogoAssetIds.length;

  if (!generatedPresetSecondaryLogoRules && missingAdditionalLogoAssetIds.length === 0 && !duplicateSecondaryLogoRemoved) {
    return params.variant;
  }

  const logoPosition = isPlainRecord(renderPackage.logo_rules) && typeof renderPackage.logo_rules.position === "string"
    ? renderPackage.logo_rules.position
    : "top_left";
  const fallbackPositions = manualAdditionalLogoPositions(logoPosition);
  const secondaryLogoAssetId = existingSecondaryLogoAssetId ?? presetSecondaryLogoAssetId ?? missingAdditionalLogoAssetIds[0] ?? null;
  const addedRules = missingAdditionalLogoAssetIds.map((assetId, index) => ({
    required: true,
    asset_id: assetId,
    position: fallbackPositions[Math.min(existingAdditionalLogoAssetIdsWithoutSecondary.length + index, fallbackPositions.length - 1)],
    source: "exact_asset_only",
    max_instances: 1,
    role: assetId === secondaryLogoAssetId ? "manual_secondary_logo" : `manual_additional_logo_${index + 1}`
  }));
  const fallbackAdditionalLogoAssetIds = missingAdditionalLogoAssetIds.filter((assetId) => assetId !== secondaryLogoAssetId);
  const fallbackAdditionalLogoRules = addedRules.filter((rule) => rule.asset_id !== secondaryLogoAssetId);
  const normalizedExistingProviderReferences = existingProviderReferences.map((item) => (
    secondaryLogoAssetId && item.asset_id === secondaryLogoAssetId
      ? { ...item, role: "exact_secondary_logo_layer" }
      : item
  ));
  const existingProviderReferenceIds = new Set(normalizedExistingProviderReferences.map((item) => item.asset_id).filter((value): value is string => typeof value === "string"));
  const providerReferences = [
    ...normalizedExistingProviderReferences,
    ...[
      ...(secondaryLogoAssetId ? [secondaryLogoAssetId] : []),
      ...fallbackAdditionalLogoAssetIds
    ]
      .filter((assetId) => !existingProviderReferenceIds.has(assetId))
      .map((assetId) => ({
        asset_id: assetId,
        role: assetId === secondaryLogoAssetId ? "exact_secondary_logo_layer" : "exact_additional_logo_layer",
        sent_to_model: true,
        composited_after: false
      }))
  ];
  const additionalLogoAssetIds = Array.from(new Set([...existingAdditionalLogoAssetIdsWithoutSecondary, ...fallbackAdditionalLogoAssetIds]));
  const additionalLogoRules = [
    ...readRecordArray(renderPackage.additional_logo_rules).filter((rule) => rule.asset_id !== secondaryLogoAssetId),
    ...fallbackAdditionalLogoRules
  ];
  const secondaryLogoRules = existingSecondaryLogoRules
    ? (generatedPresetSecondaryLogoRules ?? existingSecondaryLogoRules)
    : generatedPresetSecondaryLogoRules ?? addedRules.find((rule) => rule.asset_id === secondaryLogoAssetId) ?? { required: false };
  const patchedRenderPackage = {
    ...renderPackage,
    secondary_logo_asset_id: secondaryLogoAssetId,
    additional_logo_asset_ids: additionalLogoAssetIds,
    additional_logo_rules: additionalLogoRules,
    secondary_logo_rules: secondaryLogoRules,
    provider_references: providerReferences,
    reference_image_ids: Array.from(new Set([
      ...readStringArray(renderPackage.reference_image_ids),
      ...(secondaryLogoAssetId ? [secondaryLogoAssetId] : []),
      ...fallbackAdditionalLogoAssetIds
    ]))
  };
  const layoutContract = isPlainRecord(params.variant.layout_contract) ? params.variant.layout_contract : {};
  const existingLayoutAdditionalLogos = Array.isArray(layoutContract.additional_logo_layers)
    ? layoutContract.additional_logo_layers.filter((item: unknown): item is Record<string, unknown> => isPlainRecord(item))
      .filter((item) => item.asset_id !== secondaryLogoAssetId)
    : [];
  return {
    ...params.variant,
    render_package: patchedRenderPackage,
    layout_contract: {
      ...layoutContract,
      secondary_logo_layer: isPlainRecord(layoutContract.secondary_logo_layer)
        ? {
            ...layoutContract.secondary_logo_layer,
            ...secondaryLogoRules,
            required: true,
            asset_id: secondaryLogoAssetId,
            source: "exact_asset_only",
            max_instances: 1,
            position: typeof secondaryLogoRules.position === "string" ? secondaryLogoRules.position : fallbackPositions[0]
          }
        : {
            ...secondaryLogoRules,
            required: true,
            asset_id: secondaryLogoAssetId,
            source: "exact_asset_only",
            max_instances: 1,
            position: typeof secondaryLogoRules.position === "string" ? secondaryLogoRules.position : fallbackPositions[0]
          },
      additional_logo_layers: [
        ...existingLayoutAdditionalLogos,
        ...fallbackAdditionalLogoRules.map((rule) => ({
          required: true,
          asset_id: rule.asset_id,
          source: "exact_asset_only",
          max_instances: 1,
          position: rule.position,
          role: rule.role,
          missing: false
        }))
      ],
      prompt_audit: {
        ...(isPlainRecord(layoutContract.prompt_audit) ? layoutContract.prompt_audit : {}),
        manual_additional_logo_fallback: {
          applied: true,
          asset_ids: missingAdditionalLogoAssetIds,
          secondary_asset_id: secondaryLogoAssetId,
          used_preset_secondary_rules: Boolean(generatedPresetSecondaryLogoRules)
        }
      }
    }
  };
}

function getPresetSecondaryLogoRules(presetJson?: Record<string, any> | null) {
  if (!isPlainRecord(presetJson)) return null;
  const rules = isPlainRecord(presetJson.secondary_logo)
    ? presetJson.secondary_logo
    : isPlainRecord(presetJson.secondary_logo_layer)
      ? presetJson.secondary_logo_layer
      : null;
  if (secondaryLogoPresetIsDisabled(rules)) return null;
  return rules ? { ...rules } : null;
}

function secondaryLogoPresetIsDisabled(rules: Record<string, unknown> | null) {
  return !rules || rules.mode === "disabled" || rules.enabled === false || rules.disabled === true || rules.required === false;
}

function buildPresetSecondaryLogoRules(rules: Record<string, any> | null, assetId: string) {
  const position = typeof rules?.position === "string" && rules.position.trim() ? rules.position : "bottom_left";
  return {
    ...(rules ?? {}),
    required: true,
    asset_id: assetId,
    position,
    source: "exact_asset_only",
    max_instances: 1,
    role: typeof rules?.role === "string" ? rules.role : "preset_secondary_logo"
  };
}

function secondaryLogoRulesMatchPreset(existing: Record<string, unknown> | null, preset: Record<string, unknown> | null) {
  if (!existing || !preset) return false;
  const keys = [
    "position",
    "size_mode",
    "height_ratio",
    "margin_left_ratio",
    "margin_right_ratio",
    "margin_top_ratio",
    "margin_bottom_ratio",
    "brand_mark",
    "preserve_identity",
  ];
  return keys.every((key) => {
    if (typeof preset[key] === "undefined") return true;
    return existing[key] === preset[key];
  });
}

function manualAdditionalLogoPositions(primaryLogoPosition: string) {
  if (primaryLogoPosition === "top_left") {
    return ["top_right", "bottom_left", "bottom_right", "top_center"];
  }
  if (primaryLogoPosition === "top_right") {
    return ["top_left", "bottom_right", "bottom_left", "top_center"];
  }
  return ["top_right", "top_left", "bottom_left", "bottom_right"];
}

async function renderCreativeV3Variant(params: {
  brandId: string;
  projectId?: string | null;
  variant: Record<string, unknown>;
  count: number;
  renderPreset?: CreativeV3RenderPreset | null;
}) {
  const brand = await getBrand(params.brandId);
  const project = params.projectId ? await getProject(params.projectId) : null;
  if (project && (project.workspaceId !== brand.workspaceId || project.brandId !== brand.id)) {
    throw new Error("Project does not belong to the selected brand/workspace");
  }

  const renderPreset = resolveCreativeV3RenderPreset(params.renderPreset ?? null);
  const renderConfig = resolveCreativeV3RenderConfig(renderPreset);

  const renderPackage =
    params.variant.render_package && typeof params.variant.render_package === "object"
      ? params.variant.render_package as Record<string, unknown>
      : {};
  const prompt =
    typeof renderPackage.provider_prompt === "string" && renderPackage.provider_prompt.trim()
      ? renderPackage.provider_prompt
      : typeof renderPackage.compiled_prompt === "string" && renderPackage.compiled_prompt.trim()
        ? renderPackage.compiled_prompt
        : typeof params.variant.compiled_prompt === "string" && params.variant.compiled_prompt.trim()
          ? params.variant.compiled_prompt
          : typeof renderPackage.prompt === "string" && renderPackage.prompt.trim()
            ? renderPackage.prompt
            : typeof params.variant.prompt === "string"
              ? params.variant.prompt
              : "";

  if (!prompt.trim()) {
    throw new Error("Variant does not include a prompt or compiled_prompt.");
  }

  const aspectRatio =
    typeof params.variant.format === "string"
      ? params.variant.format
      : typeof renderPackage.format === "string"
        ? renderPackage.format
        : "4:5";

  const providerReferences = Array.isArray(renderPackage.provider_references)
    ? renderPackage.provider_references.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  const modelReferenceAssetIds = providerReferences
    .filter((item) => item.sent_to_model !== false)
    .map((item) => item.asset_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const additionalLogoAssetIds = readStringArray(renderPackage.additional_logo_asset_ids);
  const layerAssetIds = [
    renderPackage.logo_asset_id,
    renderPackage.secondary_logo_asset_id,
    ...additionalLogoAssetIds,
    renderPackage.rera_qr_asset_id
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const requestedAssetIds = Array.from(new Set([
    ...(Array.isArray(renderPackage.project_asset_ids) ? renderPackage.project_asset_ids : []),
    ...(Array.isArray(renderPackage.reference_image_ids) ? renderPackage.reference_image_ids : []),
    ...modelReferenceAssetIds,
    ...layerAssetIds
  ].filter((value): value is string => typeof value === "string" && value.length > 0)));

  const [brandAssets, reraRegistrations] = await Promise.all([
    listBrandAssets(brand.id),
    listProjectReraRegistrations(brand.workspaceId, brand.id).catch(() => [])
  ]);
  const assetById = new Map(brandAssets.map((asset) => [asset.id, asset]));
  const selectedReraQrAssetId = typeof renderPackage.rera_qr_asset_id === "string" ? renderPackage.rera_qr_asset_id : null;
  let reraCompositeStoragePath: string | null = null;
  if (selectedReraQrAssetId) {
    const qrAsset = assetById.get(selectedReraQrAssetId);
    const registration =
      reraRegistrations.find((item) => item.qrAssetId === selectedReraQrAssetId && (!project || item.projectId === project.id)) ??
      selectReraRegistrationForProject(reraRegistrations, project?.id ?? null);
    if (qrAsset && qrAsset.kind === "rera_qr" && registration) {
      const composite = await createReraComplianceBlockReference({
        workspaceId: brand.workspaceId,
        brandId: brand.id,
        projectId: project?.id ?? null,
        qrAsset,
        registration
      });
      reraCompositeStoragePath = composite.storagePath;
    }
  }
  const referencePaths = Array.from(new Set(
    [
      ...requestedAssetIds
        .filter((assetId) => assetId !== selectedReraQrAssetId)
        .map((assetId) => assetById.get(assetId))
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
        .filter((asset) => !project || asset.projectId === project.id || asset.projectId == null)
        .filter(isRenderableImageAsset)
        .map((asset) => asset.storagePath),
    ]
  ));
  const hasLogoReference = providerReferences.some((item) =>
    item.sent_to_model !== false &&
    typeof item.asset_id === "string" &&
    item.asset_id === renderPackage.logo_asset_id
  );
  const hasReraReference = Boolean(reraCompositeStoragePath) || providerReferences.some((item) =>
    typeof item.asset_id === "string" &&
    item.asset_id === renderPackage.rera_qr_asset_id
  );
  const hasSecondaryLogoReference = providerReferences.some((item) =>
    item.sent_to_model !== false &&
    typeof item.asset_id === "string" &&
    item.asset_id === renderPackage.secondary_logo_asset_id
  );
  const hasModelReferenceForAsset = (assetId: string) => providerReferences.some((item) =>
    item.sent_to_model !== false &&
    item.asset_id === assetId
  );
  const additionalLogoRulesByAssetId = new Map(
    readRecordArray(renderPackage.additional_logo_rules)
      .map((item) => [typeof item.asset_id === "string" ? item.asset_id : "", item] as const)
      .filter(([assetId]) => assetId.length > 0)
  );
  const additionalLogoRules = Array.from(new Set(additionalLogoAssetIds))
    .filter((assetId) => assetId !== renderPackage.secondary_logo_asset_id && hasModelReferenceForAsset(assetId))
    .map((assetId) => additionalLogoRulesByAssetId.get(assetId) ?? { asset_id: assetId });
  const promptFormat = typeof renderPackage.prompt_format === "string" ? renderPackage.prompt_format : "legacy";
  const renderPrompt = buildCreativeV3RendererPrompt({
    prompt,
    promptFormat,
    hasProjectReference: Array.isArray(renderPackage.project_asset_ids) && renderPackage.project_asset_ids.length > 0,
    hasLogoReference,
    hasSecondaryLogoReference,
    hasAdditionalLogoReferences: additionalLogoRules.length > 0,
    hasReraReference,
    logoRules: isPlainRecord(renderPackage.logo_rules) ? renderPackage.logo_rules : null,
    secondaryLogoRules: isPlainRecord(renderPackage.secondary_logo_rules) ? renderPackage.secondary_logo_rules : null,
    additionalLogoRules,
    contactRules: isPlainRecord(renderPackage.contact_rules) ? renderPackage.contact_rules : null,
  });

  const renderModel = renderConfig.provider === "fal"
    ? resolveCreativeV3FalModelForReferences(renderConfig.model, referencePaths.length)
    : renderConfig.model;

  const result = renderConfig.provider === "openai"
    ? await generateOpenAiImages({
        model: renderModel,
        prompt: renderPrompt,
        aspectRatio,
        count: params.count,
        ...(renderConfig.quality ? { quality: renderConfig.quality } : {}),
        referencePaths
      })
    : await generateFalImages({
        model: renderModel,
        prompt: renderPrompt,
        aspectRatio,
        count: params.count,
        referencePaths
      });
  const images = reraCompositeStoragePath
    ? await compositeReraBlockOnGeneratedImages({
        images: result.images,
        reraCompositeStoragePath,
        reraRules: isPlainRecord(renderPackage.rera_qr_rules) ? renderPackage.rera_qr_rules : null
      })
    : result.images;

  return {
    provider: renderConfig.provider,
    model: renderModel,
    renderPreset: renderConfig.renderPreset,
    requestId: result.request_id,
    providerPrompt: renderPrompt,
    referenceAssetIds: requestedAssetIds,
    layerAssetIds,
    referenceStoragePaths: referencePaths,
    images
  };
}

function buildCreativeV3RendererPrompt(params: {
  prompt: string;
  promptFormat?: string;
  hasProjectReference: boolean;
  hasLogoReference: boolean;
  hasSecondaryLogoReference: boolean;
  hasAdditionalLogoReferences: boolean;
  hasReraReference: boolean;
  logoRules?: Record<string, unknown> | null;
  secondaryLogoRules?: Record<string, unknown> | null;
  additionalLogoRules?: Array<Record<string, unknown>>;
  contactRules?: Record<string, unknown> | null;
}) {
  if (params.promptFormat === "structured_v2") {
    const roleNotes = [
      "Use the provider prompt below as the final art direction. Follow its exact text, asset, logo, contact, compliance, and factual constraints. Do not add contradictory claims or invented visible text."
    ];
    if (params.hasReraReference) {
      roleNotes.push("If a RERA compliance zone is requested, leave it clean; the exact RERA block is composited after generation. Never invent or draw a QR code.");
    }
    return `${roleNotes.join("\n")}\n\n${params.prompt}`;
  }
  const roleNotes = ["Use the following provider prompt as the final art direction. Do not add contradictory text, logo, QR, contact, or factual claims beyond it."];
  if (params.hasLogoReference) {
    roleNotes.push(compileLogoRenderInstruction(params.logoRules));
  }
  if (params.hasSecondaryLogoReference) {
    roleNotes.push(compileSecondaryLogoRenderInstruction(params.secondaryLogoRules));
  }
  if (params.hasAdditionalLogoReferences) {
    roleNotes.push(compileAdditionalLogoRenderInstruction(params.additionalLogoRules ?? []));
  }
  if (params.hasReraReference) {
    roleNotes.push("Leave a clean compact RERA compliance safe zone if requested; the exact RERA block is composited after generation. Never invent, redraw, or stylize a QR code.");
  }
  if (params.contactRules) {
    roleNotes.push(compileContactRenderInstruction(params.contactRules));
  }
  return `${roleNotes.join("\n")}\n\n${params.prompt}`;
}

function compileAdditionalLogoRenderInstruction(additionalLogoRules: Array<Record<string, unknown>>) {
  const placements = additionalLogoRules
    .map((rules, index) => {
      const position = typeof rules.position === "string" ? formatLogoPosition(rules.position) : "the preset-defined logo zone";
      const label = typeof rules.label === "string" && rules.label.trim()
        ? rules.label.trim()
        : typeof rules.role === "string" && rules.role.trim()
          ? formatLogoPosition(rules.role.trim())
          : `additional logo ${index + 2}`;
      return `${label} at ${position}`;
    })
    .join("; ");
  return [
    "Use each supplied additional logo reference exactly once as a separate flat brand mark layer.",
    placements ? `Additional logo placements: ${placements}.` : "",
    "Keep all additional logos smaller than the primary logo, clearly spaced from RERA/contact/headline areas, and never merged into one mark.",
    "Do not redraw, recolor, crop, stylize, distort, or place any additional logo on the building facade."
  ].filter(Boolean).join(" ");
}

function compileLogoRenderInstruction(logoRules?: Record<string, unknown> | null) {
  const position = typeof logoRules?.position === "string" ? logoRules.position : "top_left";
  const heightRatio = readNumericRule(logoRules, "height_ratio");
  const marginLeftRatio = readNumericRule(logoRules, "margin_left_ratio");
  const marginTopRatio = readNumericRule(logoRules, "margin_top_ratio");
  const marginRightRatio = readNumericRule(logoRules, "margin_right_ratio");
  const marginBottomRatio = readNumericRule(logoRules, "margin_bottom_ratio");
  const positionText = formatLogoPosition(position);
  const sizeText = heightRatio
    ? `Logo visual height should be about ${formatRatioPercent(heightRatio)} of the canvas height.`
    : "Keep the logo compact, premium, and clearly smaller than the headline.";
  const marginText = formatLogoMargins(position, {
    left: marginLeftRatio,
    top: marginTopRatio,
    right: marginRightRatio,
    bottom: marginBottomRatio
  });

  return [
    "Use the supplied logo reference exactly once as a flat brand mark layer.",
    `Logo position: ${positionText}.`,
    sizeText,
    marginText,
    "Place the logo exactly as provided: do not redraw, modify, stylize, recolor, warp, simplify, crop, replace, or reinterpret it.",
    "Keep the logo sharp, fully visible, separate from the building image, and never on the building facade or as physical signage."
  ].filter(Boolean).join(" ");
}

function compileSecondaryLogoRenderInstruction(logoRules?: Record<string, unknown> | null) {
  const position = typeof logoRules?.position === "string" ? logoRules.position : "top_left";
  const heightRatio = readNumericRule(logoRules, "height_ratio");
  const marginLeftRatio = readNumericRule(logoRules, "margin_left_ratio");
  const marginTopRatio = readNumericRule(logoRules, "margin_top_ratio");
  const marginRightRatio = readNumericRule(logoRules, "margin_right_ratio");
  const marginBottomRatio = readNumericRule(logoRules, "margin_bottom_ratio");
  const sizeText = heightRatio
    ? `Secondary logo visual height should be about ${formatRatioPercent(heightRatio)} of the canvas height.`
    : "Keep it visually subordinate to the primary project/logo mark.";
  const marginText = formatLogoMargins(position, {
    left: marginLeftRatio,
    top: marginTopRatio,
    right: marginRightRatio,
    bottom: marginBottomRatio
  });

  return [
    "Use the supplied secondary logo reference exactly once as a separate flat brand mark layer.",
    `Secondary logo position: ${formatLogoPosition(position)}.`,
    sizeText,
    marginText,
    "Keep it clearly spaced with no overlap with RERA, contact, or headline areas.",
    "Do not redraw, recolor, crop, merge, stylize, or place the secondary logo on the building facade."
  ].filter(Boolean).join(" ");
}

function compileContactRenderInstruction(contactRules: Record<string, unknown>) {
  const position = typeof contactRules.position === "string" ? contactRules.position : "bottom_footer";
  const marginLeftRatio = readNumericRule(contactRules, "margin_left_ratio");
  const marginTopRatio = readNumericRule(contactRules, "margin_top_ratio");
  const marginRightRatio = readNumericRule(contactRules, "margin_right_ratio");
  const marginBottomRatio = readNumericRule(contactRules, "margin_bottom_ratio");
  return [
    `If contact text is rendered, place it at ${formatLogoPosition(position)}.`,
    formatLogoMargins(position, {
      left: marginLeftRatio,
      top: marginTopRatio,
      right: marginRightRatio,
      bottom: marginBottomRatio
    }),
    "Use only grounded contact values from the provider prompt; do not invent or add extra phone, WhatsApp, email, or website text."
  ].filter(Boolean).join(" ");
}

function readNumericRule(rules: Record<string, unknown> | null | undefined, key: string) {
  const value = rules?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function formatLogoPosition(position: string) {
  if (position === "top_left_near_primary") {
    return "top-left logo group, beside or below the primary logo";
  }
  if (position === "top_right_near_primary") {
    return "top-right logo group, beside or below the primary logo";
  }
  if (position === "top_center") {
    return "top-center";
  }
  return position
    .replaceAll("_", "-")
    .replace("bottom-signature", "bottom signature area");
}

function formatRatioPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatLogoMargins(
  position: string,
  margins: { left: number | null; top: number | null; right: number | null; bottom: number | null }
) {
  if (position === "top_left") {
    return `Keep about ${formatRatioPercent(margins.left ?? 0.05)} left margin and ${formatRatioPercent(margins.top ?? 0.04)} top margin from the canvas edge.`;
  }
  if (position === "top_right") {
    return `Keep about ${formatRatioPercent(margins.right ?? 0.05)} right margin and ${formatRatioPercent(margins.top ?? 0.04)} top margin from the canvas edge.`;
  }
  if (position === "bottom_signature") {
    return `Keep about ${formatRatioPercent(margins.left ?? 0.05)} side margin and ${formatRatioPercent(margins.bottom ?? 0.04)} bottom margin from the canvas edge.`;
  }
  if (position === "bottom_left") {
    return `Keep about ${formatRatioPercent(margins.left ?? 0.05)} left margin and ${formatRatioPercent(margins.bottom ?? 0.04)} bottom margin from the canvas edge.`;
  }
  if (position === "bottom_right") {
    return `Keep about ${formatRatioPercent(margins.right ?? 0.05)} right margin and ${formatRatioPercent(margins.bottom ?? 0.04)} bottom margin from the canvas edge.`;
  }
  if (position === "bottom_center" || position === "bottom_footer") {
    return `Keep about ${formatRatioPercent(margins.left ?? margins.right ?? 0.05)} side margin and ${formatRatioPercent(margins.bottom ?? 0.04)} bottom margin from the canvas edge.`;
  }
  return "Keep comfortable spacing from all canvas edges.";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function readRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isPlainRecord(item))
    : [];
}

async function persistCreativeV3Outputs(params: {
  compileJobId: string;
  actorUserId: string | null;
  creditReservationId?: string | null;
  compiled: Awaited<ReturnType<typeof runCreativeV3Compile>>;
  renders: Array<{
    variantId: string;
    render: Awaited<ReturnType<typeof renderCreativeV3Variant>>;
    variant: Record<string, unknown>;
  }>;
}) {
  if (params.renders.length === 0) {
    return [];
  }
  if (!params.compiled.brandProfileVersion?.id) {
    throw new Error("Active brand profile is required before Creative V3 outputs can be saved to Gallery.");
  }

  const now = new Date().toISOString();
  const firstVariant = params.renders[0]?.variant ?? {};
  const firstRender = params.renders[0]?.render ?? null;
  const resolvedRenderPreset = firstRender?.renderPreset ?? params.compiled.renderPreset;
  const resolvedRenderProvider = firstRender?.provider ?? params.compiled.renderConfig.provider;
  const resolvedRenderModel = firstRender?.model ?? params.compiled.renderConfig.model;
  const firstRenderPackage =
    firstVariant.render_package && typeof firstVariant.render_package === "object"
      ? firstVariant.render_package as Record<string, unknown>
      : {};
  const finalPrompt =
    typeof firstRenderPackage.provider_prompt === "string"
      ? firstRenderPackage.provider_prompt
      : typeof firstRenderPackage.compiled_prompt === "string"
        ? firstRenderPackage.compiled_prompt
        : typeof firstVariant.compiled_prompt === "string"
        ? firstVariant.compiled_prompt
        : typeof firstVariant.prompt === "string"
          ? firstVariant.prompt
          : params.compiled.enginePayload.brief as string;
  const referenceAssetIds = collectReferenceAssetIds(params.compiled.response.result?.variants ?? []);
  const templateInfo = extractCreativeV3TemplateInfo(firstVariant);
  const safeTemplateDbId = await resolveExistingCreativeTemplateId(templateInfo.dbId);

  const creativeRequestId = randomId();
  const promptPackageId = randomId();
  const creativeJobId = randomId();
  const uploadedStoragePaths: string[] = [];
  const deliverableTarget = await createCreativeV3ReviewDeliverable({
    compiled: params.compiled,
    compileJobId: params.compileJobId,
    promptPackageId,
    createdBy: params.actorUserId
  });
  const deliverableId = deliverableTarget.deliverableId;
  const cleanupDeliverableId = deliverableTarget.created ? deliverableId : null;
  const cleanupExistingDeliverable = deliverableTarget.created
    ? null
    : {
        deliverableId,
        previousStatus: deliverableTarget.previousStatus ?? "planned",
        previousLatestPostVersionId: deliverableTarget.previousLatestPostVersionId,
        previousApprovedPostVersionId: deliverableTarget.previousApprovedPostVersionId
      };
  const createdPostVersionIds: string[] = [];

  const { error: requestError } = await supabaseAdmin.from("creative_requests").insert({
    id: creativeRequestId,
    workspace_id: params.compiled.brand.workspaceId,
    brand_id: params.compiled.brand.id,
    deliverable_id: deliverableId,
    project_id: params.compiled.project?.id ?? null,
    post_type_id: params.compiled.postType?.id ?? null,
    status: "draft",
    brief_json: {
      source: "creative_v3",
      compile_job_id: params.compileJobId,
      brief: params.compiled.enginePayload.brief,
      payload: params.compiled.response.request
    },
    created_by: params.actorUserId
  });
  if (requestError) {
    await cleanupCreativeV3Persistence({ deliverableId: cleanupDeliverableId, existingDeliverable: cleanupExistingDeliverable, creativeRequestId, promptPackageId, creativeJobId, postVersionIds: createdPostVersionIds, storagePaths: uploadedStoragePaths });
    throw requestError;
  }

  const { error: packageError } = await supabaseAdmin.from("prompt_packages").insert({
    id: promptPackageId,
    workspace_id: params.compiled.brand.workspaceId,
    brand_id: params.compiled.brand.id,
    creative_request_id: creativeRequestId,
    brand_profile_version_id: params.compiled.brandProfileVersion.id,
    deliverable_id: deliverableId,
    project_id: params.compiled.project?.id ?? null,
    post_type_id: params.compiled.postType?.id ?? null,
    creative_template_id: safeTemplateDbId,
    calendar_item_id: null,
    prompt_summary: "Creative V3 generated post",
    seed_prompt: finalPrompt,
    final_prompt: finalPrompt,
    aspect_ratio: String(params.compiled.response.result?.format ?? params.compiled.enginePayload.format ?? "4:5"),
    chosen_model: resolvedRenderModel,
    template_type: "creative_v3",
    reference_strategy: "asset_reference_generation",
    reference_asset_ids: referenceAssetIds,
    resolved_constraints: {
      source: "creative_v3",
      content_job_id: params.compiled.response.result?.content_job_id ?? null,
      variation_strategy: params.compiled.response.result?.variation_strategy ?? null,
      render_preset: resolvedRenderPreset,
      render_provider: resolvedRenderProvider,
      selected_template_id: templateInfo.templateId,
      selected_template_db_id: safeTemplateDbId ?? templateInfo.dbId
    },
    compiler_trace: {
      source: "creative_v3",
      compile_job_id: params.compileJobId,
      engine: params.compiled.response.result?.debug?.engine ?? null,
      validation: params.compiled.response.result?.validation ?? null
    },
    variations: params.compiled.response.result?.variants ?? [],
    created_by: params.actorUserId
  });
  if (packageError) {
    await cleanupCreativeV3Persistence({ deliverableId: cleanupDeliverableId, existingDeliverable: cleanupExistingDeliverable, creativeRequestId, promptPackageId, creativeJobId, postVersionIds: createdPostVersionIds, storagePaths: uploadedStoragePaths });
    throw packageError;
  }

  const totalImageCount = params.renders.reduce((sum, item) => sum + item.render.images.length, 0);
  const { error: jobError } = await supabaseAdmin.from("creative_jobs").insert({
    id: creativeJobId,
    workspace_id: params.compiled.brand.workspaceId,
    brand_id: params.compiled.brand.id,
    deliverable_id: deliverableId,
    project_id: params.compiled.project?.id ?? null,
    post_type_id: params.compiled.postType?.id ?? null,
    creative_template_id: safeTemplateDbId,
    calendar_item_id: null,
    prompt_package_id: promptPackageId,
    // DB selected_template_id is a UUID/FK in some deployments. Store only a verified DB UUID here; keep the string template key in request_payload/metadata.
    selected_template_id: safeTemplateDbId,
    job_type: "final",
    status: "completed",
    provider: resolvedRenderProvider,
    provider_model: resolvedRenderModel,
    provider_request_id: `creative-v3-${params.compileJobId}`,
    requested_count: totalImageCount,
    credit_reservation_id: params.creditReservationId ?? null,
    request_payload: {
      ...params.compiled.response.request,
      renderPreset: resolvedRenderPreset,
      renderProvider: resolvedRenderProvider
    },
    webhook_payload: {
      source: "creative_v3",
      render_preset: resolvedRenderPreset,
      render_provider: resolvedRenderProvider,
      renders: params.renders.map((item) => ({
        variant_id: item.variantId,
        render_preset: item.render.renderPreset,
        provider: item.render.provider,
        model: item.render.model,
        request_id: item.render.requestId,
        image_count: item.render.images.length
      }))
    },
    submitted_at: now,
    completed_at: now,
    created_by: params.actorUserId
  });
  if (jobError) {
    await cleanupCreativeV3Persistence({ deliverableId: cleanupDeliverableId, existingDeliverable: cleanupExistingDeliverable, creativeRequestId, promptPackageId, creativeJobId, postVersionIds: createdPostVersionIds, storagePaths: uploadedStoragePaths });
    throw jobError;
  }

  const persisted: Array<{ variantId: string; outputIds: string[] }> = [];
  let outputIndex = 0;
  try {
    for (const item of params.renders) {
      const outputIds: string[] = [];
      for (const image of item.render.images) {
        const outputId = randomId();
        const storagePath = buildStoragePath({
          workspaceId: params.compiled.brand.workspaceId,
          brandId: params.compiled.brand.id,
          section: "outputs",
          id: creativeJobId,
          fileName: `${outputId}.${extensionForGeneratedImage(image)}`
        });
        await ingestRemoteImageToStorage(storagePath, image.url);
        uploadedStoragePaths.push(storagePath);
        const thumbnail = await createThumbnailFromStorageOrNull(storagePath, {
          source: "creative_v3_output",
          mimeType: image.content_type ?? "image/png"
        });
        if (thumbnail?.thumbnailStoragePath) {
          uploadedStoragePaths.push(thumbnail.thumbnailStoragePath);
        }
        const { error: outputError } = await supabaseAdmin.from("creative_outputs").insert({
          id: outputId,
          workspace_id: params.compiled.brand.workspaceId,
          brand_id: params.compiled.brand.id,
          deliverable_id: deliverableId,
          project_id: params.compiled.project?.id ?? null,
          post_type_id: params.compiled.postType?.id ?? null,
          creative_template_id: safeTemplateDbId,
          calendar_item_id: null,
          job_id: creativeJobId,
          post_version_id: null,
          kind: "final",
          storage_path: storagePath,
          thumbnail_storage_path: thumbnail?.thumbnailStoragePath ?? null,
          thumbnail_width: thumbnail?.thumbnailWidth ?? null,
          thumbnail_height: thumbnail?.thumbnailHeight ?? null,
          thumbnail_bytes: thumbnail?.thumbnailBytes ?? null,
          provider_url: image.url.startsWith("data:") ? null : image.url,
          output_index: outputIndex,
          review_state: "pending_review",
          metadata_json: {
            source: "creative_v3",
            compile_job_id: params.compileJobId,
            variant_id: item.variantId,
            variant: item.variant,
            render_package: item.variant.render_package ?? null,
            reference_asset_ids: item.render.referenceAssetIds,
            reference_storage_paths: item.render.referenceStoragePaths,
            render_preset: item.render.renderPreset,
            provider: item.render.provider,
            provider_model: item.render.model,
            provider_request_id: item.render.requestId,
            provider_prompt_used: item.render.providerPrompt,
            provider_reference_asset_ids: item.render.referenceAssetIds,
            provider_reference_storage_paths: item.render.referenceStoragePaths,
            color_palette: isPlainObject(params.compiled.enginePayload.options)
              ? params.compiled.enginePayload.options.color_palette ?? null
              : null,
            selected_template_id: extractCreativeV3TemplateInfo(item.variant).templateId,
            selected_template_db_id: extractCreativeV3TemplateInfo(item.variant).dbId
          },
          created_by: params.actorUserId
        });
        if (outputError) {
          throw outputError;
        }
        const postVersion = await ensurePostVersionForOutput(outputId, { status: "in_review", createdBy: params.actorUserId });
        createdPostVersionIds.push(postVersion.id);
        outputIds.push(outputId);
        outputIndex += 1;
      }
      persisted.push({ variantId: item.variantId, outputIds });
    }
  } catch (error) {
    await cleanupCreativeV3Persistence({ deliverableId: cleanupDeliverableId, existingDeliverable: cleanupExistingDeliverable, creativeRequestId, promptPackageId, creativeJobId, postVersionIds: createdPostVersionIds, storagePaths: uploadedStoragePaths });
    throw error;
  }

  return persisted;
}

async function cleanupCreativeV3Persistence(params: {
  deliverableId?: string | null;
  existingDeliverable?: {
    deliverableId: string;
    previousStatus: string;
    previousLatestPostVersionId: string | null;
    previousApprovedPostVersionId: string | null;
  } | null;
  creativeRequestId: string;
  promptPackageId: string;
  creativeJobId: string;
  postVersionIds: string[];
  storagePaths: string[];
}) {
  const cleanupOperations: PromiseLike<unknown>[] = [];
  if (params.postVersionIds.length > 0) {
    cleanupOperations.push(
      supabaseAdmin.from("post_version_assets").delete().in("post_version_id", params.postVersionIds),
      supabaseAdmin.from("post_versions").delete().in("id", params.postVersionIds)
    );
  }
  cleanupOperations.push(
    supabaseAdmin.from("creative_outputs").delete().eq("job_id", params.creativeJobId),
    supabaseAdmin.from("creative_jobs").delete().eq("id", params.creativeJobId),
    supabaseAdmin.from("prompt_packages").delete().eq("id", params.promptPackageId),
    supabaseAdmin.from("creative_requests").delete().eq("id", params.creativeRequestId)
  );
  if (params.deliverableId) {
    cleanupOperations.push(supabaseAdmin.from("deliverables").delete().eq("id", params.deliverableId));
  } else if (params.existingDeliverable) {
    cleanupOperations.push(
      supabaseAdmin
        .from("deliverables")
        .update({
          status: params.existingDeliverable.previousStatus,
          latest_post_version_id: params.existingDeliverable.previousLatestPostVersionId,
          approved_post_version_id: params.existingDeliverable.previousApprovedPostVersionId
        })
        .eq("id", params.existingDeliverable.deliverableId)
    );
  }
  await Promise.allSettled(cleanupOperations);
  await removeStorageObjects(params.storagePaths).catch(() => null);
}

async function createCreativeV3ReviewDeliverable(params: {
  compiled: Awaited<ReturnType<typeof runCreativeV3Compile>>;
  compileJobId: string;
  promptPackageId: string;
  createdBy: string | null;
}) {
  if (!params.compiled.postType?.id) {
    throw new Error("A post type is required before Creative V3 outputs can be sent to Review.");
  }

  const requestedDeliverableId = params.compiled.requestBody.deliverableId ?? null;
  if (requestedDeliverableId) {
    const { data, error } = await supabaseAdmin
      .from("deliverables")
      .select("id, workspace_id, brand_id, post_type_id, status, latest_post_version_id, approved_post_version_id")
      .eq("id", requestedDeliverableId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    const row = data as {
      id: string;
      workspace_id: string;
      brand_id: string;
      post_type_id: string;
      status: string;
      latest_post_version_id: string | null;
      approved_post_version_id: string | null;
    } | null;
    if (!row) {
      throw new Error("Selected post task was not found.");
    }
    if (row.workspace_id !== params.compiled.brand.workspaceId || row.brand_id !== params.compiled.brand.id) {
      throw new Error("Selected post task does not belong to this brand workspace.");
    }
    if (row.post_type_id !== params.compiled.postType.id) {
      throw new Error("Selected post task post type does not match this generation.");
    }

    return {
      deliverableId: requestedDeliverableId,
      created: false,
      previousStatus: row.status,
      previousLatestPostVersionId: row.latest_post_version_id,
      previousApprovedPostVersionId: row.approved_post_version_id
    };
  }

  const deliverableId = randomId();
  const title = buildCreativeV3DeliverableTitle(params.compiled);
  const rawFormat = String(params.compiled.enginePayload.format ?? params.compiled.response.result?.format ?? "portrait");
  const creativeFormat = creativeFormatForCreativeV3Format(rawFormat);

  const firstVariantTemplateInfo = extractCreativeV3TemplateInfo(params.compiled.response.result?.variants?.[0] ?? {});
  const safeTemplateDbId = await resolveExistingCreativeTemplateId(firstVariantTemplateInfo.dbId);

  const { error } = await supabaseAdmin.from("deliverables").insert({
    id: deliverableId,
    workspace_id: params.compiled.brand.workspaceId,
    brand_id: params.compiled.brand.id,
    project_id: params.compiled.project?.id ?? null,
    campaign_id: null,
    series_id: null,
    persona_id: null,
    content_pillar_id: null,
    post_type_id: params.compiled.postType.id,
    creative_template_id: safeTemplateDbId,
    channel_account_id: null,
    planning_mode: "ad_hoc",
    objective_code: contentJobToObjectiveCode(params.compiled.response.result?.content_job_id),
    placement_code: placementCodeForCreativeV3Format(rawFormat),
    content_format: contentFormatForCreativeV3Format(rawFormat),
    title,
    brief_text: String(params.compiled.enginePayload.brief ?? ""),
    cta_text: null,
    scheduled_for: new Date().toISOString(),
    due_at: null,
    owner_user_id: params.createdBy,
    reviewer_user_id: params.createdBy,
    priority: "normal",
    status: "planned",
    source_json: {
      source: "creative_v3",
      compileJobId: params.compileJobId,
      promptPackageId: params.promptPackageId,
      creativeFormat,
      sourceFormat: rawFormat,
      variantCount: params.compiled.response.result?.variant_count ?? null,
      variationStrategy: params.compiled.response.result?.variation_strategy ?? null,
      selectedTemplateId: firstVariantTemplateInfo.templateId,
      selectedTemplateDbId: safeTemplateDbId ?? firstVariantTemplateInfo.dbId
    },
    created_by: params.createdBy
  });

  if (error) {
    throw error;
  }

  return {
    deliverableId,
    created: true,
    previousStatus: null,
    previousLatestPostVersionId: null,
    previousApprovedPostVersionId: null
  };
}

function buildCreativeV3DeliverableTitle(compiled: Awaited<ReturnType<typeof runCreativeV3Compile>>) {
  const projectName = compiled.project?.name ?? null;
  const postTypeName = compiled.postType?.name ?? null;
  if (projectName && postTypeName) {
    return `${projectName} ${postTypeName}`;
  }
  if (postTypeName) {
    return postTypeName;
  }
  return "Creative V3 generated post";
}

function placementCodeForCreativeV3Format(format: string) {
  if (format === "story" || format === "9:16") {
    return "instagram-story";
  }
  if (format === "landscape" || format === "16:9") {
    return "linkedin-feed";
  }
  return "instagram-feed";
}

function contentFormatForCreativeV3Format(format: string) {
  if (format === "story" || format === "9:16") {
    return "story";
  }
  return "static";
}

function creativeFormatForCreativeV3Format(format: string) {
  if (format === "story" || format === "9:16") {
    return "story";
  }
  if (format === "landscape" || format === "16:9" || format === "3:2") {
    return "landscape";
  }
  if (format === "square" || format === "1:1") {
    return "square";
  }
  return "portrait";
}

function contentJobToObjectiveCode(contentJobId?: string | null) {
  if (contentJobId === "site_visit") {
    return "footfall";
  }
  if (contentJobId === "pricing_ad") {
    return "lead_gen";
  }
  if (contentJobId === "testimonial_story") {
    return "trust";
  }
  if (contentJobId === "amenity_spotlight" || contentJobId === "location_advantage") {
    return "engagement";
  }
  return "awareness";
}

async function persistCreativeV3CompileRun(params: {
  brand: Awaited<ReturnType<typeof getBrand>>;
  project: Awaited<ReturnType<typeof getProject>> | null;
  postType: Awaited<ReturnType<typeof getPostType>> | null;
  status: string;
  enginePayload: Record<string, unknown>;
  engineResponse: unknown;
  createdBy: string | null;
  log: { warn: (payload: unknown, message?: string) => void };
}) {
  const status = ["ready", "ready_with_warnings", "blocked", "needs_input", "failed"].includes(params.status) ? params.status : "failed";
  const payload = {
    workspace_id: params.brand.workspaceId,
    brand_id: params.brand.id,
    project_id: params.project?.id ?? null,
    post_type_id: params.postType?.id ?? null,
    status,
    request_json: params.enginePayload,
    response_json: params.engineResponse as any,
    engine_url: env.PROMPT_ENGINE_V3_URL ?? null,
    created_by: params.createdBy
  };
  const { error } = await supabaseAdmin.from("creative_v3_compile_runs").insert(payload);
  if (!error) return;

  if (status === "ready_with_warnings" && error.code === "23514") {
    const { error: retryError } = await supabaseAdmin.from("creative_v3_compile_runs").insert({
      ...payload,
      status: "ready",
      response_json: {
        ...(isPlainRecord(params.engineResponse) ? params.engineResponse : { value: params.engineResponse }),
        persisted_status: "ready",
        original_status: "ready_with_warnings"
      } as any
    });
    if (!retryError) {
      params.log.warn({ error }, "creative v3 compile run status downgraded to ready because DB constraint does not yet allow ready_with_warnings");
      return;
    }
    params.log.warn({ error: retryError }, "failed to persist creative v3 compile run after ready_with_warnings fallback");
    return;
  }

  params.log.warn({ error }, "failed to persist creative v3 compile run");
}

function getCreativeV3Variants(compileResponse: unknown) {
  if (!compileResponse || typeof compileResponse !== "object") return [];
  const result = (compileResponse as { result?: unknown }).result;
  if (!result || typeof result !== "object") return [];
  const variants = (result as { variants?: unknown }).variants;
  return Array.isArray(variants) ? variants.filter((variant): variant is Record<string, unknown> => Boolean(variant && typeof variant === "object")) : [];
}

function collectReferenceAssetIds(variants: Array<Record<string, unknown>>) {
  const ids = new Set<string>();
  for (const variant of variants) {
    const renderPackage =
      variant.render_package && typeof variant.render_package === "object"
        ? variant.render_package as Record<string, unknown>
        : {};
    for (const value of [
      ...(Array.isArray(renderPackage.project_asset_ids) ? renderPackage.project_asset_ids : []),
      renderPackage.logo_asset_id,
      renderPackage.secondary_logo_asset_id,
      ...(Array.isArray(renderPackage.additional_logo_asset_ids) ? renderPackage.additional_logo_asset_ids : []),
      renderPackage.rera_qr_asset_id,
      ...(Array.isArray(renderPackage.reference_image_ids) ? renderPackage.reference_image_ids : [])
    ]) {
      if (typeof value === "string" && z.string().uuid().safeParse(value).success) {
        ids.add(value);
      }
    }
  }
  return Array.from(ids);
}

function assertCreativeV3CanGenerateImages(compiled: Awaited<ReturnType<typeof runCreativeV3Compile>>) {
  if (!compiled.brandProfileVersion?.id) {
    throw new Error("Active brand profile is required before Creative V3 image generation.");
  }

  if (!compiled.postType?.id) {
    throw new Error("A post type is required before Creative V3 image generation.");
  }

  if (!["ready", "ready_with_warnings"].includes(compiled.status)) {
    const validation = isPlainRecord(compiled.response.result?.validation)
      ? compiled.response.result.validation
      : null;
    const errors = Array.isArray(validation?.errors)
      ? validation.errors.map(String).filter(Boolean)
      : [];
    throw new Error(errors[0] ?? `Creative V3 compile returned ${compiled.status}; no images were generated.`);
  }

  const variants = getCreativeV3Variants(compiled.response);
  if (variants.length === 0) {
    throw new Error("Creative V3 compile returned no renderable variants.");
  }
}


async function resolveExistingCreativeTemplateId(templateDbId: string | null): Promise<string | null> {
  if (!templateDbId || !z.string().uuid().safeParse(templateDbId).success) {
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from("creative_templates")
    .select("id")
    .eq("id", templateDbId)
    .maybeSingle();
  if (error) {
    return null;
  }
  return typeof data?.id === "string" ? data.id : null;
}

function extractCreativeV3TemplateInfo(variant: unknown): { templateId: string | null; dbId: string | null } {
  if (!variant || typeof variant !== "object") {
    return { templateId: null, dbId: null };
  }
  const record = variant as Record<string, unknown>;
  const renderPackage = isPlainRecord(record.render_package) ? record.render_package : {};
  const templateContract = isPlainRecord(renderPackage.template_contract)
    ? renderPackage.template_contract
    : isPlainRecord(record.template_contract)
      ? record.template_contract
      : {};
  const raw = isPlainRecord(templateContract.raw) ? templateContract.raw : {};
  const templateId =
    typeof record.selected_template_id === "string" ? record.selected_template_id :
    typeof templateContract.template_id === "string" ? templateContract.template_id :
    typeof raw.template_id === "string" ? raw.template_id :
    typeof raw.template_key === "string" ? raw.template_key :
    null;
  const dbId = typeof raw.db_id === "string" && z.string().uuid().safeParse(raw.db_id).success ? raw.db_id : null;
  return { templateId, dbId };
}

function extensionForGeneratedImage(image: CreativeV3GeneratedImage) {
  const contentType = image.content_type?.toLowerCase() ?? "";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  const name = image.file_name?.toLowerCase() ?? "";
  const match = name.match(/\.([a-z0-9]+)$/);
  return match?.[1] && ["png", "jpg", "jpeg", "webp"].includes(match[1]) ? match[1] : "png";
}

async function compositeReraBlockOnGeneratedImages(params: {
  images: CreativeV3GeneratedImage[];
  reraCompositeStoragePath: string;
  reraRules: Record<string, unknown> | null;
}): Promise<CreativeV3GeneratedImage[]> {
  const reraBlob = await downloadStorageBlob(params.reraCompositeStoragePath);
  const reraBuffer = Buffer.from(await reraBlob.arrayBuffer());
  return Promise.all(
    params.images.map(async (image, index) => {
      const sourceBuffer = await generatedImageToBuffer(image.url);
      const sourceMeta = await sharp(sourceBuffer).metadata();
      const width = sourceMeta.width ?? 0;
      const height = sourceMeta.height ?? 0;
      if (width <= 0 || height <= 0) {
        return image;
      }

      const maxWidthRatio = readNumericRule(params.reraRules, "max_width_ratio") ?? 0.25;
      const maxWidth = Math.max(180, Math.round(width * maxWidthRatio));
      const resizedRera = await sharp(reraBuffer)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .png()
        .toBuffer();
      const reraMeta = await sharp(resizedRera).metadata();
      const reraWidth = reraMeta.width ?? maxWidth;
      const reraHeight = reraMeta.height ?? Math.round(maxWidth * 0.18);
      const marginTop = Math.round(height * (readNumericRule(params.reraRules, "margin_top_ratio") ?? 0.04));
      const marginRight = Math.round(width * (readNumericRule(params.reraRules, "margin_right_ratio") ?? 0.05));
      const marginLeft = Math.round(width * (readNumericRule(params.reraRules, "margin_left_ratio") ?? 0.05));
      const position = typeof params.reraRules?.position === "string" ? params.reraRules.position : "top_right";
      const left = position === "top_left" ? marginLeft : Math.max(marginLeft, width - reraWidth - marginRight);
      const top = marginTop;
      const output = await sharp(sourceBuffer)
        .composite([{ input: resizedRera, left, top }])
        .png()
        .toBuffer();
      return {
        url: `data:image/png;base64,${output.toString("base64")}`,
        content_type: "image/png",
        file_name: image.file_name?.replace(/\.[a-z0-9]+$/i, ".png") ?? `creative-v3-rera-${index + 1}.png`
      };
    })
  );
}

async function generatedImageToBuffer(sourceUrl: string) {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:[^;,]+(?:;charset=[^;,]+)?;base64,(.+)$/);
    if (!match?.[1]) {
      throw new Error("Invalid generated image data URL");
    }
    return Buffer.from(match[1], "base64");
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image for compositing: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function processCreativeV3GenerateJobLocally(params: {
  jobId: string;
  log: FastifyBaseLogger;
}) {
  const { data: claimedJob, error: claimError } = await supabaseAdmin
    .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
    .update({
      status: "processing",
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", params.jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError) {
    params.log.error({ error: claimError, jobId: params.jobId }, "failed to claim creative v3 async job locally");
    return;
  }

  if (!claimedJob) {
    return;
  }

  const reservationId = (claimedJob as { credit_reservation_id?: string | null }).credit_reservation_id ?? null;
  let jobInput: CreativeV3GenerateJobInput | null = null;
  try {
    jobInput = (claimedJob as { input_json?: unknown }).input_json as CreativeV3GenerateJobInput;
    if (!jobInput || jobInput.type !== "creative-v3-generate") {
      throw new Error("Invalid Creative V3 async job input.");
    }
    const activeJobInput = jobInput;

    await touchCreativeV3GenerateJob(params.jobId);

    const viewer: AuthenticatedViewer = {
      userId: activeJobInput.actorUserId ?? "system"
    };
    const compiled = await runCreativeV3Compile({
      body: activeJobInput.body,
      viewer,
      log: params.log
    });

    await touchCreativeV3GenerateJob(params.jobId);

    await persistCreativeV3CompileRun({
      brand: compiled.brand,
      project: compiled.project,
      postType: compiled.postType,
      status: compiled.status,
      enginePayload: compiled.enginePayload,
      engineResponse: compiled.engineResponse,
      createdBy: activeJobInput.actorUserId,
      log: params.log
    });

    assertCreativeV3CanGenerateImages(compiled);
    const variants = getCreativeV3Variants(compiled.response);
    const renders = await Promise.all(
      variants.map(async (variant) => {
        await touchCreativeV3GenerateJob(params.jobId);
        const variantId = typeof variant.variant_id === "string" ? variant.variant_id : randomId();
        return {
          variantId,
          variant,
          render: await renderCreativeV3Variant({
            brandId: activeJobInput.body.brandId,
            projectId: activeJobInput.body.projectId ?? null,
            variant: { ...variant, format: compiled.response.result?.format },
            count: 1,
            renderPreset: activeJobInput.body.renderPreset ?? null
          })
        };
      })
    );
    await touchCreativeV3GenerateJob(params.jobId);
    const persistedOutputs = await persistCreativeV3Outputs({
      compileJobId: params.jobId,
      actorUserId: activeJobInput.actorUserId,
      creditReservationId: reservationId,
      compiled,
      renders
    });
    const outputIdsByVariant = new Map(persistedOutputs.map((item) => [item.variantId, item.outputIds]));
    const totalImageCount = renders.reduce((sum, item) => sum + item.render.images.length, 0);
    if (totalImageCount > 0) {
      await settleCreativeV3ReservationIfPresent(reservationId, {
        endpoint: "/api/creative-v3/generate-async",
        status: "completed",
        generatedImageCount: totalImageCount
      });
    } else {
      await releaseCreativeV3ReservationIfPresent({
        reservationId,
        actorUserId: activeJobInput.actorUserId,
        note: "creative v3 generation completed without images",
        metadata: {
          endpoint: "/api/creative-v3/generate-async",
          reason: "no_images"
        },
        log: params.log
      });
    }

    await supabaseAdmin
      .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
      .update({
        status: "completed",
        result_json: {
          compile: compiled.response,
          renders: renders.map((item) => ({
            variantId: item.variantId,
            render: item.render,
            outputIds: outputIdsByVariant.get(item.variantId) ?? []
          }))
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId)
      .eq("status", "processing");
  } catch (error) {
    params.log.error({ error, jobId: params.jobId }, "creative v3 async generation failed locally");
    await releaseCreativeV3ReservationIfPresent({
      reservationId,
      actorUserId: jobInput?.actorUserId ?? null,
      note: "creative v3 generation failed",
      metadata: {
        endpoint: "/api/creative-v3/generate-async",
        reason: "generation_failed"
      },
      log: params.log
    });
    await supabaseAdmin
      .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
      .update({
        status: "failed",
        error_json: {
          message: error instanceof Error ? error.message : "Creative V3 generation failed"
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId)
      .eq("status", "processing");
  }
}

async function touchCreativeV3GenerateJob(jobId: string) {
  await supabaseAdmin
    .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "processing");
}

function isCreativeV3GenerateJobStale(job: { status?: unknown; updated_at?: unknown; created_at?: unknown }) {
  const status = typeof job.status === "string" ? job.status : "";
  if (!["pending", "processing"].includes(status)) {
    return false;
  }
  const timestamp = typeof job.updated_at === "string"
    ? job.updated_at
    : typeof job.created_at === "string"
      ? job.created_at
      : null;
  if (!timestamp) {
    return false;
  }
  return Date.now() - new Date(timestamp).getTime() > CREATIVE_V3_ASYNC_STALE_MS;
}

export async function registerCreativeV3Routes(app: FastifyInstance) {
  app.get("/api/creative-v3/brand-presets", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const query = z.object({
      brandId: z.string().uuid(),
      projectId: z.string().uuid().optional().nullable(),
      includeInactive: z.string().optional()
    }).parse(request.query);

    try {
      const brand = await assertCreativeV3PresetRelations({
        viewer,
        log: request.log,
        payload: {
          brandId: query.brandId,
          projectId: query.projectId ?? null
        },
        roles: ["owner", "admin", "editor", "viewer"]
      });
      return listCreativeV3BrandPresets({
        workspaceId: brand.workspaceId,
        brandId: brand.id,
        projectId: query.projectId ?? null,
        activeOnly: query.includeInactive === "1" || query.includeInactive === "true" ? false : true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load brand presets";
      if (message.includes("does not belong")) {
        return reply.badRequest(message);
      }
      throw error;
    }
  });

  app.get("/api/creative-v3/visual-templates", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.viewer) {
      return reply.unauthorized();
    }
    const query = z.object({
      brandId: z.string().uuid(),
      projectId: z.string().uuid().optional(),
      postTypeId: z.string().uuid().optional(),
      format: z.string().optional()
    }).parse(request.query);
    const brand = await getBrand(query.brandId);
    await assertWorkspaceRole(request.viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    if (query.projectId) {
      const project = await getProject(query.projectId);
      if (project.workspaceId !== brand.workspaceId || project.brandId !== brand.id) {
        throw new Error("Project does not belong to the selected brand/workspace");
      }
    }
    if (query.postTypeId) {
      const postType = await getPostType(query.postTypeId);
      if (postType.workspaceId && postType.workspaceId !== brand.workspaceId) {
        throw new Error("Post type does not belong to the selected workspace");
      }
      const templates = await listCreativeV3VisualTemplates({
        workspaceId: brand.workspaceId,
        brandId: brand.id,
        projectId: query.projectId ?? null,
        postTypeId: query.postTypeId ?? null,
        contentJobId: toContentJobId(postType.code),
        format: query.format ? toNotebookFormat(query.format) : null
      });
      const previewUrls = await Promise.all(
        templates.map((t: any) => t.preview_storage_path ? createSignedUrl(t.preview_storage_path).catch(() => null) : null)
      );
      return templates.map((t: any, i: number) => ({ ...t, previewUrl: previewUrls[i] }));
    }
    const templatesNoPostType = await listCreativeV3VisualTemplates({
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      projectId: query.projectId ?? null,
      postTypeId: query.postTypeId ?? null,
      contentJobId: null,
      format: query.format ? toNotebookFormat(query.format) : null
    });
    const previewUrlsNoPostType = await Promise.all(
      templatesNoPostType.map((t: any) => t.preview_storage_path ? createSignedUrl(t.preview_storage_path).catch(() => null) : null)
    );
    return templatesNoPostType.map((t: any, i: number) => ({ ...t, previewUrl: previewUrlsNoPostType[i] }));
  });

  app.post("/api/creative-v3/brand-presets", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreativeV3BrandPresetMutationSchema.parse(request.body);
    const brand = await assertCreativeV3PresetRelations({
      viewer,
      log: request.log,
      payload: body
    });
    const presetKey = body.presetKey ?? slugifyPresetKey(body.name);
    const validation = validateCreativeV3BrandPresetConfig({
      presetKey,
      name: body.name,
      description: body.description ?? null,
      presetJson: body.presetJson
    });
    if (validation.errors.length > 0) {
      return reply.badRequest(`Invalid preset configuration: ${validation.errors.join(" ")}`);
    }
    if (validation.warnings.length > 0) {
      request.log.warn({ warnings: validation.warnings, presetKey }, "creative v3 brand preset validation warnings");
    }
    const { data, error } = await supabaseAdmin
      .from("creative_v3_brand_presets")
      .insert({
        workspace_id: brand.workspaceId,
        brand_id: brand.id,
        project_id: body.projectId ?? null,
        preset_key: presetKey,
        name: body.name,
        description: body.description ?? null,
        preset_json: body.presetJson,
        active: body.active,
        created_by: viewer.userId
      })
      .select("id, preset_key, name, description, preset_json, project_id, active, created_at, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return {
      preset_id: data.preset_key,
      db_id: data.id,
      name: data.name,
      description: data.description,
      preset_json: data.preset_json ?? {},
      project_id: data.project_id,
      active: data.active,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  });

  app.patch("/api/creative-v3/brand-presets/:presetId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const params = z.object({ presetId: z.string().uuid() }).parse(request.params);
    const body = CreativeV3BrandPresetMutationSchema.partial().extend({
      brandId: z.string().uuid()
    }).parse(request.body);
    const brand = await assertCreativeV3PresetRelations({
      viewer,
      log: request.log,
      payload: {
        brandId: body.brandId,
        projectId: body.projectId ?? null
      }
    });

    const { data: existingPreset, error: existingPresetError } = await supabaseAdmin
      .from("creative_v3_brand_presets")
      .select("preset_key, name, description, preset_json")
      .eq("id", params.presetId)
      .eq("workspace_id", brand.workspaceId)
      .eq("brand_id", brand.id)
      .single();

    if (existingPresetError) {
      throw existingPresetError;
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.projectId !== "undefined") updates.project_id = body.projectId ?? null;
    if (typeof body.presetKey === "string") updates.preset_key = body.presetKey;
    if (typeof body.name === "string") updates.name = body.name;
    if (typeof body.description !== "undefined") updates.description = body.description ?? null;
    if (typeof body.presetJson !== "undefined") updates.preset_json = body.presetJson;
    if (typeof body.active === "boolean") updates.active = body.active;

    const validation = validateCreativeV3BrandPresetConfig({
      presetKey: typeof body.presetKey === "string" ? body.presetKey : existingPreset.preset_key,
      name: typeof body.name === "string" ? body.name : existingPreset.name,
      description: typeof body.description !== "undefined" ? body.description ?? null : existingPreset.description,
      presetJson: typeof body.presetJson !== "undefined" ? body.presetJson : existingPreset.preset_json ?? {}
    });
    if (validation.errors.length > 0) {
      return reply.badRequest(`Invalid preset configuration: ${validation.errors.join(" ")}`);
    }
    if (validation.warnings.length > 0) {
      request.log.warn({ warnings: validation.warnings, presetId: params.presetId }, "creative v3 brand preset validation warnings");
    }

    const { data, error } = await supabaseAdmin
      .from("creative_v3_brand_presets")
      .update(updates)
      .eq("id", params.presetId)
      .eq("workspace_id", brand.workspaceId)
      .eq("brand_id", brand.id)
      .select("id, preset_key, name, description, preset_json, project_id, active, created_at, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return {
      preset_id: data.preset_key,
      db_id: data.id,
      name: data.name,
      description: data.description,
      preset_json: data.preset_json ?? {},
      project_id: data.project_id,
      active: data.active,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  });

  app.delete("/api/creative-v3/brand-presets/:presetId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const params = z.object({ presetId: z.string().uuid() }).parse(request.params);
    const query = z.object({ brandId: z.string().uuid() }).parse(request.query);
    const brand = await assertCreativeV3PresetRelations({
      viewer,
      log: request.log,
      payload: {
        brandId: query.brandId,
        projectId: null
      }
    });

    const { error } = await supabaseAdmin
      .from("creative_v3_brand_presets")
      .update({ active: false })
      .eq("id", params.presetId)
      .eq("workspace_id", brand.workspaceId)
      .eq("brand_id", brand.id);

    if (error) {
      throw error;
    }

    return reply.code(204).send();
  });

  app.post("/api/creative-v3/compile", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreativeV3CompileRequestSchema.parse(request.body);
    try {
      const compiled = await runCreativeV3Compile({
        body,
        viewer,
        log: request.log
      });
      await persistCreativeV3CompileRun({
        brand: compiled.brand,
        project: compiled.project,
        postType: compiled.postType,
        status: compiled.status,
        enginePayload: compiled.enginePayload,
        engineResponse: compiled.engineResponse,
        createdBy: viewer.userId,
        log: request.log
      });
      return compiled.response;
    } catch (error) {
      request.log.error({ error }, "creative v3 compile failed");
      const message = error instanceof Error ? error.message : "Creative V3 compile failed";
      if (isCreativeV3CompileUserInputError(message)) {
        return reply.badRequest(message);
      }
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message
      });
    }
  });

  app.post("/api/creative-v3/generate-async", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreativeV3CompileRequestSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const jobId = randomId();
    let reservationId: string | null = null;
    try {
      reservationId = await reserveCreativeV3GenerationCredits({
        workspaceId: brand.workspaceId,
        jobId,
        actorUserId: viewer.userId,
        requestedVariantCount: body.variantCount
      });
    } catch (error) {
      if (isInsufficientWorkspaceCreditsError(error)) {
        return reply.code(402).send({
          statusCode: 402,
          error: "Payment Required",
          message: insufficientCreativeV3CreditsMessage(error)
        });
      }
      request.log.error({ error }, "failed to reserve creative v3 generation credits");
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Unable to reserve credits for Creative V3 generation."
      });
    }

    const jobInput: CreativeV3GenerateJobInput = {
      type: "creative-v3-generate",
      body,
      actorUserId: viewer.userId
    };
    const { error: jobError } = await supabaseAdmin
      .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
      .insert({
        id: jobId,
        workspace_id: brand.workspaceId,
        brand_id: brand.id,
        status: "pending",
        input_json: jobInput,
        actor_user_id: viewer.userId,
        credit_reservation_id: reservationId
      });

    if (jobError) {
      request.log.error({ error: jobError }, "failed to create creative v3 async job");
      await releaseCreativeV3ReservationIfPresent({
        reservationId,
        actorUserId: viewer.userId,
        note: "creative v3 job insert failed",
        metadata: {
          endpoint: "/api/creative-v3/generate-async",
          reason: "job_insert_failed"
        },
        log: request.log
      });
      return reply.code(500).send({ error: "Failed to create Creative V3 job" });
    }

    void processCreativeV3GenerateJobLocally({
      jobId,
      log: request.log.child({ jobId, route: "creative-v3-generate-async" })
    });

    return { jobId, status: "pending" };
  });

  app.get("/api/creative-v3/generate-async/:jobId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const { jobId } = request.params as { jobId: string };
    const { data: job, error: jobError } = await supabaseAdmin
      .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return reply.notFound();
    }

    const jobInput = job.input_json as Partial<CreativeV3GenerateJobInput> | null;
    if (!jobInput || jobInput.type !== "creative-v3-generate") {
      return reply.notFound();
    }

    const brand = await getBrand(job.brand_id);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    if (isCreativeV3GenerateJobStale(job)) {
      await supabaseAdmin
        .from(CREATIVE_V3_GENERATION_JOBS_TABLE)
        .update({
          status: "pending",
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", jobId)
        .in("status", ["pending", "processing"]);
      void processCreativeV3GenerateJobLocally({
        jobId,
        log: request.log.child({ jobId, route: "creative-v3-generate-async-reclaim" })
      });
      return {
        status: "processing",
        input: jobInput.body
      };
    }

    if (job.status === "completed") {
      return {
        status: "completed",
        input: jobInput.body,
        result: job.result_json
      };
    }

    if (job.status === "failed") {
      return {
        status: "failed",
        input: jobInput.body,
        error: job.error_json ?? {
          message: "Creative V3 generation failed."
        }
      };
    }

    if (job.status === "pending") {
      void processCreativeV3GenerateJobLocally({
        jobId,
        log: request.log.child({ jobId, route: "creative-v3-generate-async-resume" })
      });
    }

    return { status: job.status as "pending" | "processing", input: jobInput.body };
  });
}
