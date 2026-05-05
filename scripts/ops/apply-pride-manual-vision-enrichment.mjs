import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: "apps/api/.env" });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const APPLY = process.argv.includes("--apply");
const MANIFEST_PATH = path.resolve(process.cwd(), "tmp/pride-vision-assets/manifest.json");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function inferInterior(asset) {
  const label = asset.label.toLowerCase();
  if (/kitchen/.test(label)) {
    return {
      room: "kitchen",
      subjects: ["white modular kitchen", "tall refrigerator", "linear cabinetry", "countertop", "sliding utility door"],
      style: ["bright", "minimal", "white and grey"],
      note: "Use for kitchen, sample-flat, utility, and practical home-interior creatives.",
    };
  }
  if (/kid|kids/.test(label)) {
    return {
      room: "bedroom",
      subjects: ["bed", "large window", "study / shelf zone", "soft wall panel", "cream curtains"],
      style: ["bright", "soft neutral", "family-oriented"],
      note: "Use for bedroom, family living, kids-room, and sample-flat interior creatives.",
    };
  }
  if (/guest bath|masterbed bathroom|parents bedroom bath|bath/.test(label)) {
    return {
      room: "bathroom",
      subjects: ["vanity counter", "WC", "shower area", "mirror", "warm tile finish"],
      style: ["clean", "compact", "premium neutral"],
      note: "Use for bathroom or finish-detail creatives; avoid using as a bedroom or living-room reference.",
    };
  }
  if (/guest|master|parents/.test(label)) {
    return {
      room: "bedroom",
      subjects: ["bed", "wardrobe wall", "TV panel", "curtains", "warm cove lighting"],
      style: ["warm neutral", "premium", "soft contemporary"],
      note: "Use for bedroom, sample-flat, comfort, and interior-finish creatives.",
    };
  }
  if (/entrance|entance|entarnce|13-19|13-20|13-21/.test(label)) {
    return {
      room: "entry foyer",
      subjects: ["entry console", "arched mirror", "wall art", "corridor", "dining glimpse"],
      style: ["minimal", "warm", "decorative accent"],
      note: "Use for arrival, foyer, interior-detail, and home-entry creatives.",
    };
  }
  if (/scene 10|temple/.test(label)) {
    return {
      room: "pooja / feature niche",
      subjects: ["arched niche", "decorative idol feature", "console cabinet", "wall sconces"],
      style: ["warm", "decorative", "premium"],
      note: "Use for cultural corner, pooja-space, and interior-detail creatives.",
    };
  }
  if (/scene 13|scene 14|scene 15|scene 16|media/.test(label)) {
    return {
      room: "media room",
      subjects: ["sofa", "illuminated wall panel", "TV / media wall", "coffee table", "warm ceiling lights"],
      style: ["warm", "cinematic", "modern lounge"],
      note: "Use for media-room, lounge, and premium interior lifestyle creatives.",
    };
  }
  if (/scene 1|scene 2|scene 3|scene 4|scene 5|scene 6|scene 7|scene 8|scene 9|jpeg/.test(label)) {
    return {
      room: "living room",
      subjects: ["sofa seating", "TV wall", "coffee table", "curtains", "warm ceiling cove lighting"],
      style: ["warm neutral", "contemporary", "premium lounge"],
      note: "Use for living-room, family lifestyle, and premium sample-flat creatives.",
    };
  }
  return {
    room: "sample-flat interior",
    subjects: ["interior room", "neutral finishes", "built-in furniture", "warm lighting"],
    style: ["contemporary", "neutral", "premium"],
    note: "Use as a supporting interior reference.",
  };
}

function manualPatch(asset) {
  const meta = asset.metadata_json || {};
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  let sceneType = asset.scene_type;
  let visualUse = asset.visual_use;
  let truthStatus = "render";
  let description = asset.asset_description;
  let visibleSubjects = [];
  let visualStyle = [];
  let safeClaims = [];
  let doNotClaim = [];
  let amenityName = meta.amenityName || null;
  let promptUsageNote = "";
  let selectionKeywords = [...tags];

  if (asset.kind === "logo") {
    truthStatus = "logo";
    sceneType = "logo";
    visualUse = "brand_mark";
    description = `${asset.label} is an exact PWC brand mark asset on a light background; preserve the symbol, wordmark, colors, proportions, and lockup without redrawing.`;
    visibleSubjects = ["PWC logo", "brand wordmark"];
    visualStyle = ["exact brand mark"];
    safeClaims = ["official PWC brand mark", "exact logo asset"];
    doNotClaim = ["redrawn logo", "distorted logo", "alternate brand mark"];
    promptUsageNote = "Use only as a deterministic logo layer, not as a generated visual element.";
  } else if (asset.kind === "rera_qr") {
    truthStatus = "qr";
    sceneType = "rera_qr";
    visualUse = "compliance_asset";
    description = `${asset.label} is the exact RERA QR compliance asset for Miami / Pride World City; use as a deterministic compliance layer and never redraw the QR.`;
    visibleSubjects = ["QR code", "RERA compliance reference"];
    visualStyle = ["compliance asset"];
    safeClaims = ["RERA QR asset", "exact compliance reference"];
    doNotClaim = ["generated QR", "modified RERA number", "decorative QR"];
    promptUsageNote = "Use as part of the compact RERA block only when compliance rules require it.";
  } else if (/Cam27_Cricket/i.test(asset.label)) {
    sceneType = "amenity";
    visualUse = "amenity_anchor";
    amenityName = "Cricket pitch / open play lawn";
    visibleSubjects = ["central cricket pitch", "open lawn", "tree-lined landscape", "seating canopy", "blue sky"];
    visualStyle = ["green", "open", "daylight", "family lifestyle"];
    description = "CGI amenity render of Miami at Pride World City showing a central cricket pitch / open play lawn within a landscaped garden, with tree cover and a white seating canopy.";
    safeClaims = ["cricket pitch render", "landscaped open play amenity", "Miami amenity design representation"];
    doNotClaim = ["completed amenity photograph", "professional sports facility", "invented amenity outside the visible play lawn"];
    promptUsageNote = "Use for sports amenity, family recreation, and open-lawn creatives; do not use as a tower facade anchor.";
    selectionKeywords = ["amenity", "cricket pitch", "open play lawn", "sports", "family recreation", "landscaped lawn", "seating canopy"];
  } else if (asset.scene_type === "project_exterior") {
    const dusk = /Cam05/i.test(asset.label);
    const close = /Cam06/i.test(asset.label);
    const hillside = /Cam017/i.test(asset.label);
    const panoramic = /Cam01Final/i.test(asset.label);
    visibleSubjects = close
      ? ["low-angle tower facade", "white residential balconies", "vertical patterned facade panel", "blue sky"]
      : hillside
        ? ["residential tower", "green hillside backdrop", "landscaped frontage", "blue sky"]
        : panoramic
          ? ["multi-tower elevation", "green lawn foreground", "continuous residential facade", "blue sky"]
          : dusk
            ? ["illuminated residential tower", "evening sky", "hillside backdrop", "palm-lined frontage"]
            : ["multi-tower residential elevation", "road frontage", "landscaped podium edge", "blue sky"];
    visualStyle = dusk ? ["dusk", "illuminated", "premium"] : ["daylight", "architectural", "clean"];
    description = `CGI project exterior render of Miami at Pride World City showing ${visibleSubjects.join(", ")}. Use as a project-truth anchor and preserve tower massing, facade rhythm, landscape context, and perspective.`;
    safeClaims = ["architectural render of Miami at Pride World City", "project exterior representation", "visible tower facade and landscape context"];
    doNotClaim = ["completed building photograph", "changed tower design", "invented skyline or surroundings", "facade logo/signage unless present in source"];
    promptUsageNote = close
      ? "Use for architectural detail, tower stature, facade-led launch, and premium elevation creatives."
      : "Use for project launch, exterior hero, typology, and architecture-led creatives.";
    selectionKeywords.push("exterior", "tower", "facade", "architecture", dusk ? "dusk" : "daylight");
  } else if (asset.scene_type === "amenity") {
    const amenity = meta.amenityName || "amenity";
    const amenitySubjects = {
      "Landscape Deck": ["landscape deck", "green lawn", "walking path", "residential towers", "people in garden"],
      "Sculpture Plaza": ["colorful sculpture arch", "open lawn", "clubhouse pavilion", "residential towers", "people"],
      "Outdoor Gym": ["outdoor fitness lawn", "exercise equipment", "people using gym", "trees", "tower backdrop"],
      "Clubhouse Exterior": ["arrival driveway", "clubhouse entrance", "Miami signage", "palm trees", "tower backdrop"],
      "Swimming Pool": ["swimming pool", "pool deck", "palm trees", "residential towers", "hillside backdrop"],
      "Clubhouse Lawn": ["clubhouse pavilion", "wide green lawn", "palm tree", "people walking", "residential towers"],
    };
    visibleSubjects = amenitySubjects[amenity] || ["landscaped amenity", "residential towers", "green open space"];
    visualStyle = ["daylight", "landscaped", "lifestyle"];
    description = `CGI amenity render of Miami at Pride World City showing ${visibleSubjects.join(", ")}. Use as a truthful amenity reference for lifestyle-led social creatives.`;
    safeClaims = [`${amenity} render`, "amenity design representation", "Pride World City lifestyle amenity reference"];
    doNotClaim = ["completed amenity photograph", "guaranteed delivered furniture or equipment", "invented amenity not visible in source"];
    promptUsageNote = `Use for ${amenity.toLowerCase()} and lifestyle amenity creatives; keep the visible amenity and landscape truthful.`;
    selectionKeywords.push("amenity", amenity.toLowerCase(), ...visibleSubjects);
  } else {
    const room = inferInterior(asset);
    sceneType = "interior";
    visualUse = "support_anchor";
    visibleSubjects = room.subjects;
    visualStyle = room.style;
    description = `CGI sample-flat interior render for Miami at Pride World City showing a ${room.room} with ${room.subjects.join(", ")}. Use as an interior support anchor, not as a delivered-apartment photograph.`;
    safeClaims = ["sample flat interior render", "interior design representation", `${room.room} reference`];
    doNotClaim = ["actual delivered apartment photograph", "guaranteed furniture or fittings", "invented carpet area or typology claim"];
    promptUsageNote = room.note;
    selectionKeywords.push(room.room, ...room.subjects, ...room.style);
  }

  const nextMetadata = {
    ...meta,
    assetDescription: compact(description),
    truthStatus,
    sceneType,
    visualUse,
    amenityName,
    visibleSubjects: unique(visibleSubjects),
    visualStyle: unique(visualStyle),
    safeClaims: unique(safeClaims),
    doNotClaim: unique(doNotClaim),
    promptUsageNote: compact(promptUsageNote),
    selectionKeywords: unique(selectionKeywords.map((value) => String(value).toLowerCase())),
    manualVisionEnrichedAt: new Date().toISOString(),
    manualVisionSource: "codex_contact_sheet_review",
  };

  if (/Cam27_Cricket/i.test(asset.label)) {
    nextMetadata.tags = ["amenity", "cricket pitch", "open play lawn", "sports", "landscape"];
    nextMetadata.subjectType = "amenity";
    nextMetadata.usageIntent = "amenity_anchor";
    nextMetadata.viewType = "open_play_lawn";
    nextMetadata.qualityTier = "hero";
    nextMetadata.preserveIdentity = false;
  }

  return {
    asset_description: compact(description),
    truth_status: truthStatus,
    scene_type: sceneType,
    visual_use: visualUse,
    safe_claims: unique(safeClaims),
    do_not_claim: unique(doNotClaim),
    metadata_json: nextMetadata,
  };
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const patches = manifest.assets.map((asset) => ({
    index: asset.index,
    id: asset.id,
    label: asset.label,
    patch: manualPatch(asset),
  }));

  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", count: patches.length, sample: patches.slice(0, 12) }, null, 2));

  if (!APPLY) return;

  for (const item of patches) {
    const { error } = await supabase.from("brand_assets").update(item.patch).eq("id", item.id);
    if (error) throw new Error(`Failed to update ${item.index} ${item.label}: ${error.message}`);
  }

  console.log(`Applied manual vision enrichment to ${patches.length} Pride reference assets.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
