import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  BrandAssetRecord,
  BrandProfile,
  CalendarItemRecord,
  CandidateAsset,
  CreativeTruthBundle,
  CreativeBrief,
  CreativeTemplateAssetRecord,
  CreativeTemplateRecord,
  FestivalRecord,
  NormalizedAssetMetadata,
  PostTypeRecord,
  ProjectRecord,
  ProjectProfile
} from "@image-lab/contracts";
import { env } from "./config.js";
import { appendMissingPromptClauses, buildBrandPromptGuidance } from "./brand-prompt-guidance.js";
import {
  buildInferredReferenceSelection,
  buildProjectAmenityCatalog,
  inferAmenityNameFromAssetParts,
  isAmenityFocusedPostType,
  resolveAmenityFocus,
} from "./creative-reference-selection.js";
import { buildFestivalPromptGuidance } from "./festival-prompt-guidance.js";
import { compilePromptPackageMock } from "./mock-creative-director.js";
import { buildPostTypePromptGuidance } from "./post-type-prompt-guidance.js";
import { buildProjectPromptGuidance } from "./project-prompt-guidance.js";
import { deriveAspectRatio } from "./utils.js";

export type CreativeDirectorInput = {
  workspaceId?: string;
  brandName: string;
  brandProfile: BrandProfile;
  brief: CreativeBrief;
  referenceLabels: string[];
  brandAssets?: BrandAssetRecord[];
  templateAssets?: Array<Pick<CreativeTemplateAssetRecord, "assetId" | "role">>;
  variationCount?: number;
  projectName?: string | null;
  projectId?: string | null;
  projectStage?: ProjectRecord["stage"] | null;
  projectProfile?: ProjectProfile | null;
  festival?: Pick<FestivalRecord, "id" | "code" | "name" | "category" | "community" | "regions" | "meaning" | "dateLabel" | "nextOccursOn"> | null;
  postType?: Pick<PostTypeRecord, "code" | "name" | "config"> | null;
  template?: (Pick<CreativeTemplateRecord, "id" | "name" | "channel" | "format" | "basePrompt" | "config"> & {
    linkedAssets?: Array<Pick<CreativeTemplateAssetRecord, "assetId" | "role">>;
  }) | null;
  series?: {
    id: string;
    name: string;
    description: string | null;
    contentFormat: "static" | "carousel" | "video" | "story" | null;
    sourceBriefJson: Record<string, unknown>;
  } | null;
  calendarItem?: Pick<CalendarItemRecord, "title" | "objective" | "scheduledFor" | "status"> | null;
  deliverableSnapshot?: {
    id: string;
    title: string;
    briefText: string | null;
    objectiveCode: string;
    placementCode: string;
    contentFormat: string;
    ctaText: string | null;
    scheduledFor: string;
    priority: string;
    status: string;
    campaign?: {
      id: string;
      name: string;
      objectiveCode: string;
      keyMessage: string;
      ctaText: string | null;
    } | null;
    persona?: {
      id: string;
      name: string;
      description: string | null;
    } | null;
    channelAccount?: {
      id: string;
      platform: string;
      handle: string;
    } | null;
  } | null;
};

function isFestivalGreetingInput(input: Pick<CreativeDirectorInput, "festival" | "postType">) {
  return Boolean(input.festival) && (!input.postType || input.postType.code === "festive-greeting");
}

const ALLOWED_REFERENCE_STRATEGIES = ["generated-template", "uploaded-references", "hybrid"] as const;
const ALLOWED_TEMPLATE_TYPES = ["hero", "product-focus", "testimonial", "announcement", "quote", "offer"] as const;

function selectReraQrAssetForProject(
  assets: BrandAssetRecord[],
  projectId?: string | null
) {
  return (
    assets.find((asset) => asset.kind === "rera_qr" && asset.projectId === (projectId ?? null)) ??
    assets.find((asset) => asset.kind === "rera_qr" && asset.projectId == null) ??
    null
  );
}

type CompilerResult = {
  promptSummary: string;
  seedPrompt: string;
  finalPrompt: string;
  aspectRatio: string;
  chosenModel: string;
  resolvedConstraints: Record<string, unknown>;
  compilerTrace: Record<string, unknown>;
  referenceStrategy: (typeof ALLOWED_REFERENCE_STRATEGIES)[number];
  templateType: ((typeof ALLOWED_TEMPLATE_TYPES)[number]) | undefined;
  variations?: PromptVariationResult[];
  selectedAmenity?: string | null;
  amenityImageAssetIds?: string[];
};

type PromptVariationResult = {
  id: string;
  title: string;
  strategy: string;
  seedPrompt: string;
  finalPrompt: string;
  referenceStrategy?: (typeof ALLOWED_REFERENCE_STRATEGIES)[number];
  differenceFromOthers?: string | null;
  resolvedConstraints?: Record<string, unknown>;
  compilerTrace?: Record<string, unknown>;
};

type WorkerResponse = {
  request_id: string;
  ok: boolean;
  result?: CompilerResult;
  error?: string;
};

type V1AgentPayload = Input & {
  brandPromptManifest: ReturnType<typeof buildBrandPromptGuidance>["manifest"];
  festivalPromptManifest: ReturnType<typeof buildFestivalPromptGuidance>["manifest"];
  projectPromptManifest: ReturnType<typeof buildProjectPromptGuidance>["manifest"];
  postTypePromptManifest: ReturnType<typeof buildPostTypePromptGuidance>["manifest"];
  promptGuardrails: {
    seedClauses: string[];
    finalClauses: string[];
  };
};

type V2AgentPayload = {
  truthBundle: CreativeTruthBundle;
  projectId?: string | null;
};

type PendingRequest = {
  resolve: (value: CompilerResult) => void;
  reject: (reason?: unknown) => void;
};

type WorkerState = {
  child: ChildProcessWithoutNullStreams;
  pending: Map<string, PendingRequest>;
  buffer: string;
  stderr: string;
};

let workerState: WorkerState | null = null;
let v2WorkerState: WorkerState | null = null;
let workerRequestCount = 0;
let v2WorkerRequestCount = 0;

type Input = CreativeDirectorInput & {
  normalizationMeta?: {
    autoCopyStripped: boolean;
  };
};

export async function compilePromptPackage(input: Input) {
  const normalizedInput = normalizeCreativeDirectorInput(input);
  const mode = resolveCompilerMode();

  if (mode === "mock") {
    return compilePromptPackageMock(normalizedInput);
  }

  try {
    return await runAgnoCreativeDirector(normalizedInput);
  } catch (error) {
    if (!isTransientAgnoError(error) && env.CREATIVE_DIRECTOR_MODE === "agno") {
      throw error;
    }

    if (isTransientAgnoError(error)) {
      resetWorkerState();
      console.warn(
        `Creative Director Agno compiler timed out or hit a transient connection issue. Falling back to mock compiler. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return buildMockFallbackResult(normalizedInput, error);
  }
}

export async function compilePromptPackageV2(input: Input) {
  const normalizedInput = normalizeCreativeDirectorInput(input);
  const mode = resolveCompilerV2Mode();

  if (mode === "mock") {
    return buildV2MockResult(normalizedInput);
  }

  try {
    return await runAgnoCreativeDirectorV2(normalizedInput);
  } catch (error) {
    resetV2WorkerState();
    throw error;
  }
}

function resolveCompilerMode() {
  if (env.CREATIVE_DIRECTOR_MODE === "mock") {
    return "mock";
  }

  if (env.CREATIVE_DIRECTOR_MODE === "agno") {
    return "agno";
  }

  return env.OPENAI_API_KEY ? "agno" : "mock";
}

function resolveCompilerV2Mode() {
  if (env.CREATIVE_DIRECTOR_V2_MODE === "mock") {
    return "mock";
  }

  if (env.CREATIVE_DIRECTOR_V2_MODE === "agno") {
    return "agno";
  }

  return env.OPENAI_API_KEY ? "agno" : "mock";
}

function normalizeCreativeDirectorInput(input: Input): Input {
  const { brief, autoCopyStripped } = normalizeCreativeBriefForCompilation(input.brief);
  return {
    ...input,
    brief,
    normalizationMeta: {
      autoCopyStripped
    },
    brandProfile: normalizeBrandProfile(input.brandProfile)
  };
}

export function normalizeCreativeBriefForCompilation<T extends CreativeBrief>(brief: T): {
  brief: T;
  autoCopyStripped: boolean;
} {
  if (brief.copyMode !== "auto") {
    return { brief, autoCopyStripped: false };
  }

  const offer = typeof brief.offer === "string" ? brief.offer.trim() : "";
  const exactText = typeof brief.exactText === "string" ? brief.exactText.trim() : "";
  const autoCopyStripped = offer.length > 0 || exactText.length > 0;

  return {
    brief: {
      ...brief,
      offer: "",
      exactText: ""
    },
    autoCopyStripped
  };
}

function normalizeBrandProfile(profile: BrandProfile): BrandProfile {
  const root = asRecord(profile);
  const identity = asRecord(root.identity);
  const voice = asRecord(root.voice);
  const palette = asRecord(root.palette);
  const visualSystem = asRecord(root.visualSystem);
  const compliance = asRecord(root.compliance);
  const referenceCanon = asRecord(root.referenceCanon);

  return {
    identity: {
      positioning: asString(identity.positioning),
      promise: asString(identity.promise),
      audienceSummary: asString(identity.audienceSummary)
    },
    voice: {
      summary: asString(voice.summary, "premium"),
      adjectives: toStringArray(voice.adjectives),
      approvedVocabulary: toStringArray(voice.approvedVocabulary),
      bannedPhrases: toStringArray(voice.bannedPhrases)
    },
    palette: {
      primary: asString(palette.primary, "#111111"),
      secondary: asString(palette.secondary, "#6b7280"),
      accent: asString(palette.accent, "#c49a6c"),
      neutrals: toStringArray(palette.neutrals)
    },
    styleDescriptors: toStringArray(root.styleDescriptors),
    visualSystem: {
      typographyMood: asString(visualSystem.typographyMood),
      headlineFontFamily: asString(visualSystem.headlineFontFamily),
      bodyFontFamily: asString(visualSystem.bodyFontFamily),
      typographyNotes: toStringArray(visualSystem.typographyNotes),
      compositionPrinciples: toStringArray(visualSystem.compositionPrinciples),
      imageTreatment: toStringArray(visualSystem.imageTreatment),
      textDensity: normalizeTextDensity(visualSystem.textDensity),
      realismLevel: normalizeRealismLevel(visualSystem.realismLevel)
    },
    doRules: toStringArray(root.doRules),
    dontRules: toStringArray(root.dontRules),
    bannedPatterns: toStringArray(root.bannedPatterns),
    compliance: {
      bannedClaims: toStringArray(compliance.bannedClaims),
      reviewChecks: toStringArray(compliance.reviewChecks)
    },
    referenceAssetIds: toStringArray(root.referenceAssetIds),
    referenceCanon: {
      antiReferenceNotes: toStringArray(referenceCanon.antiReferenceNotes),
      usageNotes: toStringArray(referenceCanon.usageNotes)
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTextDensity(value: unknown): BrandProfile["visualSystem"]["textDensity"] {
  return value === "minimal" || value === "balanced" || value === "dense"
    ? value
    : "balanced";
}

function normalizeRealismLevel(value: unknown): BrandProfile["visualSystem"]["realismLevel"] {
  return value === "documentary" || value === "elevated_real" || value === "stylized"
    ? value
    : "elevated_real";
}

async function runAgnoCreativeDirector(input: Input) {
  try {
    return await runAgnoCreativeDirectorPersistent(input);
  } catch (error) {
    if (!isTransientAgnoError(error)) {
      throw error;
    }

    resetWorkerState();
    return runAgnoCreativeDirectorOneShot(input);
  }
}

async function runAgnoCreativeDirectorV2(input: Input) {
  if (env.CREATIVE_DIRECTOR_V2_TRANSPORT === "server") {
    return runAgnoCreativeDirectorV2Server(input);
  }

  try {
    return await runAgnoCreativeDirectorV2Persistent(input);
  } catch (error) {
    if (!isTransientAgnoError(error)) {
      throw error;
    }

    resetV2WorkerState();
    return runAgnoCreativeDirectorV2OneShot(input);
  }
}

async function runAgnoCreativeDirectorPersistent(input: Input) {
  const state = getWorkerState();
  const requestId = `req_${Date.now()}_${workerRequestCount++}`;
  const payload = buildV1AgentPayload(input);

  return new Promise<CompilerResult>((resolve, reject) => {
    state.pending.set(requestId, {
      resolve: (value) => resolve(normalizeAgnoResult(value, input)),
      reject
    });

    state.child.stdin.write(
      `${JSON.stringify({
        request_id: requestId,
        payload
      })}\n`
    );
  });
}

async function runAgnoCreativeDirectorV2Persistent(input: Input) {
  const state = getV2WorkerState();
  const requestId = `v2_req_${Date.now()}_${v2WorkerRequestCount++}`;
  const payload = buildV2AgentPayload(input);

  return new Promise<CompilerResult>((resolve, reject) => {
    state.pending.set(requestId, {
      resolve: (value) => resolve(normalizeV2AgnoResult(value, input)),
      reject
    });

    state.child.stdin.write(
      `${JSON.stringify({
        request_id: requestId,
        payload
      })}\n`
    );
  });
}

async function runAgnoCreativeDirectorOneShot(input: Input) {
  const scriptPath = getWorkerScriptPath();
  const payload = buildV1AgentPayload(input);

  return new Promise<CompilerResult>((resolve, reject) => {
    const child = spawn(env.AGNO_PYTHON_BIN, [scriptPath], {
      cwd: getWorkerCwd(),
      env: getWorkerEnv(),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += Buffer.from(chunk).toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      const text = Buffer.from(chunk).toString("utf8");
      stderr += text;
      if (text.trim().length > 0) {
        console.error(text.trim());
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const parsed = parseWorkerJson(stdout);

      if (code === 0 && parsed) {
        resolve(normalizeAgnoResult(parsed as CompilerResult, input));
        return;
      }

      const detail = stderr.trim() || stdout.trim();
      reject(
        new Error(
          detail || `Agno worker exited with code ${code ?? "unknown"}`
        )
      );
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function runAgnoCreativeDirectorV2OneShot(input: Input) {
  const scriptPath = getV2WorkerScriptPath();
  const payload = buildV2AgentPayload(input);

  return new Promise<CompilerResult>((resolve, reject) => {
    const child = spawn(env.AGNO_PYTHON_BIN, [scriptPath], {
      cwd: getWorkerCwd(),
      env: getWorkerEnv(),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += Buffer.from(chunk).toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      const text = Buffer.from(chunk).toString("utf8");
      stderr += text;
      if (text.trim().length > 0) {
        console.error(text.trim());
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const parsed = parseWorkerJson(stdout);

      if (code === 0 && parsed) {
        resolve(normalizeV2AgnoResult(parsed as CompilerResult, input));
        return;
      }

      const detail = stderr.trim() || stdout.trim();
      reject(
        new Error(
          detail || `Agno v2 worker exited with code ${code ?? "unknown"}`
        )
      );
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function runAgnoCreativeDirectorV2Server(input: Input) {
  const payload = buildV2AgentPayload(input);
  const controller = new AbortController();
  const timeoutSeconds = env.AGNO_AGENT_V2_SERVER_TIMEOUT_SEC;
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  timeout.unref?.();

  try {
    const response = await fetch(env.AGNO_AGENT_V2_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
      signal: controller.signal
    });
    const raw = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Agno v2 server returned invalid JSON: ${raw.slice(0, 500)}`);
    }

    if (!response.ok) {
      const message =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: unknown }).error)
          : raw.slice(0, 500);
      throw new Error(`Agno v2 server failed with ${response.status}: ${message}`);
    }

    if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
      throw new Error("Agno v2 server response did not include result");
    }

    return normalizeV2AgnoResult((parsed as { result: CompilerResult }).result, input);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Agno v2 server timed out after ${timeoutSeconds}s at ${env.AGNO_AGENT_V2_SERVER_URL}. ` +
          "Increase AGNO_AGENT_V2_SERVER_TIMEOUT_SEC or check the prompt-lab/OpenAI run latency."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || /aborted/i.test(error.message);
}

function getWorkerState() {
  if (workerState && workerState.child.exitCode === null && !workerState.child.killed) {
    return workerState;
  }

  const child = spawn(env.AGNO_PYTHON_BIN, [getWorkerScriptPath()], {
    cwd: getWorkerCwd(),
    env: {
      ...getWorkerEnv(),
      AGNO_PERSISTENT: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  workerState = {
    child,
    pending: new Map(),
    buffer: "",
    stderr: ""
  };

  child.stdout.on("data", (chunk) => {
    if (!workerState) {
      return;
    }

    workerState.buffer += Buffer.from(chunk).toString("utf8");
    const lines = workerState.buffer.split("\n");
    workerState.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const raw = line.trim();
      if (!raw) {
        continue;
      }

      if (!raw.startsWith("{")) {
        workerState.stderr = `${workerState.stderr}\n${raw}`.trim().slice(-4000);
        continue;
      }

      let message: WorkerResponse;

      try {
        message = JSON.parse(raw) as WorkerResponse;
      } catch (error) {
        rejectAllPending(new Error(`Agno worker returned invalid JSON: ${raw}`));
        child.kill();
        return;
      }

      const pending = workerState.pending.get(message.request_id);
      if (!pending) {
        continue;
      }

      workerState.pending.delete(message.request_id);

      if (message.ok && message.result) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error ?? "Agno worker failed"));
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = Buffer.from(chunk).toString("utf8").trim();
    if (text.length > 0) {
      if (workerState) {
        workerState.stderr = `${workerState.stderr}\n${text}`.trim().slice(-4000);
      }
      console.error(text);
    }
  });

  child.on("error", (error) => {
    rejectAllPending(error);
    workerState = null;
  });

  child.on("close", (code) => {
    const state = workerState;
    if (code !== 0) {
      const detail = state?.stderr.trim();
      rejectAllPending(
        new Error(
          detail
            ? `Agno worker exited with code ${code ?? "unknown"}: ${detail}`
            : `Agno worker exited with code ${code ?? "unknown"}`
        )
      );
    }
    workerState = null;
  });

  return workerState;
}

function getV2WorkerState() {
  if (v2WorkerState && v2WorkerState.child.exitCode === null && !v2WorkerState.child.killed) {
    return v2WorkerState;
  }

  const child = spawn(env.AGNO_PYTHON_BIN, [getV2WorkerScriptPath()], {
    cwd: getWorkerCwd(),
    env: {
      ...getWorkerEnv(),
      AGNO_PERSISTENT: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  v2WorkerState = {
    child,
    pending: new Map(),
    buffer: "",
    stderr: ""
  };

  child.stdout.on("data", (chunk) => {
    if (!v2WorkerState) {
      return;
    }

    v2WorkerState.buffer += Buffer.from(chunk).toString("utf8");
    const lines = v2WorkerState.buffer.split("\n");
    v2WorkerState.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const raw = line.trim();
      if (!raw) {
        continue;
      }

      if (!raw.startsWith("{")) {
        v2WorkerState.stderr = `${v2WorkerState.stderr}\n${raw}`.trim().slice(-4000);
        continue;
      }

      let message: WorkerResponse;

      try {
        message = JSON.parse(raw) as WorkerResponse;
      } catch (error) {
        rejectAllV2Pending(new Error(`Agno v2 worker returned invalid JSON: ${raw}`));
        child.kill();
        return;
      }

      const pending = v2WorkerState.pending.get(message.request_id);
      if (!pending) {
        continue;
      }

      v2WorkerState.pending.delete(message.request_id);

      if (message.ok && message.result) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error ?? "Agno v2 worker failed"));
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = Buffer.from(chunk).toString("utf8").trim();
    if (text.length > 0) {
      if (v2WorkerState) {
        v2WorkerState.stderr = `${v2WorkerState.stderr}\n${text}`.trim().slice(-4000);
      }
      console.error(text);
    }
  });

  child.on("error", (error) => {
    rejectAllV2Pending(error);
    v2WorkerState = null;
  });

  child.on("close", (code) => {
    const state = v2WorkerState;
    if (code !== 0) {
      const detail = state?.stderr.trim();
      rejectAllV2Pending(
        new Error(
          detail
            ? `Agno v2 worker exited with code ${code ?? "unknown"}: ${detail}`
            : `Agno v2 worker exited with code ${code ?? "unknown"}`
        )
      );
    }
    v2WorkerState = null;
  });

  return v2WorkerState;
}

function rejectAllPending(error: unknown) {
  if (!workerState) {
    return;
  }

  for (const pending of workerState.pending.values()) {
    pending.reject(error);
  }

  workerState.pending.clear();
}

function rejectAllV2Pending(error: unknown) {
  if (!v2WorkerState) {
    return;
  }

  for (const pending of v2WorkerState.pending.values()) {
    pending.reject(error);
  }

  v2WorkerState.pending.clear();
}

function resetWorkerState() {
  if (!workerState) {
    return;
  }

  workerState.child.kill();
  workerState = null;
}

function resetV2WorkerState() {
  if (!v2WorkerState) {
    return;
  }

  v2WorkerState.child.kill();
  v2WorkerState = null;
}

function getWorkerScriptPath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    env.AGNO_AGENT_SCRIPT
  );
}

function getV2WorkerScriptPath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    env.AGNO_AGENT_V2_SCRIPT
  );
}

function getWorkerCwd() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function getWorkerEnv() {
  return {
    ...process.env,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    AGNO_OPENAI_TIMEOUT_SEC: String(env.AGNO_OPENAI_TIMEOUT_SEC),
    AGNO_OPENAI_MAX_RETRIES: String(env.AGNO_OPENAI_MAX_RETRIES),
    AGNO_RESTRICT_TO_AMENITIES_WITH_IMAGES: String(env.AGNO_RESTRICT_TO_AMENITIES_WITH_IMAGES)
  };
}

function parseWorkerJson(stdout: string) {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const raw = [...lines].reverse().find((line) => line.startsWith("{"));

  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

function isTransientAgnoError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("enoent") ||
    message.includes("spawn python3") ||
    message.includes("spawn python") ||
    message.includes("agno dependencies are missing") ||
    message.includes("connection error") ||
    message.includes("api connection error") ||
    message.includes("temporarily unavailable") ||
    message.includes("timed out")
  );
}

function buildMockFallbackResult(input: Input, error: unknown): CompilerResult {
  const result = compilePromptPackageMock(input);
  const fallbackReason = error instanceof Error ? error.message : String(error);

  return {
    ...result,
    chosenModel: result.chosenModel,
    compilerTrace: {
      ...(result.compilerTrace && typeof result.compilerTrace === "object" ? result.compilerTrace : {}),
      fallbackCompiler: {
        from: "agno",
        to: "mock",
        reason: fallbackReason
      }
    },
    resolvedConstraints: {
      ...(result.resolvedConstraints && typeof result.resolvedConstraints === "object" ? result.resolvedConstraints : {}),
      compilerMode: "mock-fallback"
    }
  };
}

function buildV2MockResult(input: Input): CompilerResult {
  const result = compilePromptPackageMock(input);
  const variationCount = clampVariationCount(input.variationCount);
  const truthBundle = buildV2CreativeTruthBundle(input);
  const variations = buildMockVariations(result, variationCount).map((variation) => ({
    ...variation,
    seedPrompt: refineV2PromptForPostType(variation.seedPrompt, input, truthBundle),
    finalPrompt: refineV2PromptForPostType(variation.finalPrompt, input, truthBundle),
  }));
  const amenityResolutionSummary = truthBundle.amenityResolution
    ? {
        availableAmenities: truthBundle.amenityResolution.availableAmenities.map((option) => option.name),
        selectedAmenity: truthBundle.amenityResolution.selectedAmenity,
        selectedAssetIds: truthBundle.amenityResolution.selectedAssetIds,
        hasExactAssetMatch: truthBundle.amenityResolution.hasExactAssetMatch,
      }
    : null;

  return {
    ...result,
    seedPrompt: variations[0]?.seedPrompt ?? result.seedPrompt,
    finalPrompt: variations[0]?.finalPrompt ?? result.finalPrompt,
    variations,
    compilerTrace: {
      ...(result.compilerTrace && typeof result.compilerTrace === "object" ? result.compilerTrace : {}),
      pipeline: "v2-mock",
      requestedVariationCount: variationCount,
      returnedVariationCount: variations.length,
      compactPromptMode: false,
      promptDetailMode: "poster-spec",
      autoCopySanitized: input.normalizationMeta?.autoCopyStripped ?? false,
      runtimeEvents: {
        available: false,
        reason: "Compile v2 is running in mock mode, so Agno tool and skill events are not available."
      },
      amenityResolutionSummary,
      truthBundleSummary: {
        postTypeCode: truthBundle.postTypeContract.code,
        playbookKey: truthBundle.postTypeContract.playbookKey,
        candidateAssetIds: truthBundle.candidateAssets.map((asset) => asset.id),
        exactAssetIds: {
          logo: truthBundle.exactAssetContract.logoAssetId,
          reraQr: truthBundle.exactAssetContract.reraQrAssetId,
          projectAnchor: truthBundle.exactAssetContract.requiredProjectAnchorAssetId,
        },
      },
      loadedSkillNames: [],
      toolCalls: [],
      skillToolCalls: []
    },
    resolvedConstraints: {
      ...(result.resolvedConstraints && typeof result.resolvedConstraints === "object" ? result.resolvedConstraints : {}),
      compilerMode: "v2-mock",
      compactPromptMode: false,
      promptDetailMode: "poster-spec"
    }
  };
}

function clampVariationCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.max(1, Math.min(6, Math.trunc(parsed)));
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildMockVariations(result: CompilerResult, variationCount: number): PromptVariationResult[] {
  const routes = [
    {
      title: "Hero Anchor",
      strategy: "Full-frame hero subject with restrained premium typography",
      optionPrefix: "Hero-led post option:",
      differenceFromOthers: "Uses the main subject as the dominant visual anchor."
    },
    {
      title: "Editorial Open Frame",
      strategy: "Medium-wide editorial frame with more negative space and quieter copy",
      optionPrefix: "Editorial-open-frame post option:",
      differenceFromOthers: "Uses a calmer open composition rather than a tight detail crop."
    },
    {
      title: "Trust System",
      strategy: "Graphic trust-led layout with disciplined proof band and structured hierarchy",
      optionPrefix: "Trust-system post option:",
      differenceFromOthers: "Uses a cleaner information system while still keeping one complete image."
    },
    {
      title: "Warm Atmosphere",
      strategy: "Atmospheric lifestyle-led route with warm light and minimal text",
      optionPrefix: "Atmosphere-led post option:",
      differenceFromOthers: "Prioritizes mood and aspiration over structured proof cues."
    },
    {
      title: "Minimal Premium",
      strategy: "Sparse premium poster with generous whitespace and one concise message",
      optionPrefix: "Minimal-premium post option:",
      differenceFromOthers: "Removes visual density and relies on quiet hierarchy."
    },
    {
      title: "Bold Announcement",
      strategy: "Sharper announcement route with stronger headline scale and clean contrast",
      optionPrefix: "Bold-announcement post option:",
      differenceFromOthers: "Uses stronger headline pacing while avoiding clutter."
    }
  ];

  return routes.slice(0, variationCount).map((route, index) => {
    const prompt = `${route.optionPrefix} ${result.finalPrompt}`;

    return {
      id: `variation_${index + 1}`,
      title: route.title,
      strategy: route.strategy,
      seedPrompt: prompt,
      finalPrompt: prompt,
      referenceStrategy: result.referenceStrategy,
      differenceFromOthers: route.differenceFromOthers,
      resolvedConstraints: {
        variationIndex: index + 1
      },
      compilerTrace: {
        mockVariation: true
      }
    };
  });
}

function normalizeCompilerVariations(
  raw: CompilerResult,
  input: Input,
  options: {
    seedClauses: string[];
    finalClauses: string[];
    referenceStrategy: (typeof ALLOWED_REFERENCE_STRATEGIES)[number];
  }
): PromptVariationResult[] {
  const requestedCount = clampVariationCount(input.variationCount);
  const rawVariations = Array.isArray(raw.variations) ? raw.variations : [];
  const candidates = rawVariations.length > 0 ? rawVariations : [
    {
      id: "variation_1",
      title: "Primary route",
      strategy: "Primary route generated by the prompt compiler",
      seedPrompt: raw.seedPrompt,
      finalPrompt: raw.finalPrompt,
      referenceStrategy: raw.referenceStrategy,
      differenceFromOthers: null,
      resolvedConstraints: {},
      compilerTrace: { fallbackVariation: rawVariations.length === 0 }
    }
  ];

  const normalized: PromptVariationResult[] = [];

  for (const [index, variation] of candidates.slice(0, requestedCount).entries()) {
    const seedPrompt = typeof variation.seedPrompt === "string" ? variation.seedPrompt.trim() : "";
    const finalPrompt = typeof variation.finalPrompt === "string" ? variation.finalPrompt.trim() : "";

    if (!seedPrompt || !finalPrompt) {
      continue;
    }

    const rawReferenceStrategy = typeof variation.referenceStrategy === "string" ? variation.referenceStrategy : raw.referenceStrategy;
    const referenceStrategy = ALLOWED_REFERENCE_STRATEGIES.includes(rawReferenceStrategy as (typeof ALLOWED_REFERENCE_STRATEGIES)[number])
      ? (rawReferenceStrategy as (typeof ALLOWED_REFERENCE_STRATEGIES)[number])
      : options.referenceStrategy;

    normalized.push({
      id: typeof variation.id === "string" && variation.id.trim() ? variation.id.trim() : `variation_${index + 1}`,
      title: typeof variation.title === "string" && variation.title.trim() ? variation.title.trim() : `Variation ${index + 1}`,
      strategy:
        typeof variation.strategy === "string" && variation.strategy.trim()
          ? variation.strategy.trim()
          : "Distinct creative route",
      seedPrompt: seedPrompt,
      finalPrompt: finalPrompt,
      referenceStrategy,
      differenceFromOthers:
        typeof variation.differenceFromOthers === "string" && variation.differenceFromOthers.trim()
          ? variation.differenceFromOthers.trim()
          : null,
      resolvedConstraints:
        variation.resolvedConstraints && typeof variation.resolvedConstraints === "object"
          ? {
              ...variation.resolvedConstraints,
              variationIndex: index + 1
            }
          : { variationIndex: index + 1 },
      compilerTrace:
        variation.compilerTrace && typeof variation.compilerTrace === "object" ? variation.compilerTrace : {}
    });
  }

  return normalized;
}

function normalizeV2AgnoResult(raw: CompilerResult, input: Input): CompilerResult {
  const truthBundle = buildV2CreativeTruthBundle(input);
  const promptGuardrails = buildV2CompactGuardrailClauses(input);
  const brandGuidance = buildBrandPromptGuidance({
    brandProfile: input.brandProfile
  });
  const festivalGuidance = buildFestivalPromptGuidance(input.festival, input.brandName);
  const useProjectContext = !isFestivalGreetingInput(input);
  const projectGuidance = buildProjectPromptGuidance(useProjectContext ? input.projectProfile : null);
  const postTypeGuidance = buildPostTypePromptGuidance({
    brandName: input.brandName,
    brief: input.brief,
    postType: input.postType,
    projectName: useProjectContext ? input.projectName : null,
    projectProfile: useProjectContext ? input.projectProfile : null,
    brandAssets: input.brandAssets ?? [],
    projectId: useProjectContext ? input.projectId : null
  });
  const referenceStrategy = normalizeReferenceStrategy(raw.referenceStrategy, input);
  const templateType = normalizeTemplateType(raw.templateType, input);
  const aspectRatio = normalizeAspectRatio(raw.aspectRatio, input);
  const normalizedResolvedConstraints =
    raw.resolvedConstraints && typeof raw.resolvedConstraints === "object" ? raw.resolvedConstraints : {};
  const compilerTrace =
    raw.compilerTrace && typeof raw.compilerTrace === "object" ? raw.compilerTrace : {};
  const variations = normalizeCompilerVariations(raw, input, {
    seedClauses: promptGuardrails.seedClauses,
    finalClauses: promptGuardrails.finalClauses,
    referenceStrategy
  }).map((variation) => ({
    ...variation,
    seedPrompt: refineV2PromptForPostType(variation.seedPrompt, input, truthBundle),
    finalPrompt: refineV2PromptForPostType(variation.finalPrompt, input, truthBundle),
  }));
  const firstVariation = variations[0];

  const agentSelectedAmenity = typeof raw.selectedAmenity === "string" && raw.selectedAmenity.length > 0 ? raw.selectedAmenity : null;
  const agentAmenityImageAssetIds = Array.isArray(raw.amenityImageAssetIds) ? raw.amenityImageAssetIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];

  const amenityResolutionSummary = truthBundle.amenityResolution
    ? {
        availableAmenities: truthBundle.amenityResolution.availableAmenities.map((option) => option.name),
        selectedAmenity: agentSelectedAmenity ?? truthBundle.amenityResolution.selectedAmenity,
        selectedAssetIds: agentAmenityImageAssetIds.length > 0 ? agentAmenityImageAssetIds : truthBundle.amenityResolution.selectedAssetIds,
        hasExactAssetMatch: agentAmenityImageAssetIds.length > 0 || truthBundle.amenityResolution.hasExactAssetMatch,
        selectionSource: agentSelectedAmenity ? "agent" as const : truthBundle.amenityResolution.selectionSource,
      }
    : null;

  const resolvedConstraintsOverride = {
    ...normalizedResolvedConstraints,
    amenityImageAssetIds: agentAmenityImageAssetIds.length > 0 ? agentAmenityImageAssetIds : normalizedResolvedConstraints.amenityImageAssetIds,
  };

  return {
    ...raw,
    seedPrompt: firstVariation?.seedPrompt ?? raw.seedPrompt,
    finalPrompt: firstVariation?.finalPrompt ?? raw.finalPrompt,
    aspectRatio,
    chosenModel:
      typeof raw.chosenModel === "string" && raw.chosenModel.trim().length > 0
        ? raw.chosenModel
        : env.IMAGE_GENERATION_PROVIDER === "openrouter"
          ? env.OPENROUTER_FINAL_MODEL
          : env.FAL_FINAL_MODEL,
    referenceStrategy,
    templateType,
    variations,
    compilerTrace: {
      ...compilerTrace,
      pipeline: "v2-notebook-two-agent",
      requestedVariationCount: clampVariationCount(input.variationCount),
      returnedVariationCount: variations.length,
      compactPromptMode: false,
      promptDetailMode: "poster-spec",
      posterSpecGuardrails: promptGuardrails,
      brandGuidanceManifest: brandGuidance.manifest,
      festivalGuidanceManifest: festivalGuidance.manifest,
      projectGuidanceManifest: projectGuidance.manifest,
      postTypeGuidanceManifest: postTypeGuidance.manifest,
      autoCopySanitized: input.normalizationMeta?.autoCopyStripped ?? false,
      amenityResolutionSummary: truthBundle.amenityResolution
        ? {
            availableAmenities: truthBundle.amenityResolution.availableAmenities.map((option) => option.name),
            selectedAmenity: truthBundle.amenityResolution.selectedAmenity,
            selectedAssetIds: truthBundle.amenityResolution.selectedAssetIds,
            hasExactAssetMatch: truthBundle.amenityResolution.hasExactAssetMatch,
          }
        : null,
      truthBundleSummary: {
        postTypeCode: truthBundle.postTypeContract.code,
        playbookKey: truthBundle.postTypeContract.playbookKey,
        candidateAssetIds: truthBundle.candidateAssets.map((asset) => asset.id),
        exactAssetIds: {
          logo: truthBundle.exactAssetContract.logoAssetId,
          reraQr: truthBundle.exactAssetContract.reraQrAssetId,
          projectAnchor: truthBundle.exactAssetContract.requiredProjectAnchorAssetId,
        },
      },
      runtimeEvents:
        compilerTrace.runtimeEvents && typeof compilerTrace.runtimeEvents === "object"
          ? compilerTrace.runtimeEvents
          : {
              available: false,
              reason: "Agno runtime event capture is not enabled for the v2 test endpoint yet."
            },
      toolCalls: Array.isArray(compilerTrace.toolCalls) ? compilerTrace.toolCalls : [],
      skillToolCalls: Array.isArray(compilerTrace.skillToolCalls) ? compilerTrace.skillToolCalls : []
    },
    resolvedConstraints: {
      ...normalizedResolvedConstraints,
      palette:
        "palette" in normalizedResolvedConstraints && normalizedResolvedConstraints.palette
          ? normalizedResolvedConstraints.palette
          : input.brandProfile.palette,
      styleDescriptors:
        "styleDescriptors" in normalizedResolvedConstraints && Array.isArray(normalizedResolvedConstraints.styleDescriptors)
          ? normalizedResolvedConstraints.styleDescriptors
          : brandGuidance.styleDescriptors,
      brandIdentity:
        "brandIdentity" in normalizedResolvedConstraints && normalizedResolvedConstraints.brandIdentity
          ? normalizedResolvedConstraints.brandIdentity
          : input.brandProfile.identity,
      approvedVocabulary:
        "approvedVocabulary" in normalizedResolvedConstraints && Array.isArray(normalizedResolvedConstraints.approvedVocabulary)
          ? normalizedResolvedConstraints.approvedVocabulary
          : brandGuidance.approvedVocabulary,
      banned:
        "banned" in normalizedResolvedConstraints && Array.isArray(normalizedResolvedConstraints.banned)
          ? normalizedResolvedConstraints.banned
          : [...brandGuidance.bannedTerms, ...projectGuidance.manifest.bannedClaims],
      festival:
        "festival" in normalizedResolvedConstraints && normalizedResolvedConstraints.festival
          ? normalizedResolvedConstraints.festival
          : festivalGuidance.manifest,
      postTypeGuidance:
        "postTypeGuidance" in normalizedResolvedConstraints && normalizedResolvedConstraints.postTypeGuidance
          ? normalizedResolvedConstraints.postTypeGuidance
          : postTypeGuidance.manifest,
      includeBrandLogo:
        "includeBrandLogo" in normalizedResolvedConstraints
          ? normalizedResolvedConstraints.includeBrandLogo
          : input.brief.includeBrandLogo,
      includeReraQr:
        "includeReraQr" in normalizedResolvedConstraints
          ? normalizedResolvedConstraints.includeReraQr
          : input.brief.includeReraQr,
      variationCount: clampVariationCount(input.variationCount),
      compilerMode: "v2-agno",
      compactPromptMode: false,
      promptDetailMode: "poster-spec"
    }
  };
}

function normalizeAgnoResult(raw: CompilerResult, input: Input): CompilerResult {
  const promptGuardrails = buildPromptGuardrailClauses(input);
  const { brandGuidance, festivalGuidance, projectGuidance, postTypeGuidance, seedClauses, finalClauses } = promptGuardrails;
  const referenceStrategy = normalizeReferenceStrategy(raw.referenceStrategy, input);
  const templateType = normalizeTemplateType(raw.templateType, input);
  const aspectRatio = normalizeAspectRatio(raw.aspectRatio, input);
  const rawReferenceStrategy = typeof raw.referenceStrategy === "string" ? raw.referenceStrategy : null;
  const rawTemplateType = typeof raw.templateType === "string" ? raw.templateType : null;
  const normalizedResolvedConstraints =
    raw.resolvedConstraints && typeof raw.resolvedConstraints === "object" ? raw.resolvedConstraints : {};
  const normalizedCompilerTrace =
    raw.compilerTrace && typeof raw.compilerTrace === "object" ? raw.compilerTrace : {};

  const variations = normalizeCompilerVariations(raw, input, {
    seedClauses,
    finalClauses,
    referenceStrategy
  });

  const seedPrompt = variations[0]?.seedPrompt ?? appendMissingPromptClauses(raw.seedPrompt, seedClauses);
  const finalPrompt = variations[0]?.finalPrompt ?? appendMissingPromptClauses(raw.finalPrompt, finalClauses);

  return {
    ...raw,
    seedPrompt,
    finalPrompt,
    variations,
    aspectRatio,
    chosenModel:
      typeof raw.chosenModel === "string" && raw.chosenModel.trim().length > 0
        ? raw.chosenModel
        : env.IMAGE_GENERATION_PROVIDER === "openrouter"
          ? env.OPENROUTER_FINAL_MODEL
          : env.FAL_FINAL_MODEL,
    referenceStrategy,
    templateType,
    resolvedConstraints: {
      ...normalizedResolvedConstraints,
      palette:
        "palette" in normalizedResolvedConstraints && normalizedResolvedConstraints.palette
          ? normalizedResolvedConstraints.palette
          : input.brandProfile.palette,
      styleDescriptors:
        "styleDescriptors" in normalizedResolvedConstraints && Array.isArray(normalizedResolvedConstraints.styleDescriptors)
          ? normalizedResolvedConstraints.styleDescriptors
          : brandGuidance.styleDescriptors,
      brandIdentity:
        "brandIdentity" in normalizedResolvedConstraints && normalizedResolvedConstraints.brandIdentity
          ? normalizedResolvedConstraints.brandIdentity
          : input.brandProfile.identity,
      approvedVocabulary:
        "approvedVocabulary" in normalizedResolvedConstraints && Array.isArray(normalizedResolvedConstraints.approvedVocabulary)
          ? normalizedResolvedConstraints.approvedVocabulary
          : brandGuidance.approvedVocabulary,
      banned:
        "banned" in normalizedResolvedConstraints && Array.isArray(normalizedResolvedConstraints.banned)
          ? normalizedResolvedConstraints.banned
          : [...brandGuidance.bannedTerms, ...projectGuidance.manifest.bannedClaims],
      festival:
        "festival" in normalizedResolvedConstraints && normalizedResolvedConstraints.festival
          ? normalizedResolvedConstraints.festival
          : festivalGuidance.manifest,
      postTypeGuidance:
        "postTypeGuidance" in normalizedResolvedConstraints && normalizedResolvedConstraints.postTypeGuidance
          ? normalizedResolvedConstraints.postTypeGuidance
          : postTypeGuidance.manifest,
      includeBrandLogo:
        "includeBrandLogo" in normalizedResolvedConstraints
          ? normalizedResolvedConstraints.includeBrandLogo
          : input.brief.includeBrandLogo,
      includeReraQr:
        "includeReraQr" in normalizedResolvedConstraints
          ? normalizedResolvedConstraints.includeReraQr
          : input.brief.includeReraQr,
      variationCount: clampVariationCount(input.variationCount)
    },
    compilerTrace: {
      ...normalizedCompilerTrace,
      brandGuidanceManifest: brandGuidance.manifest,
      festivalGuidanceManifest: festivalGuidance.manifest,
      projectGuidanceManifest: projectGuidance.manifest,
      postTypeGuidanceManifest: postTypeGuidance.manifest,
      requestedVariationCount: clampVariationCount(input.variationCount),
      returnedVariationCount: variations.length,
      ...(rawReferenceStrategy && !ALLOWED_REFERENCE_STRATEGIES.includes(rawReferenceStrategy as (typeof ALLOWED_REFERENCE_STRATEGIES)[number])
        ? { rawReferenceStrategy }
        : {}),
      ...(rawTemplateType && !ALLOWED_TEMPLATE_TYPES.includes(rawTemplateType as (typeof ALLOWED_TEMPLATE_TYPES)[number])
        ? { rawTemplateType }
        : {})
    }
  };
}

function buildPromptGuardrailClauses(input: Input) {
  const brandGuidance = buildBrandPromptGuidance({
    brandProfile: input.brandProfile
  });
  const festivalGuidance = buildFestivalPromptGuidance(input.festival, input.brandName);
  const useProjectContext = !isFestivalGreetingInput(input);
  const projectGuidance = buildProjectPromptGuidance(useProjectContext ? input.projectProfile : null);
  const postTypeGuidance = buildPostTypePromptGuidance({
    brandName: input.brandName,
    brief: input.brief,
    postType: input.postType,
    projectName: useProjectContext ? input.projectName : null,
    projectProfile: useProjectContext ? input.projectProfile : null,
    brandAssets: input.brandAssets ?? [],
    projectId: useProjectContext ? input.projectId : null
  });
  const seedClauses = [
    ...brandGuidance.seedClauses,
    ...festivalGuidance.seedClauses,
    ...projectGuidance.seedClauses,
    ...postTypeGuidance.seedClauses,
    ...buildAssetUsageSeedClauses(input.brief)
  ];
  const finalClauses = [
    ...brandGuidance.finalClauses,
    ...festivalGuidance.finalClauses,
    ...projectGuidance.finalClauses,
    ...postTypeGuidance.finalClauses,
    ...buildAssetUsageFinalClauses(input.brief)
  ];

  return {
    brandGuidance,
    festivalGuidance,
    projectGuidance,
    postTypeGuidance,
    seedClauses,
    finalClauses
  };
}

function normalizeAspectRatio(aspectRatio: string, input: Input) {
  if (typeof aspectRatio === "string" && /^\d+:\d+$/.test(aspectRatio.trim())) {
    return aspectRatio.trim();
  }

  return deriveAspectRatio(input.brief.format);
}

function normalizeReferenceStrategy(referenceStrategy: string, input: Input) {
  if (ALLOWED_REFERENCE_STRATEGIES.includes(referenceStrategy as (typeof ALLOWED_REFERENCE_STRATEGIES)[number])) {
    return referenceStrategy as (typeof ALLOWED_REFERENCE_STRATEGIES)[number];
  }

  const hasReferences = input.referenceLabels.length > 0;
  const hasTemplate = Boolean(input.template?.name);

  if (hasReferences && hasTemplate) {
    return "hybrid";
  }

  if (hasReferences) {
    return "uploaded-references";
  }

  return "generated-template";
}

function normalizeTemplateType(
  templateType: string | undefined,
  input: Input
): (typeof ALLOWED_TEMPLATE_TYPES)[number] | undefined {
  if (templateType && ALLOWED_TEMPLATE_TYPES.includes(templateType as (typeof ALLOWED_TEMPLATE_TYPES)[number])) {
    return templateType as (typeof ALLOWED_TEMPLATE_TYPES)[number];
  }

  if (input.brief.templateType && ALLOWED_TEMPLATE_TYPES.includes(input.brief.templateType)) {
    return input.brief.templateType;
  }

  return undefined;
}

function inferPlaybookKey(code: string | undefined) {
  switch (code) {
    case "project-launch":
      return "launch-post-playbook";
    case "construction-update":
      return "construction-update-playbook";
    case "festive-greeting":
      return "festival-post-playbook";
    case "site-visit-invite":
      return "site-visit-playbook";
    case "amenity-spotlight":
      return "amenity-spotlight-playbook";
    case "location-advantage":
      return "location-advantage-playbook";
    case "testimonial":
      return "testimonial-playbook";
    default:
      return "launch-post-playbook";
  }
}

function normalizeAssetTags(label: string, metadataJson: Record<string, unknown>) {
  const explicitTags = Array.isArray(metadataJson.tags)
    ? metadataJson.tags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const inferred = label
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .slice(0, 8);
  return Array.from(new Set([...explicitTags, ...inferred])).slice(0, 12);
}

function inferAmenityName(label: string, metadataJson: Record<string, unknown>) {
  return inferAmenityNameFromAssetParts(label, metadataJson);
}

function inferAssetSubjectType(
  asset: BrandAssetRecord,
  metadataJson: Record<string, unknown>,
  templateRoles: Array<Pick<CreativeTemplateAssetRecord, "assetId" | "role">>
): NormalizedAssetMetadata["subjectType"] {
  const explicit = metadataJson.subjectType;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit as NormalizedAssetMetadata["subjectType"];
  }

  if (asset.kind === "logo") {
    return "logo";
  }

  if (asset.kind === "rera_qr") {
    return "rera_qr";
  }

  const lower = asset.label.toLowerCase();
  if (lower.includes("construction") || lower.includes("progress") || lower.includes("site")) {
    return "construction_progress";
  }
  if (
    lower.includes("sample flat") ||
    lower.includes("bedroom") ||
    lower.includes("living room") ||
    lower.includes("interior")
  ) {
    return lower.includes("sample flat") ? "sample_flat" : "interior";
  }
  if (inferAmenityName(asset.label, metadataJson)) {
    return "amenity";
  }
  if (asset.kind === "inspiration") {
    return "generic_reference";
  }
  if (templateRoles.some((entry) => entry.role === "logo_ref")) {
    return "logo";
  }
  if (asset.projectId) {
    return "project_exterior";
  }
  return asset.kind === "reference" ? "generic_reference" : "lifestyle";
}

function inferAssetViewType(asset: BrandAssetRecord, metadataJson: Record<string, unknown>) {
  const fallback: NonNullable<NormalizedAssetMetadata["viewType"]> = "wide";
  const explicit = metadataJson.viewType;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit as NonNullable<NormalizedAssetMetadata["viewType"]>;
  }

  const lower = asset.label.toLowerCase();
  if (lower.includes("aerial") || lower.includes("drone") || lower.includes("bird")) {
    return "aerial";
  }
  if (lower.includes("facade") || lower.includes("elevation") || lower.includes("front")) {
    return "facade";
  }
  if (lower.includes("close") || lower.includes("detail")) {
    return "close_up";
  }
  if (lower.includes("street") || lower.includes("entrance") || lower.includes("arrival")) {
    return "street";
  }
  if (lower.includes("construction") || lower.includes("site")) {
    return "site";
  }
  if (lower.includes("interior") || lower.includes("bedroom") || lower.includes("living room")) {
    return "interior";
  }
  return fallback;
}

function inferAssetQualityTier(asset: BrandAssetRecord, metadataJson: Record<string, unknown>) {
  const fallback: NonNullable<NormalizedAssetMetadata["qualityTier"]> = "usable";
  const explicit = metadataJson.qualityTier;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit as NonNullable<NormalizedAssetMetadata["qualityTier"]>;
  }

  const lower = asset.label.toLowerCase();
  if (lower.includes("hero") || lower.includes("cover") || lower.includes("launch")) {
    return "hero";
  }
  if (asset.kind === "logo" || asset.kind === "rera_qr") {
    return "usable";
  }
  return asset.projectId ? "hero" : fallback;
}

function buildV2CandidateAssets(input: Input) {
  const useProjectContext = !isFestivalGreetingInput(input);
  const postTypeGuidance = buildPostTypePromptGuidance({
    brandName: input.brandName,
    brief: input.brief,
    postType: input.postType,
    projectName: useProjectContext ? input.projectName : null,
    projectProfile: useProjectContext ? input.projectProfile : null,
    brandAssets: input.brandAssets ?? [],
    projectId: useProjectContext ? input.projectId : null
  });
  const amenityFocusResolution = isAmenityFocusedPostType(input.postType?.code ?? null)
    ? resolveAmenityFocus({
        briefText: [input.brief.goal, input.brief.prompt, input.brief.exactText ?? ""].join(" "),
        projectAmenityNames: [
          ...(input.projectProfile?.heroAmenities ?? []),
          ...(input.projectProfile?.amenities ?? []),
        ],
        allAssets: input.brandAssets ?? [],
        projectId: input.projectId ?? null,
        seed: [
          input.postType?.code ?? "",
          input.projectName ?? "",
          input.brief.goal,
          input.brief.prompt,
          input.brief.channel,
          input.brief.format,
          input.brief.templateType ?? "",
        ].join("|"),
      })
    : null;
  const templateLinkedAssets = input.template?.linkedAssets ?? input.templateAssets ?? [];
  const templateRoleMap = new Map<string, Array<Pick<CreativeTemplateAssetRecord, "assetId" | "role">>>();
  for (const entry of templateLinkedAssets) {
    const current = templateRoleMap.get(entry.assetId) ?? [];
    current.push(entry);
    templateRoleMap.set(entry.assetId, current);
  }

  const selectedReferenceIds = input.brief.referenceAssetIds ?? [];
  const projectImageIds = input.projectProfile?.actualProjectImageIds ?? [];
  const sampleFlatImageIds = input.projectProfile?.sampleFlatImageIds ?? [];
  const brandDefaultReferenceIds = input.brandProfile.referenceAssetIds ?? [];
  const brandLogoId = input.brief.includeBrandLogo
    ? input.brandAssets?.find((asset) => asset.kind === "logo")?.id ?? null
    : null;
  const reraQrId = input.brief.includeReraQr
    ? selectReraQrAssetForProject(input.brandAssets ?? [], input.projectId)?.id ?? null
    : null;
  const inferredReferenceSelection = buildInferredReferenceSelection({
    postTypeCode: input.postType?.code ?? null,
    isFestiveGreeting: isFestivalGreetingInput(input),
    explicitReferenceAssetIds: selectedReferenceIds,
    projectImageAssetIds: projectImageIds,
    sampleFlatImageIds,
    brandReferenceAssetIds: brandDefaultReferenceIds,
    allAssets: input.brandAssets ?? [],
    projectId: input.projectId ?? null,
    focusAmenity: postTypeGuidance.manifest.amenityFocus ?? null,
  });
  const amenityFocusedPost = isAmenityFocusedPostType(input.postType?.code ?? null);
  const projectAmenityCandidateIds = amenityFocusedPost
    ? dedupeStrings(amenityFocusResolution?.amenityAssetIds ?? [])
    : [];

  const candidateIds = dedupeStrings([
    ...(amenityFocusedPost ? projectAmenityCandidateIds : []),
    ...inferredReferenceSelection.referenceAssetIds,
    ...templateLinkedAssets.map((entry) => entry.assetId),
    ...(amenityFocusedPost ? projectImageIds : []),
    ...(brandLogoId ? [brandLogoId] : []),
    ...(reraQrId ? [reraQrId] : []),
  ]);

  const rank = new Map(candidateIds.map((id, index) => [id, index]));
  const assets = (input.brandAssets ?? [])
    .filter((asset) => candidateIds.includes(asset.id))
    .filter((asset) => {
      if (asset.kind === "logo" || asset.kind === "rera_qr") {
        return true;
      }

      if (input.projectId) {
        return !asset.projectId || asset.projectId === input.projectId;
      }

      return !asset.projectId || selectedReferenceIds.includes(asset.id);
    })
    .sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));

  const normalized: CandidateAsset[] = assets.map((asset) => {
    const metadataJson = asset.metadataJson ?? {};
    const templateRoles = templateRoleMap.get(asset.id) ?? [];
    const isProjectTruthAnchor = projectImageIds.includes(asset.id);
    const subjectType = inferAssetSubjectType(asset, metadataJson, templateRoles);
    const viewType = inferAssetViewType(asset, metadataJson);
    const preserveIdentity =
      typeof metadataJson.preserveIdentity === "boolean"
        ? metadataJson.preserveIdentity
        : isProjectTruthAnchor ||
          subjectType === "project_exterior" ||
          subjectType === "construction_progress" ||
          subjectType === "sample_flat" ||
          subjectType === "amenity" ||
          subjectType === "interior";

    const usageIntent: NonNullable<NormalizedAssetMetadata["usageIntent"]> =
      typeof metadataJson.usageIntent === "string" && metadataJson.usageIntent.trim()
        ? (metadataJson.usageIntent as NonNullable<NormalizedAssetMetadata["usageIntent"]>)
        : asset.kind === "logo" || asset.kind === "rera_qr"
          ? "exact_asset"
          : isProjectTruthAnchor
            ? "truth_anchor"
            : asset.kind === "inspiration"
              ? "inspiration_only"
              : "supporting_ref";

    return {
      id: asset.id,
      brandId: asset.brandId,
      projectId: asset.projectId ?? null,
      kind: asset.kind,
      label: asset.label,
      fileName: asset.fileName,
      storagePath: asset.storagePath,
      metadataJson,
      normalizedMetadata: {
        subjectType,
        viewType,
        amenityName: inferAmenityName(asset.label, metadataJson),
        projectStageHint:
          typeof metadataJson.projectStageHint === "string" && metadataJson.projectStageHint.trim()
            ? (metadataJson.projectStageHint as ProjectRecord["stage"])
            : input.projectStage ?? undefined,
        usageIntent,
        preserveIdentity,
        textSafeHints: Array.isArray(metadataJson.textSafeHints)
          ? metadataJson.textSafeHints.filter((value): value is string => typeof value === "string")
          : [],
        qualityTier: inferAssetQualityTier(asset, metadataJson),
        tags: normalizeAssetTags(asset.label, metadataJson),
      },
      templateRoles: templateRoles.map((entry) => entry.role),
      eligibility: {
        isProjectScoped: Boolean(input.projectId && asset.projectId === input.projectId),
        isTemplateLinked: templateRoles.length > 0,
        isSelectedReference: selectedReferenceIds.includes(asset.id),
        isBrandDefaultReference: brandDefaultReferenceIds.includes(asset.id),
        isExactLogo: Boolean(brandLogoId && asset.id === brandLogoId),
        isExactReraQr: Boolean(reraQrId && asset.id === reraQrId),
        isProjectTruthAnchor,
      },
    };
  });

  return {
    candidateAssets: normalized,
    brandLogoId,
    reraQrId,
    requiredProjectAnchorAssetId: normalized.find((asset) => asset.eligibility.isProjectTruthAnchor)?.id ?? null,
  };
}

function buildV2GenerationContract(input: Input) {
  const hasReferences =
    (input.brief.referenceAssetIds?.length ?? 0) > 0 ||
    (input.projectProfile?.actualProjectImageIds?.length ?? 0) > 0 ||
    Boolean(input.brief.includeBrandLogo) ||
    Boolean(input.brief.includeReraQr);
  const chosenModel =
    env.IMAGE_GENERATION_PROVIDER === "openrouter"
      ? env.OPENROUTER_FINAL_MODEL
      : hasReferences
        ? env.FAL_FINAL_MODEL
        : env.FAL_STYLE_SEED_MODEL;
  const compactGuardrails = buildV2CompactGuardrailClauses(input);
  return {
    aspectRatio: deriveAspectRatio(input.brief.format),
    chosenModel,
    variationCount: clampVariationCount(input.variationCount),
    maxSupportingRefs: 2,
    hardGuardrails: Array.from(new Set([...compactGuardrails.seedClauses, ...compactGuardrails.finalClauses])),
  };
}

function buildV2CreativeTruthBundle(input: Input): CreativeTruthBundle {
  const useProjectContext = !isFestivalGreetingInput(input);
  const postTypeGuidance = buildPostTypePromptGuidance({
    brandName: input.brandName,
    brief: input.brief,
    postType: input.postType,
    projectName: useProjectContext ? input.projectName : null,
    projectProfile: useProjectContext ? input.projectProfile : null,
    brandAssets: input.brandAssets ?? [],
    projectId: useProjectContext ? input.projectId : null
  });
  const candidateAssetState = buildV2CandidateAssets(input);
  return {
    requestContext: {
      createMode: input.brief.createMode,
      channel: input.brief.channel,
      format: input.brief.format,
      goal: input.brief.goal,
      prompt: input.brief.prompt,
      audience: input.brief.audience,
      copyMode: input.brief.copyMode,
      offer: input.brief.offer,
      exactText: input.brief.exactText,
      templateType: input.brief.templateType,
      variationCount: clampVariationCount(input.variationCount),
      includeBrandLogo: input.brief.includeBrandLogo,
      includeReraQr: input.brief.includeReraQr,
    },
    brandTruth: {
      name: input.brandName,
      identity: input.brandProfile.identity,
      palette: input.brandProfile.palette,
      styleDescriptors: input.brandProfile.styleDescriptors,
      visualSystem: input.brandProfile.visualSystem,
      voice: input.brandProfile.voice,
      doRules: input.brandProfile.doRules,
      dontRules: input.brandProfile.dontRules,
      bannedPatterns: input.brandProfile.bannedPatterns,
      compliance: input.brandProfile.compliance,
      referenceCanon: input.brandProfile.referenceCanon,
    },
    projectTruth:
      input.projectProfile && input.projectName && input.projectId && input.projectStage
        ? {
            id: input.projectId,
            name: input.projectName,
            stage: input.projectStage,
            tagline: input.projectProfile.tagline,
            positioning: input.projectProfile.positioning,
            lifestyleAngle: input.projectProfile.lifestyleAngle,
            audienceSegments: input.projectProfile.audienceSegments,
            heroAmenities: input.projectProfile.heroAmenities,
            amenities: input.projectProfile.amenities,
            locationAdvantages: input.projectProfile.locationAdvantages,
            nearbyLandmarks: input.projectProfile.nearbyLandmarks,
            constructionStatus: input.projectProfile.constructionStatus,
            latestUpdate: input.projectProfile.latestUpdate,
            approvedClaims: input.projectProfile.approvedClaims,
            bannedClaims: input.projectProfile.bannedClaims,
            legalNotes: input.projectProfile.legalNotes,
            credibilityFacts: input.projectProfile.credibilityFacts,
            reraNumber: input.projectProfile.reraNumber,
            actualProjectImageIds: input.projectProfile.actualProjectImageIds,
            sampleFlatImageIds: input.projectProfile.sampleFlatImageIds,
          }
        : null,
    postTypeContract: {
      id: input.brief.postTypeId ?? "",
      code: input.postType?.code ?? "project-launch",
      name: input.postType?.name ?? "Project launch",
      config: input.postType?.config ?? {
        defaultChannels: [],
        allowedFormats: [],
        recommendedTemplateTypes: [],
        requiredBriefFields: [],
        safeZoneGuidance: [],
      },
      playbookKey: postTypeGuidance.manifest.playbookKey ?? inferPlaybookKey(input.postType?.code),
      requiredFields: input.postType?.config?.requiredBriefFields ?? [],
      safeZoneGuidance: input.postType?.config?.safeZoneGuidance ?? [],
      amenityFocus: postTypeGuidance.manifest.amenityFocus ?? null,
      amenitySelectionSource: postTypeGuidance.manifest.amenitySelectionSource ?? "none",
    },
    festivalTruth: input.festival
      ? {
          id: input.festival.id,
          code: input.festival.code,
          name: input.festival.name,
          category: input.festival.category,
          community: input.festival.community,
          regions: input.festival.regions,
          meaning: input.festival.meaning,
          dateLabel: input.festival.dateLabel,
          nextOccursOn: input.festival.nextOccursOn,
        }
      : null,
    templateTruth: input.template
      ? {
          id: input.template.id,
          name: input.template.name,
          channel: input.template.channel,
          format: input.template.format,
          basePrompt: input.template.basePrompt,
          promptScaffold:
            typeof input.template.config?.promptScaffold === "string" ? input.template.config.promptScaffold : undefined,
          roles: Array.from(
            new Set(
              (input.template.linkedAssets ?? input.templateAssets ?? [])
                .map((entry) => entry.role)
                .filter((value) => typeof value === "string" && value.length > 0)
            )
          ),
          linkedAssets: (input.template.linkedAssets ?? input.templateAssets ?? []).map((entry) => ({
            assetId: entry.assetId,
            role: entry.role,
          })),
        }
      : null,
    candidateAssets: candidateAssetState.candidateAssets,
    amenityResolution: buildTruthBundleAmenityResolution(input, postTypeGuidance.manifest.amenityFocus ?? null),
    exactAssetContract: {
      logoAssetId: candidateAssetState.brandLogoId,
      reraQrAssetId: candidateAssetState.reraQrId,
      requiredProjectAnchorAssetId: candidateAssetState.requiredProjectAnchorAssetId,
      mustUseExactLogo: Boolean(input.brief.includeBrandLogo && candidateAssetState.brandLogoId),
      mustUseExactReraQr: Boolean(input.brief.includeReraQr && candidateAssetState.reraQrId),
      preserveProjectIdentity: Boolean(candidateAssetState.requiredProjectAnchorAssetId),
    },
    generationContract: buildV2GenerationContract(input),
  };
}

function buildTruthBundleAmenityResolution(
  input: Input,
  selectedAmenity: string | null
) {
  const projectAmenityNames = [
    ...(input.projectProfile?.heroAmenities ?? []),
    ...(input.projectProfile?.amenities ?? []),
  ];
  const availableAmenities = buildProjectAmenityCatalog({
    projectAmenityNames,
    allAssets: input.brandAssets ?? [],
    projectId: input.projectId ?? null,
  });
  if (!isAmenityFocusedPostType(input.postType?.code ?? null)) {
    return availableAmenities.length > 0
      ? {
          availableAmenities,
          selectedAmenity: null,
          selectionSource: "none" as const,
          selectedAssetIds: [],
          hasExactAssetMatch: false,
        }
      : null;
  }

  const selection = resolveAmenityFocus({
    briefText: [input.brief.goal, input.brief.prompt, input.brief.exactText ?? ""].join(" "),
    projectAmenityNames,
    allAssets: input.brandAssets ?? [],
    projectId: input.projectId ?? null,
    seed: [
      input.postType?.code ?? "",
      input.projectName ?? "",
      input.brief.goal,
      input.brief.prompt,
      input.brief.channel,
      input.brief.format,
      input.brief.templateType ?? "",
    ].join("|"),
  });

  return {
    availableAmenities,
    selectedAmenity: selectedAmenity ?? selection.focusAmenity ?? null,
    selectionSource: selection.source,
    selectedAssetIds: selection.amenityAssetIds,
    hasExactAssetMatch: selection.amenityAssetIds.length > 0,
  };
}

function buildV1AgentPayload(input: Input): V1AgentPayload {
  const brandGuidance = buildBrandPromptGuidance({
    brandProfile: input.brandProfile
  });
  const festivalGuidance = buildFestivalPromptGuidance(input.festival, input.brandName);
  const useProjectContext = !isFestivalGreetingInput(input);
  const projectGuidance = buildProjectPromptGuidance(useProjectContext ? input.projectProfile : null);
  const postTypeGuidance = buildPostTypePromptGuidance({
    brandName: input.brandName,
    brief: input.brief,
    postType: input.postType,
    projectName: useProjectContext ? input.projectName : null,
    projectProfile: useProjectContext ? input.projectProfile : null,
    brandAssets: input.brandAssets ?? [],
    projectId: useProjectContext ? input.projectId : null
  });

  return {
    ...input,
    projectName: useProjectContext ? input.projectName ?? null : null,
    projectProfile: useProjectContext ? input.projectProfile ?? null : null,
    brandPromptManifest: brandGuidance.manifest,
    festivalPromptManifest: festivalGuidance.manifest,
    projectPromptManifest: projectGuidance.manifest,
    postTypePromptManifest: postTypeGuidance.manifest,
    promptGuardrails: {
      seedClauses: [
        ...brandGuidance.seedClauses,
        ...festivalGuidance.seedClauses,
        ...projectGuidance.seedClauses,
        ...postTypeGuidance.seedClauses,
        ...buildAssetUsageSeedClauses(input.brief)
      ],
      finalClauses: [
        ...brandGuidance.finalClauses,
        ...festivalGuidance.finalClauses,
        ...projectGuidance.finalClauses,
        ...postTypeGuidance.finalClauses,
        ...buildAssetUsageFinalClauses(input.brief)
      ]
    }
  };
}

function buildV2AgentPayload(input: Input): V2AgentPayload {
  return {
    truthBundle: buildV2CreativeTruthBundle(input),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {})
  };
}

export function buildCanonicalV2AgentPayload(input: CreativeDirectorInput): V2AgentPayload {
  return buildV2AgentPayload(normalizeCreativeDirectorInput(input));
}

function buildBrandPaletteClause(input: Input) {
  const { primary, secondary, accent } = input.brandProfile.palette;
  return `Use the saved brand palette for graphic elements: primary ${primary}, secondary ${secondary}, accent ${accent}. Apply these to typography, overlays, divider lines, and restrained highlights instead of generic colors.`;
}

function buildBrandTypographyClause(input: Input) {
  const { typographyMood, headlineFontFamily, bodyFontFamily, typographyNotes } = input.brandProfile.visualSystem;
  const clauses = [
    typographyMood ? `Typography mood should follow this brand direction: ${typographyMood}.` : null,
    headlineFontFamily ? `When rendering headline text, align the styling with the saved brand headline font family: ${headlineFontFamily}.` : null,
    bodyFontFamily ? `When rendering supporting copy, align the styling with the saved brand body font family: ${bodyFontFamily}.` : null,
    typographyNotes.length > 0 ? `Typography rules: ${typographyNotes.join("; ")}.` : null
  ].filter((value): value is string => Boolean(value));

  return clauses.join(" ");
}

function buildV2CompactGuardrailClauses(input: Input) {
  const bannedClaims = [
    ...(input.brandProfile.compliance?.bannedClaims ?? []),
    ...(input.projectProfile?.bannedClaims ?? [])
  ].filter(Boolean).slice(0, 6);
  const exactText = input.brief.exactText?.trim();
  const postTypeCode = input.postType?.code;
  const progressCue = postTypeCode === "construction-update" ? extractConstructionProgressCue(input) : null;
  const projectImageRequired =
    !isFestivalGreetingInput(input) &&
    Boolean(input.projectProfile?.actualProjectImageIds?.length || input.referenceLabels.length > 0);
  const textGuardrail =
    postTypeCode === "construction-update"
      ? [
          "MUST include TWO separate text elements: (1) Bold HEADLINE text like 'CONSTRUCTION UPDATE' or 'SITE PROGRESS' at top, (2) Smaller SUPPORT LINE below describing visible progress like 'Structures rising at Level 12' or 'Modern living taking form'. Never use only single text.",
          progressCue ? `The only allowed specific progress cue is: ${progressCue}.` : "Do not invent exact percentages, dates, possession claims, phone numbers, prices, or RERA facts."
        ].join(" ")
      : input.brief.copyMode === "auto"
        ? "MUST include proper headline + support line text hierarchy. For poster-style posts: (1) Bold HEADLINE text at top like 'PROJECT LAUNCH' or 'NOW OPEN', (2) Smaller SUPPORT LINE below with context like 'Premium residences now available' or 'Book your visit today'. Never output only a single word or project name. Keep text premium and sparse - avoid clutter."
      : exactText && exactText.trim()
        ? `Use only this requested on-image text: "${exactText}".`
        : null;

  const sharedClauses = [
    "One complete image only.",
    `This must read like a finished poster-style ${deriveAspectRatio(input.brief.format)} social creative, not a short mood note or generic concept summary.`,
    "CRITICAL: The brief is the source of truth. Follow the brief's explicit requirements exactly (mood, lighting, colors, atmosphere, style). Playbook skill rules are defaults that apply only when the brief does NOT specify.",
    "Describe the image in a practical production order: output type and campaign intent, hero subject truth, poster structure and text-safe zones, graphic system and typography treatment, scene/light direction, then the negative prompt.",
    "If any supplied reference is an amenity image, use exactly one amenity image as the subject-truth reference for that output. Do not merge multiple amenity references or different facilities into the same scene.",
    buildBrandPaletteClause(input),
    buildBrandTypographyClause(input),
    textGuardrail,
    bannedClaims.length > 0 ? `Avoid unsupported claims: ${bannedClaims.join(", ")}.` : null,
    projectImageRequired ? "Preserve the supplied project/building reference as subject truth." : null,
    input.brief.includeBrandLogo
      ? "Use the supplied logo only as a small exact brand signature, or leave it blank."
      : "Do not invent logo marks, emblems, monograms, or house icons.",
    input.brief.includeReraQr
      ? "Use the supplied RERA QR exactly, or leave the QR area blank."
      : null
  ].filter((value): value is string => Boolean(value));

  return {
    seedClauses: [
      ...sharedClauses,
      "Vary composition, layout rhythm, and copy-safe zoning across finished post options."
    ],
    finalClauses: [
      ...sharedClauses,
      "Keep typography minimal, readable, and poster-native."
    ]
  };
}

function constructionBriefText(input: Input) {
  return [
    input.brief.goal,
    input.brief.prompt,
    input.brief.offer,
    input.brief.exactText,
    input.projectProfile?.constructionStatus,
    input.projectProfile?.latestUpdate,
    ...(input.projectProfile?.milestoneHistory ?? []),
    ...(input.projectProfile?.approvedClaims ?? [])
  ].filter(Boolean).join(" ");
}

function extractConstructionProgressCue(input: Input) {
  const text = constructionBriefText(input);
  const percentMatch = text.match(/\b(?:around|approx(?:imately)?|about|roughly)?\s*(\d{1,3})\s*%\s*(?:construction\s*)?(?:done|complete|completed|progress)?\b/i);
  if (percentMatch) {
    const percent = Number(percentMatch[1]);
    if (Number.isFinite(percent) && percent > 0 && percent <= 100) {
      return `${percent}% construction progress`;
    }
  }

  const stageMatch = text.match(/\b(half[- ]built|half[- ]done|mid[- ]construction|under construction|structure complete|plinth complete|podium complete|slab work|facade work|finishing work|near completion)\b/i);
  return stageMatch?.[1] ?? null;
}

function refineV2PromptForPostType(prompt: string, input: Input, truthBundle: CreativeTruthBundle) {
  let next = prompt.trim();
  const postTypeCode = input.postType?.code ?? truthBundle.postTypeContract.code;
  const exactProjectAnchor = truthBundle.exactAssetContract.requiredProjectAnchorAssetId;
  const candidateAssets = truthBundle.candidateAssets;
  const aspectRatio = deriveAspectRatio(input.brief.format);
  const briefAllowsAerial = /\b(aerial|drone|from above|bird'?s[- ]eye|top[- ]down)\b/i.test(input.brief.prompt);
  const assetAllowsAerial = candidateAssets.some((asset) => asset.normalizedMetadata.viewType === "aerial");
  const allowsAerial = briefAllowsAerial || assetAllowsAerial;

  if (input.brief.includeBrandLogo) {
    next = next
      .replace(/\bLogo in the upper left corner\.?/gi, "Small supplied logo in a quiet footer/corner signature zone.")
      .replace(/\bKrisala Developers logo in the lower right\.?/gi, "Small supplied Krisala Developers logo in a quiet footer/corner signature zone.")
      .replace(/\bInclude the Krisala Developers logo at the bottom\b/gi, "Use the supplied Krisala Developers logo small in a quiet footer/corner signature zone");
  }

  if (postTypeCode === "construction-update") {
    const progressCue = extractConstructionProgressCue(input);

    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} real-estate construction update poster for social media, not a plain site photo.`,
      "Use an intentional poster structure: small brand/header zone, compact project or status row, one clean headline-safe area, one short support/status zone, a dominant hero construction image, and a restrained footer or proof strip.",
      "Keep the property image dominant and let overlays stay sparse, editorial, and premium rather than dashboard-like."
    ]);

    next = next
      .replace(/\bAn intimate close[- ]up of architectural elements\b/gi, "A medium-wide construction-progress view")
      .replace(/\bAn intimate close[- ]up\b/gi, "A medium-wide construction-progress view")
      .replace(/\bA close[- ]up of (?:the )?(?:construction details|architectural elements|modern facade|facade details)\b/gi, "A medium-wide construction-progress view")
      .replace(/\bClose[- ]up of (?:the )?(?:construction details|architectural elements|modern facade|facade details)\b/gi, "Medium-wide construction-progress view")
      .replace(/\barchitectural detail close[- ]up\b/gi, "medium-wide construction-progress view")
      .replace(/\bclose[- ]up progress study\b/gi, "medium-wide progress study")
      .replace(/\bclose[- ]up\b/gi, "medium-wide construction-progress view")
      .replace(/\bforeground should focus on architectural details\b/gi, "frame the full project progress state clearly")
      .replace(/\bfocus on architectural details\b/gi, "show the project progress state clearly")
      .replace(/\bfinished luxury tower\b/gi, "same recognizable project in an active construction-progress state")
      .replace(/\bfinished tower\b/gi, "same recognizable project in an active construction-progress state")
      .replace(/\bcompleted lifestyle\b/gi, "construction-progress")
      .replace(/\bcompleted-looking\b/gi, "identity-reference");

    if (!allowsAerial) {
      next = next
        .replace(/\bwide-angle view from above\b/gi, "wide-angle construction-update view")
        .replace(/\bfrom above the construction site\b/gi, "of the project construction update")
        .replace(/\baerial view\b/gi, "wide-angle project view")
        .replace(/\bdrone view\b/gi, "wide-angle project view")
        .replace(/\bbird'?s[- ]eye view\b/gi, "wide-angle project view");
    }

    const hasUpdateSystem = /\b(progress panel|status panel|date badge|status badge|proof strip|update layout|construction update|progress update|milestone band|lower panel)\b/i.test(next);
    if (!hasUpdateSystem) {
      next = appendMissingPromptClauses(next, [
        "Use a restrained construction-update layout with a headline-safe area and one lower progress/status panel."
      ]);
    }

    const hasPosterStructure = /\b(full[- ]bleed|property[- ]first|poster|instagram creative|developer creative|headline zone|project name|construction update|progress update|footer strip|proof line|divider lines|brand-colored overlay|editorial whitespace)\b/i.test(next);
    if (!hasPosterStructure) {
      next = appendMissingPromptClauses(next, [
        "Create a property-first premium real-estate construction update creative: the full-bleed or near full-bleed project/construction image should dominate 75-90% of the frame, with only minimal brand-colored overlay elements such as project name, one construction update headline, one short progress/status line, and an optional slim footer/proof line."
      ]);
    }

    const hasMediumWideFraming = /\b(medium[- ]wide|full[- ]building|full building|full tower|full-frame|wide-angle|podium to (?:upper|crown)|podium to roof|podium to top)\b/i.test(next);
    if (!hasMediumWideFraming) {
      next = appendMissingPromptClauses(next, [
        "Use medium-wide or full-building framing so the project remains recognizable from podium to upper structure."
      ]);
    }

    if (exactProjectAnchor) {
      next = appendMissingPromptClauses(next, [
        "Use the supplied project image as the identity reference. Preserve tower silhouette, massing, facade rhythm, podium proportions, balcony language, and recognizable project identity.",
        "If the supplied reference already shows construction or incomplete work, preserve that visible progress state. If it is a final render or completed-looking exterior, reinterpret the same project as a believable active construction-progress scene based on the brief."
      ]);
    }

    next = appendMissingPromptClauses(next, [
      buildBrandPaletteClause(input),
      "Use a restrained graphic system with one translucent card or dark overlay only where text needs support. Add thin divider lines or one compact badge only if they improve hierarchy.",
      "Use realistic daylight or clean overcast premium light by default. Avoid generic orange sunset glow, oversaturated amber grading, and fake dramatic lighting unless explicitly requested.",
      "Do not create software UI, dashboard, app screen, task board, browser chrome, form fields, wireframe, card grid, or chip-based interface."
    ]);

    if (progressCue) {
      next = appendMissingPromptClauses(next, [
        `The brief provides this progress cue: ${progressCue}. Visually suggest that approximate construction stage without inventing unsupported milestone labels.`
      ]);
    }

    next = appendMissingPromptClauses(next, [
      "Do not invent dates, exact percentages, milestone claims, possession claims, prices, phone numbers, or RERA facts. Keep any generic scaffolding, site equipment, or tiny human scale visually plausible and secondary. Use specific progress percentages or stages only when provided by the brief or project truth."
    ]);
  }

  if (postTypeCode === "project-launch") {
    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} luxury real-estate launch poster for social media, not a plain architecture render.`,
      "Use an editorial poster structure: one quiet brand/header strip, a strong headline-safe negative-space zone, one compact supporting line or location cue, the project tower as the dominant hero, and a restrained footer/signature zone.",
      "Let the hero building occupy roughly the right half to two-thirds or a dominant centered frame, while preserving a clean text-safe area with smooth gradient or haze for legibility.",
      "Keep overlays disciplined: at most one soft translucent card or one thin divider system, no brochure grids, no dense chips, and no many-amenity collage behavior.",
      "Treat the project name and launch message as a premium hierarchy with minimal copy, clean tracking, and strong editorial spacing.",
      "Use believable premium architectural light and material realism. Avoid fake CGI glow, noisy skylines through the text area, traffic clutter, billboards, and random signage.",
      "Negative prompt: cheap brochure, salesy launch flyer, crowded badges, noisy skyline behind text, distorted tower, generic stock luxury tower, fake glow, cluttered amenity collage, watermark, typo-heavy text."
    ]);
  }

  if (postTypeCode === "amenity-spotlight") {
    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} amenity spotlight poster for social media, not a generic lifestyle mood shot.`,
      "Use a single-amenity poster structure: small brand/header area, one clear amenity headline zone, one short support line zone, the amenity hero occupying the lower half to two-thirds, and one restrained footer/signature treatment.",
      "Focus on one amenity only. The amenity must dominate at thumbnail size with generous negative space and calm poster hierarchy.",
      "If a project reference is also present, use it only as secondary project-truth context. It must never replace the amenity as the hero subject or turn the output into a launch poster.",
      "Use refined overlay language: one soft framed text box or quiet gradient support zone, at most one compact badge or location line, and no multi-panel amenity boards.",
      "Keep text sparse and premium. Prioritize the amenity headline, one support line, and optionally one project/locality cue.",
      "Negative prompt: multi-amenity collage, resort brochure clutter, fake hospitality ad, generic stock lifestyle scene, too many bullets, logo sticker, overpowering project tower, watermark, garbled text."
    ]);
  }

  if (postTypeCode === "site-visit-invite") {
    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} site-visit invitation poster for social media, not a crowded event flyer.`,
      "Use a trust-led poster structure: small brand/header area, one invitation headline zone, one short benefit or support line zone, a protected CTA-safe area, the real project image as the dominant hero, and a restrained footer/signature zone.",
      "The project image should carry credibility and occupy most of the frame. Keep the invitation copy in a clear negative-space area with just enough overlay support for readability.",
      "Use at most one compact status chip or locality line. Avoid stacked offer bars, crowded CTA buttons, schedule-table behavior, or hard-sell discount energy.",
      input.brief.copyMode === "auto"
        ? "If text is used at all, let the model choose a concise premium invitation line and one booking-safe CTA. Omit secondary text if it risks clutter or bad rendering."
        : "If exact invitation text or CTA is supplied, preserve it and keep the CTA-safe zone visually protected and uncluttered.",
      "Negative prompt: cheap event registration poster, loud offer banner, excessive badge stack, fake visitors collage, generic sales poster, cluttered CTA blocks, watermark, distorted building."
    ]);
  }

  if (postTypeCode === "location-advantage") {
    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} location-advantage poster for social media, not a map-heavy flyer or generic skyline image.`,
      "Use a disciplined location poster structure: project or context hero image, one headline-safe zone, one short connectivity/support zone, one restrained footer/signature strip, and optional one compact landmark or corridor cue.",
      "If a real project or context image is supplied, preserve it as place-recognition truth. Use surrounding context only to support premium positioning, not to invent landmarks or travel times.",
      "Keep wayfinding or connectivity cues subtle: thin dividers, one understated location chip, or one editorial callout line. Do not use screenshot-map aesthetics, dense infographics, or route diagrams.",
      "Let the poster communicate context, access, and premium urban positioning through composition, not through long copy blocks.",
      "Negative prompt: map screenshot, dense travel-time grid, invented landmarks, unsupported metro claims, generic city collage, cluttered arrows, brochure panel overload, watermark, typo-heavy text."
    ]);
  }

  if (postTypeCode === "testimonial") {
    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} testimonial poster for social media, not a generic quote card or review widget.`,
      "Use a quote-first editorial poster structure: small brand/header zone, dominant quote area, clean attribution-safe area, optional quiet portrait or texture support, and a restrained footer/signature strip.",
      "Prioritize quote readability over decorative imagery. Keep the background supportive and calm, not visually dominant.",
      "If a human or interior reference is supplied, use it only to support warmth and credibility. It must not overpower the quote block or turn into a stock-lifestyle ad.",
      "Do not invent ratings, stars, review badges, customer platform widgets, or testimonial facts that are not present in the brief.",
      "Use calm premium typography, generous spacing, one clean divider or quote-mark accent at most, and a soft material or texture treatment rather than busy collage behavior.",
      "Negative prompt: fake five-star review card, busy brochure testimonial, generic stock customer portrait ad, oversized review badges, dense feature list, noisy background image, watermark, garbled type."
    ]);
  }

  if (postTypeCode === "festive-greeting") {
    next = appendMissingPromptClauses(next, [
      `Create a premium ${aspectRatio} festive greeting poster for social media with restrained ceremonial styling.`,
      "Use a calm festive poster structure: one clean symbolic focal arrangement or motif, a clear central or upper text-safe zone, small secondary brand presence only if enabled, and generous negative space.",
      "Keep the poster project-free by default unless the brief explicitly asks for a project-linked greeting. Do not introduce towers, brochures, floor plans, price language, or sales overlays.",
      "Use culturally specific but restrained festive symbolism, clean typography zones, and subtle palette-led ornament instead of festival overload.",
      "Negative prompt: loud kitsch festival flyer, property-ad clutter, heavy sales language, generic holiday clipart, overloaded ornament collage, fake project linkage, watermark, messy text."
    ]);
  }

  if (exactProjectAnchor && postTypeCode !== "construction-update") {
    next = appendMissingPromptClauses(next, [
      "Preserve the supplied project reference as the source of building truth."
    ]);
  }

  return next;
}

function buildAssetUsageSeedClauses(brief: CreativeBrief) {
  return [
    "If any supplied reference is an amenity image, use exactly one amenity image as the subject-truth reference for that output. Do not merge multiple amenity references or different facilities into the same scene.",
    brief.includeBrandLogo
      ? "If a supplied brand logo reference is attached, use that exact logo as a small footer or signature element. Match the exact lockup, shape, colors, and spacing from the supplied logo reference. Integrate it into the composition as a natural brand-signature zone with proper margin, scale, and tonal harmony; it must never feel like a sticker, pasted overlay, or floating badge on top of the image. If it is not shown cleanly, keep a restrained footer or signature zone blank instead. Never invent a substitute logo, emblem, badge, or placeholder mark."
      : null,
    brief.includeReraQr
      ? "If a supplied RERA QR reference is attached, use that exact QR as a small compliance element. Match the exact QR matrix from the supplied reference. If it is not shown cleanly, keep a small compliance-safe corner or footer zone blank instead. Never invent a substitute QR, barcode, badge, or placeholder block."
      : null
  ].filter((value): value is string => Boolean(value));
}

function buildAssetUsageFinalClauses(brief: CreativeBrief) {
  return [
    "If any supplied reference is an amenity image, use exactly one amenity image as the subject-truth reference for that output. Do not merge multiple amenity references or different facilities into the same scene.",
    brief.includeBrandLogo
      ? "Include the supplied brand logo exactly as provided. Treat it as a small footer or signature element. Match the exact lockup, shape, colors, and spacing from the supplied logo reference. Integrate it into a quiet designed signature zone with proper margin, scale, and contrast so it feels built into the layout rather than pasted on top. Do not redraw, reinterpret, stylize, invent a new logo mark, add glow/shadows, place it as a sticker, or let it dominate the frame. If you cannot preserve it faithfully, leave the zone blank instead of generating a substitute."
      : null,
    brief.includeReraQr
      ? "Include the supplied RERA QR exactly as provided as a small compliance element. Match the exact QR matrix from the supplied reference. Keep it flat, unobstructed, high-contrast, and legible. Do not stylize, repaint, distort, or decorate the QR. If you cannot preserve it faithfully, leave the zone blank instead of inventing a fake QR."
      : null
  ].filter((value): value is string => Boolean(value));
}
