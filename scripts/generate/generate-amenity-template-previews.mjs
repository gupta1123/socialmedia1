import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fal } from "@fal-ai/client";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FAL_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
}

fal.config({
  credentials: process.env.FAL_KEY
});

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "creative-assets";
const falModel = process.env.FAL_STYLE_SEED_MODEL ?? "fal-ai/nano-banana";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BRAND_NAME = "Krisala Developers";
const POST_TYPE_CODE = "amenity-spotlight";
const LOCAL_OUTPUT_DIR = path.resolve("/tmp/amenity-template-previews");
const ASPECT_RATIO = "4:5";

const TEMPLATES = [
  {
    name: "Amenity spotlight · Full-bleed hero",
    templateFamily: "Amenity spotlight / full-bleed hero",
    heroAmenity: "Infinity Pool",
    microCopy: "Skyline calm, crafted for premium everyday leisure",
    locationTag: "West Pune residential address",
    approvedUseCases: ["Amenity spotlight", "Outdoor hero amenity", "Pool / deck showcase"],
    safeZoneNotes: [
      "Protect the top header strip for brand and micro info.",
      "Keep a clean headline block in the upper-left quadrant.",
      "Leave breathing room around the lower badge and footer line."
    ],
    notes: [
      "Best for pool, clubhouse lawn, rooftop deck, and premium outdoor leisure amenities."
    ],
    textZones: ["brand header", "info row", "headline", "support text", "badge", "footer"],
    scaffoldPrompt: `Create a premium vertical 4:5 real estate social media poster for an Amenity Spotlight campaign. The poster should feel like a finished luxury real estate template, not just a plain render. Use a modern editorial layout with soft rounded corners, refined spacing, subtle texture in the background, and a strong visual hierarchy.

The design should include:
- a small brand header area at the top
- a compact info row with small icon-style elements
- a bold headline zone
- a short supporting text zone
- a thin outlined or softly framed text box
- a large hero image occupying the lower half to two-thirds of the poster
- one subtle badge or premium seal element
- clean negative space for typography

The hero visual should feature a premium [AMENITY NAME] inside an upscale Indian residential project. The space should feel luxurious, photorealistic, calm, aspirational, and brand-forward. The architecture must look elegant and believable, with high-end materials such as stone, wood, glass, soft greenery, and warm ambient lighting.

The composition should feel polished and minimal, with the amenity as the hero and a few subtle decorative elements such as tiny birds, abstract line accents, or a faint geometric frame. If people are included, use only one or two understated Indian residents for scale, not as the main subject.

Leave intentional clean space for:
- [BRAND NAME]
- [AMENITY NAME]
- [SHORT TAGLINE]
- [LOCATION TAG]

Style: premium editorial poster, luxury real estate branding, architectural visualization plus graphic layout, modern Instagram campaign design, photorealistic, refined, minimal.

Negative prompt: No cluttered flyer design, no gaudy brochure look, no loud gradients, no fake luxury, no overly busy icons, no excessive text, no distorted architecture, no cheap CGI.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate amenity template preview
Primary request: Create a premium vertical 4:5 real estate social media poster template for an amenity spotlight campaign.
Subject: a luxury infinity pool within an upscale Indian residential project
Scene/backdrop: high-end outdoor amenity environment with stone, wood, water, greenery, and warm ambient lighting
Style/medium: photoreal real estate campaign poster with editorial layout
Composition/framing: finished luxury poster, not a plain render; small top brand strip, compact icon/info row, bold headline zone, short support text zone, subtle badge, large hero visual in the lower half to two-thirds, clean negative space
Lighting/mood: calm, aspirational, premium, polished, warm evening light
Text (verbatim): "KRISALA DEVELOPERS" "Infinity Pool" "Skyline calm, crafted for premium everyday leisure" "West Pune residential address"
Constraints: use sample text only as visual scaffolding; no logo mark or emblem; keep the composition minimal and brand-forward; amenity is the hero; one or two understated residents at most
Avoid: cluttered flyer design, gaudy brochure styling, loud gradients, fake luxury, excessive text, distorted architecture, cheap CGI, watermark`
  },
  {
    name: "Amenity spotlight · Center framed card",
    templateFamily: "Amenity spotlight / center framed card",
    heroAmenity: "Co-working Lounge",
    microCopy: "Quiet focus, elevated by hospitality-led design",
    locationTag: "Premium community living",
    approvedUseCases: ["Amenity spotlight", "Indoor amenity", "Lounge / coworking showcase"],
    safeZoneNotes: [
      "Reserve a central framed content card over the hero scene.",
      "Keep the top strip minimal and refined.",
      "Let the hero amenity remain visible around the content frame."
    ],
    notes: [
      "Best for lounge, co-working space, indoor games room, private theatre, spa, and clubhouse interiors."
    ],
    textZones: ["brand strip", "info row", "framed headline", "secondary text", "corner badge"],
    scaffoldPrompt: `Design a luxury vertical 4:5 social media template for a real estate Amenity Spotlight post. The poster should have a premium editorial composition with a large hero visual in the background and a central framed content card layered over it. The overall look should feel elegant, calm, and upscale, with a soft paper-like or matte textured base.

The layout should include:
- a small refined brand strip at the top
- a compact contact/info/icon row
- a centered or upper-middle content frame with rounded edges or thin line border
- a large headline area
- a short secondary text area
- a subtle corner badge / symbol / icon accent
- a soft foreground/background layering effect
- a photorealistic premium amenity scene behind the content frame

The hero image should show a sophisticated [AMENITY NAME] within a luxury Indian residential project. The amenity should feel warm, premium, and believable, with strong materiality: marble or travertine, rich wood, soft upholstery, glass, warm lighting, sculptural decor, elegant interior styling.

The composition should be layered so that the framed card feels intentionally placed over the scene, like a premium launch poster or amenity announcement. The poster should feel curated and stylish, with whitespace and visual restraint.

Leave clean structured areas for:
- [BRAND NAME]
- [AMENITY NAME]
- [SHORT TAGLINE]
- [MICRO INFO LINE]

Style: luxury campaign poster, real estate social media template, editorial layout, interior design sophistication, photorealistic, calm, high-end.

Negative prompt: No chaotic overlapping elements, no overdecorated luxury interiors, no excessive gold, no unreadable text shapes, no cheap hotel vibe, no crowded people, no glossy brochure clutter.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate amenity template preview
Primary request: Design a luxury vertical 4:5 social media template for an amenity spotlight with a central framed content card layered over a premium hero scene.
Subject: a sophisticated co-working lounge inside a luxury Indian residential project
Scene/backdrop: hospitality-inspired interior with travertine, wood, soft upholstery, glass, warm lighting, sculptural decor
Style/medium: photoreal premium campaign poster with editorial framing
Composition/framing: small refined top brand strip, compact icon/info row, rounded or thin-line content frame in the upper-middle, headline and support zones inside the frame, subtle corner badge, hero amenity visible around the frame
Lighting/mood: calm, upscale, soft warm light, curated and stylish
Text (verbatim): "KRISALA DEVELOPERS" "Co-working Lounge" "Quiet focus, elevated by hospitality-led design" "Premium community living"
Constraints: sample text only; no logo mark or emblem; keep whitespace and restraint; avoid overfilling the card
Avoid: chaotic overlap, excessive gold, cheap hotel vibe, crowded people, glossy brochure clutter, watermark`
  },
  {
    name: "Amenity spotlight · Split lifestyle layer",
    templateFamily: "Amenity spotlight / split lifestyle layer",
    heroAmenity: "Fitness Studio",
    microCopy: "Wellness spaces designed for consistent everyday energy",
    locationTag: "Urban routines, premium setting",
    approvedUseCases: ["Amenity spotlight", "Wellness amenity", "Lifestyle-led amenity post"],
    safeZoneNotes: [
      "Keep a clear branding row at the top.",
      "Protect one boxed content area for headline and supporting copy.",
      "Ensure the secondary lifestyle layer stays subtle and does not overpower the amenity."
    ],
    notes: [
      "Best for kids’ play area, jogging path, clubhouse café, fitness studio, and landscaped garden amenities."
    ],
    textZones: ["branding row", "headline block", "support copy", "boxed content panel", "micro footer"],
    scaffoldPrompt: `Create a premium vertical 4:5 real estate social media template for an Amenity Spotlight post using a split-composition poster style. The layout should feel like a designed brand asset with both architectural beauty and subtle lifestyle storytelling. The overall mood should be luxury, calm, warm, and contemporary.

The poster should include:
- a clean top branding row
- a small icon-led information strip
- a bold headline block
- a short body/supporting copy zone
- one boxed or softly tinted content panel
- a large architectural amenity visual
- a secondary lifestyle layer in the foreground or lower portion
- elegant framing and intentional whitespace

The visual should feature a beautifully designed [AMENITY NAME] in a luxury Indian residential development. The split treatment should feel integrated, not like a collage. One part of the composition emphasizes the amenity itself, while another layer subtly introduces human warmth through one or two residents using the space naturally.

For example, the environment may show landscaped seating, a wellness area, a co-working corner, or a semi-open lounge, while the lifestyle layer shows residents walking, sitting, or interacting in a subtle and premium way. Keep the people small and natural. The architecture remains the hero.

Use muted premium tones, elegant shadows, subtle layering, and leave clear text-safe areas for graphic placement.

Leave intentional space for:
- [BRAND NAME]
- [AMENITY NAME]
- [SHORT TAGLINE]
- [SUBTEXT OR LOCATION TAG]

Style: editorial real estate poster, luxury residential branding, premium Instagram template, layered visual storytelling, refined, photorealistic.

Negative prompt: No collage chaos, no stock-photo family vibe, no exaggerated smiles, no busy multi-panel brochure style, no cartoon landscaping, no fake architectural proportions, no loud decorative graphics.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate amenity template preview
Primary request: Create a premium split-composition 4:5 social media poster for an amenity spotlight.
Subject: a luxury fitness studio within an Indian residential development, with subtle lifestyle storytelling
Scene/backdrop: premium wellness environment with rich materiality, clean architecture, muted premium tones, and one or two understated residents using the space naturally
Style/medium: photoreal editorial real estate poster with layered storytelling
Composition/framing: clean top branding row, icon-led info strip, bold headline block, short support copy zone, one softly tinted or boxed content panel, large amenity visual, subtle lifestyle layer in the lower or foreground portion, elegant whitespace
Lighting/mood: calm, warm, contemporary, premium
Text (verbatim): "KRISALA DEVELOPERS" "Fitness Studio" "Wellness spaces designed for consistent everyday energy" "Urban routines, premium setting"
Constraints: architecture remains the hero; people stay small and natural; sample text only; no logos
Avoid: collage chaos, stock-photo family vibe, busy brochure style, cartoon landscaping, loud decorative graphics, watermark`
  },
  {
    name: "Amenity spotlight · Luxury mood detail",
    templateFamily: "Amenity spotlight / luxury mood detail",
    heroAmenity: "Arrival Lounge",
    microCopy: "A hospitality-led first impression with quiet luxury",
    locationTag: "Crafted detail in every arrival moment",
    approvedUseCases: ["Amenity spotlight", "Mood-led interior", "Lobby / lounge detail post"],
    safeZoneNotes: [
      "Hold an elegant label zone at the top.",
      "Keep the headline and support line in calm negative space.",
      "Let the close-up amenity visual stay material-rich and uncluttered."
    ],
    notes: [
      "Best for lobby, spa, reading lounge, indoor seating pavilion, and arrival lounge posts."
    ],
    textZones: ["brand label", "info row", "headline", "support line", "detail line"],
    scaffoldPrompt: `Generate a high-end vertical 4:5 social media poster for an Amenity Spotlight campaign focused on detail, materiality, and mood. This should look like a luxury real estate brand template with a quiet, sophisticated editorial aesthetic. The design should not feel like a generic property ad; it should feel curated, atmospheric, and premium.

The poster layout should include:
- a small elegant brand label at the top
- a thin information row with minimal icons
- a large headline area
- a subtle supporting line zone
- one fine outline frame, architectural line box, or translucent content card
- a large close-up or semi-close-up hero visual of the amenity
- one discreet decorative emblem, badge, or corner icon
- generous whitespace and calm composition

The hero image should focus on a richly designed [AMENITY NAME] with a hospitality-inspired aesthetic. Emphasize materials and atmosphere: stone walls, plush seating, warm wood, brushed brass, textured finishes, soft cove lighting, elegant indoor plants, refined shadows, and premium styling. The camera angle should feel intentional and editorial, not overly wide.

The design should feel intimate and luxurious, with typography zones integrated into quieter areas of the composition. It should look like a premium amenity announcement from a top residential brand.

Leave clean, readable zones for:
- [BRAND NAME]
- [AMENITY NAME]
- [SHORT TAGLINE]
- [SMALL DETAIL LINE]

Style: luxury editorial interior poster, premium real estate campaign, material-rich, calm, sophisticated, photorealistic.

Negative prompt: No flashy glamour, no gold overload, no oversized chandeliers unless very restrained, no noisy decor, no clutter, no distorted perspective, no budget showroom vibe, no overly dark unreadable scene.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate amenity template preview
Primary request: Generate a high-end vertical 4:5 social media poster template for an amenity spotlight focused on materiality, detail, and mood.
Subject: a hospitality-inspired arrival lounge within a premium Indian residential project
Scene/backdrop: stone walls, plush seating, warm wood, brushed brass, textured finishes, elegant indoor plants, soft cove lighting
Style/medium: photoreal luxury editorial interior poster
Composition/framing: small elegant top label, thin info row with minimal icons, large headline area, subtle supporting line, one refined outline frame or translucent content card, close-up or semi-close-up hero visual, generous whitespace
Lighting/mood: calm, intimate, sophisticated, premium, softly lit
Text (verbatim): "KRISALA DEVELOPERS" "Arrival Lounge" "A hospitality-led first impression with quiet luxury" "Crafted detail in every arrival moment"
Constraints: sample text only; no logo mark; keep the angle editorial and not too wide; preserve readability
Avoid: flashy glamour, gold overload, noisy decor, budget showroom vibe, overly dark unreadable scene, watermark`
  },
  {
    name: "Amenity spotlight · Outdoor skyline poster",
    templateFamily: "Amenity spotlight / outdoor skyline poster",
    heroAmenity: "Rooftop Sky Deck",
    microCopy: "Open-air evenings framed by skyline calm",
    locationTag: "Elevated community leisure",
    approvedUseCases: ["Amenity spotlight", "Outdoor amenity", "Rooftop / terrace showcase"],
    safeZoneNotes: [
      "Use the sky or upper negative space as the main headline zone.",
      "Keep the location/info row compact and high.",
      "Protect the lower support block so the amenity remains spacious."
    ],
    notes: [
      "Best for rooftop garden, sky lounge, infinity pool, terrace deck, and open seating court."
    ],
    textZones: ["header strip", "location row", "headline", "support line", "micro copy"],
    scaffoldPrompt: `Create a luxury vertical 4:5 social media poster for an Amenity Spotlight post featuring an outdoor premium amenity. The design should feel like a fully composed campaign template with branding, typography zones, elegant info elements, and a high-end photoreal hero scene. The overall visual language should be modern, aspirational, and refined.

The layout should include:
- a top brand/header strip
- a small location/info row with icon-style markers
- a strong headline section
- a compact support line section
- a softly framed or outlined text block
- a dominant outdoor hero visual
- a subtle badge or marker element
- rounded edges and premium editorial spacing

The hero image should showcase a beautiful [AMENITY NAME] at golden hour or early blue hour in an upscale Indian residential setting. The amenity should feel airy, elevated, premium, and serene. Include refined paving, elegant outdoor seating, greenery, glass railings, skyline or tower context, soft ambient lighting, and a believable high-end residential mood.

The composition should feel spacious and intentionally designed, with the sky or upper negative space used as a clean typography zone. Add very subtle decorative motion or atmosphere if needed, such as birds, breeze in plants, or soft lighting glow, but keep it tasteful and restrained.

Leave clear layout space for:
- [BRAND NAME]
- [AMENITY NAME]
- [SHORT TAGLINE]
- [LOCATION TAG OR MICRO COPY]

Style: luxury outdoor real estate campaign poster, editorial architecture plus graphic design layout, premium Instagram template, photorealistic, elevated, minimal.

Negative prompt: No resort cliché, no beach vibe unless specifically intended, no party scene, no neon lighting, no overcrowding, no fantasy skyline, no excessive lens flare, no loud promotional styling.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate amenity template preview
Primary request: Create a luxury vertical 4:5 social media poster template for an outdoor amenity spotlight.
Subject: a rooftop sky deck in an upscale Indian residential setting
Scene/backdrop: golden-hour or early blue-hour outdoor premium amenity with refined paving, elegant seating, greenery, glass railings, tower context, and believable skyline depth
Style/medium: photoreal outdoor real estate campaign poster with editorial graphic layout
Composition/framing: top brand/header strip, small location/info row, strong headline section in the sky or upper negative space, compact support line, softly framed text block, dominant outdoor hero visual, subtle badge, rounded edges, premium spacing
Lighting/mood: airy, elevated, serene, premium
Text (verbatim): "KRISALA DEVELOPERS" "Rooftop Sky Deck" "Open-air evenings framed by skyline calm" "Elevated community leisure"
Constraints: sample text only; no logo mark or emblem; keep the composition spacious and restrained
Avoid: resort cliché, beach vibe, party scene, neon lighting, overcrowding, fantasy skyline, loud promotional styling, watermark`
  }
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });

  const brand = await fetchBrand(BRAND_NAME);
  const ownerUserId = await fetchWorkspaceOwner(brand.workspace_id);
  const postTypeId = await fetchPostTypeId(POST_TYPE_CODE, brand.workspace_id);

  console.log(`Generating ${TEMPLATES.length} amenity template previews for ${brand.name}...`);

  for (const template of TEMPLATES) {
    const existingTemplate = await fetchTemplateByName(brand.id, template.name);
    const templateId = existingTemplate?.id ?? crypto.randomUUID();
    const fileName = `${slugify(template.name)}.png`;
    const storagePath = buildStoragePath({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      section: "templates",
      id: templateId,
      fileName
    });

    console.log(`\n→ ${template.name}`);
    const generated = await generatePreviewImage(template.previewPrompt);
    const localPreviewPath = path.join(LOCAL_OUTPUT_DIR, fileName);
    await fs.writeFile(localPreviewPath, generated.buffer);
    await uploadPreviewToStorage(storagePath, generated.buffer, generated.contentType);
    await upsertTemplate({
      templateId,
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      postTypeId,
      createdBy: ownerUserId,
      name: template.name,
      previewStoragePath: storagePath,
      basePrompt: template.scaffoldPrompt,
      config: {
        promptScaffold: template.scaffoldPrompt,
        safeZoneNotes: template.safeZoneNotes,
        approvedUseCases: template.approvedUseCases,
        templateFamily: template.templateFamily,
        outputKinds: ["single_image"],
        defaultSlideCount: null,
        allowedSlideCounts: [],
        seriesUseCases: [],
        carouselRecipe: [],
        notes: [
          ...template.notes,
          `Hero amenity sample for preview generation: ${template.heroAmenity}.`,
          "Template preview generated from prompt-only poster guidance. Use as a style anchor, not a source image to replicate."
        ],
        textZones: template.textZones.map((name) => ({ name }))
      }
    });

    console.log(`  preview: ${localPreviewPath}`);
    console.log(`  storage: ${storagePath}`);
  }

  console.log("\nAmenity template generation complete.");
}

async function generatePreviewImage(prompt) {
  const submission = await fal.queue.submit(falModel, {
    input: {
      prompt,
      aspect_ratio: ASPECT_RATIO,
      num_images: 1
    }
  });

  const requestId = submission.request_id;
  if (!requestId) {
    throw new Error("Fal did not return a request id");
  }

  const result = await waitForFalResult(falModel, requestId);
  const imageUrl = result?.data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error(`Fal returned no image URL for request ${requestId}`);
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType, imageUrl };
}

async function waitForFalResult(endpoint, requestId) {
  const maxAttempts = 80;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await fal.queue.status(endpoint, { requestId });
    const state = status?.status;

    if (state === "COMPLETED") {
      return fal.queue.result(endpoint, { requestId });
    }

    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`Fal generation ${state.toLowerCase()} for request ${requestId}`);
    }

    await sleep(2500);
  }

  throw new Error(`Timed out waiting for Fal result ${requestId}`);
}

async function uploadPreviewToStorage(storagePath, buffer, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: true
  });

  if (error) throw error;
}

async function upsertTemplate({
  templateId,
  workspaceId,
  brandId,
  postTypeId,
  createdBy,
  name,
  previewStoragePath,
  basePrompt,
  config
}) {
  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    project_id: null,
    post_type_id: postTypeId,
    name,
    status: "approved",
    channel: "instagram-feed",
    format: "portrait",
    base_prompt: basePrompt,
    preview_storage_path: previewStoragePath,
    template_json: config,
    created_by: createdBy
  };

  const { data: existing } = await supabase
    .from("creative_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("creative_templates").update(payload).eq("id", templateId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("creative_templates").insert({
    id: templateId,
    ...payload
  });

  if (error) throw error;
}

async function fetchBrand(name) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, workspace_id, name")
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Brand not found: ${name}`);
  return data;
}

async function fetchWorkspaceOwner(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id) throw new Error(`No workspace owner found for workspace ${workspaceId}`);
  return data.user_id;
}

async function fetchPostTypeId(code, workspaceId) {
  const { data, error } = await supabase
    .from("post_types")
    .select("id, workspace_id, code")
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .eq("code", code);

  if (error) throw error;
  const row = (data ?? []).find((item) => item.workspace_id === workspaceId) ?? data?.[0];
  if (!row?.id) throw new Error(`Post type not found: ${code}`);
  return row.id;
}

async function fetchTemplateByName(brandId, name) {
  const { data, error } = await supabase
    .from("creative_templates")
    .select("id")
    .eq("brand_id", brandId)
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function buildStoragePath({ workspaceId, brandId, section, id, fileName }) {
  return `${workspaceId}/${brandId}/${section}/${id}/${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName) {
  return fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
