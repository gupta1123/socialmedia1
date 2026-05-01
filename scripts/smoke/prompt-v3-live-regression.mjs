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
  email: args.values.email ?? process.env.TEST_EMAIL ?? "demo@imagelab.local",
  password: args.values.password ?? process.env.TEST_PASSWORD ?? "DemoPass1234",
  jwtSecret: args.values.jwtSecret ?? process.env.JWT_SECRET ?? localApiEnv.SUPABASE_JWT_SECRET ?? "",
  userId: args.values.userId ?? "35e5197a-8536-4d46-89ae-dc04647da7ee",
  brandQuery: (args.values.brand ?? "prescon").toLowerCase(),
  projectQuery: (args.values.project ?? "prescon midtown bay").toLowerCase(),
  outDir: args.values.outDir ?? path.join("reports", "prompt-engine-v3", timestamp()),
  continueOnError: !args.flags.has("fail-fast")
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
  const caseContext = {
    brand,
    project,
    postTypes,
    festivals,
    assets,
    presets,
    templates
  };
  const cases = buildCases(caseContext).filter(Boolean);
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
      if (!evaluation.passed && !config.continueOnError) break;
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
      console.log(record.evaluation.errors[0]);
      if (!config.continueOnError) break;
    }
  }

  const report = renderMarkdownReport({ config, brand, project, results });
  const reportPath = path.join(config.outDir, "prompt-v3-live-regression.md");
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
  const festival =
    (ctx.festivals ?? []).find((item) => /sankranti/i.test(`${item.name} ${item.code ?? ""}`)) ??
    (ctx.festivals ?? [])[0] ??
    null;
  const logo = firstAsset(ctx.assets, (asset) => asset.kind === "logo" && (!ctx.project || asset.projectId === ctx.project.id || asset.projectId == null));
  const pool = firstAsset(ctx.assets, (asset) => projectAsset(ctx, asset) && haystack(asset).includes("pool"));
  const entrance = firstAsset(ctx.assets, (asset) => projectAsset(ctx, asset) && /entrance|gate|lobby|arrival/.test(haystack(asset)));
  const exterior = firstAsset(ctx.assets, (asset) => projectAsset(ctx, asset) && /exterior|facade|façade|tower|building/.test(haystack(asset)));
  const amenity = firstAsset(ctx.assets, (asset) => projectAsset(ctx, asset) && /amenity|pool|clubhouse|gym|yoga|kids|basketball/.test(haystack(asset)));
  const preset = (ctx.presets ?? []).find((item) => /rera|compliance|footer|logo/i.test(`${item.name} ${item.description ?? ""}`)) ?? null;

  const base = {
    brandId: ctx.brand.id,
    projectId: ctx.project?.id ?? null,
    format: "portrait",
    audience: "Homebuyers and investors",
    variantCount: 1,
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
    maybeCase("case-01-festive-no-project-no-ref", "Festive greeting without project or ref", postType("festive-greeting") && festival, {
      ...base,
      projectId: null,
      postTypeId: postType("festive-greeting")?.id,
      festivalId: festival?.id,
      brief: `Create a premium ${festival?.name ?? "festive"} greeting that feels respectful, elegant, occasion-led, and brand-safe.`
    }, {
      contentJobId: "festive_greeting",
      assetPolicy: "none",
      mustInclude: [festival?.name ?? "festive"],
      mustNotInclude: ["project launch", "site visit", "starting from", "A New Address Takes Shape"]
    }),
    maybeCase("case-02-festive-project-no-ref", "Festive greeting with project selected", postType("festive-greeting") && festival && ctx.project, {
      ...base,
      postTypeId: postType("festive-greeting")?.id,
      festivalId: festival?.id,
      brief: `Create a premium ${festival?.name ?? "festive"} greeting for the brand.`
    }, {
      contentJobId: "festive_greeting",
      assetPolicy: "optional",
      mustInclude: [festival?.name ?? "festive"],
      mustNotInclude: ["site visit", "starting from"]
    }),
    maybeCase("case-03-festive-project-explicit-ref", "Festive greeting with explicit reference", postType("festive-greeting") && festival && exterior, {
      ...base,
      postTypeId: postType("festive-greeting")?.id,
      festivalId: festival?.id,
      selectedAssetIds: [exterior?.id],
      brief: `Create a premium ${festival?.name ?? "festive"} greeting using this exact reference image tastefully.`
    }, {
      contentJobId: "festive_greeting",
      assetPolicy: "exact",
      selectedAssetId: exterior?.id,
      mustInclude: [festival?.name ?? "festive"]
    }),
    maybeCase("case-04-project-launch", "Project launch", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      includeLogo: Boolean(logo),
      logoAssetId: logo?.id ?? null,
      brief: "Create a premium real-estate launch post with a strong architectural visual and restrained copy."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "any",
      mustInclude: [ctx.project?.name]
    }),
    maybeCase("case-05-construction-update", "Construction update", postType("construction-update") && ctx.project, {
      ...base,
      postTypeId: postType("construction-update")?.id,
      includeLogo: Boolean(logo),
      logoAssetId: logo?.id ?? null,
      variantCount: 2,
      brief: "Create a premium construction update post that feels credible, current, and grounded."
    }, {
      contentJobId: "construction_update",
      assetPolicy: "any",
      mustInclude: ["Progress"],
      mustNotInclude: ["A New Address Takes Shape", "launch post"]
    }),
    maybeCase("case-06-amenity-auto", "Amenity spotlight without naming amenity", postType("amenity-spotlight") && ctx.project, {
      ...base,
      postTypeId: postType("amenity-spotlight")?.id,
      brief: "Create a premium amenity post that highlights one lifestyle benefit with calm, polished copy."
    }, {
      contentJobId: "amenity_spotlight",
      assetPolicy: amenity ? "any" : "optional",
      preferredAssetText: amenity ? ["amenity"] : []
    }),
    maybeCase("case-07-amenity-pool-daylight", "Pool amenity daylight", postType("amenity-spotlight") && ctx.project, {
      ...base,
      postTypeId: postType("amenity-spotlight")?.id,
      brief: "Create a bright daylight swimming pool amenity post with fresh premium lifestyle energy."
    }, {
      contentJobId: "amenity_spotlight",
      assetPolicy: pool ? "contains" : "optional",
      selectedAssetText: pool ? ["pool"] : [],
      mustInclude: ["pool"]
    }),
    maybeCase("case-08-site-visit", "Site visit invite", postType("site-visit-invite") && ctx.project, {
      ...base,
      postTypeId: postType("site-visit-invite")?.id,
      selectedAssetIds: entrance ? [entrance.id] : [],
      brief: "Create a premium site visit invite using the arrival, entrance, or lobby mood."
    }, {
      contentJobId: "site_visit",
      assetPolicy: entrance ? "exact" : "any",
      selectedAssetId: entrance?.id,
      mustInclude: ["Visit"]
    }),
    maybeCase("case-09-location-advantage", "Location advantage", postType("location-advantage") && ctx.project, {
      ...base,
      postTypeId: postType("location-advantage")?.id,
      brief: "Create a premium location advantage post using only verified connectivity or neighbourhood facts."
    }, {
      contentJobId: "location_advantage",
      assetPolicy: "any",
      mustNotInclude: ["unverified", "guaranteed"]
    }),
    maybeCase("case-10-pricing-db", "Pricing or offer from DB", (postType("ad") || postType("offer")) && ctx.project, {
      ...base,
      postTypeId: (postType("ad") || postType("offer"))?.id,
      brief: "Create a premium price-led post using verified project pricing only."
    }, {
      contentJobId: "pricing_ad",
      assetPolicy: "any",
      mustNotInclude: ["guaranteed returns"]
    }),
    maybeCase("case-11-pricing-brief-override", "Pricing brief override", (postType("ad") || postType("offer")) && ctx.project, {
      ...base,
      postTypeId: (postType("ad") || postType("offer"))?.id,
      brief: "Create a premium offer post. Use client supplied price: ₹3.21 Cr all inclusive."
    }, {
      contentJobId: "pricing_ad",
      assetPolicy: "any",
      mustInclude: ["₹3.21 Cr"]
    }),
    maybeCase("case-12-no-phone-no-qr", "Negation: no phone and no QR", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      brief: "Create a premium launch post. No phone, no QR, and without RERA block."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "any",
      mustNotInclude: ["phone", "QR", "RERA"],
      contactItemsExpected: []
    }),
    maybeCase("case-13-show-phone-website", "Contact trigger: phone and website", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      contactItems: ["phone", "website"],
      brief: "Create a premium launch post and show phone and website in the footer."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "any",
      contactItemsExpected: ["phone", "website"]
    }),
    maybeCase("case-14-three-variants", "Three launch variants", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      variantCount: 3,
      brief: "Create three meaningfully different premium launch post options."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "any",
      variantCount: 3,
      distinctPrompts: true
    }),
    maybeCase("case-15-selected-asset-locked", "Selected asset locked across variants", postType("project-launch") && ctx.project && exterior, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      selectedAssetIds: [exterior?.id],
      variantCount: 3,
      brief: "Create three premium launch variants using this exact selected reference image."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "allExact",
      selectedAssetId: exterior?.id,
      variantCount: 3,
      distinctPrompts: true
    }),
    maybeCase("case-16-exact-copy", "Exact copy mode", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      copyMode: "manual",
      copy: {
        headline: "A Landmark Address",
        subheadline: "Designed for composed urban living.",
        cta: "Enquire Today"
      },
      brief: "Create a premium launch post using the exact copy."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "any",
      mustInclude: ["A Landmark Address", "Designed for composed urban living.", "Enquire Today"]
    }),
    maybeCase("case-17-preset-compliance", "Preset logo/RERA/contact", postType("project-launch") && ctx.project && preset, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      brandPresetId: preset?.preset_id ?? preset?.db_id ?? null,
      brief: "Create a premium launch post using the selected brand preset."
    }, {
      contentJobId: "project_launch",
      assetPolicy: "any",
      expectLogoRequired: true
    })
  ].filter(Boolean);
}

function maybeCase(id, title, condition, payload, expected) {
  return condition ? { id, title, payload, expected } : null;
}

function evaluateCase(testCase, response) {
  const errors = [];
  const warnings = [];
  const result = response?.result;
  if (!result) errors.push("Missing response.result.");
  if (result?.status !== "ready") errors.push(`Expected status ready, got ${result?.status}`);
  if (result?.validation?.passed !== true) errors.push("Expected validation.passed=true.");
  if (testCase.expected.contentJobId && result?.content_job_id !== testCase.expected.contentJobId) {
    errors.push(`Expected content_job_id ${testCase.expected.contentJobId}, got ${result?.content_job_id}`);
  }
  const visibleWarnings = result?.validation?.warnings ?? [];
  for (const warning of visibleWarnings) {
    if (/dspy|adapterparseerror|registry planner/i.test(String(warning))) {
      errors.push(`Internal warning leaked: ${warning}`);
    }
  }
  const variants = Array.isArray(result?.variants) ? result.variants : [];
  if (!variants.length) errors.push("No variants returned.");
  if (testCase.expected.variantCount && variants.length !== testCase.expected.variantCount) {
    errors.push(`Expected ${testCase.expected.variantCount} variants, got ${variants.length}`);
  }

  const allPrompt = variants.map((variant) => `${variant.prompt ?? ""}\n${variant.compiled_prompt ?? ""}\n${JSON.stringify(variant.copy ?? {})}`).join("\n\n");
  for (const value of testCase.expected.mustInclude ?? []) {
    if (value && !allPrompt.toLowerCase().includes(String(value).toLowerCase())) {
      errors.push(`Expected prompt/copy to include "${value}".`);
    }
  }
  for (const value of testCase.expected.mustNotInclude ?? []) {
    if (value && hasPositiveMention(allPrompt, String(value))) {
      errors.push(`Expected prompt/copy not to include "${value}".`);
    }
  }
  if (/\b(?:asset_id|template_id)\b/i.test(allPrompt)) {
    errors.push("Prompt exposes internal field name asset_id/template_id.");
  }
  if (/[a-f0-9]{8}-[a-f0-9-]{27,}/i.test(allPrompt)) {
    errors.push("Prompt exposes UUID/internal asset reference.");
  }

  const projectAssetIdsByVariant = variants.map((variant) => variant.render_package?.project_asset_ids ?? []);
  if (testCase.expected.assetPolicy === "none" && projectAssetIdsByVariant.some((ids) => ids.length > 0)) {
    errors.push(`Expected no project assets, got ${JSON.stringify(projectAssetIdsByVariant)}.`);
  }
  if (testCase.expected.assetPolicy === "any" && projectAssetIdsByVariant.some((ids) => ids.length === 0)) {
    errors.push(`Expected each variant to have a project asset, got ${JSON.stringify(projectAssetIdsByVariant)}.`);
  }
  if (testCase.expected.assetPolicy === "exact") {
    const first = projectAssetIdsByVariant[0]?.[0];
    if (first !== testCase.expected.selectedAssetId) errors.push(`Expected selected asset ${testCase.expected.selectedAssetId}, got ${first}.`);
  }
  if (testCase.expected.assetPolicy === "allExact") {
    const bad = projectAssetIdsByVariant.some((ids) => ids[0] !== testCase.expected.selectedAssetId);
    if (bad) errors.push(`Expected all variants to use ${testCase.expected.selectedAssetId}, got ${JSON.stringify(projectAssetIdsByVariant)}.`);
  }
  if (testCase.expected.assetPolicy === "contains") {
    const selectedText = variants.map((variant) => JSON.stringify(variant.selected_assets ?? [])).join(" ").toLowerCase();
    for (const value of testCase.expected.selectedAssetText ?? []) {
      if (!selectedText.includes(String(value).toLowerCase())) errors.push(`Expected selected asset text to include ${value}.`);
    }
  }
  for (const value of testCase.expected.preferredAssetText ?? []) {
    const selectedText = variants.map((variant) => JSON.stringify(variant.selected_assets ?? [])).join(" ").toLowerCase();
    if (!selectedText.includes(String(value).toLowerCase())) warnings.push(`Preferred selected asset text did not include ${value}.`);
  }
  if (testCase.expected.contactItemsExpected) {
    const items = new Set(variants.flatMap((variant) => variant.render_package?.contact_rules?.items ?? []));
    for (const expected of testCase.expected.contactItemsExpected) {
      if (!items.has(expected)) errors.push(`Expected contact item ${expected}.`);
    }
    if (testCase.expected.contactItemsExpected.length === 0 && items.size > 0) {
      errors.push(`Expected no contact items, got ${Array.from(items).join(", ")}.`);
    }
  }
  if (testCase.expected.expectLogoRequired) {
    if (!variants.some((variant) => variant.render_package?.logo_rules?.required === true)) {
      errors.push("Expected logo required from preset.");
    }
  }
  if (testCase.expected.distinctPrompts) {
    const normalized = variants.map((variant) => normalizePrompt(variant.compiled_prompt ?? variant.prompt ?? ""));
    if (new Set(normalized).size < Math.min(2, normalized.length)) {
      errors.push("Expected meaningfully distinct variant prompts.");
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

function hasPositiveMention(text, value) {
  const source = String(text ?? "");
  const escaped = escapeRegExp(value).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(.{0,80})\\b${escaped}\\b(.{0,80})`, "gi");
  for (const match of source.matchAll(pattern)) {
    const before = String(match[1] ?? "").toLowerCase();
    const context = `${match[1] ?? ""}${value}${match[2] ?? ""}`.toLowerCase();
    if (/(?:not|no|without|never|do not|don't|avoid|must not|should not)[^.!?;:\n]{0,80}$/.test(before)) continue;
    if (/(?:not|no|without|never|do not|don't|avoid|must not|should not)[^.!?;:\n]{0,100}/.test(context)) continue;
    return true;
  }
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderMarkdownReport({ config, brand, project, results }) {
  const passed = results.filter((item) => item.evaluation.passed).length;
  const failed = results.length - passed;
  const lines = [
    "# Prompt Engine V3 Live Compile Regression",
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
    lines.push(`Content job: \`${result?.content_job_id ?? "n/a"}\``);
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
      lines.push(`### Variant ${variant.variant_id}: ${variant.variation_label ?? ""}`);
      lines.push(`Selected template: \`${variant.selected_template_id ?? "none"}\``);
      lines.push(`Selected assets: \`${(variant.render_package?.project_asset_ids ?? []).join(", ") || "none"}\``);
      lines.push("");
      lines.push("Copy:");
      lines.push("```json");
      lines.push(JSON.stringify(variant.copy ?? {}, null, 2));
      lines.push("```");
      lines.push("");
      lines.push("Compiled prompt:");
      lines.push("```text");
      lines.push(String(variant.compiled_prompt ?? ""));
      lines.push("```");
      lines.push("");
      lines.push("Render package:");
      lines.push("```json");
      lines.push(JSON.stringify(variant.render_package ?? {}, null, 2));
      lines.push("```");
    }
    lines.push("");
    lines.push(`Raw JSON: \`raw/${record.id}.json\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function requestGet(route, token) {
  const response = await fetch(`${config.apiBase}${route}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function requestPost(route, token, body) {
  const response = await fetch(`${config.apiBase}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
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

function firstAsset(assets, predicate) {
  return (assets ?? []).find((asset) => predicate(asset)) ?? null;
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

function normalizePrompt(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[0-9]/g, "#").slice(0, 500);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
