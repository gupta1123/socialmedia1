import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  BrandProfile,
  CalendarItemRecord,
  CreativeBrief,
  CreativeTemplateRecord,
  FestivalRecord,
  PostTypeRecord,
  ProjectProfile
} from "@image-lab/contracts";
import { env } from "./config.js";
import { appendMissingPromptClauses, buildBrandPromptGuidance } from "./brand-prompt-guidance.js";
import { buildFestivalPromptGuidance } from "./festival-prompt-guidance.js";
import { compilePromptPackageMock } from "./mock-creative-director.js";
import { buildPostTypePromptGuidance } from "./post-type-prompt-guidance.js";
import { buildProjectPromptGuidance } from "./project-prompt-guidance.js";
import { deriveAspectRatio } from "./utils.js";

type Input = {
  brandName: string;
  brandProfile: BrandProfile;
  brief: CreativeBrief;
  referenceLabels: string[];
  projectName?: string | null;
  projectProfile?: ProjectProfile | null;
  festival?: Pick<FestivalRecord, "id" | "code" | "name" | "category" | "community" | "regions" | "meaning" | "dateLabel" | "nextOccursOn"> | null;
  postType?: Pick<PostTypeRecord, "code" | "name" | "config"> | null;
  template?: Pick<CreativeTemplateRecord, "name" | "basePrompt" | "config"> | null;
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

function isFestivalGreetingInput(input: Pick<Input, "festival" | "postType">) {
  return Boolean(input.festival) && (!input.postType || input.postType.code === "festive-greeting");
}

const ALLOWED_REFERENCE_STRATEGIES = ["generated-template", "uploaded-references", "hybrid"] as const;
const ALLOWED_TEMPLATE_TYPES = ["hero", "product-focus", "testimonial", "announcement", "quote", "offer"] as const;

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
};

type WorkerResponse = {
  request_id: string;
  ok: boolean;
  result?: CompilerResult;
  error?: string;
};

type AgentPayload = Input & {
  brandPromptManifest: ReturnType<typeof buildBrandPromptGuidance>["manifest"];
  festivalPromptManifest: ReturnType<typeof buildFestivalPromptGuidance>["manifest"];
  projectPromptManifest: ReturnType<typeof buildProjectPromptGuidance>["manifest"];
  postTypePromptManifest: ReturnType<typeof buildPostTypePromptGuidance>["manifest"];
  promptGuardrails: {
    seedClauses: string[];
    finalClauses: string[];
  };
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
let workerRequestCount = 0;

export async function compilePromptPackage(input: Input) {
  const mode = resolveCompilerMode();

  if (mode === "mock") {
    return compilePromptPackageMock(input);
  }

  try {
    return await runAgnoCreativeDirector(input);
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

    return buildMockFallbackResult(input, error);
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

async function runAgnoCreativeDirectorPersistent(input: Input) {
  const state = getWorkerState();
  const requestId = `req_${Date.now()}_${workerRequestCount++}`;
  const payload = buildAgentPayload(input);

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

async function runAgnoCreativeDirectorOneShot(input: Input) {
  const scriptPath = getWorkerScriptPath();
  const payload = buildAgentPayload(input);

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

function rejectAllPending(error: unknown) {
  if (!workerState) {
    return;
  }

  for (const pending of workerState.pending.values()) {
    pending.reject(error);
  }

  workerState.pending.clear();
}

function resetWorkerState() {
  if (!workerState) {
    return;
  }

  workerState.child.kill();
  workerState = null;
}

function getWorkerScriptPath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    env.AGNO_AGENT_SCRIPT
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
    AGNO_OPENAI_MAX_RETRIES: String(env.AGNO_OPENAI_MAX_RETRIES)
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

function normalizeAgnoResult(raw: CompilerResult, input: Input): CompilerResult {
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
    projectProfile: useProjectContext ? input.projectProfile : null
  });
  const seedClauses = [
    ...brandGuidance.seedClauses,
    ...festivalGuidance.seedClauses,
    ...projectGuidance.seedClauses,
    ...postTypeGuidance.seedClauses
  ];
  const finalClauses = [
    ...brandGuidance.finalClauses,
    ...festivalGuidance.finalClauses,
    ...projectGuidance.finalClauses,
    ...postTypeGuidance.finalClauses
  ];
  const referenceStrategy = normalizeReferenceStrategy(raw.referenceStrategy, input);
  const templateType = normalizeTemplateType(raw.templateType, input);
  const aspectRatio = normalizeAspectRatio(raw.aspectRatio, input);
  const rawReferenceStrategy = typeof raw.referenceStrategy === "string" ? raw.referenceStrategy : null;
  const rawTemplateType = typeof raw.templateType === "string" ? raw.templateType : null;
  const normalizedResolvedConstraints =
    raw.resolvedConstraints && typeof raw.resolvedConstraints === "object" ? raw.resolvedConstraints : {};
  const normalizedCompilerTrace =
    raw.compilerTrace && typeof raw.compilerTrace === "object" ? raw.compilerTrace : {};

  return {
    ...raw,
    seedPrompt: appendMissingPromptClauses(raw.seedPrompt, seedClauses),
    finalPrompt: appendMissingPromptClauses(raw.finalPrompt, finalClauses),
    aspectRatio,
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
          : postTypeGuidance.manifest
    },
    compilerTrace: {
      ...normalizedCompilerTrace,
      brandGuidanceManifest: brandGuidance.manifest,
      festivalGuidanceManifest: festivalGuidance.manifest,
      projectGuidanceManifest: projectGuidance.manifest,
      postTypeGuidanceManifest: postTypeGuidance.manifest,
      ...(rawReferenceStrategy && !ALLOWED_REFERENCE_STRATEGIES.includes(rawReferenceStrategy as (typeof ALLOWED_REFERENCE_STRATEGIES)[number])
        ? { rawReferenceStrategy }
        : {}),
      ...(rawTemplateType && !ALLOWED_TEMPLATE_TYPES.includes(rawTemplateType as (typeof ALLOWED_TEMPLATE_TYPES)[number])
        ? { rawTemplateType }
        : {})
    }
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

function buildAgentPayload(input: Input): AgentPayload {
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
    projectProfile: useProjectContext ? input.projectProfile : null
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
        ...postTypeGuidance.seedClauses
      ],
      finalClauses: [
        ...brandGuidance.finalClauses,
        ...festivalGuidance.finalClauses,
        ...projectGuidance.finalClauses,
        ...postTypeGuidance.finalClauses
      ]
    }
  };
}
