import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: "apps/api/.env" });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(getArg("--limit") || 0);
const ONLY_MISSING_VISION = process.argv.includes("--missing-only");
const BRAND_MATCH = /pride/i;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "creative-assets";
const MODEL = process.env.VISION_ENRICHMENT_MODEL || "gpt-4o-mini";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferFallback(asset) {
  const metadata = asset.metadata_json || {};
  const scene = asset.scene_type || metadata.sceneType || metadata.subjectType || "reference";
  return {
    asset_description: asset.asset_description || `Reference asset for Pride Group / Miami at Pride World City: ${asset.label}.`,
    truth_status: asset.truth_status || (asset.kind === "reference" ? "render" : "unknown"),
    scene_type: scene === "sample_flat" ? "interior" : scene,
    visual_use: asset.visual_use || metadata.visualUse || metadata.usageIntent || "supporting_ref",
    safe_claims: asArray(asset.safe_claims).length ? asArray(asset.safe_claims) : asArray(metadata.safeClaims),
    do_not_claim: asArray(asset.do_not_claim).length ? asArray(asset.do_not_claim) : asArray(metadata.doNotClaim),
  };
}

function schemaPrompt(asset) {
  return [
    "Analyze this real-estate brand/project asset for an AI social creative prompt engine.",
    "Return JSON only. No markdown.",
    "Be factual about what is visible. Do not infer unsupported project facts.",
    "If this is a CGI/render, say render. If it is a photo, say photograph.",
    "For buildings, describe facade, angle, surroundings, visible signage, skyline/context, and what must be preserved.",
    "For interiors, describe room type, layout, main furniture/fixtures, style, lighting, and whether it is a sample-flat render.",
    "For amenities, describe exact amenity type, people/no people, lighting, landscape, and visual mood.",
    "Classify for a real estate creative engine.",
    "",
    "Allowed truth_status: render, photograph, floor_plan, map, logo, qr, brochure, video, unknown.",
    "Allowed scene_type: project_exterior, amenity, interior, location_map, floor_plan, logo, rera_qr, generic_reference.",
    "Allowed visual_use: hero_anchor, truth_anchor, amenity_anchor, support_anchor, background_context, supporting_ref, exact_asset, compliance_asset, brand_mark, do_not_use.",
    "",
    "JSON shape:",
    "{",
    '  "asset_description": "one concise but specific sentence, 24-45 words",',
    '  "truth_status": "render|photograph|floor_plan|map|logo|qr|brochure|video|unknown",',
    '  "scene_type": "project_exterior|amenity|interior|location_map|floor_plan|logo|rera_qr|generic_reference",',
    '  "visual_use": "hero_anchor|truth_anchor|amenity_anchor|support_anchor|background_context|supporting_ref|exact_asset|compliance_asset|brand_mark|do_not_use",',
    '  "quality_tier": "hero|usable|supporting|avoid",',
    '  "view_type": "short snake_case view descriptor",',
    '  "amenity_name": "visible amenity name or null",',
    '  "visible_subjects": ["short factual visible elements"],',
    '  "visual_style": ["short visual style descriptors"],',
    '  "safe_claims": ["claims safely supported by this image"],',
    '  "do_not_claim": ["things this image must not be used to claim"],',
    '  "prompt_usage_note": "how prompt engine should use this asset",',
    '  "selection_keywords": ["keywords for asset selection"]',
    "}",
    "",
    `Asset label: ${asset.label}`,
    `Existing metadata: ${JSON.stringify(asset.metadata_json || {})}`,
  ].join("\n");
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error(`Could not parse JSON from vision response: ${raw.slice(0, 240)}`);
}

function normalizeVision(asset, result) {
  const fallback = inferFallback(asset);
  const metadata = asset.metadata_json && typeof asset.metadata_json === "object" ? asset.metadata_json : {};
  const sceneType = compact(result.scene_type) || fallback.scene_type;
  const visualUse = compact(result.visual_use) || fallback.visual_use;
  const truthStatus = compact(result.truth_status) || fallback.truth_status;
  const safeClaims = asArray(result.safe_claims).length ? asArray(result.safe_claims) : fallback.safe_claims;
  const doNotClaim = asArray(result.do_not_claim).length ? asArray(result.do_not_claim) : fallback.do_not_claim;
  const selectionKeywords = asArray(result.selection_keywords);
  const visibleSubjects = asArray(result.visible_subjects);
  const visualStyle = asArray(result.visual_style);
  const modelDescription = compact(result.asset_description);
  const description = improveDescription({
    asset,
    fallback,
    modelDescription,
    sceneType,
    truthStatus,
    visualUse,
    visibleSubjects,
    visualStyle,
    amenityName: result.amenity_name,
    viewType: result.view_type,
  });

  return {
    asset_description: description,
    truth_status: truthStatus,
    scene_type: sceneType === "sample_flat" ? "interior" : sceneType,
    visual_use: visualUse,
    safe_claims: safeClaims,
    do_not_claim: doNotClaim,
    metadata_json: {
      ...metadata,
      assetDescription: description,
      truthStatus,
      sceneType: sceneType === "sample_flat" ? "interior" : sceneType,
      visualUse,
      qualityTier: compact(result.quality_tier) || metadata.qualityTier,
      viewType: compact(result.view_type) || metadata.viewType,
      amenityName: result.amenity_name === null ? null : compact(result.amenity_name) || metadata.amenityName || null,
      visibleSubjects,
      visualStyle,
      safeClaims,
      doNotClaim,
      promptUsageNote: compact(result.prompt_usage_note),
      selectionKeywords,
      visionEnrichedAt: new Date().toISOString(),
      visionModel: MODEL,
      source: metadata.source || "pride-hosted-asset-vision-enrichment",
    },
  };
}

function improveDescription(args) {
  const {
    asset,
    fallback,
    modelDescription,
    sceneType,
    truthStatus,
    visibleSubjects,
    visualStyle,
    amenityName,
    viewType,
  } = args;
  const subjects = visibleSubjects.slice(0, 5).join(", ");
  const style = visualStyle.slice(0, 3).join(", ");
  const prior = fallback.asset_description || "";
  const tooGeneric =
    !modelDescription ||
    modelDescription === prior ||
    /Supporting truth reference|Supporting interior reference|showing the project exterior \/ Facade view/i.test(modelDescription);

  if (!tooGeneric) return modelDescription;

  const truth = truthStatus === "photograph" ? "photograph" : "CGI render";
  if (sceneType === "project_exterior") {
    return compact(
      `${truth} of Miami at Pride World City showing ${subjects || "the residential tower exterior"}${viewType ? ` from a ${String(viewType).replace(/_/g, " ")} angle` : ""}. Use as a project-truth anchor; preserve facade geometry, massing, landscape context, and visible surroundings.`
    );
  }
  if (sceneType === "amenity") {
    return compact(
      `${truth} of the ${compact(amenityName) || "amenity area"} at Miami, with ${subjects || "landscaped lifestyle amenity features"}${style ? ` in a ${style} visual mood` : ""}. Use for amenity-led creatives without claiming completed delivery.`
    );
  }
  if (sceneType === "interior") {
    return compact(
      `${truth} of a Miami sample-flat interior showing ${subjects || "room layout, furniture, fixtures, and finish mood"}${style ? ` with ${style} styling` : ""}. Use as an interior support anchor, not as a delivered-apartment photograph.`
    );
  }
  return modelDescription || prior || `Reference asset for Pride Group / Miami at Pride World City: ${asset.label}.`;
}

async function imageDataUrl(asset) {
  const { data, error } = await supabase.storage.from(BUCKET).download(asset.storage_path);
  if (error) throw new Error(`Storage download failed for ${asset.label}: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = asset.mime_type || data.type || "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

async function analyze(asset) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: schemaPrompt(asset) },
            { type: "image_url", image_url: { url: await imageDataUrl(asset), detail: "low" } },
          ],
        },
      ],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI vision failed for ${asset.label}: ${JSON.stringify(json)}`);
  }
  const content = json.choices?.[0]?.message?.content;
  return normalizeVision(asset, extractJson(content));
}

async function main() {
  const { data: brands, error: brandError } = await supabase
    .from("brands")
    .select("id,name,slug")
    .or("name.ilike.%pride%,slug.ilike.%pride%");
  if (brandError) throw brandError;
  const brand = (brands || []).find((row) => BRAND_MATCH.test(`${row.name} ${row.slug}`));
  if (!brand) throw new Error("Pride brand not found");

  const { data: rows, error: assetError } = await supabase
    .from("brand_assets")
    .select("id,kind,label,file_name,mime_type,storage_path,asset_description,truth_status,scene_type,visual_use,safe_claims,do_not_claim,metadata_json")
    .eq("brand_id", brand.id)
    .eq("kind", "reference")
    .order("label");
  if (assetError) throw assetError;

  let assets = rows || [];
  if (ONLY_MISSING_VISION) {
    assets = assets.filter((asset) => !asset.metadata_json?.visionEnrichedAt);
  }
  if (LIMIT > 0) assets = assets.slice(0, LIMIT);

  console.log(JSON.stringify({ brand, mode: APPLY ? "apply" : "dry-run", model: MODEL, count: assets.length }, null, 2));

  const outputs = [];
  for (const [index, asset] of assets.entries()) {
    console.error(`[${index + 1}/${assets.length}] vision: ${asset.label}`);
    const patch = await analyze(asset);
    outputs.push({ id: asset.id, label: asset.label, patch });
    if (APPLY) {
      const { error } = await supabase.from("brand_assets").update(patch).eq("id", asset.id);
      if (error) throw new Error(`Failed to update ${asset.label}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ updated: APPLY ? outputs.length : 0, sample: outputs.slice(0, 8) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
