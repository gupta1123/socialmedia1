import fs from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const webEnv = await loadEnvFile(path.resolve(repoRoot, "apps/web/.env.local"));
const apiEnv = await loadEnvFile(path.resolve(repoRoot, "apps/api/.env"));

const config = {
  apiBase: args.values.apiBase ?? process.env.API_BASE ?? webEnv.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? apiEnv.SUPABASE_JWT_SECRET ?? "",
  email: args.values.email ?? process.env.TEST_EMAIL ?? "demo@imagelab.local",
  userId: args.values.userId ?? "35e5197a-8536-4d46-89ae-dc04647da7ee",
  brandQuery: (args.values.brand ?? "prescon").toLowerCase(),
  projectQuery: (args.values.project ?? "prescon midtown bay").toLowerCase(),
  outDir: args.values.outDir ?? path.join("reports", "prompt-engine-v3", timestamp(), "infer-from-brief")
};

async function main() {
  if (!config.jwtSecret) throw new Error("Missing SUPABASE_JWT_SECRET/JWT_SECRET for local API auth.");
  const token = await createLocalToken(config);
  const bootstrap = await requestGet("/api/session/bootstrap?view=light", token);
  const brand = pickByName(bootstrap.brands ?? [], config.brandQuery) ?? bootstrap.brands?.[0];
  if (!brand?.id) throw new Error("No brand found.");

  const [projects, festivals, assets] = await Promise.all([
    requestGet(`/api/projects?brandId=${encodeURIComponent(brand.id)}`, token),
    requestGet("/api/festivals", token).catch(() => []),
    requestGet(`/api/brands/${brand.id}/assets`, token)
  ]);
  const project = pickByName(projects, config.projectQuery) ?? projects[0] ?? null;
  const festival =
    (festivals ?? []).find((item) => /sankranti|diwali|gudi|akshaya/i.test(`${item.name} ${item.code ?? ""}`)) ??
    (festivals ?? [])[0] ??
    null;

  const cases = buildCases({ brand, project, festival });
  await fs.mkdir(path.join(config.outDir, "raw"), { recursive: true });

  const records = [];
  for (const testCase of cases) {
    const started = Date.now();
    const response = await requestPost("/api/creative-v3/compile", token, testCase.payload);
    const record = {
      id: testCase.id,
      title: testCase.title,
      expected: testCase.expected,
      input: testCase.payload,
      response,
      summary: summarize(response),
      assessment: assess(testCase, response),
      durationMs: Date.now() - started
    };
    records.push(record);
    await fs.writeFile(path.join(config.outDir, "raw", `${testCase.id}.json`), JSON.stringify(record, null, 2));
    console.log(`${record.assessment.ok ? "PASS" : "CHECK"} ${testCase.id}: ${record.summary.contentJobId} | ${record.summary.assets.join(" | ") || "no asset"}`);
  }

  const reportPath = path.join(config.outDir, "infer-from-brief-live.md");
  await fs.writeFile(reportPath, renderReport({ brand, project, festival, records }));
  console.log(JSON.stringify({ reportPath, rawDir: path.join(config.outDir, "raw"), total: records.length }, null, 2));
}

function buildCases({ brand, project, festival }) {
  const base = {
    brandId: brand.id,
    projectId: project?.id ?? null,
    format: "portrait",
    audience: "Homebuyers and investors",
    variantCount: 1,
    variationStrategy: "auto",
    assetVariation: true,
    copyMode: "auto",
    copyLanguage: "en",
    copy: { headline: null, subheadline: null, cta: null },
    brandPresetId: null,
    visualTemplateId: null,
    visualTemplateIds: [],
    selectedAssetIds: [],
    includeLogo: false,
    logoAssetId: null,
    includeReraQr: false,
    contactItems: [],
    options: {}
  };

  return [
    {
      id: "infer-01-launch",
      title: "Infer project launch from brief",
      payload: {
        ...base,
        brief: "Create a premium launch announcement for this project. Make the architecture feel iconic, polished, and restrained."
      },
      expected: "Should infer project_launch and select an exterior/tower/facade truth asset."
    },
    {
      id: "infer-02-interiors",
      title: "Infer interiors/sample flat from brief",
      payload: {
        ...base,
        brief: "Show the interiors of ours. Make it feel like a calm premium sample flat post, with warm daylight, refined materials, and minimal copy."
      },
      expected: "Should infer interior/sample-flat style or at least select an interior asset if one exists."
    },
    {
      id: "infer-03-amenity-unspecified",
      title: "Infer amenity without naming it",
      payload: {
        ...base,
        brief: "Create a premium lifestyle amenity post. Don't mention the amenity name in the brief; pick the strongest amenity visual and make it feel aspirational."
      },
      expected: "Should infer amenity_spotlight and select an amenity image."
    },
    {
      id: "infer-04-imaginary-concept",
      title: "Infer unusual concept not directly in asset set",
      payload: {
        ...base,
        brief: "Create a dreamy rooftop stargazing cinema night post for residents. If we do not have this exact visual, make it concept-led without pretending it is an actual project photo."
      },
      expected: "Should not overclaim asset truth; should either use conceptual/no asset or clearly mark concept-led usage."
    },
    {
      id: "infer-05-site-visit",
      title: "Infer site visit from brief",
      payload: {
        ...base,
        brief: "Invite families for a weekend site visit. Make the visual feel like arrival, entrance, or lobby, not a generic launch poster."
      },
      expected: "Should infer site_visit and prefer entrance/lobby/arrival/exterior asset."
    },
    {
      id: "infer-06-festival-brand-only",
      title: "Infer festive greeting without post type and without project",
      payload: {
        ...base,
        projectId: null,
        festivalId: festival?.id ?? null,
        brief: `Create a premium ${festival?.name ?? "festive"} greeting for the brand. Keep it elegant, respectful, and brand-safe. Do not force a project building unless the brief asks for one.`
      },
      expected: "Should infer festive_greeting or brand greeting and not select project assets."
    }
  ];
}

function summarize(response) {
  const result = response?.result ?? {};
  const variants = Array.isArray(result.variants) ? result.variants : [];
  return {
    status: result.status,
    contentJobId: result.content_job_id,
    engine: result.debug?.engine ?? null,
    warnings: result.validation?.warnings ?? [],
    assets: variants.flatMap((variant) => (variant.selected_assets ?? []).map((asset) => asset.label ?? asset.asset_id)).filter(Boolean),
    prompts: variants.map((variant) => variant.compiled_prompt ?? variant.prompt ?? ""),
    copies: variants.map((variant) => variant.copy ?? {}),
    renderPackages: variants.map((variant) => variant.render_package ?? {})
  };
}

function assess(testCase, response) {
  const summary = summarize(response);
  const promptText = `${summary.contentJobId ?? ""}\n${summary.assets.join("\n")}\n${summary.prompts.join("\n")}`.toLowerCase();
  const issues = [];
  if (summary.status !== "ready") issues.push(`status=${summary.status}`);
  if (/adapterparseerror|registry planner/i.test(JSON.stringify(summary.warnings))) issues.push("DSPy parse/fallback warning present");
  if (testCase.id === "infer-01-launch" && !/launch|project_launch/.test(promptText)) issues.push("launch intent not clear");
  if (testCase.id === "infer-02-interiors" && !/interior|sample|flat|lobby|residence/.test(promptText)) issues.push("interior intent not clear");
  if (testCase.id === "infer-03-amenity-unspecified" && !/amenity|pool|club|lifestyle|wellness|deck|lounge/.test(promptText)) issues.push("amenity intent not clear");
  if (testCase.id === "infer-05-site-visit" && !/visit|arrival|entrance|lobby|site/.test(promptText)) issues.push("site visit intent not clear");
  if (testCase.id === "infer-06-festival-brand-only" && summary.renderPackages.some((pkg) => (pkg.project_asset_ids ?? []).length > 0)) {
    issues.push("brand-only festive case selected project asset");
  }
  return { ok: issues.length === 0, issues };
}

function renderReport({ brand, project, festival, records }) {
  const lines = [
    "# Prompt V3 Infer From Brief Live Test",
    "",
    `Brand: ${brand.name}`,
    `Project: ${project?.name ?? "none"}`,
    `Festival fixture: ${festival?.name ?? "none"}`,
    "",
    "All cases intentionally omit `postTypeId`, `content_job_id`, selected template, and selected reference asset.",
    ""
  ];
  for (const record of records) {
    lines.push(`## ${record.id}: ${record.title}`);
    lines.push("");
    lines.push(`Expected: ${record.expected}`);
    lines.push("");
    lines.push(`Status: \`${record.summary.status}\``);
    lines.push(`Inferred content job: \`${record.summary.contentJobId ?? "n/a"}\``);
    lines.push(`Engine: \`${record.summary.engine ?? "n/a"}\``);
    lines.push(`Assessment: ${record.assessment.ok ? "OK" : "CHECK"}${record.assessment.issues.length ? ` - ${record.assessment.issues.join("; ")}` : ""}`);
    lines.push("");
    lines.push("Input brief:");
    lines.push("```text");
    lines.push(record.input.brief);
    lines.push("```");
    lines.push("");
    lines.push(`Selected assets: ${record.summary.assets.length ? record.summary.assets.map((item) => `\`${item}\``).join(", ") : "none"}`);
    lines.push("");
    for (const [index, prompt] of record.summary.prompts.entries()) {
      lines.push(`Variant ${index + 1} copy:`);
      lines.push("```json");
      lines.push(JSON.stringify(record.summary.copies[index] ?? {}, null, 2));
      lines.push("```");
      lines.push("Compiled prompt:");
      lines.push("```text");
      lines.push(prompt);
      lines.push("```");
      lines.push("Render package:");
      lines.push("```json");
      lines.push(JSON.stringify(record.summary.renderPackages[index] ?? {}, null, 2));
      lines.push("```");
    }
    lines.push("");
    lines.push(`Raw JSON: \`raw/${record.id}.json\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function requestGet(route, token) {
  const response = await fetch(`${config.apiBase}${route}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function requestPost(route, token, body) {
  const response = await fetch(`${config.apiBase}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function createLocalToken(options) {
  const secret = new TextEncoder().encode(options.jwtSecret);
  return new SignJWT({ email: options.email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(options.userId)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
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
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
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

function pickByName(items, query) {
  const q = String(query ?? "").toLowerCase();
  return (items ?? []).find((item) => String(item.name ?? item.slug ?? "").toLowerCase().includes(q));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
