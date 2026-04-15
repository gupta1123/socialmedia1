import { config as loadEnv } from "dotenv";
import type { BrandAssetRecord, PromptPackage } from "@image-lab/contracts";

loadEnv({ path: "apps/api/.env" });

type RoleAwareReferencePlan = {
  primaryAnchor: { role: "template" | "source_post"; label: string; storagePath: string } | null;
  sourcePost: { role: "source_post"; label: string; storagePath: string } | null;
  amenityAnchor: { role: "amenity_image"; label: string; storagePath: string; amenityName: string | null } | null;
  projectAnchor: { role: "project_image"; label: string; storagePath: string } | null;
  brandLogo: { role: "brand_logo"; label: string; storagePath: string } | null;
  complianceQr: { role: "rera_qr"; label: string; storagePath: string } | null;
  references: Array<{ role: "reference"; label: string; storagePath: string }>;
};

const MAX_SUPPORTING_REFERENCE_IMAGES = 2;
let inferAmenityNameFromAssetPartsRef: typeof import("../src/lib/creative-reference-selection.js").inferAmenityNameFromAssetParts;
let isAmenityFocusedPostTypeRef: typeof import("../src/lib/creative-reference-selection.js").isAmenityFocusedPostType;
let isAmenityReferenceAssetRef: typeof import("../src/lib/creative-reference-selection.js").isAmenityReferenceAsset;

function sortAssetsByIdOrder(assets: BrandAssetRecord[], orderedIds: string[]) {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...assets].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function getPromptPackagePostTypeGuidance(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  return resolvedConstraints.postTypeGuidance && typeof resolvedConstraints.postTypeGuidance === "object"
    ? (resolvedConstraints.postTypeGuidance as Record<string, unknown>)
    : null;
}

function getPromptPackagePostTypeCode(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const postTypeGuidance = getPromptPackagePostTypeGuidance(promptPackage);
  return typeof postTypeGuidance?.code === "string" && postTypeGuidance.code.length > 0 ? postTypeGuidance.code : null;
}

function getPromptPackageAmenityFocus(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const postTypeGuidance = getPromptPackagePostTypeGuidance(promptPackage);
  return typeof postTypeGuidance?.amenityFocus === "string" && postTypeGuidance.amenityFocus.trim().length > 0
    ? postTypeGuidance.amenityFocus.trim()
    : null;
}

function getPromptPackageProjectImageAssetIds(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const value = resolvedConstraints.projectImageAssetIds;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function getPromptPackageAmenityImageAssetIds(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const value = resolvedConstraints.amenityImageAssetIds;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function getPromptPackageResolvedAssetId(
  promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined },
  key: "brandLogoAssetId" | "reraQrAssetId"
) {
  const resolvedConstraints =
    promptPackage.resolvedConstraints && typeof promptPackage.resolvedConstraints === "object"
      ? promptPackage.resolvedConstraints
      : {};
  const value = resolvedConstraints[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getPromptPackageUsesProjectImage(promptPackage: { resolvedConstraints?: Record<string, unknown> | null | undefined }) {
  const postTypeGuidance = getPromptPackagePostTypeGuidance(promptPackage);
  return postTypeGuidance?.usesProjectImage === true;
}

function scoreProjectAnchorAsset(asset: BrandAssetRecord) {
  const metadata = asset.metadataJson ?? {};
  let score = 0;
  const usageIntent = typeof metadata.usageIntent === "string" ? metadata.usageIntent.toLowerCase() : "";
  if (usageIntent === "truth_anchor") score += 200;
  const qualityTier = typeof metadata.qualityTier === "string" ? metadata.qualityTier.toLowerCase() : "";
  if (qualityTier === "hero") score += 40;
  const viewType = typeof metadata.viewType === "string" ? metadata.viewType.toLowerCase() : "";
  if (["wide", "facade", "aerial", "street", "site"].includes(viewType)) score += 20;
  if (["close_up", "detail"].includes(viewType)) score -= 15;
  const subjectType = typeof metadata.subjectType === "string" ? metadata.subjectType.toLowerCase() : "";
  if (["project_exterior", "construction_progress"].includes(subjectType)) score += 30;
  if (["amenity", "interior", "sample_flat", "lifestyle"].includes(subjectType)) score -= 20;
  const label = asset.label.toLowerCase();
  if (/(hero|facade|elevation|tower|front|wide|aerial)/.test(label)) score += 15;
  if (/(close|detail|interior|amenity|lobby)/.test(label)) score -= 10;
  if (/(construction|site)/.test(label)) score += 5;
  return score;
}

function resolveProjectAnchorAsset(
  brandAssets: BrandAssetRecord[],
  projectImageAssetIds: string[],
  supportingReferenceAssetIds: string[]
) {
  if (projectImageAssetIds.length === 0) return null;
  const rank = new Map(projectImageAssetIds.map((id, index) => [id, index]));
  const projectAssets = brandAssets.filter((asset) => projectImageAssetIds.includes(asset.id));
  if (projectAssets.length === 0) return null;
  const explicitProjectRefs = supportingReferenceAssetIds.filter((id) => projectImageAssetIds.includes(id));
  const explicitAssets = projectAssets.filter((asset) => explicitProjectRefs.includes(asset.id));
  const candidates = explicitAssets.length > 0 ? explicitAssets : projectAssets;
  return (
    candidates.reduce<{ asset: BrandAssetRecord; score: number } | null>((best, asset) => {
      const score = scoreProjectAnchorAsset(asset);
      if (!best || score > best.score) return { asset, score };
      if (score === best.score && (rank.get(asset.id) ?? 999) < (rank.get(best.asset.id) ?? 999)) return { asset, score };
      return best;
    }, null)?.asset ?? null
  );
}

function scoreAmenityAnchorAsset(asset: BrandAssetRecord, focusAmenity: string | null) {
  const metadata = asset.metadataJson ?? {};
  let score = 0;
  const subjectType = typeof metadata.subjectType === "string" ? metadata.subjectType.toLowerCase() : "";
  if (subjectType === "amenity") score += 200;
  const amenityName = inferAmenityNameFromAssetPartsRef(asset.label, metadata);
  if (amenityName) score += 80;
  const qualityTier = typeof metadata.qualityTier === "string" ? metadata.qualityTier.toLowerCase() : "";
  if (qualityTier === "hero") score += 40;
  const usageIntent = typeof metadata.usageIntent === "string" ? metadata.usageIntent.toLowerCase() : "";
  if (usageIntent === "truth_anchor") score += 20;
  const viewType = typeof metadata.viewType === "string" ? metadata.viewType.toLowerCase() : "";
  if (["interior", "wide", "street"].includes(viewType)) score += 10;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const haystack = `${asset.label} ${amenityName ?? ""} ${tags.join(" ")}`.toLowerCase();
  if (focusAmenity) {
    const normalizedFocus = focusAmenity.trim().toLowerCase();
    if (haystack.includes(normalizedFocus)) {
      score += 250;
    } else {
      const partialMatches = normalizedFocus
        .split(/[^a-z0-9]+/g)
        .filter((token) => token.length > 2 && haystack.includes(token)).length;
      score += partialMatches * 35;
    }
  }
  return score;
}

function resolveAmenityAnchorAsset(
  orderedReferenceAssets: BrandAssetRecord[],
  amenityAssetIds: string[],
  focusAmenity: string | null
) {
  if (orderedReferenceAssets.length === 0) return null;
  if (focusAmenity && amenityAssetIds.length === 0) return null;
  const rank = new Map(orderedReferenceAssets.map((asset, index) => [asset.id, index]));
  const candidates = amenityAssetIds.length > 0
    ? orderedReferenceAssets.filter((asset) => amenityAssetIds.includes(asset.id))
    : orderedReferenceAssets.filter((asset) => isAmenityReferenceAssetRef(asset));
  if (candidates.length === 0) return null;
  return (
    candidates.reduce<{ asset: BrandAssetRecord; score: number } | null>((best, asset) => {
      const score = scoreAmenityAnchorAsset(asset, focusAmenity);
      if (!best || score > best.score) return { asset, score };
      if (score === best.score && (rank.get(asset.id) ?? 999) < (rank.get(best.asset.id) ?? 999)) return { asset, score };
      return best;
    }, null)?.asset ?? null
  );
}

function resolvePromptPackageReferenceAssets(promptPackage: PromptPackage, brandAssets: BrandAssetRecord[], supportingReferenceAssetIds: string[]) {
  const orderedReferenceAssets = sortAssetsByIdOrder(
    brandAssets.filter((asset) => supportingReferenceAssetIds.includes(asset.id)),
    supportingReferenceAssetIds
  );
  const postTypeCode = getPromptPackagePostTypeCode(promptPackage);
  const amenityAssetIds = getPromptPackageAmenityImageAssetIds(promptPackage);
  const amenityFocus = getPromptPackageAmenityFocus(promptPackage);
  const amenityAnchorAsset =
    isAmenityFocusedPostTypeRef(postTypeCode)
      ? resolveAmenityAnchorAsset(orderedReferenceAssets, amenityAssetIds, amenityFocus)
      : null;
  const projectImageAssetIds = getPromptPackageProjectImageAssetIds(promptPackage);
  const usesProjectImage = getPromptPackageUsesProjectImage(promptPackage);
  const projectAnchorAsset =
    usesProjectImage && projectImageAssetIds.length > 0
      ? resolveProjectAnchorAsset(brandAssets, projectImageAssetIds, supportingReferenceAssetIds)
      : null;
  const secondaryReferenceAssets = orderedReferenceAssets
    .filter((asset) => asset.id !== amenityAnchorAsset?.id && asset.id !== projectAnchorAsset?.id)
    .slice(0, MAX_SUPPORTING_REFERENCE_IMAGES);
  const brandLogoAssetId = getPromptPackageResolvedAssetId(promptPackage, "brandLogoAssetId");
  const reraQrAssetId = getPromptPackageResolvedAssetId(promptPackage, "reraQrAssetId");

  return {
    amenityAnchorAsset,
    projectAnchorAsset,
    secondaryReferenceAssets,
    brandLogoAsset: brandLogoAssetId ? brandAssets.find((asset) => asset.id === brandLogoAssetId) ?? null : null,
    complianceQrAsset: reraQrAssetId ? brandAssets.find((asset) => asset.id === reraQrAssetId) ?? null : null,
  };
}

function buildV2RoleAwarePrompt(basePrompt: string, plan: RoleAwareReferencePlan, mode: "seed" | "final", postTypeCode?: string) {
  const roleLines: string[] = [];
  const heroRef = getHeroReferenceForPostType(plan, postTypeCode ?? "default");
  const firstHeroRef = heroRef[0];
  const heroAsset = firstHeroRef ? getAssetForPath(plan, firstHeroRef) : null;

  if (heroAsset) {
    if (heroAsset.role === "amenity_image") {
      roleLines.push("Use the amenity as the hero subject. Preserve its function, spatial cues, materiality, and lifestyle context. Do not switch to a different facility or amenity type.");
    } else if (heroAsset.role === "project_image") {
      roleLines.push("Use the project building as the primary reference. Preserve its tower identity, facade rhythm, massing, proportions, and overall silhouette.");
    }
  }

  if (postTypeCode === "amenity-spotlight" && !plan.amenityAnchor && plan.projectAnchor) {
    roleLines.push("No exact amenity reference image was supplied for the requested facility. Use the project reference only for project identity and brand-truth context.");
    roleLines.push("Do not substitute a different amenity, facility, park, lawn, pool, or plaza from any reference image.");
  } else if (plan.projectAnchor && plan.amenityAnchor) {
    roleLines.push("Use the amenity reference for the hero subject and use the project reference only for brand-truth context.");
  } else if (plan.projectAnchor && !heroAsset) {
    roleLines.push(`Use the project building reference (${plan.projectAnchor.label}) for project identity and architectural context.`);
  }

  if (plan.brandLogo) {
    roleLines.push(`Use the brand logo (${plan.brandLogo.label}) as a small footer signature element. Match the exact lockup, shape, colors, and spacing.`);
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

function getAssetForPath(plan: RoleAwareReferencePlan, storagePath: string): { role: string; label: string } | null {
  if (plan.primaryAnchor?.storagePath === storagePath) return { role: plan.primaryAnchor.role, label: plan.primaryAnchor.label };
  if (plan.sourcePost?.storagePath === storagePath) return { role: plan.sourcePost.role, label: plan.sourcePost.label };
  if (plan.amenityAnchor?.storagePath === storagePath) return { role: "amenity_image", label: plan.amenityAnchor.label };
  if (plan.projectAnchor?.storagePath === storagePath) return { role: "project_image", label: plan.projectAnchor.label };
  return null;
}

function filterReferenceStoragePathsForPrompt(plan: RoleAwareReferencePlan, _prompt: string, postTypeCode: string): string[] {
  const alwaysInclude = [plan.brandLogo?.storagePath, plan.complianceQr?.storagePath].filter((v): v is string => typeof v === "string" && v.length > 0);
  const heroReference: string[] = [];
  if (postTypeCode === "amenity-spotlight") {
    if (plan.amenityAnchor?.storagePath) heroReference.push(plan.amenityAnchor.storagePath);
    if (plan.projectAnchor?.storagePath) heroReference.push(plan.projectAnchor.storagePath);
  } else {
    if (plan.amenityAnchor?.storagePath) heroReference.push(plan.amenityAnchor.storagePath);
    if (plan.projectAnchor?.storagePath) heroReference.push(plan.projectAnchor.storagePath);
  }
  return [...heroReference, ...alwaysInclude];
}

function getHeroReferenceForPostType(plan: RoleAwareReferencePlan, postTypeCode: string): string[] {
  switch (postTypeCode) {
    case "amenity-spotlight":
      return plan.amenityAnchor?.storagePath ? [plan.amenityAnchor.storagePath] : [];
    default:
      return [
        plan.amenityAnchor?.storagePath,
        plan.projectAnchor?.storagePath,
      ].filter((value): value is string => typeof value === "string" && value.length > 0);
  }
}

async function main() {
  const [{ getPromptPackage, listBrandAssets }, { supabaseAdmin }, referenceSelection] = await Promise.all([
    import("../src/lib/repository.js"),
    import("../src/lib/supabase.js"),
    import("../src/lib/creative-reference-selection.js"),
  ]);
  inferAmenityNameFromAssetPartsRef = referenceSelection.inferAmenityNameFromAssetParts;
  isAmenityFocusedPostTypeRef = referenceSelection.isAmenityFocusedPostType;
  isAmenityReferenceAssetRef = referenceSelection.isAmenityReferenceAsset;

  const promptPackageId = process.argv[2];
  if (!promptPackageId) {
    throw new Error("Usage: tsx apps/api/scripts/inspect-fal-payload.ts <prompt-package-id>");
  }

  const promptPackage = await getPromptPackage(promptPackageId);
  const brandAssets = await listBrandAssets(promptPackage.brandId);
  const sourceBrief = promptPackage.compilerTrace?.sourceBrief as { referenceAssetIds?: string[] } | undefined;
  const supportingReferenceAssetIds = promptPackage.referenceAssetIds ?? sourceBrief?.referenceAssetIds ?? [];
  const { amenityAnchorAsset, projectAnchorAsset, secondaryReferenceAssets, brandLogoAsset, complianceQrAsset } =
    resolvePromptPackageReferenceAssets(promptPackage, brandAssets, supportingReferenceAssetIds);

  const referencePlan: RoleAwareReferencePlan = {
    primaryAnchor: null,
    sourcePost: null,
    amenityAnchor: amenityAnchorAsset
      ? {
          role: "amenity_image",
          label: amenityAnchorAsset.label,
          storagePath: amenityAnchorAsset.storagePath,
          amenityName: inferAmenityNameFromAssetPartsRef(amenityAnchorAsset.label, amenityAnchorAsset.metadataJson ?? {}) ?? null,
        }
      : null,
    projectAnchor: projectAnchorAsset
      ? {
          role: "project_image",
          label: projectAnchorAsset.label,
          storagePath: projectAnchorAsset.storagePath,
        }
      : null,
    brandLogo: brandLogoAsset
      ? {
          role: "brand_logo",
          label: brandLogoAsset.label,
          storagePath: brandLogoAsset.storagePath,
        }
      : null,
    complianceQr: complianceQrAsset
      ? {
          role: "rera_qr",
          label: complianceQrAsset.label,
          storagePath: complianceQrAsset.storagePath,
        }
      : null,
    references: secondaryReferenceAssets.map((asset) => ({
      role: "reference",
      label: asset.label,
      storagePath: asset.storagePath,
    })),
  };

  const postTypeCode = getPromptPackagePostTypeCode(promptPackage) ?? "default";
  const variations = promptPackage.variations.length > 0
    ? promptPackage.variations
    : [{ id: "variation_1", title: "Primary route", finalPrompt: promptPackage.finalPrompt }];

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from("creative_jobs")
    .select("id, request_payload, created_at, status")
    .eq("prompt_package_id", promptPackageId)
    .order("created_at", { ascending: true });

  if (jobsError) throw jobsError;

  const report = variations.map((variation) => {
    const roleAwarePrompt = buildV2RoleAwarePrompt(variation.finalPrompt, referencePlan, "final", postTypeCode);
    const filteredPaths = filterReferenceStoragePathsForPrompt(referencePlan, variation.finalPrompt, postTypeCode);
    const filteredAssets = filteredPaths.map((path) => {
      const asset = brandAssets.find((entry) => entry.storagePath === path);
      return {
        storagePath: path,
        label: asset?.label ?? null,
        assetId: asset?.id ?? null,
        amenityName: asset ? inferAmenityNameFromAssetPartsRef(asset.label, asset.metadataJson ?? {}) ?? null : null,
      };
    });
    const storedJob = (jobs ?? []).find((job) => (job.request_payload as Record<string, unknown> | null)?.variationId === variation.id);

    return {
      variationId: variation.id,
      variationTitle: variation.title,
      storedJobPrompt: (storedJob?.request_payload as Record<string, unknown> | null)?.prompt ?? null,
      computedRoleAwarePrompt: roleAwarePrompt,
      filteredReferenceAssets: filteredAssets,
      referencePlan: {
        amenityAnchor: referencePlan.amenityAnchor,
        projectAnchor: referencePlan.projectAnchor,
        brandLogo: referencePlan.brandLogo,
        supporting: referencePlan.references,
      },
    };
  });

  console.log(JSON.stringify({
    promptPackageId,
    postTypeCode,
    amenityFocus: getPromptPackageAmenityFocus(promptPackage),
    referenceAssetIds: promptPackage.referenceAssetIds,
    amenityImageAssetIds: getPromptPackageAmenityImageAssetIds(promptPackage),
    report,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
