import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const targetMatchers = [
  { key: "krisala", test: (name) => /krisala/i.test(name) },
  { key: "pride", test: (name) => /pride/i.test(name) },
  { key: "sankla", test: (name) => /sankla|sankala/i.test(name) },
];

const brandFields = [
  ["identity.positioning", (profile) => profile?.identity?.positioning],
  ["identity.promise", (profile) => profile?.identity?.promise],
  ["identity.audienceSummary", (profile) => profile?.identity?.audienceSummary],
  ["voice.summary", (profile) => profile?.voice?.summary],
  ["voice.adjectives", (profile) => profile?.voice?.adjectives],
  ["palette.primary", (profile) => profile?.palette?.primary],
  ["palette.secondary", (profile) => profile?.palette?.secondary],
  ["palette.accent", (profile) => profile?.palette?.accent],
  ["styleDescriptors", (profile) => profile?.styleDescriptors],
  ["visualSystem.typographyMood", (profile) => profile?.visualSystem?.typographyMood],
  ["visualSystem.compositionPrinciples", (profile) => profile?.visualSystem?.compositionPrinciples],
  ["visualSystem.imageTreatment", (profile) => profile?.visualSystem?.imageTreatment],
  ["doRules", (profile) => profile?.doRules],
  ["dontRules", (profile) => profile?.dontRules],
  ["compliance.reviewChecks", (profile) => profile?.compliance?.reviewChecks],
];

const projectFields = [
  ["tagline", (profile) => profile?.tagline],
  ["positioning", (profile) => profile?.positioning],
  ["lifestyleAngle", (profile) => profile?.lifestyleAngle],
  ["configurations", (profile) => profile?.configurations],
  ["sizeRanges", (profile) => profile?.sizeRanges],
  ["pricingBand", (profile) => profile?.pricingBand],
  ["startingPrice", (profile) => profile?.startingPrice],
  ["priceRangeByConfig", (profile) => profile?.priceRangeByConfig],
  ["currentOffers", (profile) => profile?.currentOffers],
  ["paymentPlanSummary", (profile) => profile?.paymentPlanSummary],
  ["amenities", (profile) => profile?.amenities],
  ["heroAmenities", (profile) => profile?.heroAmenities],
  ["locationAdvantages", (profile) => profile?.locationAdvantages],
  ["nearbyLandmarks", (profile) => profile?.nearbyLandmarks],
  ["travelTimes", (profile) => profile?.travelTimes],
  ["constructionStatus", (profile) => profile?.constructionStatus],
  ["latestUpdate", (profile) => profile?.latestUpdate],
  ["approvedClaims", (profile) => profile?.approvedClaims],
  ["credibilityFacts", (profile) => profile?.credibilityFacts],
  ["reraNumber", (profile) => profile?.reraNumber],
  ["actualProjectImageIds", (profile) => profile?.actualProjectImageIds],
];

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function missingFields(profile, fields) {
  return fields.filter(([, getter]) => !hasValue(getter(profile))).map(([label]) => label);
}

function assetSummary(assets) {
  const byKind = new Map();
  for (const asset of assets) {
    byKind.set(asset.kind, (byKind.get(asset.kind) ?? 0) + 1);
  }
  return Object.fromEntries([...byKind.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const [{ data: brands, error: brandsError }, { data: projects, error: projectsError }, { data: assets, error: assetsError }, { data: reraRegs, error: reraError }] =
    await Promise.all([
      supabase.from("brands").select("id, workspace_id, name, slug, description, current_profile_version_id"),
      supabase.from("projects").select("id, workspace_id, brand_id, name, slug, city, micro_location, stage, status, current_profile_version_id"),
      supabase.from("brand_assets").select("id, brand_id, project_id, kind, label, metadata_json"),
      supabase.from("project_rera_registrations").select("id, brand_id, project_id, registration_number, label, is_default"),
    ]);

  if (brandsError) throw brandsError;
  if (projectsError) throw projectsError;
  if (assetsError) throw assetsError;
  if (reraError) throw reraError;

  const brandProfileIds = [...new Set((brands ?? []).map((brand) => brand.current_profile_version_id).filter(Boolean))];
  const projectProfileIds = [...new Set((projects ?? []).map((project) => project.current_profile_version_id).filter(Boolean))];

  const [{ data: brandProfiles, error: brandProfilesError }, { data: projectProfiles, error: projectProfilesError }] = await Promise.all([
    brandProfileIds.length
      ? supabase.from("brand_profile_versions").select("id, brand_id, version_number, profile_json").in("id", brandProfileIds)
      : Promise.resolve({ data: [], error: null }),
    projectProfileIds.length
      ? supabase.from("project_profile_versions").select("id, project_id, version_number, profile_json").in("id", projectProfileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (brandProfilesError) throw brandProfilesError;
  if (projectProfilesError) throw projectProfilesError;

  const brandProfileById = new Map((brandProfiles ?? []).map((row) => [row.id, row]));
  const projectProfileById = new Map((projectProfiles ?? []).map((row) => [row.id, row]));

  const result = [];
  for (const matcher of targetMatchers) {
    const matchedBrands = (brands ?? []).filter((brand) => matcher.test(brand.name));
    result.push({
      target: matcher.key,
      brands: matchedBrands.map((brand) => {
        const brandProfile = brandProfileById.get(brand.current_profile_version_id)?.profile_json ?? null;
        const brandAssets = (assets ?? []).filter((asset) => asset.brand_id === brand.id);
        const brandProjects = (projects ?? []).filter((project) => project.brand_id === brand.id);
        return {
          brand: {
            id: brand.id,
            name: brand.name,
            slug: brand.slug,
            description: brand.description,
          },
          brandProfileMissing: missingFields(brandProfile, brandFields),
          brandAssetCounts: assetSummary(brandAssets),
          projects: brandProjects.map((project) => {
            const projectProfile = projectProfileById.get(project.current_profile_version_id)?.profile_json ?? null;
            const projectAssets = brandAssets.filter((asset) => asset.project_id === project.id);
            const regs = (reraRegs ?? []).filter((row) => row.project_id === project.id);
            return {
              project: {
                id: project.id,
                name: project.name,
                slug: project.slug,
                city: project.city,
                microLocation: project.micro_location,
                stage: project.stage,
                status: project.status,
              },
              projectProfileMissing: missingFields(projectProfile, projectFields),
              projectAssetCounts: assetSummary(projectAssets),
              rera: regs.map((row) => ({
                label: row.label,
                registrationNumber: row.registration_number,
                isDefault: row.is_default,
              })),
            };
          }),
        };
      }),
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
