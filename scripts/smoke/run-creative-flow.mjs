import fs from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const promptsOnly = args.flags.has("prompts-only") || process.env.PROMPTS_ONLY === "1";
const payloadPath = args.values.payload
  ? path.resolve(process.cwd(), args.values.payload)
  : null;
const localEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/web/.env.local"));

const config = {
  apiBase: args.values.apiBase ?? process.env.API_BASE ?? "http://127.0.0.1:4000",
  supabaseUrl:
    args.values.supabaseUrl ??
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    localEnv.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:62021",
  supabaseAnonKey:
    args.values.anonKey ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
  email: args.values.email ?? process.env.TEST_EMAIL ?? "demo@imagelab.local",
  password: args.values.password ?? process.env.TEST_PASSWORD ?? "password123",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? ""
};

async function main() {
  if (!payloadPath) {
    throw new Error(
      "Missing --payload <file>. Pass a CreativeBrief JSON file. Example: node scripts/smoke/run-creative-flow.mjs --payload tmp/brief.json --prompts-only"
    );
  }

  if (!config.supabaseAnonKey) {
    throw new Error("Missing Supabase anon key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or pass --anon-key.");
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const token = config.jwtSecret ? await createLocalToken(config) : await signIn(config);
  const compiled = await request("/api/creative/compile", token, payload, config.apiBase);

  console.log("PROMPT_PACKAGE");
  console.log(
    JSON.stringify(
      {
        id: compiled.id,
        deliverableId: compiled.deliverableId,
        promptSummary: compiled.promptSummary,
        seedPrompt: compiled.seedPrompt,
        finalPrompt: compiled.finalPrompt,
        referenceAssetIds: compiled.referenceAssetIds,
        resolvedConstraints: compiled.resolvedConstraints,
        compilerTrace: compiled.compilerTrace
      },
      null,
      2
    )
  );

  if (promptsOnly) {
    console.log("STOPPED_AT_PROMPTS");
    return;
  }

  const seedCount = parsePositiveInt(args.values.seedCount, 3);
  const finalCount = parsePositiveInt(args.values.finalCount, 2);

  const seedJob = await request(
    "/api/creative/style-seeds",
    token,
    {
      promptPackageId: compiled.id,
      count: seedCount
    },
    config.apiBase
  );

  console.log("SEED_JOB");
  console.log(JSON.stringify(seedJob, null, 2));

  const runAfterSeed = await pollRun(compiled.id, token, config.apiBase);
  const selectedTemplateId =
    args.values.selectedTemplateId ??
    runAfterSeed.seedTemplates?.[0]?.id ??
    null;

  if (!selectedTemplateId) {
    throw new Error("No style direction was produced, so final generation could not continue.");
  }

  const finalJob = await request(
    "/api/creative/finals",
    token,
    {
      promptPackageId: compiled.id,
      selectedTemplateId,
      count: finalCount
    },
    config.apiBase
  );

  console.log("FINAL_JOB");
  console.log(JSON.stringify(finalJob, null, 2));

  const finalRun = await pollRun(compiled.id, token, config.apiBase);
  console.log("RUN_RESULT");
  console.log(
    JSON.stringify(
      {
        seedTemplates: finalRun.seedTemplates?.map((template) => ({
          id: template.id,
          label: template.label,
          previewUrl: template.previewUrl
        })),
        finalOutputs: finalRun.finalOutputs?.map((output) => ({
          id: output.id,
          previewUrl: output.previewUrl,
          reviewState: output.reviewState
        })),
        jobs: finalRun.jobs?.map((job) => ({
          id: job.id,
          type: job.jobType,
          status: job.status,
          error: job.error
        }))
      },
      null,
      2
    )
  );
}

async function signIn(options) {
  const authUrl = `${options.supabaseUrl}/auth/v1/token?grant_type=password`;
  let response;
  try {
    response = await fetch(authUrl, {
      method: "POST",
      headers: {
        apikey: options.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: options.email,
        password: options.password
      })
    });
  } catch (error) {
    throw new Error(
      `Could not reach Supabase auth at ${authUrl}. Start local Supabase or pass hosted --supabaseUrl/--anon-key.`
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase sign-in failed (${response.status}): ${text}`);
  }

  const json = JSON.parse(text);
  if (!json.access_token) {
    throw new Error("Supabase sign-in did not return an access token.");
  }

  return json.access_token;
}

async function createLocalToken(options) {
  const secret = new TextEncoder().encode(options.jwtSecret);
  return new SignJWT({ email: options.email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("35e5197a-8536-4d46-89ae-dc04647da7ee")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function request(route, token, body, apiBase) {
  const url = `${apiBase}${route}`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Could not reach API at ${url}. Start the API or pass --apiBase.`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function pollRun(runId, token, apiBase) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const url = `${apiBase}/api/creative/runs/${runId}`;
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      throw new Error(`Could not poll run at ${url}.`);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`/api/creative/runs/${runId} ${response.status}: ${text}`);
    }

    const json = text ? JSON.parse(text) : null;
    const settled = json?.jobs?.every((job) => ["completed", "failed", "cancelled"].includes(job.status));
    if (settled) {
      return json;
    }

    await delay(3000);
  }

  throw new Error(`Run ${runId} did not settle in time.`);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const values = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
