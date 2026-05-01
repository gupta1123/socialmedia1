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
  outDir: args.values.outDir ?? path.join("reports", "prompt-engine-v3", timestamp(), "asset-selection-matrix")
};

async function main() {
  if (!config.jwtSecret) throw new Error("Missing SUPABASE_JWT_SECRET/JWT_SECRET for local API auth.");
  const token = await createLocalToken(config);
  const bootstrap = await requestGet("/api/session/bootstrap?view=light", token);
  const brand = pickByName(bootstrap.brands ?? [], config.brandQuery) ?? bootstrap.brands?.[0];
  if (!brand?.id) throw new Error("No brand found.");

  const [projects, postTypes, festivals, assets, presets] = await Promise.all([
    requestGet(`/api/projects?brandId=${encodeURIComponent(brand.id)}`, token),
    requestGet("/api/post-types", token),
    requestGet("/api/festivals", token).catch(() => []),
    requestGet(`/api/brands/${brand.id}/assets`, token),
    requestGet(`/api/creative-v3/brand-presets?brandId=${encodeURIComponent(brand.id)}`, token).catch(() => [])
  ]);

  const project = pickByName(projects, config.projectQuery) ?? projects[0] ?? null;
  const ctx = { brand, project, postTypes, festivals, assets, presets };
  const cases = buildCases(ctx).filter(Boolean);
  await fs.mkdir(path.join(config.outDir, "raw"), { recursive: true });

  const results = [];
  for (const testCase of cases) {
    const started = Date.now();
    const response = await requestPost("/api/creative-v3/compile", token, testCase.payload);
    const record = {
      id: testCase.id,
      title: testCase.title,
      expectedAssetBehavior: testCase.expectedAssetBehavior,
      input: testCase.payload,
      response,
      assetSummary: summarizeAssets(response),
      durationMs: Date.now() - started
    };
    results.push(record);
    await fs.writeFile(path.join(config.outDir, "raw", `${testCase.id}.json`), JSON.stringify(record, null, 2));
    console.log(`${testCase.id}: ${record.assetSummary.map((item) => item.label || item.projectAssetIds.join(",") || "none").join(" | ")}`);
  }

  const report = renderReport({ config, brand, project, results, ctx });
  const reportPath = path.join(config.outDir, "asset-selection-matrix.md");
  await fs.writeFile(reportPath, report);
  console.log(JSON.stringify({ reportPath, rawDir: path.join(config.outDir, "raw"), total: results.length }, null, 2));
}

function buildCases(ctx) {
  const postType = (code) => (ctx.postTypes ?? []).find((item) => item.code === code);
  const festival =
    (ctx.festivals ?? []).find((item) => /sankranti|diwali|gudi/i.test(`${item.name} ${item.code ?? ""}`)) ??
    (ctx.festivals ?? [])[0] ??
    null;
  const projectAssets = (ctx.assets ?? []).filter((asset) => asset.projectId === ctx.project?.id && isRenderable(asset) && !["logo", "rera_qr"].includes(asset.kind));
  const exterior = firstAsset(projectAssets, (asset) => /exterior|facade|façade|tower|building|hero/.test(haystack(asset)));
  const pool = firstAsset(projectAssets, (asset) => /pool|swimming/.test(haystack(asset)));
  const entrance = firstAsset(projectAssets, (asset) => /entrance|gate|arrival|lobby/.test(haystack(asset)));
  const map = firstAsset(projectAssets, (asset) => /map|location|connectivity|landmark/.test(haystack(asset)));
  const construction = firstAsset(projectAssets, (asset) => /construction|progress|site update|work in progress/.test(haystack(asset)));

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
    maybeCase("project-launch-auto", "Project launch, no selected ref", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      brief: "Create a premium real-estate launch post with a strong architectural visual and restrained copy."
    }, "Should prefer an exterior / tower / facade hero image."),
    maybeCase("amenity-auto", "Amenity spotlight, no amenity named", postType("amenity-spotlight") && ctx.project, {
      ...base,
      postTypeId: postType("amenity-spotlight")?.id,
      brief: "Create a premium amenity post that highlights one lifestyle benefit with calm, polished copy."
    }, "Should choose an amenity asset, not generic exterior."),
    maybeCase("amenity-pool", "Amenity spotlight, pool named", postType("amenity-spotlight") && ctx.project, {
      ...base,
      postTypeId: postType("amenity-spotlight")?.id,
      brief: "Create a bright daylight swimming pool amenity post with fresh premium lifestyle energy."
    }, "Should choose a swimming pool asset when one exists."),
    maybeCase("site-visit-auto", "Site visit invite", postType("site-visit-invite") && ctx.project, {
      ...base,
      postTypeId: postType("site-visit-invite")?.id,
      brief: "Create a premium site visit invite using arrival, entrance, or lobby mood."
    }, "Should prefer entrance / gate / lobby / arrival, then exterior fallback."),
    maybeCase("location-advantage-auto", "Location advantage", postType("location-advantage") && ctx.project, {
      ...base,
      postTypeId: postType("location-advantage")?.id,
      brief: "Create a premium location advantage post using verified connectivity and neighbourhood facts."
    }, "Should prefer map/location/connectivity asset when available, otherwise aerial/exterior."),
    maybeCase("construction-update-auto", "Construction update", postType("construction-update") && ctx.project, {
      ...base,
      postTypeId: postType("construction-update")?.id,
      brief: "Create a credible construction update post without inventing current site progress."
    }, "Should prefer construction/progress asset; if none exists, exterior is only a visual fallback and prompt must avoid progress claims."),
    maybeCase("pricing-auto", "Pricing ad", (postType("ad") || postType("offer")) && ctx.project, {
      ...base,
      postTypeId: (postType("ad") || postType("offer"))?.id,
      brief: "Create a premium pricing post using verified project pricing only."
    }, "Should prefer exterior or floor/unit plan where pricing context supports it."),
    maybeCase("festive-no-project", "Festive greeting, no project selected", postType("festive-greeting") && festival, {
      ...base,
      projectId: null,
      postTypeId: postType("festive-greeting")?.id,
      festivalId: festival?.id,
      brief: `Create a premium ${festival?.name ?? "festive"} greeting that feels elegant, respectful, and brand-safe.`
    }, "Should not auto-select project assets when no project/ref is selected."),
    maybeCase("festive-project-auto", "Festive greeting, project selected but no ref", postType("festive-greeting") && festival && ctx.project, {
      ...base,
      postTypeId: postType("festive-greeting")?.id,
      festivalId: festival?.id,
      brief: `Create a premium ${festival?.name ?? "festive"} greeting for the brand.`
    }, "Project asset is optional; if selected, it should be used tastefully and not turn into a launch post."),
    maybeCase("selected-ref-locked", "Project launch with explicit selected ref", postType("project-launch") && exterior, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      selectedAssetIds: exterior?.id ? [exterior.id] : [],
      variantCount: 2,
      brief: "Create two premium launch options using this exact selected reference image."
    }, `Should lock selected asset ${exterior?.label}.`),
    maybeCase("asset-variation", "Launch variants with asset variation enabled", postType("project-launch") && ctx.project, {
      ...base,
      postTypeId: postType("project-launch")?.id,
      variantCount: 3,
      assetVariation: true,
      brief: "Create three launch variants with different visual angles where suitable."
    }, "Can distribute variants across different eligible assets.")
  ];
}

function maybeCase(id, title, condition, payload, expectedAssetBehavior) {
  return condition ? { id, title, payload, expectedAssetBehavior } : null;
}

function summarizeAssets(response) {
  const variants = Array.isArray(response?.result?.variants) ? response.result.variants : [];
  return variants.map((variant) => {
    const selected = Array.isArray(variant.selected_assets) ? variant.selected_assets[0] : null;
    return {
      variantId: variant.variant_id,
      label: selected?.label ?? null,
      selectedAssets: variant.selected_assets ?? [],
      projectAssetIds: variant.render_package?.project_asset_ids ?? [],
      creativeDirection: variant.creative_direction ?? {},
      promptStart: String(variant.compiled_prompt ?? variant.prompt ?? "").slice(0, 500)
    };
  });
}

function renderReport({ config, brand, project, results, ctx }) {
  const lines = [
    "# Prompt Engine V3 Asset Selection Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    `API base: \`${config.apiBase}\``,
    `Brand: ${brand.name} (${brand.id})`,
    `Project: ${project ? `${project.name} (${project.id})` : "none"}`,
    `Renderable project assets: ${countRenderableProjectAssets(ctx)}`,
    "",
    "## Notebook Comparison",
    "",
    "The notebook used a stricter flow: first hard-filter candidate assets by content-job semantic type, then score by best_for/not_good_for, requested amenity, brief lighting, visual analysis, crop fit, quality, and recent usage. DSPy then selected the hero asset from that shortlisted candidate set.",
    "",
    "Current service behavior being tested here: user-selected assets are locked; festive without a project returns no project asset; otherwise renderable images are scored with content-job semantic bonuses and brief-token matches, then DSPy may choose from the shortlist.",
    ""
  ];

  for (const record of results) {
    const result = record.response?.result;
    lines.push(`## ${record.id}: ${record.title}`);
    lines.push("");
    lines.push(`Expected behavior: ${record.expectedAssetBehavior}`);
    lines.push(`Status: \`${result?.status ?? "n/a"}\`; content job: \`${result?.content_job_id ?? "n/a"}\`; engine: \`${result?.debug?.engine ?? "n/a"}\`; duration: ${record.durationMs}ms`);
    lines.push("");
    lines.push("| Variant | Selected image | Project asset IDs | Creative direction |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of record.assetSummary) {
      lines.push(`| ${item.variantId} | ${escapeTable(item.label ?? "none")} | ${escapeTable(item.projectAssetIds.join(", ") || "none")} | ${escapeTable(JSON.stringify(item.creativeDirection))} |`);
    }
    lines.push("");
    lines.push("Prompt excerpt:");
    lines.push("```text");
    lines.push(record.assetSummary.map((item) => `${item.variantId}: ${item.promptStart}`).join("\n\n"));
    lines.push("```");
    lines.push("");
    lines.push(`Raw JSON: \`raw/${record.id}.json\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function countRenderableProjectAssets(ctx) {
  return (ctx.assets ?? []).filter((asset) => asset.projectId === ctx.project?.id && isRenderable(asset) && !["logo", "rera_qr"].includes(asset.kind)).length;
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
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      index += 1;
    }
  }
  return { values };
}

function pickByName(items, query) {
  const q = String(query ?? "").toLowerCase();
  return (items ?? []).find((item) => String(`${item.name ?? ""} ${item.slug ?? ""}`).toLowerCase().includes(q));
}

function firstAsset(assets, predicate) {
  return (assets ?? []).find((asset) => predicate(asset)) ?? null;
}

function isRenderable(asset) {
  const storage = String(asset.storagePath ?? "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].some((ext) => storage.endsWith(ext));
}

function haystack(asset) {
  return JSON.stringify({
    label: asset.label,
    kind: asset.kind,
    description: asset.assetDescription ?? asset.description,
    sceneType: asset.sceneType,
    visualUse: asset.visualUse,
    metadata: asset.metadataJson ?? asset.metadata,
    storagePath: asset.storagePath
  }).toLowerCase();
}

function escapeTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").slice(0, 320);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
