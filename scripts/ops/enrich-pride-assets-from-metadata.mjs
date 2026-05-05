import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: "apps/api/.env" });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const APPLY = process.argv.includes("--apply");
const BRAND_MATCH = /pride/i;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tagsFrom(asset) {
  const tags = asset.metadata_json?.tags;
  return Array.isArray(tags) ? tags.map((tag) => String(tag).toLowerCase()) : [];
}

function inferRoom(asset) {
  const haystack = `${asset.label} ${tagsFrom(asset).join(" ")}`.toLowerCase();
  const checks = [
    ["living room", /living|scene [2-8]\b/],
    ["kitchen", /kitchen/],
    ["kids bedroom", /kids?|kid\b/],
    ["guest bedroom", /guest/],
    ["parents bedroom", /parents?/],
    ["master bedroom", /master/],
    ["media room", /media/],
    ["entrance foyer", /entrance|entance|entarnce/],
    ["temple room", /temple/],
    ["bathroom", /bath/],
  ];
  return checks.find(([, regex]) => regex.test(haystack))?.[0] || "sample flat interior";
}

function baseMetadata(asset, patch) {
  const metadata = asset.metadata_json && typeof asset.metadata_json === "object" ? asset.metadata_json : {};
  return {
    ...metadata,
    assetDescription: patch.asset_description,
    truthStatus: patch.truth_status,
    sceneType: patch.scene_type,
    visualUse: patch.visual_use,
    safeClaims: patch.safe_claims,
    doNotClaim: patch.do_not_claim,
    preserveIdentity: patch.scene_type === "project_exterior" || patch.kind === "logo",
    source: metadata.source || "pride-hosted-asset-enrichment",
  };
}

function patchForLogo(asset) {
  const isStacked = /stacked/i.test(asset.label);
  const logoKind = isStacked ? "stacked PWC project logo" : "linear PWC project logo";
  return {
    asset_description: `${titleCase(logoKind)} on a light background. Exact brand mark asset; preserve the symbol, wordmark, proportions, and lockup without stylizing or redrawing.`,
    truth_status: "logo",
    scene_type: "logo",
    visual_use: "brand_mark",
    safe_claims: ["official PWC brand mark", "preserve exact logo lockup"],
    do_not_claim: ["redrawn logo", "stylized alternate mark", "distorted logo"],
  };
}

function patchForRera(asset) {
  const number = asset.metadata_json?.reraNumber ? ` ${asset.metadata_json.reraNumber}` : "";
  return {
    asset_description: `Pride World City / Miami MahaRERA QR asset${number}. Exact compliance asset for deterministic placement; do not redraw or regenerate the QR code.`,
    truth_status: "qr",
    scene_type: "rera_qr",
    visual_use: "compliance_asset",
    safe_claims: ["official RERA QR reference", "use as exact compliance asset"],
    do_not_claim: ["generated QR code", "modified RERA number", "decorative QR"],
  };
}

function patchForExterior(asset) {
  const view = asset.metadata_json?.viewType || "facade";
  const quality = asset.metadata_json?.qualityTier || "usable";
  return {
    asset_description: `CGI architectural render of Miami at Pride World City showing the project exterior / ${titleCase(view)} view. ${quality === "hero" ? "Strong hero truth anchor for project launch, architecture, typology, and elevation-led creatives." : "Usable project exterior reference for architecture-led creatives."}`,
    truth_status: "render",
    scene_type: "project_exterior",
    visual_use: quality === "hero" ? "truth_anchor" : "support_anchor",
    safe_claims: ["architectural render of Miami at Pride World City", "project exterior representation", "preserve building identity and facade geometry"],
    do_not_claim: ["completed building photograph", "changed tower design", "invented skyline or surroundings", "facade logo/signage unless present in source"],
  };
}

function patchForAmenity(asset) {
  const amenity = compact(asset.metadata_json?.amenityName) || titleCase(tagsFrom(asset).filter((tag) => tag !== "amenity").join(" "));
  return {
    asset_description: `CGI amenity render for Miami at Pride World City showing ${amenity || "a lifestyle amenity space"}. Supporting truth reference for amenity-led social creatives.`,
    truth_status: "render",
    scene_type: "amenity",
    visual_use: "amenity_anchor",
    safe_claims: [`${amenity || "amenity"} render`, "amenity design representation", "Pride World City lifestyle amenity reference"],
    do_not_claim: ["completed amenity photograph", "guaranteed delivered furniture or equipment", "invented amenity not visible in source"],
  };
}

function patchForInterior(asset) {
  const room = inferRoom(asset);
  return {
    asset_description: `CGI sample flat interior render for Miami at Pride World City showing a ${room}. Supporting interior reference for lifestyle, home-tour, and typology creatives.`,
    truth_status: "render",
    scene_type: "interior",
    visual_use: "support_anchor",
    safe_claims: ["sample flat interior render", "interior design representation", `${room} reference`],
    do_not_claim: ["actual delivered apartment photograph", "guaranteed furniture or fittings", "invented carpet area or typology claim"],
  };
}

function patchForAsset(asset) {
  if (asset.kind === "logo") return patchForLogo(asset);
  if (asset.kind === "rera_qr") return patchForRera(asset);
  const subject = asset.metadata_json?.subjectType || asset.scene_type;
  if (subject === "project_exterior" || asset.scene_type === "project_exterior") return patchForExterior(asset);
  if (subject === "amenity" || asset.scene_type === "amenity") return patchForAmenity(asset);
  if (subject === "sample_flat" || asset.scene_type === "sample_flat" || tagsFrom(asset).includes("interior")) return patchForInterior(asset);
  return {
    asset_description: `Reference asset for Pride Group / Miami at Pride World City: ${asset.label}. Use only as supporting visual context unless explicitly selected.`,
    truth_status: "render",
    scene_type: asset.scene_type || "reference",
    visual_use: asset.visual_use || "supporting_ref",
    safe_claims: ["brand/project reference asset"],
    do_not_claim: ["unsupported factual claim", "invented project detail"],
  };
}

async function main() {
  const { data: brands, error: brandError } = await supabase
    .from("brands")
    .select("id,name,slug")
    .or("name.ilike.%pride%,slug.ilike.%pride%");
  if (brandError) throw brandError;

  const brand = (brands || []).find((row) => BRAND_MATCH.test(`${row.name} ${row.slug}`));
  if (!brand) throw new Error("Pride brand not found");

  const { data: assets, error: assetError } = await supabase
    .from("brand_assets")
    .select("id,kind,label,asset_description,truth_status,scene_type,visual_use,safe_claims,do_not_claim,metadata_json")
    .eq("brand_id", brand.id)
    .order("label");
  if (assetError) throw assetError;

  const patches = (assets || []).map((asset) => {
    const patch = patchForAsset(asset);
    return {
      id: asset.id,
      label: asset.label,
      patch: {
        ...patch,
        metadata_json: baseMetadata(asset, patch),
      },
    };
  });

  console.log(JSON.stringify({ brand, mode: APPLY ? "apply" : "dry-run", count: patches.length, sample: patches.slice(0, 8) }, null, 2));

  if (!APPLY) return;

  for (const item of patches) {
    const { error } = await supabase.from("brand_assets").update(item.patch).eq("id", item.id);
    if (error) throw new Error(`Failed to update ${item.label}: ${error.message}`);
  }

  console.log(`Updated ${patches.length} Pride assets.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
