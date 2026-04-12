import fs from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const payloadPath = args.values.payload ? path.resolve(process.cwd(), args.values.payload) : null;
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
    "http://127.0.0.1:62021",
  supabaseAnonKey:
    args.values.anonKey ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localWebEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localApiEnv.SUPABASE_ANON_KEY ??
    "",
  email: args.values.email ?? process.env.TEST_EMAIL ?? "demo@imagelab.local",
  password: args.values.password ?? process.env.TEST_PASSWORD ?? "DemoPass1234",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? localApiEnv.SUPABASE_JWT_SECRET ?? ""
};

async function main() {
  if (!payloadPath) {
    throw new Error("Missing --payload <file>. Pass a CreativeBrief JSON file.");
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  if (args.values.variationCount) {
    payload.variationCount = Number(args.values.variationCount);
  }
  const token = config.jwtSecret ? await createLocalToken(config) : await signIn(config);
  const compiled = await request("/api/creative/compile-v2", token, payload, config.apiBase);

  console.log("INPUT_BRIEF");
  console.log(JSON.stringify(payload, null, 2));
  console.log("\nPROMPT_SUMMARY");
  console.log(compiled.promptSummary);
  console.log("\nSEED_PROMPT");
  console.log(compiled.seedPrompt);
  console.log("\nFINAL_PROMPT");
  console.log(compiled.finalPrompt);
  console.log("\nVARIATIONS");
  const variations = Array.isArray(compiled.variations) ? compiled.variations : [];
  for (const variation of variations) {
    console.log(`\n[${variation.id}] ${variation.title}`);
    console.log(`Strategy: ${variation.strategy}`);
    if (variation.differenceFromOthers) {
      console.log(`Difference: ${variation.differenceFromOthers}`);
    }
    console.log(`Seed (${variation.seedPrompt.length} chars):`);
    console.log(variation.seedPrompt);
    console.log(`Final (${variation.finalPrompt.length} chars):`);
    console.log(variation.finalPrompt);
  }
  console.log("\nTRACE_SUMMARY");
  console.log(
    JSON.stringify(
      {
        previewId: compiled.compilerTrace?.previewId,
        pipeline: compiled.compilerTrace?.pipeline,
        persisted: compiled.compilerTrace?.persisted,
        requestedVariationCount: compiled.compilerTrace?.requestedVariationCount,
        returnedVariationCount: compiled.compilerTrace?.returnedVariationCount,
        skillsAvailable: compiled.compilerTrace?.skillsAvailable,
        loadedSkillNames: compiled.compilerTrace?.loadedSkillNames ?? [],
        runtimeEvents: compiled.compilerTrace?.runtimeEvents,
        toolCallCount: Array.isArray(compiled.compilerTrace?.toolCalls) ? compiled.compilerTrace.toolCalls.length : 0,
        skillToolCallCount: Array.isArray(compiled.compilerTrace?.skillToolCalls) ? compiled.compilerTrace.skillToolCalls.length : 0
      },
      null,
      2
    )
  );
}

async function signIn(options) {
  if (!options.supabaseAnonKey) {
    throw new Error("Missing Supabase anon key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or pass --anon-key.");
  }

  const authUrl = `${options.supabaseUrl}/auth/v1/token?grant_type=password`;
  const response = await fetch(authUrl, {
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
    .setSubject(args.values.userId ?? "35e5197a-8536-4d46-89ae-dc04647da7ee")
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
