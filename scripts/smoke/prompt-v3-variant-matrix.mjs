import fs from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const localWebEnv = await loadEnvFile(path.resolve(repoRoot, "apps/web/.env.local"));
const localApiEnv = await loadEnvFile(path.resolve(repoRoot, "apps/api/.env"));

const config = {
  apiBase: args.values.apiBase ?? process.env.API_BASE ?? localWebEnv.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000",
  supabaseUrl:
    args.values.supabaseUrl ??
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    localWebEnv.NEXT_PUBLIC_SUPABASE_URL ??
    localApiEnv.SUPABASE_URL ??
    "",
  supabaseAnonKey:
    args.values.anonKey ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localWebEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localApiEnv.SUPABASE_ANON_KEY ??
    "",
  email: args.values.email ?? process.env.TEST_EMAIL ?? "admin@prescon.com",
  password: args.values.password ?? process.env.TEST_PASSWORD ?? "DemoPass1234",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? localApiEnv.SUPABASE_JWT_SECRET ?? "",
  userId: args.values.userId ?? "ae797edd-41a8-440a-ac50-3a1b107b7792",
  brandQuery: (args.values.brand ?? "prescon").toLowerCase(),
  projectQuery: (args.values.project ?? "prescon midtown bay").toLowerCase(),
  outDir: args.values.outDir ?? path.join("reports", "prompt-engine-v3", timestamp(), "variant-matrix")
};

async function main() {
  const token = config.jwtSecret ? await createLocalToken(config) : await signIn(config);
  const bootstrap = await requestGet("/api/session/bootstrap?view=light", token);
  const brand = pickByName(bootstrap.brands ?? [], config.brandQuery) ?? bootstrap.brands?.[0];
  if (!brand?.id) throw new Error("No brand found from /api/session/bootstrap.");

  const [projects, postTypes, festivals, assets, presets, templates] = await Promise.all([
    requestGet(`/api/projects?brandId=${encodeURIComponent(brand.id)}`, token),
    requestGet("/api/post-types", token),
    requestGet("/api/festivals", token),
    requestGet(`/api/brands/${brand.id}/assets`, token),
    requestGet(`/api/creative-v3/brand-presets?brandId=${encodeURIComponent(brand.id)}`, token).catch(() => []),
    requestGet(`/api/creative-v3/visual-templates?brandId=${encodeURIComponent(brand.id)}`, token).catch(() => [])
  ]);

  const project = pickByName(projects, config.projectQuery) ?? projects[0] ?? null;
  const ctx = { brand, project, postTypes, festivals, assets, presets, templates };
  const cases = buildCases(ctx).filter(Boolean);

  await fs.mkdir(path.join(config.outDir, "raw"), { recursive: true });
  const results = [];
  for (const testCase of cases) {
    const started = Date.now();
    try {
      const response = await requestPost("/api/creative-v3/compile", token, testCase.payload);
      const evaluation = evaluateCase(testCase, response);
      const record = {
        id: testCase.id,
        title: testCase.title,
        expected: testCase.expected,
        input: testCase.payload,
        response,
        evaluation,
        durationMs: Date.now() - started
      };
      results.push(record);
      await fs.writeFile(path.join(config.outDir, "raw", `${testCase.id}.json`), JSON.stringify(record, null, 2));
      console.log(`${evaluation.passed ? "PASS" : "FAIL"} ${testCase.id} ${testCase.title}`);
      for (const error of evaluation.errors) console.log(`  - ${error}`);
      for (const warning of evaluation.warnings) console.log(`  ! ${warning}`);
    } catch (error) {
      const record = {
        id: testCase.id,
        title: testCase.title,
        expected: testCase.expected,
        input: testCase.payload,
        response: null,
        evaluation: {
          passed: false,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: []
        },
        durationMs: Date.now() - started
      };
      results.push(record);
      await fs.writeFile(path.join(config.outDir, "raw", `${testCase.id}.json`), JSON.stringify(record, null, 2));
      console.log(`FAIL ${testCase.id} ${testCase.title}`);
      console.log(`  - ${record.evaluation.errors[0]}`);
    }
  }

  const report = renderMarkdownReport({ config, brand, project, results });
  const reportPath = path.join(config.outDir, "variant-matrix.md");
  await fs.writeFile(reportPath, report);
  const summary = {
    reportPath,
    rawDir: path.join(config.outDir, "raw"),
    total: results.length,
    passed: results.filter((item) => item.evaluation.passed).length,
    failed: results.filter((item) => !item.evaluation.passed).length
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

function buildCases(ctx) {
  const postType = (code) => (ctx.postTypes ?? []).find((item) => item.code === code);
  const launch = postType("project-launch");
  const festive = postType("festive-greeting");
  const festival = (ctx.festivals ?? []).find((item) => /sankranti/i.test(`${item.name} ${item.code ?? ""}`)) ?? (ctx.festivals ?? [])[0] ?? null;
  const exterior = firstAsset(ctx.assets, (asset) => projectAsset(ctx, asset) && /exterior|facade|façade|tower|building/.test(haystack(asset)));
  const renderableProjectAssets = (ctx.assets ?? []).filter((asset) => projectAsset(ctx, asset));
  const launchTemplate = firstTemplate(ctx.templates, (template) => templateFor(template, "project_launch"));
  const preset = (ctx.presets ?? []).find((item) => /rera|compliance|footer|logo/i.test(`${item.name} ${item.description ?? ""}`)) ?? null;

  const base = {
    brandId: ctx.brand.id,
    projectId: ctx.project?.id ?? null,
    format: "portrait",
    audience: "Homebuyers and investors",
    variantCount: 2,
    variationStrategy: "auto",
    assetVariation: false,
    copyMode: "auto",
    copyLanguage: "en",
    copy: { headline: null, subheadline: null, cta: null },
    visualTemplateId: null,
    visualTemplateIds: [],
    brandPresetId: null,
    selectedAssetIds: [],
    includeLogo: false,
    logoAssetId: null,
    includeReraQr: false,
    contactItems: [],
    options: {}
  };

  return [
    maybeCase("variant-01-no-template-ai-copy", "No template, AI copy, 3 variants", launch && ctx.project, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 3,
      brief: "Create three meaningfully different premium launch post options with varied design and copy."
    }, {
      variantCount: 3,
      templates: "not_required",
      copy: "varied",
      prompts: "distinct",
      assets: "default_fixed_or_varied"
    }),
    maybeCase("variant-02-template-locked-ai-copy", "Selected template, AI copy, 3 variants", launch && ctx.project && launchTemplate, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 3,
      visualTemplateId: templateId(launchTemplate),
      brief: "Create three premium launch variants using this selected template."
    }, {
      variantCount: 3,
      templates: "all_locked",
      lockedTemplateId: templateId(launchTemplate),
      copy: "may_vary",
      prompts: "distinct"
    }),
    maybeCase("variant-03-exact-copy-no-template", "Exact copy, no template, 2 variants", launch && ctx.project, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 2,
      copyMode: "manual",
      copy: {
        headline: "A Landmark Address",
        subheadline: "Designed for composed urban living.",
        cta: "Enquire Today"
      },
      brief: "Create two premium launch variants using the exact supplied copy."
    }, {
      variantCount: 2,
      copy: "exact",
      expectedCopy: {
        headline: "A Landmark Address",
        subheadline: "Designed for composed urban living.",
        cta: "Enquire Today"
      },
      prompts: "distinct"
    }),
    maybeCase("variant-04-template-and-exact-copy-locked", "Selected template plus exact copy, 2 variants", launch && ctx.project && launchTemplate, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 2,
      visualTemplateId: templateId(launchTemplate),
      copyMode: "manual",
      copy: {
        headline: "A Landmark Address",
        subheadline: "Designed for composed urban living.",
        cta: "Enquire Today"
      },
      brief: "Create two launch variants while keeping this selected template and exact copy locked."
    }, {
      variantCount: 2,
      templates: "all_locked",
      lockedTemplateId: templateId(launchTemplate),
      copy: "exact",
      expectedCopy: {
        headline: "A Landmark Address",
        subheadline: "Designed for composed urban living.",
        cta: "Enquire Today"
      },
      prompts: "distinct"
    }),
    maybeCase("variant-05-selected-asset-locked", "Selected asset locked across variants", launch && ctx.project && exterior, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 3,
      selectedAssetIds: [exterior?.id],
      brief: "Create three premium launch variants using this exact selected reference image."
    }, {
      variantCount: 3,
      assets: "all_locked",
      lockedAssetId: exterior?.id,
      prompts: "distinct"
    }),
    maybeCase("variant-06-asset-variation-enabled", "Asset variation enabled", launch && ctx.project && renderableProjectAssets.length >= 2, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 3,
      assetVariation: true,
      brief: "Create three premium launch variants with different visual options."
    }, {
      variantCount: 3,
      assets: "should_vary",
      prompts: "distinct"
    }),
    maybeCase("variant-07-preset-locked", "Preset locks logo/RERA/contact behavior", launch && ctx.project && preset, {
      ...base,
      postTypeId: launch?.id,
      variantCount: 2,
      brandPresetId: preset?.preset_id ?? preset?.db_id ?? preset?.id,
      brief: "Create two launch variants using the selected preset."
    }, {
      variantCount: 2,
      preset: "locked",
      prompts: "distinct"
    }),
    maybeCase("variant-08-festive-no-project-no-asset", "Festive no project, no selected asset", festive && festival, {
      ...base,
      projectId: null,
      postTypeId: festive?.id,
      festivalId: festival?.id,
      variantCount: 2,
      brief: `Create two premium ${festival?.name ?? "festive"} greeting variants. Do not make this a project launch post.`
    }, {
      variantCount: 2,
      assets: "none",
      copy: "may_vary",
      prompts: "distinct"
    })
  ].filter(Boolean);
}

function evaluateCase(testCase, response) {
  const errors = [];
  const warnings = [];
  const result = response?.result;
  if (!result) errors.push("Missing response.result.");
  if (result?.status !== "ready") errors.push(`Expected ready status, got ${result?.status}`);
  if (result?.validation?.passed !== true) errors.push("Expected validation.passed=true.");
  if (/fallback|registry planner|AdapterParseError/i.test(JSON.stringify(result?.debug ?? {}))) {
    errors.push(`Expected DSPy path without fallback, got debug ${JSON.stringify(result?.debug ?? {})}`);
  }

  const variants = Array.isArray(result?.variants) ? result.variants : [];
  if (variants.length !== testCase.expected.variantCount) {
    errors.push(`Expected ${testCase.expected.variantCount} variants, got ${variants.length}.`);
  }

  if (testCase.expected.templates === "all_locked") {
    const bad = variants.filter((variant) => variant.selected_template_id !== testCase.expected.lockedTemplateId);
    if (bad.length) errors.push(`Expected all variants to keep template ${testCase.expected.lockedTemplateId}.`);
  }

  if (testCase.expected.copy === "exact") {
    for (const variant of variants) {
      const copy = variant.copy ?? {};
      for (const [key, value] of Object.entries(testCase.expected.expectedCopy ?? {})) {
        if (copy[key] !== value) errors.push(`Expected ${variant.variant_id} copy.${key} to be "${value}", got "${copy[key]}".`);
        if (!String(variant.compiled_prompt ?? variant.prompt ?? "").includes(value)) {
          errors.push(`Expected ${variant.variant_id} prompt to include exact ${key} "${value}".`);
        }
      }
    }
  }

  for (const variant of variants) {
    const copy = variant.copy ?? {};
    for (const [key, value] of Object.entries(copy)) {
      if (value != null && typeof value !== "string") {
        errors.push(`Expected ${variant.variant_id} copy.${key} to be a string, got ${typeof value}.`);
      }
      if (typeof value === "string" && /['"]text['"]\s*:|font_family|font_size|background_color/.test(value)) {
        errors.push(`Expected ${variant.variant_id} copy.${key} to contain final copy only, got structured text "${value}".`);
      }
    }
  }

  if (testCase.expected.copy === "varied") {
    const copyKeys = variants.map((variant) => normalizeCopy(variant.copy));
    if (new Set(copyKeys).size < Math.min(2, copyKeys.length)) {
      warnings.push("AI copy did not vary across variants.");
    }
  }

  const assetSets = variants.map((variant) => variant.render_package?.project_asset_ids ?? []);
  if (testCase.expected.assets === "none" && assetSets.some((ids) => ids.length > 0)) {
    errors.push(`Expected no project assets, got ${JSON.stringify(assetSets)}.`);
  }
  if (testCase.expected.assets === "all_locked") {
    const bad = assetSets.some((ids) => ids[0] !== testCase.expected.lockedAssetId);
    if (bad) errors.push(`Expected all variants to keep asset ${testCase.expected.lockedAssetId}, got ${JSON.stringify(assetSets)}.`);
  }
  if (testCase.expected.assets === "should_vary") {
    const firstAssetByVariant = assetSets.map((ids) => ids[0]).filter(Boolean);
    if (new Set(firstAssetByVariant).size < Math.min(2, firstAssetByVariant.length)) {
      errors.push(`Expected assetVariation=true to use at least two assets, got ${JSON.stringify(assetSets)}.`);
    }
  }

  if (testCase.expected.preset === "locked") {
    for (const variant of variants) {
      const pkg = variant.render_package ?? {};
      if (pkg.logo_rules?.required !== true) errors.push(`Expected ${variant.variant_id} logo required by preset.`);
      const contactItems = pkg.contact_rules?.items ?? [];
      if (!Array.isArray(contactItems) || contactItems.length === 0) {
        warnings.push(`Preset did not expose contact footer items for ${variant.variant_id}.`);
      }
    }
  }

  if (testCase.expected.prompts === "distinct") {
    const promptKeys = variants.map((variant) => normalizePrompt(variant.compiled_prompt ?? variant.prompt ?? ""));
    if (new Set(promptKeys).size < Math.min(2, promptKeys.length)) {
      errors.push("Expected at least two distinct compiled prompts.");
    }
  }

  const allPrompt = variants.map((variant) => `${variant.prompt ?? ""}\n${variant.compiled_prompt ?? ""}`).join("\n\n");
  if (/\b(?:asset_id|template_id)\b/i.test(allPrompt) || /[a-f0-9]{8}-[a-f0-9-]{27,}/i.test(allPrompt)) {
    errors.push("Prompt exposes internal IDs or schema field names.");
  }

  return { passed: errors.length === 0, errors, warnings };
}

function renderMarkdownReport({ config, brand, project, results }) {
  const passed = results.filter((item) => item.evaluation.passed).length;
  const failed = results.length - passed;
  const lines = [
    "# Prompt Engine V3 Variant Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    `API base: \`${config.apiBase}\``,
    `Brand: ${brand.name} (${brand.id})`,
    `Default project: ${project ? `${project.name} (${project.id})` : "none"}`,
    "",
    `Summary: ${passed}/${results.length} passed, ${failed} failed.`,
    ""
  ];

  for (const record of results) {
    const result = record.response?.result;
    const variants = Array.isArray(result?.variants) ? result.variants : [];
    lines.push(`## ${record.evaluation.passed ? "PASS" : "FAIL"} ${record.id}: ${record.title}`);
    lines.push("");
    lines.push(`Duration: ${record.durationMs}ms`);
    lines.push(`Status: \`${result?.status ?? "no-response"}\``);
    lines.push(`Engine: \`${result?.debug?.engine ?? "n/a"}\``);
    if (record.evaluation.errors.length) {
      lines.push("");
      lines.push("### Errors");
      for (const error of record.evaluation.errors) lines.push(`- ${error}`);
    }
    if (record.evaluation.warnings.length) {
      lines.push("");
      lines.push("### Warnings");
      for (const warning of record.evaluation.warnings) lines.push(`- ${warning}`);
    }
    lines.push("");
    lines.push("### Input");
    lines.push("```json");
    lines.push(JSON.stringify(record.input, null, 2));
    lines.push("```");
    for (const variant of variants) {
      lines.push("");
      lines.push(`### ${variant.variant_id}: ${variant.variation_label ?? ""}`);
      lines.push(`Axis: \`${variant.variation_axis ?? "n/a"}\``);
      lines.push(`Template: \`${variant.selected_template_id ?? "none"}\``);
      lines.push(`Assets: \`${(variant.render_package?.project_asset_ids ?? []).join(", ") || "none"}\``);
      lines.push("Copy:");
      lines.push("```json");
      lines.push(JSON.stringify(variant.copy ?? {}, null, 2));
      lines.push("```");
      lines.push("Creative direction:");
      lines.push("```json");
      lines.push(JSON.stringify(variant.creative_direction ?? {}, null, 2));
      lines.push("```");
      lines.push("Compiled prompt:");
      lines.push("```text");
      lines.push(String(variant.compiled_prompt ?? ""));
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

async function signIn(options) {
  if (!options.supabaseUrl || !options.supabaseAnonKey) {
    throw new Error("Missing Supabase auth config. Provide JWT secret or Supabase URL/anon key.");
  }
  const response = await fetch(`${options.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: options.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: options.email, password: options.password })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase sign-in failed (${response.status}): ${text}`);
  const json = JSON.parse(text);
  if (!json.access_token) throw new Error("Supabase sign-in did not return an access token.");
  return json.access_token;
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

function maybeCase(id, title, condition, payload, expected) {
  return condition ? { id, title, payload, expected } : null;
}

function pickByName(items, query) {
  const q = String(query ?? "").toLowerCase();
  return (items ?? []).find((item) => String(item.name ?? item.slug ?? "").toLowerCase().includes(q));
}

function firstAsset(assets, predicate) {
  return (assets ?? []).find((asset) => predicate(asset)) ?? null;
}

function firstTemplate(templates, predicate) {
  return (templates ?? []).find((template) => predicate(template)) ?? null;
}

function projectAsset(ctx, asset) {
  return asset.projectId === ctx.project?.id && !["logo", "rera_qr"].includes(asset.kind) && isRenderable(asset);
}

function isRenderable(asset) {
  const storage = String(asset.storagePath ?? "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].some((ext) => storage.endsWith(ext));
}

function haystack(asset) {
  return JSON.stringify({
    label: asset.label,
    kind: asset.kind,
    description: asset.description,
    metadata: asset.metadata,
    storagePath: asset.storagePath
  }).toLowerCase();
}

function templateId(template) {
  return template?.template_id ?? template?.templateId ?? template?.id ?? null;
}

function templateFor(template, contentJobId) {
  const value = template?.content_job_id ?? template?.contentJobId ?? template?.content_job ?? "";
  return !value || value === contentJobId;
}

function normalizePrompt(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[0-9]/g, "#")
    .slice(0, 650);
}

function normalizeCopy(copy) {
  return JSON.stringify({
    headline: copy?.headline ?? "",
    subheadline: copy?.subheadline ?? "",
    cta: copy?.cta ?? ""
  }).toLowerCase();
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
