import fs from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";

const args = parseArgs(process.argv.slice(2));
const payloadPath = args.values.payload ? path.resolve(process.cwd(), args.values.payload) : null;
const fullTrace = args.flags.has("full-trace");
const falDryRun = args.flags.has("fal-dry-run");
const variationIndex = parsePositiveInt(args.values.variationIndex, 1) - 1;
const localWebEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/web/.env.local"));
const localApiEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/api/.env"));
const useAsyncCompile =
  args.flags.has("use-async") ||
  (!args.flags.has("use-sync") && localWebEnv.NEXT_PUBLIC_USE_ASYNC_COMPILE === "true");

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
  const compiled = useAsyncCompile
    ? await compileV2Async(payload, token, config.apiBase)
    : await request("/api/creative/compile-v2", token, payload, config.apiBase);

  console.log("INPUT_BRIEF");
  console.log(JSON.stringify(payload, null, 2));
  console.log("\nPROMPT_SUMMARY");
  console.log(compiled.promptSummary);
  console.log("\nFINAL_PROMPT");
  console.log(compiled.finalPrompt);
  console.log("\nVARIATIONS");
  const variations = Array.isArray(compiled.variations) ? compiled.variations : [];
  for (const variation of variations) {
    console.log(`\n[${variation.id}] ${variation.title}`);
    console.log(`Strategy: ${variation.strategy}`);
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

  if (fullTrace) {
    console.log("\nTRACE_DETAIL");
    console.log(
      JSON.stringify(
        {
          loadedSkillNames: compiled.compilerTrace?.loadedSkillNames ?? [],
          runtimeEvents: compiled.compilerTrace?.runtimeEvents ?? null,
          toolCalls: Array.isArray(compiled.compilerTrace?.toolCalls) ? compiled.compilerTrace.toolCalls : [],
          skillToolCalls: Array.isArray(compiled.compilerTrace?.skillToolCalls) ? compiled.compilerTrace.skillToolCalls : []
        },
        null,
        2
      )
    );
  }

  if (falDryRun) {
    const dryRun = await buildFalDryRun({
      compiled,
      brief: payload,
      token,
      apiBase: config.apiBase,
      variationIndex,
      falFinalModel:
        args.values.falFinalModel ?? process.env.FAL_FINAL_MODEL ?? localApiEnv.FAL_FINAL_MODEL ?? "fal-ai/nano-banana/edit",
      falStyleSeedModel:
        args.values.falStyleSeedModel ?? process.env.FAL_STYLE_SEED_MODEL ?? localApiEnv.FAL_STYLE_SEED_MODEL ?? "fal-ai/nano-banana",
      falWebhookUrl: args.values.falWebhookUrl ?? process.env.FAL_WEBHOOK_URL ?? localApiEnv.FAL_WEBHOOK_URL ?? ""
    });
    console.log("\nFAL_DRY_RUN");
    console.log(JSON.stringify(dryRun, null, 2));
  }
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

async function requestGet(route, token, apiBase) {
  const url = `${apiBase}${route}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function compileV2Async(payload, token, apiBase) {
  const created = await request("/api/creative/compile-v2-async", token, payload, apiBase);
  if (!created || typeof created.jobId !== "string" || created.jobId.length === 0) {
    throw new Error("compile-v2-async did not return a jobId");
  }

  const pollIntervalMs = 2000;
  const maxAttempts = 120;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await delay(pollIntervalMs);
    const status = await requestGet(`/api/creative/compile-v2-async/${created.jobId}`, token, apiBase);
    if (status?.status === "completed" && status.result) {
      return status.result;
    }

    if (status?.status === "failed") {
      const message =
        status?.error && typeof status.error === "object" && typeof status.error.message === "string"
          ? status.error.message
          : "Async compile failed";
      throw new Error(message);
    }
  }

  throw new Error("Async compile timed out while polling /api/creative/compile-v2-async");
}

async function buildFalDryRun({
  compiled,
  brief,
  token,
  apiBase,
  variationIndex,
  falFinalModel,
  falStyleSeedModel,
  falWebhookUrl
}) {
  const assetList = await requestGet(`/api/brands/${compiled.brandId}/assets`, token, apiBase);
  const assets = Array.isArray(assetList) ? assetList : [];
  const supportingReferenceAssetIds = Array.isArray(compiled.referenceAssetIds)
    ? compiled.referenceAssetIds
    : Array.isArray(brief.referenceAssetIds)
      ? brief.referenceAssetIds
      : [];
  const orderedReferenceAssets = sortAssetsByIdOrder(
    assets.filter((asset) => supportingReferenceAssetIds.includes(asset.id)),
    supportingReferenceAssetIds
  );

  const resolvedConstraints = asRecord(compiled.resolvedConstraints);
  const postTypeGuidance = asRecord(resolvedConstraints.postTypeGuidance);
  const postTypeCode =
    asOptionalString(postTypeGuidance.code) ??
    asOptionalString(compiled.compilerTrace?.postTypeCode) ??
    "default";
  const usesProjectImage = postTypeGuidance.usesProjectImage === true;
  const amenityFocus = asOptionalString(postTypeGuidance.amenityFocus);
  const amenityImageAssetIds = asStringArray(resolvedConstraints.amenityImageAssetIds);
  const projectImageAssetIds = asStringArray(resolvedConstraints.projectImageAssetIds);

  const amenityAnchorAsset =
    postTypeCode === "amenity-spotlight"
      ? resolveAmenityAnchorAsset(orderedReferenceAssets, amenityImageAssetIds, amenityFocus)
      : null;
  const projectAnchorAsset =
    usesProjectImage && projectImageAssetIds.length > 0
      ? resolveProjectAnchorAsset(assets, projectImageAssetIds, supportingReferenceAssetIds)
      : null;
  const secondaryReferenceAssets = orderedReferenceAssets
    .filter((asset) => asset.id !== amenityAnchorAsset?.id && asset.id !== projectAnchorAsset?.id)
    .slice(0, 2);
  const brandLogoAsset = findAssetById(assets, asOptionalString(resolvedConstraints.brandLogoAssetId));
  const complianceQrAsset = findAssetById(assets, asOptionalString(resolvedConstraints.reraQrAssetId));

  const referencePlan = {
    primaryAnchor: null,
    sourcePost: null,
    amenityAnchor: amenityAnchorAsset
      ? {
          role: "amenity_image",
          label: amenityAnchorAsset.label,
          storagePath: amenityAnchorAsset.storagePath,
          amenityName: inferAmenityNameFromAsset(amenityAnchorAsset, amenityFocus)
        }
      : null,
    projectAnchor: projectAnchorAsset
      ? {
          role: "project_image",
          label: projectAnchorAsset.label,
          storagePath: projectAnchorAsset.storagePath
        }
      : null,
    brandLogo: brandLogoAsset
      ? {
          role: "brand_logo",
          label: brandLogoAsset.label,
          storagePath: brandLogoAsset.storagePath
        }
      : null,
    complianceQr: complianceQrAsset
      ? {
          role: "rera_qr",
          label: complianceQrAsset.label,
          storagePath: complianceQrAsset.storagePath
        }
      : null,
    references: secondaryReferenceAssets.map((asset) => ({
      role: "reference",
      label: asset.label,
      storagePath: asset.storagePath
    }))
  };

  const variations = Array.isArray(compiled.variations) && compiled.variations.length > 0
    ? compiled.variations
    : [
        {
          id: "variation_1",
          title: "Primary route",
          strategy: "Primary route",
          finalPrompt: compiled.finalPrompt
        }
      ];
  const safeVariationIndex =
    Number.isInteger(variationIndex) && variationIndex >= 0 && variationIndex < variations.length ? variationIndex : 0;
  const selectedVariation = variations[safeVariationIndex];
  const allPayloads = variations.map((variation) => {
    const basePrompt = asOptionalString(variation.finalPrompt) ?? compiled.finalPrompt;
    const preUploadReferenceStoragePaths = filterReferenceStoragePathsForPrompt(referencePlan, basePrompt, postTypeCode);
    const finalGenerationPrompt =
      preUploadReferenceStoragePaths.length > 0
        ? buildV2RoleAwarePrompt(basePrompt, referencePlan, "final", postTypeCode)
        : basePrompt;
    const model = preUploadReferenceStoragePaths.length > 0 ? falFinalModel : falStyleSeedModel;
    const input = {
      prompt: finalGenerationPrompt,
      num_images: 1,
      aspect_ratio: compiled.aspectRatio
    };

    if (preUploadReferenceStoragePaths.length > 0) {
      input.image_urls = preUploadReferenceStoragePaths.map((storagePath) => `UPLOAD_REQUIRED:${storagePath}`);
    }

    const options = {
      input
    };

    if (falWebhookUrl) {
      options.webhookUrl = `${falWebhookUrl}?jobId=dryrun-${variation.id}`;
    }

    return {
      variationId: variation.id,
      variationTitle: variation.title,
      variationStrategy: variation.strategy,
      postTypeCode,
      model,
      preUploadReferenceStoragePaths,
      finalGenerationPrompt,
      falQueueSubmit: {
        endpoint: model,
        options
      }
    };
  });

  return {
    selectedVariationId: selectedVariation?.id ?? null,
    selectedVariationTitle: selectedVariation?.title ?? null,
    selectedPayload: allPayloads[safeVariationIndex] ?? allPayloads[0] ?? null,
    allPayloads,
    note:
      "This is a dry-run payload. image_urls are placeholders and must be uploaded to Fal storage before real submit."
  };
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

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function sortAssetsByIdOrder(assets, orderedIds) {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...assets].sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));
}

function findAssetById(assets, id) {
  if (!id) return null;
  return assets.find((asset) => asset.id === id) ?? null;
}

function inferAmenityNameFromAsset(asset, amenityFocus) {
  const label = typeof asset.label === "string" ? asset.label : "";
  if (!amenityFocus) {
    return null;
  }
  return label.toLowerCase().includes(amenityFocus.toLowerCase()) ? amenityFocus : null;
}

function resolveAmenityAnchorAsset(orderedReferenceAssets, amenityImageAssetIds, amenityFocus) {
  const byId = orderedReferenceAssets.find((asset) => amenityImageAssetIds.includes(asset.id));
  if (byId) {
    return byId;
  }

  if (!amenityFocus) {
    return null;
  }

  const normalizedFocus = amenityFocus.toLowerCase();
  return (
    orderedReferenceAssets.find((asset) => {
      const label = typeof asset.label === "string" ? asset.label.toLowerCase() : "";
      return label.includes(normalizedFocus);
    }) ?? null
  );
}

function resolveProjectAnchorAsset(assets, projectImageAssetIds, supportingReferenceAssetIds) {
  const fromSupporting = sortAssetsByIdOrder(
    assets.filter((asset) => supportingReferenceAssetIds.includes(asset.id) && projectImageAssetIds.includes(asset.id)),
    supportingReferenceAssetIds
  )[0];
  if (fromSupporting) {
    return fromSupporting;
  }

  return assets.find((asset) => projectImageAssetIds.includes(asset.id)) ?? null;
}

function getAssetForPath(plan, storagePath) {
  if (plan.primaryAnchor?.storagePath === storagePath) return { role: plan.primaryAnchor.role, label: plan.primaryAnchor.label };
  if (plan.sourcePost?.storagePath === storagePath) return { role: plan.sourcePost.role, label: plan.sourcePost.label };
  if (plan.amenityAnchor?.storagePath === storagePath) return { role: "amenity_image", label: plan.amenityAnchor.label };
  if (plan.projectAnchor?.storagePath === storagePath) return { role: "project_image", label: plan.projectAnchor.label };
  if (plan.brandLogo?.storagePath === storagePath) return { role: "brand_logo", label: plan.brandLogo.label };
  if (plan.complianceQr?.storagePath === storagePath) return { role: "rera_qr", label: plan.complianceQr.label };
  const reference = plan.references.find((entry) => entry.storagePath === storagePath);
  if (reference) return { role: "reference", label: reference.label };
  return null;
}

function getHeroReferenceForPostType(plan, postTypeCode) {
  switch (postTypeCode) {
    case "amenity-spotlight":
      return plan.amenityAnchor?.storagePath ? [plan.amenityAnchor.storagePath] : [];
    case "construction-update":
    case "project-launch":
    case "sample-flat-showcase":
    case "site-visit-invite":
      return plan.projectAnchor?.storagePath ? [plan.projectAnchor.storagePath] : [];
    case "location-advantage":
      return [plan.projectAnchor?.storagePath, plan.primaryAnchor?.storagePath].filter((value) => typeof value === "string" && value.length > 0);
    case "testimonial":
      return [plan.primaryAnchor?.storagePath, plan.projectAnchor?.storagePath].filter((value) => typeof value === "string" && value.length > 0);
    case "festive-greeting":
      return plan.primaryAnchor?.storagePath ? [plan.primaryAnchor.storagePath] : [];
    default:
      return [plan.amenityAnchor?.storagePath, plan.projectAnchor?.storagePath, plan.primaryAnchor?.storagePath].filter((value) => typeof value === "string" && value.length > 0);
  }
}

function buildV2RoleAwarePrompt(basePrompt, plan, mode, postTypeCode = "default") {
  const roleLines = [];

  const heroRef = getHeroReferenceForPostType(plan, postTypeCode);
  const firstHeroRef = heroRef[0];
  const heroAsset = firstHeroRef ? getAssetForPath(plan, firstHeroRef) : null;

  if (heroAsset) {
    if (heroAsset.role === "amenity_image") {
      roleLines.push(
        "Use the amenity as the hero subject. Preserve its function, spatial cues, materiality, and lifestyle context. Do not switch to a different facility or amenity type."
      );
    } else if (heroAsset.role === "project_image") {
      roleLines.push(
        "Use the project building as the primary reference. Preserve its tower identity, facade rhythm, massing, proportions, and overall silhouette."
      );
    } else if (heroAsset.role === "template") {
      roleLines.push("Use the template for layout rhythm and safe-zone discipline.");
    } else if (heroAsset.role === "source_post") {
      roleLines.push("Preserve the source post's core subject and framing intent.");
    }
  }

  if (plan.primaryAnchor?.role === "template") {
    roleLines.push(
      `Use the template reference (${plan.primaryAnchor.label}) for layout rhythm, safe-zone planning, overlay discipline, spacing, and footer structure only. Do not copy its literal text, brand names, or placeholder content.`
    );
  } else if (plan.primaryAnchor?.role === "source_post") {
    roleLines.push(
      `Use the source-post reference (${plan.primaryAnchor.label}) only for framing intent and compositional structure. Do not copy its literal text or branding.`
    );
  }

  if (postTypeCode === "amenity-spotlight" && !plan.amenityAnchor && plan.projectAnchor) {
    roleLines.push(
      "No exact amenity reference image was supplied for the requested facility. Generate the amenity scene without using a mismatched amenity or building image as the hero reference."
    );
    roleLines.push(
      "Do not substitute a different amenity, facility, park, lawn, pool, plaza, or building facade from any reference image."
    );
  } else if (plan.projectAnchor && plan.amenityAnchor) {
    roleLines.push("Use the amenity reference for the hero subject and use the project reference only for brand-truth context.");
  } else if (plan.projectAnchor && !heroAsset) {
    roleLines.push(`Use the project building reference (${plan.projectAnchor.label}) for project identity and architectural context.`);
  }

  if (plan.brandLogo) {
    roleLines.push(
      `Use the brand logo (${plan.brandLogo.label}) as a small integrated footer/signature element. Match the exact lockup, shape, colors, and spacing. Blend it into a quiet designed logo zone with proper margin, scale, and tonal harmony so it feels built into the layout, never pasted on top.`
    );
  }

  if (plan.complianceQr) {
    roleLines.push(`Use the RERA QR (${plan.complianceQr.label}) as a small compliance element if needed.`);
  }

  if (plan.references.length > 0) {
    roleLines.push(
      "If an additional style or context reference is supplied, use it only for layout rhythm, overlay discipline, material language, atmosphere, or premium finishing detail. It must never override the hero subject."
    );
  }

  roleLines.push(
    mode === "seed"
      ? "One complete style direction only; no grid, collage, contact sheet, or multiple poster options."
      : "One finished design only; keep text minimal, clean, and legible."
  );

  if (plan.projectAnchor) {
    roleLines.push("Do not replace the supplied project with a different generic building.");
  }

  return `${basePrompt} ${roleLines.join(" ")}`.trim();
}

function filterReferenceStoragePathsForPrompt(plan, _prompt, postTypeCode) {
  const alwaysInclude = [plan.brandLogo?.storagePath, plan.complianceQr?.storagePath].filter(
    (value) => typeof value === "string" && value.length > 0
  );

  const heroReference = [];
  const secondaryReference = [];
  const pushSecondary = (value) => {
    if (!value || heroReference.includes(value) || secondaryReference.includes(value)) {
      return;
    }
    secondaryReference.push(value);
  };

  if (postTypeCode === "amenity-spotlight") {
    if (plan.amenityAnchor?.storagePath) {
      heroReference.push(plan.amenityAnchor.storagePath);
    }
    pushSecondary(plan.projectAnchor?.storagePath);
  } else if (postTypeCode === "construction-update" || postTypeCode === "project-launch") {
    if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "sample-flat-showcase" || postTypeCode === "site-visit-invite") {
    if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "location-advantage") {
    if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "testimonial") {
    if (plan.primaryAnchor?.storagePath) {
      heroReference.push(plan.primaryAnchor.storagePath);
    } else if (plan.projectAnchor?.storagePath) {
      heroReference.push(plan.projectAnchor.storagePath);
    }
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "festive-greeting") {
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else {
    if (plan.amenityAnchor?.storagePath) heroReference.push(plan.amenityAnchor.storagePath);
    if (plan.projectAnchor?.storagePath) heroReference.push(plan.projectAnchor.storagePath);
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  }

  return [...heroReference, ...secondaryReference.slice(0, 1), ...alwaysInclude];
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
