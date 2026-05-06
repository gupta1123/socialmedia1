import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const localWebEnv = await loadEnvFile(path.resolve(repoRoot, "apps/web/.env.local"));
const localApiEnv = await loadEnvFile(path.resolve(repoRoot, "apps/api/.env"));

const config = {
  apiBase: stripTrailingSlash(args.values.apiBase ?? process.env.API_BASE ?? localWebEnv.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000"),
  supabaseUrl: args.values.supabaseUrl ?? process.env.SUPABASE_URL ?? localWebEnv.NEXT_PUBLIC_SUPABASE_URL ?? localApiEnv.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: args.values.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? localApiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? localApiEnv.SUPABASE_JWT_SECRET ?? "",
  brandQuery: String(args.values.brand ?? process.env.IMAGE_EDIT_TEST_BRAND ?? "prescon").toLowerCase(),
  prompt: args.values.prompt ?? "Add a light-colored gradient-filled box in the lower half for future text.",
  keepArtifacts: args.flags.has("keep-artifacts")
};

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

const created = {
  compileJobId: crypto.randomUUID(),
  outputId: null,
  outputJobId: null,
  promptPackageId: null,
  creativeRequestId: null,
  storagePaths: []
};

async function main() {
  assertConfig();
  await assertApiHealthy();

  const context = await loadBrandContext(config.brandQuery);
  const token = await createLocalTokenForWorkspace(context.workspaceId, context.userId);
  const promptPlan = await callImageEditPlan({
    token,
    brandId: context.brand.id,
    prompt: config.prompt
  });
  const protectedPrompt = promptPlan.protectedPrompt;

  await insertSyntheticEditJob({
    jobId: created.compileJobId,
    context,
    prompt: config.prompt,
    promptPlan
  });

  const saved = await callEditorSave({
    token,
    brandId: context.brand.id,
    jobId: created.compileJobId,
    prompt: config.prompt
  });
  created.outputId = saved.output.id;

  const output = await fetchOutput(saved.output.id);
  const aiEdit = output.metadata_json?.aiEdit ?? null;
  const history = Array.isArray(output.metadata_json?.aiEditHistory) ? output.metadata_json.aiEditHistory : [];
  const historyEntry = history.find((entry) => entry?.jobId === created.compileJobId) ?? null;

  if (aiEdit?.protectedPrompt !== protectedPrompt) {
    throw new Error("Saved output metadata did not contain the expected aiEdit.protectedPrompt.");
  }
  if (historyEntry?.protectedPrompt !== protectedPrompt) {
    throw new Error("Saved output metadata did not contain the expected aiEditHistory protectedPrompt.");
  }

  created.outputJobId = output.job_id;
  created.storagePaths.push(output.storage_path, output.thumbnail_storage_path);
  const job = output.job_id ? await fetchSingle("creative_jobs", "id,prompt_package_id", `id=eq.${output.job_id}`) : null;
  created.promptPackageId = job?.prompt_package_id ?? null;
  const pkg = created.promptPackageId
    ? await fetchSingle("prompt_packages", "id,creative_request_id", `id=eq.${created.promptPackageId}`)
    : null;
  created.creativeRequestId = pkg?.creative_request_id ?? null;

  const editorSourcePath = output.metadata_json?.editorState?.source?.storagePath;
  if (typeof editorSourcePath === "string") created.storagePaths.push(editorSourcePath);

  console.log(JSON.stringify({
    ok: true,
    mode: "no-provider-generation",
    apiBase: config.apiBase,
    brand: context.brand.name,
    outputId: created.outputId,
    syntheticEditJobId: created.compileJobId,
    promptStrategy: promptPlan.promptStrategy,
    plannerModel: promptPlan.plannerModel,
    protectedPromptSha256: sha256(protectedPrompt),
    protectedPromptLength: protectedPrompt.length,
    protectedPromptPreview: protectedPrompt.slice(0, 240),
    ...(args.flags.has("full-prompt") ? { prompt: config.prompt, promptPlan, protectedPrompt } : {}),
    keptArtifacts: config.keepArtifacts
  }, null, 2));
}

async function callImageEditPlan({ token, brandId, prompt }) {
  const response = await fetch(`${config.apiBase}/api/creative/image-edit-plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      brandId,
      prompt,
      editPreset: "v2_high",
      width: 1,
      height: 1
    }),
    signal: AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`/api/creative/image-edit-plan ${response.status}: ${text}`);
  }
  if (!json?.protectedPrompt) {
    throw new Error("/api/creative/image-edit-plan did not return a protectedPrompt.");
  }
  return json;
}

async function callEditorSave({ token, brandId, jobId, prompt }) {
  const form = new FormData();
  form.append("brandId", brandId);
  form.append("saveMode", "new");
  form.append("image", new Blob([tinyPngBuffer()], { type: "image/png" }), "protected-prompt-smoke.png");
  form.append("sourceImage", new Blob([tinyPngBuffer()], { type: "image/png" }), "protected-prompt-smoke-source.png");
  form.append("editorState", JSON.stringify({
    version: 1,
    source: { width: 1, height: 1, fileName: "protected-prompt-smoke.png" },
    layers: []
  }));
  form.append("aiEditMetadata", JSON.stringify({
    source: "ai-edit",
    promptMode: "normal",
    exactInput: { prompt },
    submittedPrompt: prompt,
    jobId,
    editPreset: "v2_high",
    resultModel: "no-provider-smoke",
    resultWidth: 1,
    resultHeight: 1,
    mergedLayerCount: 0,
    preservedLayerCount: 0
  }));

  const response = await fetch(`${config.apiBase}/api/creative/editor-save`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`/api/creative/editor-save ${response.status}: ${text}`);
  }
  return json;
}

async function insertSyntheticEditJob({ jobId, context, prompt, promptPlan }) {
  const { error } = await supabase.from("compile_jobs").insert({
    id: jobId,
    workspace_id: context.workspaceId,
    brand_id: context.brand.id,
    status: "completed",
    input_brief: {
      type: "image-edit",
      brandId: context.brand.id,
      workspaceId: context.workspaceId,
      prompt,
      protectedPrompt: promptPlan.protectedPrompt,
      editPlan: promptPlan.editPlan,
      promptStrategy: promptPlan.promptStrategy,
      plannerModel: promptPlan.plannerModel,
      aiWrittenPrompt: promptPlan.aiWrittenPrompt,
      guardrails: promptPlan.guardrails,
      negativePrompt: promptPlan.negativePrompt,
      promptValidation: promptPlan.promptValidation,
      sourceStoragePath: "smoke/no-provider-source.png",
      sourceContentType: "image/png",
      sourceFileName: "no-provider-source.png",
      actorUserId: context.userId,
      reservationId: null,
      editPreset: "v2_high",
      provider: "openai",
      model: "no-provider-smoke",
      quality: "high",
      width: 1,
      height: 1
    },
    result: {
      model: "no-provider-smoke",
      width: 1,
      height: 1,
      skippedProviderGeneration: true
    },
    session_token: "smoke-no-provider"
  });
  if (error) throw error;
}

async function loadBrandContext(query) {
  const brands = await queryAll("brands", "id,workspace_id,name,slug");
  const brand = brands.find((item) =>
    String(item.slug ?? "").toLowerCase().includes(query) || String(item.name ?? "").toLowerCase().includes(query)
  ) ?? brands[0];
  if (!brand) throw new Error("No brand found for smoke test.");

  const memberships = await queryAll(
    "workspace_memberships",
    "workspace_id,user_id,role,created_at",
    `workspace_id=eq.${brand.workspace_id}`
  );
  const membership = memberships.sort((a, b) => roleRank(a.role) - roleRank(b.role))[0];
  if (!membership?.user_id) throw new Error(`No workspace membership for brand ${brand.name}.`);

  return { brand, workspaceId: brand.workspace_id, userId: membership.user_id };
}

async function fetchOutput(outputId) {
  const output = await fetchSingle(
    "creative_outputs",
    "id,job_id,storage_path,thumbnail_storage_path,metadata_json",
    `id=eq.${outputId}`
  );
  if (!output) throw new Error(`Saved output ${outputId} not found.`);
  return output;
}

async function fetchSingle(table, select, query) {
  const rows = await queryAll(table, select, query, 1);
  return rows[0] ?? null;
}

async function queryAll(table, select, query = "", limit = 1000) {
  const params = new URLSearchParams();
  params.set("select", select);
  params.set("limit", String(limit));
  const suffix = query ? `&${query}` : "";
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?${params.toString()}${suffix}`, {
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} query failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function createLocalTokenForWorkspace(workspaceId, userId) {
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function assertApiHealthy() {
  const response = await fetch(`${config.apiBase}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`API health check failed at ${config.apiBase}/health (${response.status}).`);
}

function assertConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.jwtSecret) missing.push("SUPABASE_JWT_SECRET");
  if (missing.length) throw new Error(`Missing config: ${missing.join(", ")}`);
}

function tinyPngBuffer() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

function roleRank(role) {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  if (role === "editor") return 2;
  return 3;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }
    values[key] = next;
    index += 1;
  }
  return { values, flags };
}

async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const values = {};
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 0) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

function stripTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

async function cleanup() {
  if (config.keepArtifacts) return;

  const storagePaths = [...new Set(created.storagePaths.filter(Boolean))];
  if (storagePaths.length > 0) {
    await supabase.storage.from(localApiEnv.SUPABASE_STORAGE_BUCKET ?? "creative-assets").remove(storagePaths).catch(() => undefined);
  }

  if (created.outputId) await supabase.from("creative_outputs").delete().eq("id", created.outputId);
  if (created.outputJobId) await supabase.from("creative_jobs").delete().eq("id", created.outputJobId);
  if (created.promptPackageId) await supabase.from("prompt_packages").delete().eq("id", created.promptPackageId);
  if (created.creativeRequestId) await supabase.from("creative_requests").delete().eq("id", created.creativeRequestId);
  if (created.compileJobId) await supabase.from("compile_jobs").delete().eq("id", created.compileJobId);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
