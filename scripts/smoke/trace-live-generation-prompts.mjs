import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const payloadPath = args.values.payload ? path.resolve(process.cwd(), args.values.payload) : null;
const variationCount = parsePositiveInt(args.values.variationCount, 1);
const includeFullPrompts = args.flags.has("full-prompts");
const localWebEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/web/.env.local"));
const localApiEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/api/.env"));

const config = {
  apiBase: args.values.apiBase ?? process.env.API_BASE ?? "http://127.0.0.1:4000",
  supabaseUrl:
    args.values.supabaseUrl ??
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    localWebEnv.NEXT_PUBLIC_SUPABASE_URL ??
    localApiEnv.SUPABASE_URL ??
    "",
  supabaseServiceRoleKey:
    args.values.serviceRoleKey ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    localApiEnv.SUPABASE_SERVICE_ROLE_KEY ??
    "",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? localApiEnv.SUPABASE_JWT_SECRET ?? "",
  email: args.values.email ?? process.env.TEST_EMAIL ?? "demo@imagelab.local",
  userId: args.values.userId ?? "35e5197a-8536-4d46-89ae-dc04647da7ee"
};

async function main() {
  if (!payloadPath) {
    throw new Error("Missing --payload <file>.");
  }

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Missing Supabase URL or service role key.");
  }

  if (!config.jwtSecret) {
    throw new Error("Missing JWT secret for local API auth.");
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  payload.variationCount = variationCount;

  const token = await createLocalToken(config);
  const compiled = await request("/api/creative/compile-v2", token, payload, config.apiBase);

  console.log("COMPILE_RESULT");
  console.log(
    JSON.stringify(
      {
        promptPackageId: compiled.id,
        promptSummary: compiled.promptSummary,
        ...(includeFullPrompts ? { seedPromptRaw: typeof compiled.seedPrompt === "string" ? compiled.seedPrompt : null } : {}),
        finalPrompt: summarizePrompt(compiled.finalPrompt),
        variations: Array.isArray(compiled.variations)
          ? compiled.variations.map((variation) => ({
              id: variation.id,
              title: variation.title,
              ...(includeFullPrompts ? { seedPromptRaw: typeof variation.seedPrompt === "string" ? variation.seedPrompt : null } : {}),
              finalPrompt: summarizePrompt(variation.finalPrompt)
            }))
          : []
      },
      null,
      2
    )
  );

  const optionsResponse = await request(
    "/api/creative/options",
    token,
    {
      promptPackage: compiled,
      variationCount
    },
    config.apiBase
  );

  const promptPackageId = optionsResponse.promptPackageId ?? compiled.id;
  const styleSeedsResponse = await request(
    "/api/creative/style-seeds",
    token,
    {
      promptPackageId,
      count: 1
    },
    config.apiBase
  );

  const finalsResponse = await request(
    "/api/creative/finals",
    token,
    {
      promptPackageId,
      count: 1
    },
    config.apiBase
  );

  await delay(500);

  const promptPackageRow = await fetchSingleRow(
    "prompt_packages",
    "id, seed_prompt, final_prompt, prompt_summary",
    `id=eq.${encodeURIComponent(promptPackageId)}`,
    config
  );

  const optionJobIds = Array.isArray(optionsResponse.jobs)
    ? optionsResponse.jobs
        .map((job) => (typeof job?.id === "string" ? job.id : null))
        .filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const otherJobIds = [styleSeedsResponse?.id, finalsResponse?.id]
    .filter((id) => typeof id === "string" && id.length > 0);
  const jobIds = [...optionJobIds, ...otherJobIds];
  const jobs = jobIds.length > 0
    ? await fetchRows(
        "creative_jobs",
        "id, job_type, request_payload, created_at, provider, provider_model",
        `id=in.(${jobIds.map(escapeSupabaseValue).join(",")})&order=created_at.asc`,
        config
      )
    : [];

  const variationPromptById = new Map(
    Array.isArray(compiled.variations)
      ? compiled.variations.map((variation) => [variation.id, variation.finalPrompt])
      : []
  );

  const comparison = jobs.map((job) => {
    const payloadRecord = asRecord(job.request_payload);
    const prompt = typeof payloadRecord.prompt === "string" ? payloadRecord.prompt : "";
    const variationId = typeof payloadRecord.variationId === "string" ? payloadRecord.variationId : null;
    const expectedVariationPrompt = variationId ? variationPromptById.get(variationId) ?? null : null;
    return {
      id: job.id,
      jobType: job.job_type,
      provider: job.provider,
      providerModel: job.provider_model,
      variationId,
      ...(includeFullPrompts ? { promptRaw: prompt } : {}),
      persistedPrompt: summarizePrompt(prompt),
      equalsCompiledFinalPrompt: prompt === compiled.finalPrompt,
      equalsPromptPackageFinalPrompt: prompt === promptPackageRow.final_prompt,
      equalsPromptPackageSeedPrompt: prompt === promptPackageRow.seed_prompt,
      equalsVariationFinalPrompt: expectedVariationPrompt ? prompt === expectedVariationPrompt : null
    };
  });

  console.log("\nPERSISTED_PROMPT_PACKAGE");
  console.log(
    JSON.stringify(
      {
        promptPackageId,
        promptSummary: promptPackageRow.prompt_summary,
        ...(includeFullPrompts
          ? {
              seedPromptRaw: promptPackageRow.seed_prompt,
              finalPromptRaw: promptPackageRow.final_prompt
            }
          : {}),
        seedPrompt: summarizePrompt(promptPackageRow.seed_prompt),
        finalPrompt: summarizePrompt(promptPackageRow.final_prompt)
      },
      null,
      2
    )
  );

  console.log("\nLIVE_JOB_PROMPTS");
  console.log(JSON.stringify(comparison, null, 2));

  const styleSeedJob = comparison.find((job) => job.jobType === "style_seed") ?? null;
  const optionJobs = comparison.filter((job) => job.jobType === "option");
  const finalJobs = comparison.filter((job) => job.jobType === "final");

  console.log("\nSUMMARY");
  console.log(
    JSON.stringify(
      {
        optionJobCount: optionJobs.length,
        finalJobCount: finalJobs.length,
        styleSeedUsesCompiledFinalPrompt: styleSeedJob?.equalsCompiledFinalPrompt ?? null,
        styleSeedUsesPersistedSeedPrompt: styleSeedJob?.equalsPromptPackageSeedPrompt ?? null,
        optionsUseVariationSeedPrompt: optionJobs.map((job) => ({
          id: job.id,
          variationId: job.variationId,
          equalsVariationFinalPrompt: job.equalsVariationFinalPrompt,
          equalsCompiledFinalPrompt: job.equalsCompiledFinalPrompt
        })),
        finalsUseCompiledFinalPrompt: finalJobs.map((job) => ({
          id: job.id,
          variationId: job.variationId,
          equalsCompiledFinalPrompt: job.equalsCompiledFinalPrompt
        }))
      },
      null,
      2
    )
  );
}

async function fetchSingleRow(table, select, query, config) {
  const rows = await fetchRows(table, select, `${query}&limit=1`, config);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No rows returned for ${table}`);
  }
  return rows[0];
}

async function fetchRows(table, select, query, config) {
  const url = `${config.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&${query}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${table} query failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : [];
}

async function createLocalToken(options) {
  const secret = new TextEncoder().encode(options.jwtSecret);
  return new SignJWT({ email: options.email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(options.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function request(route, token, body, apiBase) {
  const url = `${apiBase}${route}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

function summarizePrompt(prompt) {
  const normalized = typeof prompt === "string" ? prompt : "";
  return {
    length: normalized.length,
    sha256: crypto.createHash("sha256").update(normalized).digest("hex"),
    preview: normalized.slice(0, 220)
  };
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function escapeSupabaseValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) continue;

    if (current.startsWith("--")) {
      const key = current.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        flags.add(key);
      } else {
        values[key] = next;
        index += 1;
      }
    }
  }

  return { flags, values };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const entries = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
