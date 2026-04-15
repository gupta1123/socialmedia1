import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImageEditPlanResponseSchema, type ImageEditIntent, type ImageEditPlanResponse } from "@image-lab/contracts";
import { env } from "./config.js";

export type AiEditPlannerInput = {
  brandName: string;
  prompt: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

type AgentPayload = {
  brandName: string;
  prompt: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

type WorkerResponse = {
  request_id: string;
  ok: boolean;
  result?: ImageEditPlanResponse;
  error?: string;
};

type PendingRequest = {
  resolve: (value: ImageEditPlanResponse) => void;
  reject: (reason?: unknown) => void;
};

type WorkerState = {
  child: ChildProcessWithoutNullStreams;
  pending: Map<string, PendingRequest>;
  buffer: string;
};

let workerState: WorkerState | null = null;
let workerRequestCount = 0;

export async function planImageEdit(input: AiEditPlannerInput) {
  const mode = resolvePlannerMode();

  if (mode === "mock") {
    return buildMockImageEditPlan(input);
  }

  try {
    return await runAgnoImageEditDirector(input);
  } catch (error) {
    resetAiEditWorkerState();
    if (env.AI_EDIT_DIRECTOR_MODE === "agno") {
      throw error;
    }
    return buildMockImageEditPlan(input, error);
  }
}

export function buildMockImageEditPlan(
  input: AiEditPlannerInput,
  fallbackReason?: unknown
): ImageEditPlanResponse {
  const prompt = input.prompt.trim();
  const targetObject = inferTargetObject(prompt) ?? "target region";
  const editIntent = inferEditIntent(prompt);
  const ambiguityNotes =
    targetObject === "target region" || /^fix\s+this$/i.test(prompt) || /^make\s+it\s+better$/i.test(prompt)
      ? ["The requested target is underspecified. Use click-guided targeting or refine the prompt."]
      : [];
  const requiresPointSelection =
    ambiguityNotes.length > 0 ||
    editIntent === "background-change" ||
    /\b(one|single|specific|selected)\b/i.test(prompt) ||
    /\b(people|persons|windows|cars|chairs|plants|workers)\b/i.test(prompt);

  return ImageEditPlanResponseSchema.parse({
    targetObject,
    editIntent,
    rewrittenPrompt: buildMaskedEditPrompt(prompt, targetObject, editIntent),
    segmentationHints: {
      requiresPointSelection,
      suggestedTargetPointLabel: requiresPointSelection ? targetObject : null,
      notes: requiresPointSelection
        ? ["If there are repeated objects, click the exact item to segment before editing."]
        : []
    },
    ambiguityNotes,
    plannerTrace: {
      pipeline: "ai-edit-v2-mock",
      plannerMode: "mock",
      loadedSkillNames: [],
      ...(fallbackReason
        ? {
            fallbackReason: fallbackReason instanceof Error ? fallbackReason.message : String(fallbackReason)
          }
        : {})
    }
  });
}

function inferEditIntent(prompt: string): ImageEditIntent {
  if (/\b(remove|erase|delete|clear away|take out)\b/i.test(prompt)) return "remove";
  if (/\b(recolou?r|re-color|change the colou?r|change .* colou?r|make .* (red|blue|green|pink|yellow|orange|purple|black|white|gold|silver|brown|beige|grey|gray))\b/i.test(prompt)) {
    return "recolor";
  }
  if (/\b(replace|swap|change .* to|turn .* into)\b/i.test(prompt)) return "replace";
  if (/\b(clean|cleanup|retouch|fix|restore|remove stain|remove scratch)\b/i.test(prompt)) return "cleanup";
  if (/\b(add|insert|place|put)\b/i.test(prompt)) return "insert";
  if (/\b(background|sky|wallpaper|surroundings|scene)\b/i.test(prompt)) return "background-change";
  return "other";
}

function inferTargetObject(prompt: string) {
  const patterns = [
    /\b(?:remove|erase|delete|replace|swap|clean|cleanup|retouch|fix|restore|add|insert|place|put)\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z0-9\s-]{0,80}?)(?=$|\s+(?:with|from|in|on|into|to|and|while|near)\b|[,.!?])/i,
    /\b(?:change|make|turn|recolou?r|re-color)\s+(?:the\s+)?(?:colou?r\s+of\s+)?(?:the\s+|a\s+|an\s+)?([a-z][a-z0-9\s-]{0,80}?)(?=\s+(?:to|into|red|blue|green|pink|yellow|orange|purple|black|white|gold|silver|brown|beige|grey|gray)\b|$|[,.!?])/i,
    /\b(?:background|sky|wall|floor|table|sofa|chair|person|car|worker|plant|window|door|sign|logo|text)\b/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const candidate = normalizeObjectLabel(match?.[1] ?? match?.[0]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function normalizeObjectLabel(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .replace(/\s+/g, " ")
    .replace(/^[Tt]he\s+/, "")
    .replace(/^[Aa]n?\s+/, "")
    .replace(/\s+colou?r$/i, "")
    .replace(/[.,!?]+$/g, "")
    .trim();

  if (!normalized || normalized.length === 0) {
    return null;
  }

  if (/^(this|that|it|them|these|those)$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function buildMaskedEditPrompt(prompt: string, targetObject: string, editIntent: ImageEditIntent) {
  const trimmedPrompt = prompt.trim();

  switch (editIntent) {
    case "remove":
      return `Remove only the masked ${targetObject}. Fill the area naturally so the surrounding scene remains coherent, realistic, and unchanged outside the mask.`;
    case "replace":
      return `Replace only the masked ${targetObject} according to this request: ${trimmedPrompt}. Preserve all unmasked regions exactly.`;
    case "recolor":
      return `Change only the color or finish of the masked ${targetObject} based on this request: ${trimmedPrompt}. Preserve shape, lighting, reflections, and all unmasked regions.`;
    case "cleanup":
      return `Clean up only the masked ${targetObject} based on this request: ${trimmedPrompt}. Keep the original image composition and preserve all unmasked areas.`;
    case "insert":
      return `Apply this insertion only inside the masked region: ${trimmedPrompt}. Blend it naturally with the original perspective, lighting, and scene.`;
    case "background-change":
      return `Modify only the masked background region according to this request: ${trimmedPrompt}. Preserve the main subject and all unmasked regions.`;
    default:
      return `Apply this edit only to the masked ${targetObject}: ${trimmedPrompt}. Preserve all unmasked regions exactly.`;
  }
}

function resolvePlannerMode() {
  if (env.AI_EDIT_DIRECTOR_MODE === "mock") {
    return "mock";
  }

  if (env.AI_EDIT_DIRECTOR_MODE === "agno") {
    return "agno";
  }

  return env.OPENAI_API_KEY ? "agno" : "mock";
}

async function runAgnoImageEditDirector(input: AiEditPlannerInput) {
  if (env.AI_EDIT_DIRECTOR_TRANSPORT === "server") {
    return runAgnoImageEditDirectorServer(input);
  }

  try {
    return await runAgnoImageEditDirectorPersistent(input);
  } catch (error) {
    resetAiEditWorkerState();
    return runAgnoImageEditDirectorOneShot(input);
  }
}

async function runAgnoImageEditDirectorPersistent(input: AiEditPlannerInput) {
  const state = getAiEditWorkerState();
  const requestId = `ai_edit_req_${Date.now()}_${workerRequestCount++}`;
  const payload = buildAgentPayload(input);

  return new Promise<ImageEditPlanResponse>((resolve, reject) => {
    state.pending.set(requestId, {
      resolve: (value) => resolve(normalizeAgentResult(value)),
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

async function runAgnoImageEditDirectorOneShot(input: AiEditPlannerInput) {
  const scriptPath = getWorkerScriptPath();
  const payload = buildAgentPayload(input);

  return new Promise<ImageEditPlanResponse>((resolve, reject) => {
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
      stderr += Buffer.from(chunk).toString("utf8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      const parsed = parseWorkerJson(stdout);
      if (code === 0 && parsed) {
        resolve(normalizeAgentResult(parsed as ImageEditPlanResponse));
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `AI edit planner exited with code ${code ?? "unknown"}`));
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function runAgnoImageEditDirectorServer(input: AiEditPlannerInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_EDIT_DIRECTOR_SERVER_TIMEOUT_SEC * 1000);
  timeout.unref?.();

  try {
    const response = await fetch(env.AI_EDIT_DIRECTOR_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: buildAgentPayload(input) }),
      signal: controller.signal
    });
    const raw = await response.text();
    const parsed = raw.length > 0 ? JSON.parse(raw) : null;

    if (!response.ok) {
      const message =
        parsed && typeof parsed === "object" && parsed && "error" in parsed ? String((parsed as { error?: unknown }).error) : raw;
      throw new Error(`AI edit planner server failed with ${response.status}: ${message}`);
    }

    if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
      throw new Error("AI edit planner server response did not include result");
    }

    return normalizeAgentResult((parsed as { result: ImageEditPlanResponse }).result);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAgentResult(raw: ImageEditPlanResponse) {
  const parsed = ImageEditPlanResponseSchema.parse(raw);
  const plannerTrace =
    parsed.plannerTrace && typeof parsed.plannerTrace === "object" && !Array.isArray(parsed.plannerTrace)
      ? { ...parsed.plannerTrace }
      : {};

  return {
    ...parsed,
    plannerTrace: {
      pipeline: parsed.plannerTrace?.pipeline ?? "ai-edit-v2-agno",
      plannerMode: resolvePlannerMode(),
      ...plannerTrace
    }
  } satisfies ImageEditPlanResponse;
}

function buildAgentPayload(input: AiEditPlannerInput): AgentPayload {
  return {
    brandName: input.brandName,
    prompt: input.prompt.trim(),
    ...(typeof input.width === "number" ? { width: input.width } : {}),
    ...(typeof input.height === "number" ? { height: input.height } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.mimeType ? { mimeType: input.mimeType } : {})
  };
}

function getAiEditWorkerState() {
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
    buffer: ""
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
      if (!raw || !raw.startsWith("{")) {
        continue;
      }

      const message = JSON.parse(raw) as WorkerResponse;
      const pending = workerState.pending.get(message.request_id);
      if (!pending) {
        continue;
      }

      workerState.pending.delete(message.request_id);

      if (message.ok && message.result) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error ?? "AI edit planner failed"));
      }
    }
  });

  child.on("close", () => {
    if (!workerState) {
      return;
    }

    const pending = workerState.pending;
    workerState = null;
    for (const request of pending.values()) {
      request.reject(new Error("AI edit planner worker exited"));
    }
  });

  child.on("error", (error) => {
    if (!workerState) {
      return;
    }

    const pending = workerState.pending;
    workerState = null;
    for (const request of pending.values()) {
      request.reject(error);
    }
  });

  return workerState;
}

function resetAiEditWorkerState() {
  if (!workerState) {
    return;
  }

  const state = workerState;
  workerState = null;
  state.child.kill();
  for (const pending of state.pending.values()) {
    pending.reject(new Error("AI edit planner worker reset"));
  }
}

function getWorkerScriptPath() {
  return path.resolve(getWorkerCwd(), env.AI_EDIT_DIRECTOR_SCRIPT);
}

function getWorkerCwd() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
}

function getWorkerEnv() {
  return process.env;
}

function parseWorkerJson(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  const lastJsonLine = [...lines].reverse().find((line) => line.startsWith("{"));
  if (!lastJsonLine) {
    return null;
  }

  return JSON.parse(lastJsonLine);
}
