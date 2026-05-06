import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const localWebEnv = await loadEnvFile(path.resolve(repoRoot, "apps/web/.env.local"));
const localApiEnv = await loadEnvFile(path.resolve(repoRoot, "apps/api/.env"));

const DEFAULT_GROUPS = ["smoke"];
const ALL_GROUPS = ["smoke", "presets", "logos", "contact", "text", "truth", "templates", "negative"];
const READY_STATUSES = new Set(["ready", "ready_with_warnings"]);
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i;

const config = {
  apiBase: stripTrailingSlash(args.values.apiBase ?? process.env.API_BASE ?? localWebEnv.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000"),
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
  brandQueries: splitCsv(args.values.brands ?? args.values.brand ?? process.env.CREATIVE_V3_TEST_BRANDS ?? "prescon,pride"),
  projectQuery: String(args.values.project ?? process.env.CREATIVE_V3_TEST_PROJECT ?? "").toLowerCase(),
  groups: normalizeGroups(args.values.groups ?? DEFAULT_GROUPS.join(",")),
  limit: parseOptionalInt(args.values.limit),
  outDir: args.values.outDir ?? path.join("reports", "creative-v3-compile-matrix", timestamp()),
  timeoutMs: parseOptionalInt(args.values.timeoutMs) ?? 180_000,
  deterministic: args.flags.has("deterministic") || process.env.CREATIVE_V3_COMPILE_MATRIX_DETERMINISTIC === "1",
  requireDspy: args.flags.has("require-dspy") || process.env.CREATIVE_V3_COMPILE_MATRIX_REQUIRE_DSPY === "1",
  failFast: args.flags.has("fail-fast"),
  listCases: args.flags.has("list-cases"),
  dryRun: args.flags.has("dry-run"),
  fullPrompts: args.flags.has("full-prompts"),
  includeSkipped: args.flags.has("include-skipped"),
  maxConcurrency: Math.max(1, parseOptionalInt(args.values.concurrency) ?? 1)
};

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
  global: { fetch: fetchWithTimeout(30_000) }
});

async function main() {
  assertConfig();
  await assertLocalApiHealthy();

  const db = await loadDbSnapshot();
  const selectedContexts = selectBrandContexts(db);
  const allCases = selectedContexts.flatMap((ctx) => buildCases(ctx, db));
  const runnableCases = allCases
    .filter((testCase) => config.includeSkipped || !testCase.skipReason)
    .filter((testCase) => config.groups.includes("all") || config.groups.includes(testCase.group));
  const limitedCases = config.limit ? runnableCases.slice(0, config.limit) : runnableCases;

  if (config.listCases || config.dryRun) {
    printCaseList(limitedCases);
    return;
  }

  if (limitedCases.length === 0) {
    throw new Error(`No runnable cases for groups: ${config.groups.join(", ")}.`);
  }

  await fs.mkdir(path.join(config.outDir, "raw"), { recursive: true });
  const results = [];

  for (const testCase of limitedCases) {
    if (testCase.skipReason) {
      const record = skippedRecord(testCase);
      results.push(record);
      console.log(`SKIP ${testCase.id} ${testCase.title}: ${testCase.skipReason}`);
      continue;
    }

    const token = await createLocalTokenForWorkspace(testCase.context.workspaceId, db);
    const startedAt = Date.now();
    try {
      const response = await requestCompile(token, testCase.payload);
      const evaluation = evaluateCase(testCase, response);
      const record = {
        id: testCase.id,
        group: testCase.group,
        brand: testCase.context.brand.name,
        project: testCase.context.project?.name ?? null,
        title: testCase.title,
        expected: testCase.expected,
        input: testCase.payload,
        response,
        evaluation,
        durationMs: Date.now() - startedAt
      };
      results.push(record);
      await writeRawRecord(record);
      logResult(record);
      if (!evaluation.passed && config.failFast) break;
    } catch (error) {
      const record = {
        id: testCase.id,
        group: testCase.group,
        brand: testCase.context.brand.name,
        project: testCase.context.project?.name ?? null,
        title: testCase.title,
        expected: testCase.expected,
        input: testCase.payload,
        response: null,
        evaluation: {
          passed: false,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: []
        },
        durationMs: Date.now() - startedAt
      };
      results.push(record);
      await writeRawRecord(record);
      logResult(record);
      if (config.failFast) break;
    }
  }

  const report = renderMarkdownReport({ config, results, contexts: selectedContexts });
  const summary = summarizeResults(results);
  await fs.writeFile(path.join(config.outDir, "creative-v3-compile-matrix.md"), report);
  await fs.writeFile(path.join(config.outDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify({ ...summary, outDir: config.outDir }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

function assertConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.jwtSecret) missing.push("SUPABASE_JWT_SECRET/JWT_SECRET");
  if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}. Expected apps/api/.env or process env.`);
}

async function assertLocalApiHealthy() {
  const response = await fetch(`${config.apiBase}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`API health check failed: ${response.status} ${await response.text()}`);
}

async function loadDbSnapshot() {
  const [brands, projects, assets, postTypes, festivals, presets, workspaceTemplates, catalogTemplates, memberships, rera] = await Promise.all([
    queryAll("brands", "id, workspace_id, name, slug"),
    queryAll("projects", "id, workspace_id, brand_id, name, slug, city, micro_location, stage, status"),
    queryAll("brand_assets", "id, workspace_id, brand_id, project_id, kind, label, storage_path, thumbnail_storage_path, asset_description, metadata_json, scene_type, visual_use, truth_status"),
    queryAll("post_types", "id, workspace_id, code, name"),
    queryAll("festivals", "id, workspace_id, code, name, category, community, regions, meaning, date_label, next_occurs_on").catch(() => []),
    queryAll("creative_v3_brand_presets", "id, workspace_id, brand_id, project_id, preset_key, name, description, preset_json, active", (query) => query.eq("active", true)).catch(() => []),
    queryAll("creative_v3_visual_templates", "id, workspace_id, brand_id, project_id, post_type_id, template_key, name, description, content_job_id, allowed_formats, lever_signature, template_json, status", (query) => query.eq("status", "approved")).catch(() => []),
    queryAll("creative_v3_visual_template_catalog", "id, template_key, name, description, content_job_id, allowed_formats, lever_signature, template_json, status", (query) => query.eq("status", "approved")).catch(() => []),
    queryAll("workspace_memberships", "workspace_id, user_id, role, created_at"),
    queryAll("project_rera_registrations", "id, workspace_id, brand_id, project_id, registration_number, qr_asset_id, is_default").catch(() => [])
  ]);

  return {
    brands: brands.map(mapBrand),
    projects: projects.map(mapProject),
    assets: assets.map(mapAsset),
    postTypes: postTypes.map(mapPostType),
    festivals: festivals.map(mapFestival),
    presets: presets.map(mapPreset),
    workspaceTemplates: workspaceTemplates.map(mapWorkspaceTemplate),
    catalogTemplates: catalogTemplates.map(mapCatalogTemplate),
    memberships,
    rera
  };
}

async function queryAll(table, select, apply = null) {
  return retry(async () => {
    let query = supabase.from(table).select(select);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  }, { label: `query ${table}`, attempts: 3 });
}

function selectBrandContexts(db) {
  const contexts = [];
  const selectedBrands = [];
  for (const query of config.brandQueries) {
    const brand = db.brands.find((item) => matchesQuery(item, query));
    if (brand && !selectedBrands.some((item) => item.id === brand.id)) selectedBrands.push(brand);
  }
  if (selectedBrands.length === 0 && db.brands.length) selectedBrands.push(db.brands[0]);

  for (const brand of selectedBrands) {
    const projects = db.projects.filter((project) => project.brandId === brand.id);
    const project = config.projectQuery
      ? projects.find((item) => matchesQuery(item, config.projectQuery)) ?? projects[0] ?? null
      : projects[0] ?? null;
    const brandAssets = db.assets.filter((asset) => asset.brandId === brand.id);
    const brandPresets = db.presets.filter((preset) => preset.brandId === brand.id);
    const workspaceTemplates = db.workspaceTemplates.filter((template) => template.brandId === brand.id || !template.brandId);
    const templates = [...workspaceTemplates, ...db.catalogTemplates];
    contexts.push({
      brand,
      workspaceId: brand.workspaceId,
      project,
      projects,
      assets: brandAssets,
      postTypes: db.postTypes.filter((postType) => !postType.workspaceId || postType.workspaceId === brand.workspaceId),
      festivals: db.festivals.filter((festival) => !festival.workspaceId || festival.workspaceId === brand.workspaceId),
      presets: brandPresets,
      templates,
      rera: db.rera.filter((item) => item.brand_id === brand.id)
    });
  }
  return contexts;
}

function buildCases(ctx) {
  const project = ctx.project;
  const postType = (...codes) => codes.map((code) => ctx.postTypes.find((item) => item.code === code)).find(Boolean) ?? null;
  const templateFor = (...contentJobIds) => ctx.templates.find((item) => contentJobIds.includes(item.contentJobId)) ?? null;
  const templatesFor = (...contentJobIds) => ctx.templates.filter((item) => contentJobIds.includes(item.contentJobId));
  const festival = ctx.festivals.find((item) => /diwali|akshaya|eid|christmas|navratri|gudi|sankranti/i.test(`${item.name} ${item.code}`)) ?? ctx.festivals[0] ?? null;

  const projectLogo = firstAsset(ctx.assets, (asset) => asset.kind === "logo" && asset.projectId === project?.id);
  const brandLogo = firstAsset(ctx.assets, (asset) => asset.kind === "logo" && !asset.projectId);
  const anyLogo = projectLogo ?? brandLogo ?? firstAsset(ctx.assets, (asset) => asset.kind === "logo");
  const secondaryLogo = brandLogo && brandLogo.id !== anyLogo?.id ? brandLogo : firstAsset(ctx.assets, (asset) => asset.kind === "logo" && asset.id !== anyLogo?.id);
  const partnerLogo = firstAsset(ctx.assets, (asset) => asset.kind === "logo" && asset.id !== anyLogo?.id && asset.id !== secondaryLogo?.id);
  const reraQr = firstAsset(ctx.assets, (asset) => asset.kind === "rera_qr") ?? firstAsset(ctx.assets, (asset) => ctx.rera.some((row) => row.qr_asset_id === asset.id));

  const exterior = assetByTerms(ctx, ["exterior", "facade", "façade", "tower", "building", "elevation"], ["exterior", "project_exterior", "building_exterior"]);
  const interior = assetByTerms(ctx, ["interior", "living", "bedroom", "kitchen", "room"], ["interior", "living_room", "bedroom", "kitchen"]);
  const amenity = assetByTerms(ctx, ["amenity", "pool", "clubhouse", "gym", "yoga", "kids", "basketball", "garden"], ["amenity", "pool", "clubhouse", "garden", "landscape"]);
  const pool = assetByTerms(ctx, ["pool", "swimming"], ["pool", "amenity"]);
  const construction = assetByTerms(ctx, ["construction", "site", "progress", "slab", "under construction"], ["construction", "site_progress"]);
  const locationAsset = assetByTerms(ctx, ["location", "map", "connectivity", "neighbourhood", "neighborhood"], ["location", "map"]);
  const entrance = assetByTerms(ctx, ["entrance", "gate", "lobby", "arrival"], ["entrance", "lobby"]);

  const presconPreset = findPreset(ctx, ["prescon", "dual", "phone", "contact", "footer"]);
  const prideTownshipPreset = findPreset(ctx, ["township", "dual"]);
  const reraPreset = findPreset(ctx, ["rera"]);
  const anyPreset = presconPreset ?? prideTownshipPreset ?? reraPreset ?? ctx.presets[0] ?? null;
  const launchTemplates = templatesFor("project_launch");
  const launchType = postType("project-launch");
  const constructionType = postType("construction-update");
  const amenityType = postType("amenity-spotlight");
  const locationType = postType("location-advantage");
  const festiveType = postType("festive-greeting");
  const siteVisitType = postType("site-visit-invite");
  const adType = postType("ad", "offer", "pricing-ad");
  const testimonialType = postType("testimonial");

  const base = {
    brandId: ctx.brand.id,
    projectId: project?.id ?? null,
    festivalId: null,
    postTypeId: launchType?.id ?? null,
    brief: "Create a premium real-estate creative.",
    audience: "Homebuyers and investors",
    format: "portrait",
    variantCount: 1,
    variationStrategy: "auto",
    assetVariation: false,
    creativeMode: "auto",
    textStrategy: "auto",
    noveltyLevel: 0.65,
    constructionVisualMode: "auto",
    constructionProgressPercent: 50,
    festivalVisualScope: "auto",
    copyMode: "auto",
    copyLanguage: "en",
    copy: { headline: null, subheadline: null, cta: null },
    brandPresetId: null,
    visualTemplateId: null,
    visualTemplateIds: [],
    selectedAssetIds: [],
    renderPreset: "v1_low",
    includeLogo: false,
    logoAssetId: null,
    additionalLogoAssetIds: [],
    includeReraQr: false,
    reraQrAssetId: null,
    contactItems: [],
    options: config.deterministic ? { disable_dspy: true } : {}
  };

  const cases = [
    c("smoke-project-launch-basic", "smoke", "Project launch basic", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      brief: "Create a premium real-estate launch post with a strong architectural visual and restrained copy."
    }, {
      contentJobId: "project_launch",
      allowedStatuses: [...READY_STATUSES],
      expectedVariantCount: 1,
      expectProjectAsset: true,
      promptMustIncludeAny: [project?.name, ctx.brand.name]
    }),
    c("smoke-project-launch-selected-exterior", "smoke", "Project launch with selected exterior", launchType && project && exterior, {
      ...base,
      postTypeId: launchType?.id,
      selectedAssetIds: [exterior?.id],
      brief: "Create a premium launch post using this selected building image as the exact truth anchor."
    }, {
      contentJobId: "project_launch",
      selectedAssetId: exterior?.id,
      expectTruthAnchor: "exterior",
      promptMustIncludeAny: ["preserve", "facade", "massing", "truth"]
    }),
    c("smoke-three-variants", "smoke", "Three launch variants", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      variantCount: 3,
      brief: "Create three meaningfully different premium launch post options."
    }, {
      contentJobId: "project_launch",
      expectedVariantCount: 3,
      expectDistinctPrompts: true
    }),
    c("smoke-construction-visualized", "smoke", "Construction visualized progress", constructionType && project, {
      ...base,
      postTypeId: constructionType?.id,
      constructionVisualMode: "visualized_progress_from_project_truth",
      constructionProgressPercent: 65,
      selectedAssetIds: exterior ? [exterior?.id] : [],
      brief: "Create a premium construction update, visualized from approved project truth at around 65 percent progress."
    }, {
      contentJobId: "construction_update",
      promptMustIncludeAny: ["65", "construction-stage", "without implying verified current site progress"],
      promptMustNotInclude: ["actual current site photo", "verified latest progress"]
    }),
    c("smoke-amenity", "smoke", "Amenity spotlight", amenityType && project, {
      ...base,
      postTypeId: amenityType?.id,
      selectedAssetIds: amenity ? [amenity?.id] : [],
      creativeMode: "lifestyle_led",
      brief: "Create a premium amenity spotlight around calm lifestyle value and refined daily living."
    }, {
      contentJobId: "amenity_spotlight",
      selectedAssetId: amenity?.id,
      promptMustIncludeAny: ["amenity", "lifestyle", "daily living"]
    }),
    c("smoke-location", "smoke", "Location advantage", locationType && project, {
      ...base,
      postTypeId: locationType?.id,
      selectedAssetIds: locationAsset ? [locationAsset?.id] : [],
      creativeMode: "proof_led",
      brief: "Create a premium location advantage post using only verified connectivity or neighbourhood facts."
    }, {
      contentJobId: "location_advantage",
      promptMustNotInclude: ["guaranteed", "unverified"]
    }),
    c("smoke-festive-brand-only", "smoke", "Festive brand-only greeting", festiveType && festival, {
      ...base,
      projectId: null,
      postTypeId: festiveType?.id,
      festivalId: festival?.id,
      festivalVisualScope: "brand_only",
      creativeMode: "brand_led",
      brief: `Create a premium ${festival?.name ?? "festive"} greeting that is brand-safe, elegant, and not project-led.`
    }, {
      contentJobId: "festive_greeting",
      expectNoProjectAsset: true,
      promptMustIncludeAny: [festival?.name, "festive", "greeting"],
      promptMustNotInclude: ["building exterior", "tower facade", "project render", "construction scene"]
    }),
    c("smoke-pricing-offer", "smoke", "Pricing or offer", adType && project, {
      ...base,
      postTypeId: adType?.id,
      creativeMode: "offer_led",
      contactItems: ["phone"],
      brief: "Create a premium price-led offer post using verified project pricing only. Do not invent a price."
    }, {
      contentJobId: "pricing_ad",
      allowedStatuses: [...READY_STATUSES, "needs_input"],
      allowNoVariantsForStatuses: ["needs_input"],
      expectContactItems: ["phone"],
      expectWarningMatching: /pricing|verified|client-provided|client-confirmation/i,
      promptMustNotInclude: ["guaranteed returns"]
    }),

    c("preset-selected-preset", "presets", "Selected preset survives compile", launchType && project && anyPreset, {
      ...base,
      postTypeId: launchType?.id,
      brandPresetId: presetId(anyPreset),
      brief: "Create a premium launch post using the selected brand preset."
    }, {
      contentJobId: "project_launch",
      expectPresetKey: anyPreset?.presetKey,
      expectLogoRequiredIfPresetRequires: anyPreset,
      expectPresetContactIfAny: anyPreset
    }),
    c("preset-dual-logo-prescon", "presets", "Preset dual logo positions", launchType && project && presconPreset && anyLogo && secondaryLogo, {
      ...base,
      postTypeId: launchType?.id,
      brandPresetId: presetId(presconPreset),
      includeLogo: true,
      logoAssetId: projectLogo?.id ?? anyLogo?.id,
      additionalLogoAssetIds: [secondaryLogo?.id],
      contactItems: ["phone"],
      brief: "Create a premium launch post with main logo, second logo, and phone contact following preset placement."
    }, {
      contentJobId: "project_launch",
      expectLogoPosition: readPresetPosition(presconPreset, "logo"),
      expectSecondaryLogoAssetId: secondaryLogo?.id,
      expectSecondaryLogoPosition: readPresetPosition(presconPreset, "secondary_logo"),
      expectContactItems: ["phone"],
      expectContactPosition: readPresetPosition(presconPreset, "contact"),
      expectNoSecondaryInAdditional: true
    }),
    c("preset-rera-explicit", "presets", "Explicit RERA QR contract", launchType && project && reraQr, {
      ...base,
      postTypeId: launchType?.id,
      includeReraQr: true,
      reraQrAssetId: reraQr?.id,
      brief: "Create a premium launch post and include the exact RERA compliance block."
    }, {
      contentJobId: "project_launch",
      expectReraAssetId: reraQr?.id,
      expectReraCompositedAfter: true,
      promptMustNotInclude: ["fake qr", "generate qr"]
    }),
    c("preset-rera-trigger-pricing", "presets", "Preset RERA triggered by pricing/project brief", adType && project && reraPreset && reraQr, {
      ...base,
      postTypeId: adType?.id,
      brandPresetId: presetId(reraPreset),
      brief: "Create a price-led project ad mentioning project and typology; follow compliance requirements."
    }, {
      contentJobId: "pricing_ad",
      allowedStatuses: [...READY_STATUSES, "needs_input"],
      allowNoVariantsForStatuses: ["needs_input"],
      expectWarningMatching: /pricing|verified|client-provided|client-confirmation/i,
      expectReraRequired: true,
      expectReraCompositedAfter: true
    }),
    c("preset-location-contact", "presets", "Preset location and contact placement", launchType && project && anyPreset, {
      ...base,
      postTypeId: launchType?.id,
      brandPresetId: presetId(anyPreset),
      contactItems: ["phone"],
      brief: "Create a premium launch post with project location and phone footer if grounded."
    }, {
      contentJobId: "project_launch",
      expectContactItems: ["phone"],
      expectLocationIfPreset: anyPreset
    }),

    c("logo-primary-only", "logos", "Primary logo only", launchType && project && anyLogo, {
      ...base,
      postTypeId: launchType?.id,
      includeLogo: true,
      logoAssetId: anyLogo?.id,
      brief: "Create a premium launch post with the exact supplied logo once."
    }, {
      contentJobId: "project_launch",
      expectLogoAssetId: anyLogo?.id,
      expectProviderRole: { assetId: anyLogo?.id, role: "exact_logo_layer" },
      promptMustIncludeAny: ["logo", "exact"]
    }),
    c("logo-manual-secondary", "logos", "Manual secondary logo without preset", launchType && project && anyLogo && secondaryLogo, {
      ...base,
      postTypeId: launchType?.id,
      includeLogo: true,
      logoAssetId: anyLogo?.id,
      additionalLogoAssetIds: [secondaryLogo?.id],
      brief: "Create a premium launch post with project logo and developer logo."
    }, {
      contentJobId: "project_launch",
      expectLogoAssetId: anyLogo?.id,
      expectSecondaryLogoAssetId: secondaryLogo?.id,
      expectProviderRole: { assetId: secondaryLogo?.id, role: "exact_secondary_logo_layer" },
      expectNoSecondaryInAdditional: true
    }),
    c("logo-multiple-additional", "logos", "Multiple manual logos", launchType && project && anyLogo && secondaryLogo && partnerLogo, {
      ...base,
      postTypeId: launchType?.id,
      includeLogo: true,
      logoAssetId: anyLogo?.id,
      additionalLogoAssetIds: [secondaryLogo?.id, partnerLogo?.id],
      brief: "Create a premium launch post with main logo, developer logo, and partner logo."
    }, {
      contentJobId: "project_launch",
      expectSecondaryLogoAssetId: secondaryLogo?.id,
      expectAdditionalLogoAssetIds: [partnerLogo?.id],
      expectProviderRole: { assetId: partnerLogo?.id, role: "exact_additional_logo_layer" },
      expectNoSecondaryInAdditional: true
    }),
    c("logo-conflict-brief-no-logo-preset", "logos", "Brief says no logo but preset requires logo", launchType && project && anyPreset, {
      ...base,
      postTypeId: launchType?.id,
      brandPresetId: presetId(anyPreset),
      brief: "Create a premium launch post. Do not show logo, no logo at all."
    }, {
      contentJobId: "project_launch",
      expectNoFakeLogo: true,
      expectLogoRequiredIfPresetRequires: anyPreset
    }),

    c("contact-phone", "contact", "Phone contact", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      contactItems: ["phone"],
      brief: "Create a premium launch post and show phone in the footer."
    }, { contentJobId: "project_launch", expectContactItems: ["phone"] }),
    c("contact-website", "contact", "Website contact", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      contactItems: ["website"],
      brief: "Create a premium launch post and show website in the footer."
    }, { contentJobId: "project_launch", expectContactItems: ["website"] }),
    c("contact-email", "contact", "Email contact", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      contactItems: ["email"],
      brief: "Create a premium launch post and show email in the footer."
    }, { contentJobId: "project_launch", expectContactItems: ["email"] }),
    c("contact-whatsapp", "contact", "WhatsApp contact", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      contactItems: ["whatsapp"],
      brief: "Create a premium launch post and show WhatsApp contact in the footer."
    }, { contentJobId: "project_launch", expectContactItems: ["whatsapp"] }),
    c("contact-multiple", "contact", "Multiple contacts", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      contactItems: ["phone", "website", "email"],
      brief: "Create a premium launch post with phone, website, and email in a restrained footer."
    }, { contentJobId: "project_launch", expectContactItems: ["phone", "website", "email"] }),
    c("contact-brief-phone-override", "contact", "Brief phone override", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      contactItems: ["phone"],
      brief: "Create a premium launch post. Show phone 98765 43210."
    }, {
      contentJobId: "project_launch",
      expectContactItems: ["phone"],
      expectContactValue: { key: "phone", value: "98765 43210" }
    }),
    c("contact-negated", "contact", "Negated phone and QR", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      brief: "Create a premium launch post. No phone, no QR, and without RERA block."
    }, {
      contentJobId: "project_launch",
      expectNoContactItems: true,
      expectNoRera: true,
      promptMustNotInclude: ["phone footer", "rera block", "qr"]
    }),

    c("text-manual-exact-copy", "text", "Manual exact copy", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      copyMode: "manual",
      copy: {
        headline: "A Landmark Address",
        subheadline: "Designed for composed urban living.",
        cta: "Enquire Today"
      },
      brief: "Create a premium launch post using the exact copy."
    }, {
      contentJobId: "project_launch",
      promptMustInclude: ["A Landmark Address", "Designed for composed urban living.", "Enquire Today"]
    }),
    c("text-reserve-space", "text", "Reserve editable space", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      textStrategy: "reserve_editable_space",
      brief: "Create a premium launch background and reserve clean editable space for later copy."
    }, {
      contentJobId: "project_launch",
      expectTextTreatment: "reserve_space",
      expectNoExactTextLayers: true,
      promptMustIncludeAny: ["no text", "reserve", "editable"]
    }),
    c("text-no-text-visual", "text", "No text visual only", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      textStrategy: "no_text_visual_only",
      brief: "Create a visual-only premium launch key visual with no typography."
    }, {
      contentJobId: "project_launch",
      expectTextTreatment: "reserve_space",
      expectNoExactTextLayers: true,
      promptMustIncludeAny: ["no text", "no typography"]
    }),
    c("text-typography-dominant", "text", "Typography dominant", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      textStrategy: "typography_dominant",
      creativeMode: "copy_led",
      brief: "Create a typography-led premium launch poster with confident editorial hierarchy."
    }, {
      contentJobId: "project_launch",
      promptMustIncludeAny: ["typography", "headline", "hierarchy"]
    }),
    c("text-hindi-language", "text", "Hindi copy language", launchType && project, {
      ...base,
      postTypeId: launchType?.id,
      copyLanguage: "hi",
      contactItems: ["phone"],
      brief: "Create a premium Hindi launch post. Keep logo, URL, phone, and RERA values unchanged."
    }, {
      contentJobId: "project_launch",
      expectContactItems: ["phone"],
      promptMustIncludeAny: ["phone", "logo"],
      promptMustNotInclude: ["translate logo", "translate phone"]
    }),

    c("truth-preserve-building", "truth", "Preserve selected building", launchType && project && exterior, {
      ...base,
      postTypeId: launchType?.id,
      selectedAssetIds: [exterior?.id],
      brief: "Create a premium launch post. Preserve the building exactly and make the design more premium."
    }, {
      contentJobId: "project_launch",
      selectedAssetId: exterior?.id,
      expectTruthAnchor: "exterior",
      promptMustIncludeAny: ["preserve", "massing", "facade", "tower count"]
    }),
    c("truth-user-asks-taller", "truth", "User asks to make building taller", launchType && project && exterior, {
      ...base,
      postTypeId: launchType?.id,
      selectedAssetIds: [exterior?.id],
      brief: "Create a premium launch post and make the building taller and grander than in the image."
    }, {
      contentJobId: "project_launch",
      selectedAssetId: exterior?.id,
      expectTruthAnchor: "exterior",
      promptMustIncludeAny: ["do not change", "preserve", "massing", "height impression"],
      promptMustNotInclude: ["make the building taller"]
    }),
    c("truth-change-elevation", "truth", "User asks to change elevation", launchType && project && exterior, {
      ...base,
      postTypeId: launchType?.id,
      selectedAssetIds: [exterior?.id],
      brief: "Create a premium post and change the elevation to a more glass-heavy facade."
    }, {
      contentJobId: "project_launch",
      selectedAssetId: exterior?.id,
      expectTruthAnchor: "exterior",
      promptMustIncludeAny: ["do not change", "facade rhythm", "material character"],
      promptMustNotInclude: ["glass-heavy facade"]
    }),
    c("truth-no-facade-signage", "truth", "Forbid facade signage", launchType && project && exterior && anyLogo, {
      ...base,
      postTypeId: launchType?.id,
      selectedAssetIds: [exterior?.id],
      includeLogo: true,
      logoAssetId: anyLogo?.id,
      brief: "Create a premium post and put the logo on the building facade."
    }, {
      contentJobId: "project_launch",
      selectedAssetId: exterior?.id,
      expectLogoAssetId: anyLogo?.id,
      promptMustIncludeAny: ["Never place the logo on the building facade", "facade signage", "separate flat brand mark"],
      promptMustNotInclude: ["put the logo on the building facade"]
    }),
    c("truth-interior-brief-selects-interior", "truth", "Interior brief selects interior", launchType && project && interior, {
      ...base,
      postTypeId: launchType?.id,
      brief: "Create a launch post but show a warm interior for families."
    }, {
      contentJobId: "project_launch",
      expectSelectedAssetTerms: ["interior", "living", "room"],
      promptMustIncludeAny: ["interior", "room layout"],
      promptMustNotInclude: ["facade rhythm"]
    }),
    c("truth-amenity-with-exterior-mismatch", "truth", "Amenity post with exterior selected", amenityType && project && exterior, {
      ...base,
      postTypeId: amenityType?.id,
      selectedAssetIds: [exterior?.id],
      brief: "Create an amenity spotlight but use this selected exterior reference as the visual anchor."
    }, {
      contentJobId: "amenity_spotlight",
      selectedAssetId: exterior?.id,
      expectWarningMatching: /template|asset|semantic|adapt/i
    }),

    c("template-led-matching", "templates", "Template-led matching template", launchType && project && templateFor("project_launch"), {
      ...base,
      postTypeId: launchType?.id,
      visualTemplateId: templateFor("project_launch")?.templateId,
      creativeMode: "template_led",
      brief: "Create a premium launch post following the selected template layout and style."
    }, {
      contentJobId: "project_launch",
      expectTemplateId: templateFor("project_launch")?.templateId,
      promptMustIncludeAny: ["Template guidance", "template"]
    }),
    c("template-copy-led", "templates", "Copy-led with selected template", launchType && project && templateFor("project_launch"), {
      ...base,
      postTypeId: launchType?.id,
      visualTemplateId: templateFor("project_launch")?.templateId,
      creativeMode: "copy_led",
      brief: "Create a copy-led launch announcement while using the selected template only for hierarchy."
    }, {
      contentJobId: "project_launch",
      expectTemplateId: templateFor("project_launch")?.templateId,
      promptMustIncludeAny: ["copy-led", "Template guidance"]
    }),
    c("template-multiple", "templates", "Multiple template IDs", launchType && project && launchTemplates.length >= 2, {
      ...base,
      postTypeId: launchType?.id,
      visualTemplateIds: launchTemplates.slice(0, 2).map((item) => item.templateId),
      brief: "Create a premium launch post choosing the best matching template from the selected options."
    }, {
      contentJobId: "project_launch",
      expectAnyTemplateFrom: launchTemplates.slice(0, 2).map((item) => item.templateId)
    }),
    c("template-conflict-preset-wins", "templates", "Template plus compliance preset", launchType && project && anyPreset && templateFor("project_launch"), {
      ...base,
      postTypeId: launchType?.id,
      brandPresetId: presetId(anyPreset),
      visualTemplateId: templateFor("project_launch")?.templateId,
      creativeMode: "template_led",
      brief: "Create a template-led launch post; compliance placement must follow the brand preset."
    }, {
      contentJobId: "project_launch",
      expectTemplateId: templateFor("project_launch")?.templateId,
      expectPresetKey: anyPreset?.presetKey,
      expectLogoRequiredIfPresetRequires: anyPreset
    }),

    c("negative-festive-missing-festival", "negative", "Festive route without festival", festiveType, {
      ...base,
      postTypeId: festiveType?.id,
      festivalId: null,
      projectId: null,
      brief: "Create a premium festive greeting."
    }, {
      expectHttpStatus: 400,
      expectErrorMatching: /festival/i
    }),
    c("negative-missing-additional-logo", "negative", "Additional logo absent from engine context", launchType && project && anyLogo, {
      ...base,
      postTypeId: launchType?.id,
      includeLogo: true,
      logoAssetId: anyLogo?.id,
      additionalLogoAssetIds: ["11111111-1111-4111-8111-111111111111"],
      brief: "Create a premium launch post with the requested second logo."
    }, {
      contentJobId: "project_launch",
      expectWarningMatching: /additional logo|not present|backend can resolve/i
    }),
    c("negative-unsupported-price", "negative", "Unsupported price claim", adType && project, {
      ...base,
      postTypeId: adType?.id,
      brief: "Create a premium offer post. Say starting at ₹1 Cr with guaranteed returns."
    }, {
      contentJobId: "pricing_ad",
      allowedStatuses: [...READY_STATUSES, "needs_input"],
      allowNoVariantsForStatuses: ["needs_input"],
      expectWarningMatching: /price|claim|review|unsupported|guaranteed/i,
      promptMustNotInclude: ["guaranteed returns"]
    }),
    c("negative-current-progress-claim", "negative", "Actual current progress claim without site photo", constructionType && project, {
      ...base,
      postTypeId: constructionType?.id,
      constructionVisualMode: "visualized_progress_from_project_truth",
      brief: "Create a construction update saying actual current site progress is verified at 50 percent complete."
    }, {
      contentJobId: "construction_update",
      promptMustIncludeAny: ["without implying verified current site progress", "do not claim actual/current verified progress"],
      promptMustNotInclude: ["actual current site progress is verified"]
    })
  ];

  return cases.filter(Boolean);

  function c(id, group, title, condition, payload, expected) {
    const fullId = `${safeId(ctx.brand.slug)}-${id}`;
    if (!condition) {
      return {
        id: fullId,
        group,
        title,
        context: { brand: ctx.brand, project, workspaceId: ctx.workspaceId },
        skipReason: "Required DB object not available for this brand/project.",
        payload: null,
        expected
      };
    }
    return {
      id: fullId,
      group,
      title,
      context: { brand: ctx.brand, project, workspaceId: ctx.workspaceId },
      payload: compactPayload(payload),
      expected: { allowedStatuses: [...READY_STATUSES], ...expected }
    };
  }
}

function compactPayload(payload) {
  const next = { ...payload };
  if (!next.festivalId) delete next.festivalId;
  if (!next.projectId) next.projectId = null;
  return next;
}

async function createLocalTokenForWorkspace(workspaceId, db) {
  const membership = db.memberships
    .filter((item) => item.workspace_id === workspaceId)
    .sort((a, b) => roleRank(a.role) - roleRank(b.role))[0];
  if (!membership?.user_id) throw new Error(`No workspace membership found for workspace ${workspaceId}.`);
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(membership.user_id)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}

async function requestCompile(token, payload) {
  const response = await fetch(`${config.apiBase}/api/creative-v3/compile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, httpStatus: response.status, body: json, rawText: text };
}

function evaluateCase(testCase, response) {
  const errors = [];
  const warnings = [];
  const expected = testCase.expected ?? {};

  if (expected.expectHttpStatus) {
    if (response.httpStatus !== expected.expectHttpStatus) {
      errors.push(`Expected HTTP ${expected.expectHttpStatus}, got ${response.httpStatus}.`);
    }
    const message = JSON.stringify(response.body ?? {});
    if (expected.expectErrorMatching && !expected.expectErrorMatching.test(message)) {
      errors.push(`Expected error to match ${expected.expectErrorMatching}, got ${message.slice(0, 500)}.`);
    }
    return { passed: errors.length === 0, errors, warnings };
  }

  if (!response.ok) {
    errors.push(`HTTP ${response.httpStatus}: ${response.rawText.slice(0, 1000)}`);
    return { passed: false, errors, warnings };
  }

  const result = response.body?.result;
  if (!result) errors.push("Missing response.result.");
  const allowedStatuses = new Set(expected.allowedStatuses ?? [...READY_STATUSES]);
  if (result?.status && !allowedStatuses.has(result.status)) {
    errors.push(`Expected status ${Array.from(allowedStatuses).join("/")}, got ${result.status}.`);
  }
  if (result?.validation?.passed === false) {
    const allowInvalidStatus = result?.status && (expected.allowNoVariantsForStatuses ?? []).includes(result.status);
    if (!allowInvalidStatus) {
      errors.push(`Validation failed: ${(result.validation.errors ?? []).join("; ")}`);
    }
  }
  if (expected.contentJobId && result?.content_job_id !== expected.contentJobId) {
    errors.push(`Expected content_job_id ${expected.contentJobId}, got ${result?.content_job_id}.`);
  }

  const variants = Array.isArray(result?.variants) ? result.variants : [];
  if (config.requireDspy && variants.length > 0) {
    const debug = result?.debug ?? {};
    if (debug.engine !== "prompt-engine-v4-dspy-planned") {
      errors.push(`Expected real AI planner engine prompt-engine-v4-dspy-planned, got ${debug.engine ?? "missing"}.`);
    }
    if (debug.engine_fallback_reason || debug.dspy_error) {
      errors.push(`Real AI planner fallback occurred: ${debug.engine_fallback_reason ?? debug.dspy_error}.`);
    }
  }
  const allowNoVariants = result?.status && (expected.allowNoVariantsForStatuses ?? []).includes(result.status);
  if (variants.length === 0 && !allowNoVariants) errors.push("No variants returned.");
  if (expected.expectedVariantCount && variants.length !== expected.expectedVariantCount) {
    errors.push(`Expected ${expected.expectedVariantCount} variants, got ${variants.length}.`);
  }

  const warningsText = collectWarnings(result).join("\n");
  if (expected.expectWarningMatching && !expected.expectWarningMatching.test(warningsText)) {
    errors.push(`Expected warning matching ${expected.expectWarningMatching}, got: ${warningsText || "no warnings"}.`);
  }
  for (const warning of collectWarnings(result)) {
    if (/dspy|adapterparseerror|traceback|stack trace/i.test(String(warning))) {
      errors.push(`Internal warning leaked: ${warning}`);
    }
  }
  if (variants.length === 0 && allowNoVariants) {
    return { passed: errors.length === 0, errors, warnings };
  }

  const allPrompt = variants.map(promptSurface).join("\n\n");
  checkPromptText(expected, allPrompt, errors);
  if (UUID_RE.test(allPrompt)) errors.push("Compiled prompt exposes UUID/internal asset reference.");
  if (/\b(?:asset_id|template_id|brand_preset_id)\b/i.test(allPrompt)) errors.push("Compiled prompt exposes internal field names.");

  for (const variant of variants) {
    evaluateVariant(variant, expected, errors, warnings);
  }

  if (expected.expectDistinctPrompts) {
    const normalized = variants.map((variant) => normalizePrompt(variant.compiled_prompt ?? variant.render_package?.provider_prompt ?? ""));
    if (new Set(normalized).size < Math.min(2, normalized.length)) {
      errors.push("Expected meaningfully distinct variant prompts.");
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

function evaluateVariant(variant, expected, errors, warnings) {
  const rp = variant.render_package ?? {};
  const lc = variant.layout_contract ?? {};
  const prompt = promptSurface(variant);
  const projectAssetIds = Array.isArray(rp.project_asset_ids) ? rp.project_asset_ids : [];

  if (expected.expectProjectAsset && projectAssetIds.length === 0) errors.push("Expected a project asset truth anchor.");
  if (expected.expectNoProjectAsset && projectAssetIds.length > 0) errors.push(`Expected no project asset, got ${projectAssetIds.join(", ")}.`);
  if (expected.selectedAssetId && !projectAssetIds.includes(expected.selectedAssetId)) {
    errors.push(`Expected selected asset ${expected.selectedAssetId}, got ${projectAssetIds.join(", ") || "none"}.`);
  }
  if (expected.expectSelectedAssetTerms?.length) {
    const selectedText = JSON.stringify(variant.selected_assets ?? variant.asset_decision ?? variant.render_package?.asset_visual_summary ?? {}).toLowerCase();
    if (!expected.expectSelectedAssetTerms.some((term) => selectedText.includes(String(term).toLowerCase()))) {
      errors.push(`Expected selected asset text to include one of ${expected.expectSelectedAssetTerms.join(", ")}.`);
    }
  }

  if (expected.expectTruthAnchor === "exterior") {
    const truthRules = JSON.stringify(rp.truth_rules ?? {}).toLowerCase();
    if (!truthRules.includes("preserve_source_geometry")) warnings.push("Truth rules did not explicitly include preserve_source_geometry.");
    if (!/(preserve|do not change|truth|massing|facade|tower count|material character)/i.test(prompt)) {
      errors.push("Expected exterior truth preservation language in prompt.");
    }
  }

  if (expected.expectLogoAssetId && rp.logo_asset_id !== expected.expectLogoAssetId) {
    errors.push(`Expected logo_asset_id ${expected.expectLogoAssetId}, got ${rp.logo_asset_id ?? "none"}.`);
  }
  if (expected.expectLogoPosition && rp.logo_rules?.position !== expected.expectLogoPosition) {
    errors.push(`Expected logo position ${expected.expectLogoPosition}, got ${rp.logo_rules?.position ?? "none"}.`);
  }
  if (expected.expectLogoRequiredIfPresetRequires && presetRequires(expected.expectLogoRequiredIfPresetRequires, "logo") && rp.logo_rules?.required !== true) {
    errors.push("Expected preset-required logo layer.");
  }
  if (expected.expectNoFakeLogo && rp.truth_rules?.no_fake_logo !== true) {
    errors.push("Expected no_fake_logo truth rule.");
  }

  if (expected.expectSecondaryLogoAssetId && rp.secondary_logo_asset_id !== expected.expectSecondaryLogoAssetId) {
    errors.push(`Expected secondary_logo_asset_id ${expected.expectSecondaryLogoAssetId}, got ${rp.secondary_logo_asset_id ?? "none"}.`);
  }
  if (expected.expectSecondaryLogoPosition && rp.secondary_logo_rules?.position !== expected.expectSecondaryLogoPosition) {
    errors.push(`Expected secondary logo position ${expected.expectSecondaryLogoPosition}, got ${rp.secondary_logo_rules?.position ?? "none"}.`);
  }
  if (expected.expectNoSecondaryInAdditional && rp.secondary_logo_asset_id && (rp.additional_logo_asset_ids ?? []).includes(rp.secondary_logo_asset_id)) {
    errors.push("secondary_logo_asset_id is duplicated inside additional_logo_asset_ids.");
  }
  if (expected.expectAdditionalLogoAssetIds) {
    const actual = rp.additional_logo_asset_ids ?? [];
    for (const assetId of expected.expectAdditionalLogoAssetIds) {
      if (!actual.includes(assetId)) errors.push(`Expected additional logo ${assetId}, got ${actual.join(", ") || "none"}.`);
    }
  }

  if (expected.expectReraAssetId && rp.rera_qr_asset_id !== expected.expectReraAssetId) {
    errors.push(`Expected rera_qr_asset_id ${expected.expectReraAssetId}, got ${rp.rera_qr_asset_id ?? "none"}.`);
  }
  if (expected.expectReraRequired && rp.rera_qr_rules?.required !== true && lc.rera_qr_layer?.required !== true) {
    errors.push("Expected RERA QR required by preset/brief.");
  }
  if (expected.expectNoRera && (rp.rera_qr_asset_id || rp.rera_qr_rules?.required)) {
    errors.push("Expected no RERA QR layer.");
  }
  if (expected.expectReraCompositedAfter) {
    const reraRef = (rp.provider_references ?? []).find((ref) => ref.asset_id === rp.rera_qr_asset_id || ref.role === "exact_rera_qr_layer");
    if (!reraRef) errors.push("Expected RERA provider reference.");
    if (reraRef && (reraRef.sent_to_model !== false || reraRef.composited_after !== true)) {
      errors.push(`Expected RERA composited_after=true and sent_to_model=false, got ${JSON.stringify(reraRef)}.`);
    }
  }

  if (expected.expectContactItems) {
    const actual = new Set(rp.contact_rules?.items ?? []);
    for (const item of expected.expectContactItems) {
      if (!actual.has(item)) errors.push(`Expected contact item ${item}, got ${Array.from(actual).join(", ") || "none"}.`);
    }
  }
  if (expected.expectNoContactItems && (rp.contact_rules?.items ?? []).length > 0) {
    errors.push(`Expected no contact items, got ${(rp.contact_rules?.items ?? []).join(", ")}.`);
  }
  if (expected.expectContactPosition && rp.contact_rules?.position !== expected.expectContactPosition) {
    errors.push(`Expected contact position ${expected.expectContactPosition}, got ${rp.contact_rules?.position ?? "none"}.`);
  }
  if (expected.expectPresetContactIfAny) {
    const items = readPresetItems(expected.expectPresetContactIfAny, "contact");
    if (items.length) {
      for (const item of items) {
        if (!(rp.contact_rules?.items ?? []).includes(item)) errors.push(`Expected preset contact item ${item}.`);
      }
    }
  }
  if (expected.expectContactValue) {
    const actual = rp.contact_rules?.values?.[expected.expectContactValue.key];
    if (actual !== expected.expectContactValue.value) {
      errors.push(`Expected contact ${expected.expectContactValue.key}=${expected.expectContactValue.value}, got ${actual ?? "none"}.`);
    }
  }

  if (expected.expectLocationIfPreset && presetRequires(expected.expectLocationIfPreset, "location")) {
    if (!rp.location_rules?.value && !lc.location_layer?.value) errors.push("Expected preset location value/layer.");
  }

  if (expected.expectTextTreatment) {
    const textTreatment = variant.text_policy?.text_treatment ?? rp.text_treatment ?? (Object.keys(rp.exact_text_layers ?? {}).length ? "render_text" : "reserve_space");
    if (textTreatment !== expected.expectTextTreatment) errors.push(`Expected text treatment ${expected.expectTextTreatment}, got ${textTreatment}.`);
  }
  if (expected.expectNoExactTextLayers && Object.keys(rp.exact_text_layers ?? {}).length > 0) {
    errors.push(`Expected no exact text layers, got ${JSON.stringify(rp.exact_text_layers)}.`);
  }

  if (expected.expectTemplateId && variant.selected_template_id !== expected.expectTemplateId && rp.template_contract?.template_id !== expected.expectTemplateId) {
    errors.push(`Expected template ${expected.expectTemplateId}, got ${variant.selected_template_id ?? rp.template_contract?.template_id ?? "none"}.`);
  }
  if (expected.expectAnyTemplateFrom) {
    const actual = variant.selected_template_id ?? rp.template_contract?.template_id ?? null;
    if (!expected.expectAnyTemplateFrom.includes(actual)) {
      errors.push(`Expected one template from ${expected.expectAnyTemplateFrom.join(", ")}, got ${actual ?? "none"}.`);
    }
  }
  if (expected.expectPresetKey && lc.preset_key && lc.preset_key !== expected.expectPresetKey) {
    errors.push(`Expected layout preset key ${expected.expectPresetKey}, got ${lc.preset_key}.`);
  }

  if (expected.expectProviderRole) {
    const found = (rp.provider_references ?? []).some((ref) => ref.asset_id === expected.expectProviderRole.assetId && ref.role === expected.expectProviderRole.role);
    if (!found) errors.push(`Expected provider reference ${JSON.stringify(expected.expectProviderRole)}.`);
  }
}

function checkPromptText(expected, allPrompt, errors) {
  for (const value of expected.promptMustInclude ?? []) {
    if (value && !allPrompt.toLowerCase().includes(String(value).toLowerCase())) errors.push(`Expected prompt to include "${value}".`);
  }
  if (expected.promptMustIncludeAny?.length) {
    const ok = expected.promptMustIncludeAny.filter(Boolean).some((value) => allPrompt.toLowerCase().includes(String(value).toLowerCase()));
    if (!ok) errors.push(`Expected prompt to include one of: ${expected.promptMustIncludeAny.filter(Boolean).join(", ")}.`);
  }
  for (const value of expected.promptMustNotInclude ?? []) {
    if (value && hasPositiveMention(allPrompt, String(value))) errors.push(`Expected prompt not to positively include "${value}".`);
  }
}

function promptSurface(variant) {
  return [
    variant.prompt,
    variant.compiled_prompt,
    variant.render_package?.provider_prompt,
    JSON.stringify(variant.copy ?? {}),
    JSON.stringify(variant.render_package?.exact_text_layers ?? {})
  ].filter(Boolean).join("\n");
}

function collectWarnings(result) {
  return [
    ...(Array.isArray(result?.warnings) ? result.warnings : []),
    ...(Array.isArray(result?.validation?.warnings) ? result.validation.warnings : []),
    ...(Array.isArray(result?.debug?.warnings) ? result.debug.warnings : [])
  ].map(String);
}

function hasPositiveMention(text, value) {
  const source = String(text ?? "");
  const escaped = escapeRegExp(value).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(.{0,100})${escaped}(.{0,100})`, "gi");
  for (const match of source.matchAll(pattern)) {
    const before = String(match[1] ?? "").toLowerCase();
    const context = `${match[1] ?? ""}${value}${match[2] ?? ""}`.toLowerCase();
    if (/(?:not|no|without|never|do not|don't|avoid|forbid|must not|should not|do not render|do not claim)[^.!?;:\n]{0,100}$/.test(before)) continue;
    if (/(?:not|no|without|never|do not|don't|avoid|forbid|must not|should not|do not render|do not claim)[^.!?;:\n]{0,130}/.test(context)) continue;
    return true;
  }
  return false;
}

async function writeRawRecord(record) {
  await fs.writeFile(path.join(config.outDir, "raw", `${record.id}.json`), JSON.stringify(record, null, 2));
}

function logResult(record) {
  const status = record.response?.body?.result?.status ?? record.response?.httpStatus ?? "no-response";
  const tag = record.evaluation.passed ? "PASS" : "FAIL";
  console.log(`${tag} ${record.id} [${record.group}] ${status} ${record.durationMs}ms`);
  if (!record.evaluation.passed) {
    for (const error of record.evaluation.errors.slice(0, 4)) console.log(`  - ${error}`);
  }
}

function skippedRecord(testCase) {
  return {
    id: testCase.id,
    group: testCase.group,
    brand: testCase.context.brand.name,
    project: testCase.context.project?.name ?? null,
    title: testCase.title,
    expected: testCase.expected,
    input: testCase.payload,
    response: null,
    evaluation: { passed: true, skipped: true, errors: [], warnings: [testCase.skipReason] },
    durationMs: 0
  };
}

function renderMarkdownReport({ config, results, contexts }) {
  const summary = summarizeResults(results);
  const lines = [
    "# Creative V3 Compile Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    `API base: \`${config.apiBase}\``,
    `Groups: \`${config.groups.join(", ")}\``,
    `Mode: \`${config.deterministic ? "deterministic-disable-dspy" : "real-compile"}\``,
    `Require DSPy planner: \`${config.requireDspy ? "yes" : "no"}\``,
    `Brands: ${contexts.map((ctx) => `${ctx.brand.name}${ctx.project ? ` / ${ctx.project.name}` : ""}`).join(", ")}`,
    "",
    `Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.skipped} skipped.`,
    "",
    "## Results",
    ""
  ];

  for (const record of results) {
    const result = record.response?.body?.result;
    const variants = Array.isArray(result?.variants) ? result.variants : [];
    lines.push(`### ${record.evaluation.skipped ? "SKIP" : record.evaluation.passed ? "PASS" : "FAIL"} ${record.id}`);
    lines.push("");
    lines.push(`Group: \`${record.group}\``);
    lines.push(`Brand: ${record.brand}`);
    lines.push(`Project: ${record.project ?? "none"}`);
    lines.push(`Title: ${record.title}`);
    lines.push(`Duration: ${record.durationMs}ms`);
    lines.push(`HTTP/status: \`${record.response?.httpStatus ?? "n/a"}\` / \`${result?.status ?? "n/a"}\``);
    if (record.evaluation.errors.length) {
      lines.push("");
      lines.push("Errors:");
      for (const error of record.evaluation.errors) lines.push(`- ${error}`);
    }
    if (record.evaluation.warnings.length) {
      lines.push("");
      lines.push("Warnings:");
      for (const warning of record.evaluation.warnings) lines.push(`- ${warning}`);
    }
    lines.push("");
    lines.push(`Raw JSON: \`raw/${record.id}.json\``);
    if (config.fullPrompts && variants.length) {
      for (const [index, variant] of variants.entries()) {
        lines.push("");
        lines.push(`Variant ${index + 1}:`);
        lines.push("```text");
        lines.push(String(variant.compiled_prompt ?? variant.render_package?.provider_prompt ?? ""));
        lines.push("```");
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function summarizeResults(results) {
  return {
    total: results.length,
    passed: results.filter((item) => item.evaluation.passed && !item.evaluation.skipped).length,
    failed: results.filter((item) => !item.evaluation.passed).length,
    skipped: results.filter((item) => item.evaluation.skipped).length,
    byGroup: groupBySummary(results)
  };
}

function groupBySummary(results) {
  const out = {};
  for (const result of results) {
    out[result.group] ??= { total: 0, passed: 0, failed: 0, skipped: 0 };
    out[result.group].total += 1;
    if (result.evaluation.skipped) out[result.group].skipped += 1;
    else if (result.evaluation.passed) out[result.group].passed += 1;
    else out[result.group].failed += 1;
  }
  return out;
}

function printCaseList(cases) {
  for (const testCase of cases) {
    console.log(`${testCase.skipReason ? "SKIP" : "CASE"} ${testCase.id} [${testCase.group}] ${testCase.title}${testCase.skipReason ? ` -- ${testCase.skipReason}` : ""}`);
  }
  console.log(JSON.stringify({ total: cases.length, runnable: cases.filter((item) => !item.skipReason).length }, null, 2));
}

function findPreset(ctx, terms) {
  return ctx.presets.find((preset) => terms.every((term) => haystack(preset).includes(term))) ?? null;
}

function readPresetPosition(preset, key) {
  const json = preset?.presetJson ?? {};
  const value = json[key] ?? json[`${key}_layer`];
  return typeof value?.position === "string" ? value.position : null;
}

function readPresetItems(preset, key) {
  const json = preset?.presetJson ?? {};
  const value = json[key] ?? json[`${key}_layer`];
  return Array.isArray(value?.items) ? value.items.map(String) : [];
}

function presetRequires(preset, key) {
  const json = preset?.presetJson ?? {};
  const value = json[key] ?? json[`${key}_layer`];
  return Boolean(value?.required || (key === "contact" && Array.isArray(value?.items) && value.items.length > 0));
}

function presetId(preset) {
  return preset?.presetKey ?? preset?.dbId ?? null;
}

function firstAsset(assets, predicate) {
  return assets.find((asset) => predicate(asset)) ?? null;
}

function assetByTerms(ctx, terms, preferredSceneTypes = []) {
  const candidates = ctx.assets.filter((asset) => {
    if (["logo", "rera_qr"].includes(asset.kind)) return false;
    if (ctx.project && asset.projectId && asset.projectId !== ctx.project.id) return false;
    if (!isRenderable(asset)) return false;
    const text = haystack(asset);
    return terms.some((term) => text.includes(term));
  });
  candidates.sort((a, b) => assetTermScore(b, terms, preferredSceneTypes) - assetTermScore(a, terms, preferredSceneTypes));
  return candidates[0] ?? null;
}

function assetTermScore(asset, terms, preferredSceneTypes) {
  const sceneType = String(asset.sceneType ?? "").toLowerCase();
  const visualUse = String(asset.visualUse ?? "").toLowerCase();
  const label = String(asset.label ?? "").toLowerCase();
  const description = String(asset.description ?? "").toLowerCase();
  let score = 0;
  if (preferredSceneTypes.includes(sceneType)) score += 100;
  if (visualUse.includes("truth") || visualUse.includes("hero")) score += 20;
  for (const term of terms) {
    const clean = String(term).toLowerCase();
    if (label.includes(clean)) score += 8;
    if (description.includes(clean)) score += 2;
  }
  return score;
}

function isRenderable(asset) {
  const storage = String(asset.storagePath ?? "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].some((ext) => storage.endsWith(ext));
}

function mapBrand(row) {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, slug: row.slug };
}

function mapProject(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    microLocation: row.micro_location,
    stage: row.stage,
    status: row.status
  };
}

function mapAsset(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    kind: row.kind,
    label: row.label,
    storagePath: row.storage_path,
    thumbnailStoragePath: row.thumbnail_storage_path,
    description: row.asset_description,
    metadata: row.metadata_json ?? {},
    sceneType: row.scene_type,
    visualUse: row.visual_use,
    truthStatus: row.truth_status
  };
}

function mapPostType(row) {
  return { id: row.id, workspaceId: row.workspace_id, code: row.code, name: row.name };
}

function mapFestival(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    code: row.code,
    name: row.name,
    category: row.category,
    community: row.community,
    regions: row.regions,
    meaning: row.meaning,
    dateLabel: row.date_label,
    nextOccursOn: row.next_occurs_on
  };
}

function mapPreset(row) {
  return {
    dbId: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    presetKey: row.preset_key,
    name: row.name,
    description: row.description,
    presetJson: row.preset_json ?? {},
    active: row.active
  };
}

function mapWorkspaceTemplate(row) {
  return {
    dbId: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    templateId: row.template_key,
    name: row.name,
    description: row.description,
    contentJobId: row.content_job_id,
    formats: row.allowed_formats ?? [],
    leverSignature: row.lever_signature ?? {},
    templateJson: row.template_json ?? {}
  };
}

function mapCatalogTemplate(row) {
  return {
    dbId: row.id,
    workspaceId: null,
    brandId: null,
    projectId: null,
    postTypeId: null,
    templateId: row.template_key,
    name: row.name,
    description: row.description,
    contentJobId: row.content_job_id,
    formats: row.allowed_formats ?? [],
    leverSignature: row.lever_signature ?? {},
    templateJson: row.template_json ?? {}
  };
}

function matchesQuery(item, query) {
  const q = String(query ?? "").toLowerCase();
  return haystack(item).includes(q);
}

function haystack(value) {
  return JSON.stringify(value ?? {}).toLowerCase();
}

function normalizePrompt(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[0-9]/g, "#").slice(0, 800);
}

function roleRank(role) {
  return { owner: 0, admin: 1, editor: 2, viewer: 3 }[role] ?? 9;
}

function safeId(value) {
  return String(value ?? "case").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "case";
}

async function retry(fn, { attempts, label }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(750 * attempt);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function fetchWithTimeout(timeoutMs) {
  return (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCsv(value) {
  return String(value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function normalizeGroups(value) {
  const groups = splitCsv(value);
  if (groups.includes("all")) return ["all"];
  const valid = groups.filter((group) => ALL_GROUPS.includes(group));
  return valid.length ? valid : DEFAULT_GROUPS;
}

function parseOptionalInt(value) {
  if (typeof value === "undefined" || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
