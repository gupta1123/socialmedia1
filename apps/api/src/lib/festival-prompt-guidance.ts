import type { FestivalRecord } from "@image-lab/contracts";

type FestivalPromptInput = Pick<
  FestivalRecord,
  "id" | "code" | "name" | "category" | "community" | "regions" | "meaning" | "dateLabel" | "nextOccursOn"
>;

type FestivalVisualRecipe = {
  background: string;
  mainComposition: string;
  typography: string;
  decorative: string;
  styleMood: string;
  negativePrompt: string;
};

export function buildFestivalPromptGuidance(
  festival: FestivalPromptInput | null | undefined,
  brandName?: string | null
) {
  if (!festival) {
    return {
      manifest: null,
      seedClauses: [] as string[],
      finalClauses: [] as string[]
    };
  }

  const recipe = getFestivalVisualRecipe(festival);
  const manifest = {
    id: festival.id,
    code: festival.code,
    name: festival.name,
    category: festival.category,
    community: festival.community,
    regions: festival.regions,
    meaning: festival.meaning,
    dateLabel: festival.dateLabel,
    nextOccursOn: festival.nextOccursOn,
    visualRecipe: recipe
  };

  const occasionLine = festival.dateLabel
    ? `Occasion timing: ${festival.dateLabel}.`
    : festival.nextOccursOn
      ? `Occasion timing: ${festival.nextOccursOn}.`
      : null;

  return {
    manifest,
    seedClauses: [
      `Festival context: ${festival.name}.`,
      occasionLine,
      `Meaning: ${festival.meaning}.`,
      `Treat this as a culturally respectful festive greeting for ${festival.name}, using cues that match the occasion instead of generic celebration clutter.`,
      `Festive greeting rule: this is a standalone greeting poster, not a property ad. Do not use project renders, amenities, pricing, location facts, RERA, sales CTA, or real-estate copy blocks unless the brief explicitly asks for a project-linked festive post.`,
      `Do not assume or require input reference images for festive greetings. Build the direction from festival symbolism, color language, typography, and negative space unless explicit references are attached.`,
      `Background direction: ${recipe.background}`,
      `Main composition direction: ${recipe.mainComposition}`,
      `Typography direction: ${recipe.typography}`,
      `Decorative direction: ${recipe.decorative}`,
      `Style and mood: ${recipe.styleMood}`,
      brandName
        ? `Use the exact brand name "${brandName}" as plain text only in a small, understated footer or signature line if brand attribution is shown.`
        : null,
      `Do not generate, invent, or imply any logo, monogram, emblem, icon mark, or house symbol. Brand attribution must be text-only.`,
      `Negative prompt cues: ${recipe.negativePrompt}`
    ].filter(Boolean) as string[],
    finalClauses: [
      `Festival: ${festival.name}.`,
      occasionLine,
      `Meaning: ${festival.meaning}.`,
      `The greeting should feel specifically appropriate to ${festival.name}. Avoid mixing symbolism, color language, or rituals from unrelated festivals.`,
      `Keep festive cues refined, respectful, and brand-safe rather than loud or novelty-led.`,
      `Write this as a highly detailed poster-style image prompt, not a vague concept note. Spell out the background, central symbolic arrangement, typography placement, decorative accents, style treatment, and a short negative prompt.`,
      `Do not use project buildings, facades, amenities, brochures, floor plans, maps, or sales overlays unless the brief explicitly asks for a project-linked festive greeting.`,
      `Background direction: ${recipe.background}`,
      `Main composition direction: ${recipe.mainComposition}`,
      `Typography direction: ${recipe.typography}`,
      `Decorative direction: ${recipe.decorative}`,
      `Style and mood: ${recipe.styleMood}`,
      brandName
        ? `If brand attribution is included, render the exact brand name "${brandName}" as plain text only in a small footer, signature line, or understated credit.`
        : null,
      `Do not render any logo, monogram, emblem, icon mark, brand symbol, or house icon. Use text-only brand attribution.`,
      `Negative prompt: ${recipe.negativePrompt}`
    ].filter(Boolean) as string[]
  };
}

function getFestivalVisualRecipe(festival: FestivalPromptInput): FestivalVisualRecipe {
  switch (festival.code) {
    case "ugadi":
      return {
        background:
          "Use a soft light grey or warm ivory background with a subtle flowing wave texture and a faint large mandala or rangoli pattern in pale beige behind the main arrangement.",
        mainComposition:
          "Feature one clean Ugadi arrangement with a ceremonial kalash, fresh mango leaves, marigold flowers, a rich festive cloth, and simple fruit offerings such as mangoes or bananas. Keep the arrangement centered or right-weighted, dignified, and uncluttered.",
        typography:
          "Place the greeting in a calm premium hierarchy with a small sans-serif opener, a large elegant serif festival name, and one short blessing line. Keep generous negative space so the greeting feels like a premium card, not a busy flyer.",
        decorative:
          "Use restrained floral or leaf accents in opposite corners, keeping them glossy, festive, and sparse rather than ornamental everywhere.",
        styleMood:
          "Clean, minimal, festive, elegant. Prefer flat-vector or semi-illustrative poster language with crisp edges, polished gradients, and bright Indian festival colors such as red, gold, orange, green, and white.",
        negativePrompt:
          "photorealistic 3D render, messy background, dark muddy colors, extra text blocks, watermark, distorted fruit, blurry flowers, asymmetrical layout, crowded design, neon palette, logo, monogram, icon mark, house icon"
      };
    case "maha-shivaratri":
      return {
        background:
          "Use a calm moonlit indigo, stone, or charcoal-toned background with a faint sacred-geometry or mandala pattern and lots of quiet negative space.",
        mainComposition:
          "Create one dignified central Shiva-linked arrangement such as a brass trishul with a tied damaru, crescent moon cue, bilva leaves, soft diya glow, or a serene symbolic altar treatment. Keep it devotional, still, and uncluttered.",
        typography:
          "Use elegant premium typography with a restrained sans-serif or serif pairing. The festival name should feel graceful and composed, with only one short blessing line if needed.",
        decorative:
          "Add sparse sacred accents such as bilva leaves, rudraksha detail, or a very subtle temple-bell or mandala flourish. Keep the frame quiet and balanced.",
        styleMood:
          "Serene, devotional, premium, still, respectful. Prefer a polished illustrated or graphic-poster treatment over photoreal religious realism or loud festive collage.",
        negativePrompt:
          "crowded temple scene, photorealistic deity portrait, gaudy collage, excessive glow, neon palette, clipart icons, heavy text blocks, sales poster layout, building render, logo, monogram, icon mark, house symbol"
      };
    case "diwali":
    case "deepavali":
      return {
        background:
          "Use a warm ivory, midnight, or muted charcoal background with subtle rangoli or mandala texture and a soft golden festive glow.",
        mainComposition:
          "Center the design on a refined festive arrangement of brass diyas, marigold flowers, and elegant light cues. Keep the composition symmetrical or gently offset, never cluttered.",
        typography:
          "Use a graceful greeting hierarchy with a prominent elegant festival name and minimal supporting copy. Preserve clear negative space and safe zones.",
        decorative:
          "Add restrained corner accents such as rangoli fragments, marigold petals, or lamp glow, keeping them premium and sparse.",
        styleMood:
          "Warm, luminous, celebratory, polished, premium. Favor illustrated or graphic greeting-poster styling instead of sales-banner energy.",
        negativePrompt:
          "fireworks overload, photorealistic 3D scene, gaudy glitter, neon colors, crowded layout, extra slogans, property brochure elements, sales CTA, logo, monogram, icon mark, house icon"
      };
    default:
      return {
        background:
          "Use a soft neutral or festival-appropriate color field with a subtle cultural pattern, faint mandala, or refined textured wash and generous negative space.",
        mainComposition:
          "Build one clear symbolic festive arrangement rooted in the occasion's meaning, with a single focal cluster rather than many disconnected elements.",
        typography:
          "Use an elegant greeting-card hierarchy with a small opener, a prominent festival name, and only one short blessing line if needed.",
        decorative:
          "Keep corner or edge accents minimal and culturally appropriate, using floral, leaf, rangoli, or ceremonial motifs only where they help balance the composition.",
        styleMood:
          "Clean, premium, culturally respectful, modern social-poster aesthetic. Prefer illustrated, vector-like, or polished graphic language over photoreal clutter.",
        negativePrompt:
          "photorealistic 3D render, busy background, excessive objects, neon palette, low quality, watermark, crowded flyer layout, unrelated festival symbols, sales-banner styling, logo, monogram, icon mark, house icon"
      };
  }
}
