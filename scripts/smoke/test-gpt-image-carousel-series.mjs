#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OUT_DIR = "tmp/gpt-image-carousel-series";

const slideAssets = [
  {
    n: 1,
    role: "cover_hook",
    assetPath:
      "Prescon/Prescon Midtown Bay - Digital Kit/building renders/Building Renders/CG-13.Cam_Hero Shot_Post_V1-High2.jpg",
    headline: "Introducing Prescon Midtown Bay",
    subheadline: "A refined story of place, design, and everyday living.",
  },
  {
    n: 2,
    role: "project_promise",
    assetPath:
      "Prescon/db-prepared/project/exterior/prescon-midtown-bay-hero-tower-twilight-alt.jpeg",
    headline: "Designed for everyday ease",
    subheadline: "Mahim, Mumbai",
  },
  {
    n: 3,
    role: "location_context",
    assetPath:
      "Prescon/db-prepared/project/exterior/prescon-midtown-bay-city-facade-day.jpg",
    headline: "The advantage begins with the address",
    subheadline: "Mahim, Mumbai",
  },
  {
    n: 4,
    role: "amenity_hero",
    assetPath:
      "Prescon/db-prepared/amenities/swimming-pool/prescon-midtown-bay-pool-night.jpg",
    headline: "Evenings made for the podium",
    subheadline: "A calmer side of city living.",
  },
];

function argValue(name, fallback = undefined) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

const dryRun = process.argv.includes("--dry-run");
const chained = process.argv.includes("--chain");
const bakeText = process.argv.includes("--bake-text");
const slideLimit = Number(argValue("--slides", slideAssets.length));
const outDir = argValue("--out", DEFAULT_OUT_DIR);
const responsesModel = process.env.OPENAI_RESPONSES_MODEL || "gpt-5.1";
const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const size = process.env.OPENAI_IMAGE_SIZE || "1024x1536";

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function dataUrl(filePath) {
  const bytes = await readFile(filePath);
  return `data:${mimeFromPath(filePath)};base64,${bytes.toString("base64")}`;
}

function imageGenTool() {
  const tool = {
    type: "image_generation",
    size,
  };

  // The image-generation tool model field is supported in current docs for model
  // selection; if the API rejects it, unset OPENAI_IMAGE_MODEL and retry.
  if (imageModel) tool.model = imageModel;
  return tool;
}

async function callResponses(payload) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI API returned non-JSON (${res.status}): ${text}`);
  }

  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${JSON.stringify(json, null, 2)}`);
  }

  return json;
}

function extractImageBase64(response) {
  const imageCall = (response.output || []).find((item) => item.type === "image_generation_call");
  if (!imageCall?.result) {
    throw new Error(`No image_generation_call result found. Output types: ${(response.output || []).map((x) => x.type).join(", ")}`);
  }
  return imageCall.result;
}

async function writePngFromBase64(filePath, b64) {
  await writeFile(filePath, Buffer.from(b64, "base64"));
}

function styleMasterPrompt() {
  return [
    "Create a blank 4:5 carousel style master for a premium Indian real estate Instagram carousel.",
    "This is not a final slide; it is the shared visual system.",
    "Use warm stone background, deep graphite type zones, champagne-gold editorial rules, thin border, consistent logo zone top-left, and slide number/progress zone bottom-left.",
    "Avoid rigid boxed cards and avoid simple image-in-a-rectangle layouts.",
    "Create a flowing connected visual language: overlapping editorial masks, soft architectural cutout edges, image fragments that can continue across slides, gold contour lines, and abstract arch/blob/rounded-plate fields.",
    "The system should feel like one continuous carousel when slides are viewed side by side, not four separate posters.",
    "Do not include final readable marketing copy, phone numbers, QR codes, prices, RERA, maps, or real project claims.",
    "If text is suggested, use only faint non-readable layout blocks, never words.",
  ].join(" ");
}

function slidePrompt(slide, totalSlides) {
  const inputTruth =
    chained && slide.n > 1
      ? "Use the first input image as the style master, the second input image as the previous generated slide to continue from, and the third input image as the factual project visual truth for this slide."
      : "Use the first input image as the style master and the second input image as the factual project visual truth for this slide.";
  const continuity =
    chained && slide.n > 1
      ? "Continue the visual motion from the previous slide: let one abstract shape, contour line, crop direction, or background field feel like it flows into this slide. Do not copy the previous slide exactly."
      : "Establish the opening visual language for the carousel so later slides can continue it.";
  const textDirection = bakeText
    ? [
        "Render the following final text cleanly and legibly, with correct spelling. Do not add any other words.",
        `Headline: ${slide.headline}`,
        `Subheadline: ${slide.subheadline}`,
        `Slide number: ${slide.n}/${totalSlides}`,
        "Use premium editorial typography, large readable headline, restrained subheadline, and a small slide number/progress mark.",
      ].join(" ")
    : [
        "Generate the visual/background/hero composition only; leave clean editable areas for deterministic text overlay.",
        `Text that will be overlaid later, not baked into the image: headline '${slide.headline}', subheadline '${slide.subheadline}', slide number '${slide.n}/${totalSlides}'.`,
        "Do not render final text, placeholder words, fake logos, internal template names, asset IDs, phone numbers, QR codes, RERA IDs, prices, websites, or extra claims inside the image.",
      ].join(" ");

  return [
    `Create slide ${slide.n} of the same 4:5 premium real estate carousel visual system.`,
    `Slide role: ${slide.role}.`,
    inputTruth,
    continuity,
    "Keep a cohesive luxury real-estate social design, but avoid rigid boxy templates. Blend the project image into the layout using masks, cutouts, editorial crops, torn-paper-like soft edges, depth layers, and atmospheric gradients.",
    "The factual asset may be cropped, masked, extended with abstract background, or blended into a design field, but its real visible architecture/amenity truth must not be changed.",
    "Preserve the selected asset's architecture/amenity geometry, proportions, facade rhythm, balcony/window pattern, pool shape, entrance form, and material character.",
    "Do not redraw the building into a different structure.",
    "Do not add project names, logos, signage, hoardings, glowing letters, banners, or word-like markings onto the building facade.",
    "Do not add ocean, skyline, roads, people, vehicles, or extra surroundings unless already visible in the input asset.",
    textDirection,
  ].join(" ");
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const selectedSlides = slideAssets.slice(0, Math.max(1, Math.min(slideLimit, slideAssets.length)));
  const manifest = {
    created_at: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "api",
    responses_model: responsesModel,
    image_model: imageModel,
    size,
    out_dir: outDir,
    chained,
    bake_text: bakeText,
    slides: selectedSlides,
  };

  const masterPayload = {
    model: responsesModel,
    tools: [imageGenTool()],
    input: styleMasterPrompt(),
  };

  manifest.style_master_prompt = styleMasterPrompt();
  manifest.style_master_payload_preview = masterPayload;

  if (dryRun) {
    manifest.slide_prompts = selectedSlides.map((slide) => ({
      slide: slide.n,
      role: slide.role,
      asset_path: slide.assetPath,
      prompt: slidePrompt(slide, selectedSlides.length),
    }));
    const manifestPath = path.join(outDir, "dry-run-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Dry run wrote ${manifestPath}`);
    return;
  }

  console.log("Generating carousel style master...");
  const masterResponse = await callResponses(masterPayload);
  const masterPng = path.join(outDir, "00-style-master.png");
  await writePngFromBase64(masterPng, extractImageBase64(masterResponse));
  manifest.style_master_response_id = masterResponse.id;
  manifest.style_master_path = masterPng;

  const masterDataUrl = await dataUrl(masterPng);
  manifest.generated_slides = [];
  let previousSlideDataUrl = null;
  let previousResponse = null;

  for (const slide of selectedSlides) {
    console.log(`Generating slide ${slide.n}: ${slide.role}`);
    const content = [
      { type: "input_text", text: slidePrompt(slide, selectedSlides.length) },
      { type: "input_image", image_url: masterDataUrl },
    ];
    if (chained && previousSlideDataUrl) {
      content.push({ type: "input_image", image_url: previousSlideDataUrl });
    }
    content.push({ type: "input_image", image_url: await dataUrl(slide.assetPath) });

    const payload = {
      model: responsesModel,
      tools: [imageGenTool()],
      previous_response_id: chained && previousResponse ? previousResponse.id : masterResponse.id,
      input: [
        {
          role: "user",
          content,
        },
      ],
    };

    const response = await callResponses(payload);
    const outPath = path.join(outDir, `slide-${String(slide.n).padStart(2, "0")}-${slide.role}.png`);
    await writePngFromBase64(outPath, extractImageBase64(response));
    manifest.generated_slides.push({
      slide: slide.n,
      role: slide.role,
      response_id: response.id,
      asset_path: slide.assetPath,
      output_path: outPath,
      prompt: slidePrompt(slide, selectedSlides.length),
    });
    previousResponse = response;
    previousSlideDataUrl = await dataUrl(outPath);
  }

  const manifestPath = path.join(outDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Done. Manifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
