import type { BrandAssetRecord, CreativeBrief, PostTypeRecord, ProjectProfile } from "@image-lab/contracts";
import { resolveAmenityFocus } from "./creative-reference-selection.js";
import { deriveAspectRatio } from "./utils.js";

type PostTypePromptInput = {
  brandName: string;
  brief: Pick<CreativeBrief, "channel" | "format" | "goal" | "prompt" | "exactText" | "templateType" | "copyMode" | "offer">;
  postType: Pick<PostTypeRecord, "code" | "name" | "config"> | null | undefined;
  projectName: string | null | undefined;
  projectProfile: ProjectProfile | null | undefined;
  brandAssets?: BrandAssetRecord[] | null | undefined;
  projectId?: string | null | undefined;
};

type PostTypeVisualRecipe = {
  key: string;
  direction: string;
  hero: string;
  layout: string;
  typography: string;
  supportingSystem: string;
  footer: string;
  styleMood: string;
  negativePrompt: string;
};

export type PostTypePromptGuidance = {
  seedClauses: string[];
  finalClauses: string[];
  manifest: {
    code: string | null;
    name: string | null;
    aspectRatio: string;
    usesProjectImage: boolean;
    recipeKey: string | null;
    recipeDirection: string;
    negativePrompt: string;
    amenityFocus?: string | null;
    amenitySelectionSource?: "explicit" | "inferred" | "none";
    playbookKey?: string | null;
  };
};

export function buildPostTypePromptGuidance(input: PostTypePromptInput): PostTypePromptGuidance {
  const aspectRatio = deriveAspectRatio(input.brief.format);
  const postType = input.postType;
  const projectHasActualImage = Boolean(input.projectProfile?.actualProjectImageIds.length);

  if (!postType) {
    return emptyGuidance(aspectRatio);
  }

  switch (postType.code) {
    case "construction-update":
      return buildConstructionUpdateGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    case "amenity-spotlight":
      return buildAmenitySpotlightGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    case "project-launch":
      return buildProjectLaunchGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    case "site-visit-invite":
      return buildSiteVisitInviteGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    case "location-advantage":
      return buildLocationAdvantageGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    case "testimonial":
      return buildTestimonialGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    case "festive-greeting":
      return buildFestiveGreetingGuidance({
        ...input,
        aspectRatio,
        projectHasActualImage
      });
    default:
      return {
        seedClauses: [],
        finalClauses: [],
        manifest: {
          code: postType.code,
          name: postType.name,
          aspectRatio,
          usesProjectImage: false,
          recipeKey: null,
          recipeDirection: "",
          negativePrompt: ""
        }
      };
  }
}

function buildConstructionUpdateGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "editorial-progress-band",
        direction: "Editorial construction progress poster with a large hero site photo, left-led headline stack, and a premium metric band across the lower third.",
        hero:
          "Use a real construction-stage building image as the hero visual. Favor golden-hour or warm late-afternoon light, exposed concrete, tower cranes, scaffolding, safety rails, glazing in progress, and truthful structural detail.",
        layout:
          "Keep the building dominant in the right and center of frame. Place the headline system on the upper-left with a restrained dark gradient or tinted overlay behind copy for readability while preserving the construction photo.",
        typography:
          "Use a strong uppercase modern sans headline for the main update title, a smaller refined kicker above it, and one short supporting line below. Keep the hierarchy premium, brochure-like, and clean rather than loud.",
        supportingSystem:
          "Add a dark navy or charcoal semi-transparent metric panel in the lower portion with 2 to 4 credible progress highlights, a date marker, and one delivery-confidence line. Use icons sparingly and keep the panel elegant, not infographic-heavy.",
        footer:
          "Finish with a minimal premium footer strip or trust row that carries short values such as quality, safety, and delivery discipline without turning into a dense checklist.",
        styleMood:
          "Premium, trustworthy, polished, editorial, construction-real, sunset-lit, expensive-looking.",
        negativePrompt:
          "cheap flyer, cartoon construction site, unrealistic architecture, flat low-detail building, distorted cranes, cluttered infographic, gaudy brochure, too much copy, watermark, random logo, neon palette"
      },
      {
        key: "sunset-site-journal",
        direction: "Luxury site-journal style progress update with more breathing room in the upper third and a slimmer data treatment anchored low in the composition.",
        hero:
          "Use the project's actual construction image when available, prioritizing truthful site progress, structure, cranes, deck edges, and premium evening light rather than fully finished fantasy architecture.",
        layout:
          "Let the building rise through the center-right of the frame with open sky or atmospheric space on the left for typography. Use one subtle shadowed gradient wash behind text, not multiple graphic boxes.",
        typography:
          "Treat the heading like an editorial cover: a small sophisticated topper, a bold progress headline, and one refined support sentence. The tone should feel calm, credible, and milestone-led.",
        supportingSystem:
          "Use a compact lower progress module with milestone percentages, an update timestamp, and one concise delivery-status line. Keep data blocks aligned, evenly spaced, and visually quiet.",
        footer:
          "Use a narrow premium footer with one short brand-safe closing statement and 2 to 3 small trust cues. Avoid over-explaining.",
        styleMood:
          "Realistic construction photography blended with sleek brochure graphics, balanced whitespace, sharp type, navy-cream-gold accents, and premium trust energy.",
        negativePrompt:
          "busy sales banner, cheap brochure clutter, muddy dusk photo, fake completion render, clipart tools, dense metric grid, distorted scaffolding, exaggerated HDR, watermark, icon spam"
      },
      {
        key: "progress-dashboard-luxe",
        direction: "High-end progress bulletin with a stronger lower information panel but still anchored in a premium real-estate photo rather than a flat dashboard graphic.",
        hero:
          "Use the project construction image as the dominant hero element and preserve visible structure, scaffolding, glazing, railings, and realistic light falloff. It should still read as a real building update first.",
        layout:
          "Keep the hero image full-frame with the building weighted to the right. Put the title cluster upper-left or center-left, and use one clean dark overlay for legibility. The lower panel can stretch across the frame if it stays elegant.",
        typography:
          "Use crisp sans-serif hierarchy with one refined script or premium accent word if it helps, but do not let typography feel wedding-card ornamental.",
        supportingSystem:
          "The bottom panel can carry multiple progress metrics, one date badge, and one on-track statement. It should feel like polished developer communication, not an overcrowded site report.",
        footer:
          "End with a subtle footer strip using short assurance phrases and a restrained closing line that reinforces long-term build quality.",
        styleMood:
          "Trust-building, premium, modern, polished, graphically disciplined, photography-led.",
        negativePrompt:
          "generic dashboard ui, cheap flyer, low-resolution site photo, cluttered panel, construction clipart, fake lens flares, distorted perspective, random extra text, logo inventions, low-end brochure"
      }
    ],
    buildSeed(input)
  );

  const projectImageLine = input.projectHasActualImage
    ? `Treat the actual project construction image as the hero reference when one is available. Build the composition around that truthful site image instead of generic architecture.`
    : `If no real project image is supplied, still write the prompt as a realistic construction-stage hero image with truthful structure, cranes, and site detail rather than a finished fantasy tower.`;

  const variableCopyLine =
    "Do not default to one canned update headline, date, or percentage treatment on every run. Vary the visual route, framing, and whether any neutral update text is used at all. Keep any copy short, factual, and grounded in the brief or project truth.";

  return {
    seedClauses: compactStrings([
      `Construction-update direction family: ${recipe.direction}`,
      projectImageLine,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Progress panel rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep this scene-first. The recognizable project and believable construction stage should lead; if any text is used, reserve only a small readable area.`,
      `Style and mood: ${recipe.styleMood}`,
      `Generate materially different progress directions by varying stage interpretation, framing, environmental mood, and text usage while keeping the same project identity central.`,
      variableCopyLine,
      `Negative prompt cues: ${recipe.negativePrompt}`,
      `If truth references are supplied, refer to them only in plain language by role. Never say "Image 1", "Image 2", "first image", or list filenames. Keep the prompt single-scene and single-output.`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed premium construction-progress image prompt, not a generic summary.`,
      projectImageLine,
      `Composition family: ${recipe.direction}`,
      `Hero photography direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Progress panel treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: Make the same project identity and visible progress do the work. Use only a minimal readable reserve or one neutral update label if needed; avoid template-like update systems.`,
      `Style and mood: ${recipe.styleMood}`,
      variableCopyLine,
      input.brief.exactText
        ? `If explicit metrics, dates, or copy are supplied in the brief, preserve them exactly and build the visual system around them.`
        : `If exact metrics are not supplied, keep copy concise and credible. Use short milestone language rather than inventing overly specific technical numbers.`,
      `Negative prompt: ${recipe.negativePrompt}`,
      `CRITICAL: Reference any supplied truth or style images only in plain language by role. Never say "Image 1 is X, Image 2 is Y", and never enumerate filenames.`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: true,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt
    }
  };
}

function buildAmenitySpotlightGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "single-amenity-editorial",
        direction: "Premium single-amenity spotlight with one hero amenity scene and restrained supporting copy.",
        hero:
          "Build the image around one clear amenity hero, not a collage of the clubhouse, pool, garden, gym, and kids zone all at once. The chosen amenity should dominate the frame and feel aspirational, premium, and believable.",
        layout:
          "Use a clean editorial composition with one primary visual subject and calm negative space. If a project image is also supplied, use it only as supporting brand-truth context, not as a competing second hero.",
        typography:
          "Keep the copy hierarchy light and premium: one amenity title, one short supporting line, and optionally one small project or locality cue.",
        supportingSystem:
          "If secondary detail is needed, limit it to one subtle supporting note such as the lifestyle benefit or one micro feature. Use at most one compact info chip or location cue. Do not list multiple amenities in the same frame.",
        footer:
          "End with a minimal footer or signature strip for brand-safe attribution or a soft enquiry cue. The amenity should remain the star.",
        styleMood:
          "Lifestyle-led, elevated, premium, calm, clean, polished real-estate social creative.",
        negativePrompt:
          "amenity collage, too many facilities at once, cluttered resort brochure, low-end flyer, random icons, excessive copy, multiple competing scenes, watermark, logo invention"
      },
      {
        key: "luxury-lifestyle-focus",
        direction: "Luxury lifestyle amenity poster that translates one chosen amenity into an aspirational premium scene.",
        hero:
          "Choose one amenity and make it the singular focal subject. The chosen amenity should feel immersive and premium, with believable lighting, materials, and real-estate lifestyle cues rather than generic stock imagery.",
        layout:
          "Balance one amenity hero visual with calm breathing room and disciplined composition. Avoid splitting the frame into multiple amenity cards or brochure-style blocks.",
        typography:
          "Use a crisp premium hierarchy with one amenity-led headline, a short support line, and restrained copy density.",
        supportingSystem:
          "Optional supporting detail can highlight one lifestyle benefit, but the design must still read as one amenity spotlight rather than a feature sheet.",
        footer:
          "Keep the footer subtle with light attribution or soft CTA language only.",
        styleMood:
          "Premium lifestyle marketing, polished, architecture-aware, refined, quiet confidence, clean whitespace.",
        negativePrompt:
          "multi-panel amenity list, busy brochure grid, cheap clubhouse ad, too many benefit bullets, cartoon resort icons, neon treatment, fake luxury cliché, watermark, random symbols"
      }
    ],
    buildSeed(input)
  );

  const amenityChoice = chooseAmenityFocus(input);
  const uniqueAmenityPool = Array.from(new Set([
    ...(input.projectProfile?.heroAmenities ?? []),
    ...(input.projectProfile?.amenities ?? [])
  ]));
  const amenityLine = amenityChoice.focusAmenity
    ? amenityChoice.source === "explicit"
      ? `The brief already names the amenity "${amenityChoice.focusAmenity}". Spotlight that specific amenity and do not switch to a different one.`
      : `You MUST spotlight exactly this amenity: "${amenityChoice.focusAmenity}". Do NOT select any other amenity. The available amenity pool is: ${uniqueAmenityPool.slice(0, 10).join(", ")}${uniqueAmenityPool.length > 10 ? "..." : ""}.`
    : `CRITICAL: You must pick exactly ONE amenity from this list only: ${uniqueAmenityPool.join(", ")}. Do NOT invent or assume any amenity not in this list. Pick the most suitable one based on the brief.`;

  const availableAmenitiesClause = `Available amenities for this project: ${uniqueAmenityPool.slice(0, 20).join(", ")}${uniqueAmenityPool.length > 20 ? ", and " + (uniqueAmenityPool.length - 20) + " more" : ""}. You MUST select from this list only.`;

  return {
    seedClauses: compactStrings([
      `Amenity-spotlight direction family: ${recipe.direction}`,
      amenityLine,
      availableAmenitiesClause,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Supporting-system rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep the selected amenity as the unmistakable hero. If text is used, reserve only a small readable area and keep supporting copy minimal.`,
      `Style and mood: ${recipe.styleMood}`,
      `If the project profile contains many amenities, treat them as the choice pool, not as a checklist to show all at once.`,
      `Negative prompt cues: ${recipe.negativePrompt}`,
      `If truth or style references are supplied, describe their roles in plain language only. Do NOT say "Image 1", "Image 2", "the first image", "the second image", or list filenames. Keep the prompt single-scene and single-output.`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed single-amenity spotlight prompt, not a generic amenities poster.`,
      amenityLine,
      availableAmenitiesClause,
      `Composition family: ${recipe.direction}`,
      `Hero direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Supporting treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: The image must read as one amenity-led scene, not a template. At most one short supporting cue is allowed if it materially helps.`,
      `Style and mood: ${recipe.styleMood}`,
      `Keep the output focused on one amenity per image. Do not merge the pool, gym, clubhouse, and garden into one crowded layout unless the brief explicitly asks for a multi-amenity collage.`,
      `Negative prompt: ${recipe.negativePrompt}`,
      `CRITICAL: Reference any supplied truth or style images only in plain language by role. Never say "Image 1 is X, Image 2 is Y", and never enumerate filenames.`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: true,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt,
      amenityFocus: amenityChoice.focusAmenity,
      amenitySelectionSource: amenityChoice.source,
      playbookKey: getPlaybookKey(input.postType?.code)
    }
  };
}

function getPlaybookKey(postTypeCode: string | null | undefined): string | null {
  if (!postTypeCode) return null;
  const mapping: Record<string, string> = {
    "construction-update": "construction-update-playbook",
    "amenity-spotlight": "amenity-spotlight-playbook",
    "project-launch": "launch-post-playbook",
    "site-visit-invite": "site-visit-playbook",
    "location-advantage": "location-advantage-playbook",
    "testimonial": "testimonial-playbook",
    "festive-greeting": "festival-post-playbook"
  };
  return mapping[postTypeCode] ?? null;
}

function buildProjectLaunchGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "facade-editorial-reveal",
        direction: "Premium property-image reveal with the project facade or tower image dominating the frame and a clean editorial launch hierarchy.",
        hero:
          "Use the actual project building image as the hero visual when available. Favor a polished premium facade or tower view, truthful materials, crisp skyline, and warm light that makes the property feel aspirational and real.",
        layout:
          "Let the building dominate the frame. Preserve one calm readable reserve only where text is necessary, with clean negative space and no brochure-grid behavior.",
        typography:
          "Use a premium launch hierarchy with a small kicker, a strong uppercase or editorial-serif project title area, and one short support line. Keep text restrained and hero-led.",
        supportingSystem:
          "Add only one supporting content zone if needed, such as a location cue, launch note, or refined availability line. Use at most one compact chip or divider treatment. Avoid turning the layout into a brochure grid.",
        footer:
          "Use a narrow bottom footer or signature strip for brand-safe trust language, a micro CTA, or understated attribution. It should feel expensive and quiet.",
        styleMood:
          "Premium, aspirational, polished, architecture-led, clean, brochure-editorial, high-end real-estate marketing.",
        negativePrompt:
          "cheap flyer, cluttered brochure, distorted tower, fake luxury clichés, random skyline collage, overpacked amenities icons, neon colors, logo inventions, watermark, text artifacts"
      },
      {
        key: "skyline-launch-poster",
        direction: "Luxury launch poster with a strong hero building image, airy upper typography zone, and minimal supporting sales language.",
        hero:
          "Use the project tower or facade photo/render as the hero element. Keep the architecture dominant and premium, with believable proportions, crisp edges, and soft premium light.",
        layout:
          "Open up calm negative space in the upper third or left side only if text needs support. The building must remain visible, impressive, and dominant.",
        typography:
          "Treat the project name like the star. Use one refined heading system and a short supporting sentence. Avoid multiple competing text blocks.",
        supportingSystem:
          "Optional supporting details can appear as one small launch/status line, one location line, or one restrained credential. Keep the rest of the frame visually quiet.",
        footer:
          "Close with a premium footer accent, light CTA cue, or understated statement rather than a dense sales panel.",
        styleMood:
          "Hero-led, premium reveal, warm and aspirational, expensive-looking, graphic restraint with strong architectural presence.",
        negativePrompt:
          "crowded property flyer, low-end brochure look, fake glass reflections, overly saturated sky, busy icon grid, too many badges, distorted balconies, neon gradients, watermark, random logos"
      },
      {
        key: "residence-hero-brochure",
        direction: "Brochure-like property hero built around the project image with strong luxury hierarchy and disciplined copy zones.",
        hero:
          "Anchor the visual in the supplied project building image, prioritizing truthful facade detail, materiality, light, and scale. The property should be the unmistakable focal subject.",
        layout:
          "Use the project image full-frame or near full-frame, with the building carrying the center/right. Keep copy to one strong heading block and one compact support block. Use overlays only as much as needed for clarity.",
        typography:
          "Use a polished serif-sans or modern sans hierarchy with premium spacing and calm emphasis. The launch should feel credible and expensive, not flashy.",
        supportingSystem:
          "If additional information is needed, keep it to one premium chip, line, or micro-panel such as launch phase, configuration cue, or locality note. Avoid multi-column clutter.",
        footer:
          "Use a refined footer strip or corner signature for subtle trust cues, but leave enough breathing room that the property image still leads.",
        styleMood:
          "Luxury developer poster, minimal, balanced, premium brochure energy, architectural realism blended with sleek graphic design.",
        negativePrompt:
          "salesy discount ad, cluttered grid, low-resolution building, warped facade, generic stock building, too many text boxes, cheap gold effects, watermark, icon clutter, random brand marks"
      }
    ],
    buildSeed(input)
  );

  const projectImageLine = input.projectHasActualImage
    ? `Treat the actual project building image as the hero reference when one is available. Use it as the dominant visual rather than generic architecture or invented towers.`
    : `If no real project image is attached, still write the prompt as a premium property-image hero poster with believable real-estate architecture, disciplined composition, and minimal brochure clutter.`;

  const variableCopyLine =
    "Do not reuse one canned launch headline or the same supporting copy every time. Keep the detailed property-hero structure, but adapt the headline, support line, and supporting cue to the project name, goal, positioning, and brief.";

  return {
    seedClauses: compactStrings([
      `Project-launch direction family: ${recipe.direction}`,
      projectImageLine,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Supporting-zone rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep this building-led and scene-first. If text is used, it should sit in one calm readable reserve with minimal supporting copy.`,
      `Style and mood: ${recipe.styleMood}`,
      `Explore launch directions by varying the negative space, overlay treatment, and title pacing while keeping the project image as the primary hero.`,
      variableCopyLine,
      `Negative prompt cues: ${recipe.negativePrompt}`,
      `If truth or style references are supplied, refer to them only in plain language by role. Do NOT say "Image 1", "Image 2", or list filenames. Keep the prompt single-scene and single-output.`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed premium property-image / project-launch prompt, not a generic concept note.`,
      projectImageLine,
      `Composition family: ${recipe.direction}`,
      `Hero photography direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Supporting zone treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: The building is the hero subject. Use only one readable reserve and one short supporting cue at most; avoid brochure-grid clutter.`,
      `Style and mood: ${recipe.styleMood}`,
      variableCopyLine,
      input.brief.exactText
        ? `If exact launch copy is supplied, preserve it and organize the hierarchy around it rather than inventing replacement copy.`
        : `Keep supporting copy concise. Prioritize the building image and project-name hierarchy over dense claims or too many facts.`,
      `Negative prompt: ${recipe.negativePrompt}`,
      `CRITICAL: Reference any supplied truth or style images only in plain language by role. Never say "Image 1 is X, Image 2 is Y", and never enumerate filenames.`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: true,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt
    }
  };
}

function buildSiteVisitInviteGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "visit-hero-invite",
        direction: "Project-image-led site visit invite with a strong hero building visual and a crisp booking-safe CTA zone.",
        hero:
          "Use the actual project building image as the hero visual whenever available. Let the architecture carry credibility and aspiration so the invite feels grounded in a real project, not a generic event flyer.",
        layout:
          "Keep the project image dominant, with open negative space for the invite message and a protected CTA zone. Use one soft overlay or gradient for readability without burying the building.",
        typography:
          "Use a clear invitation hierarchy: one headline, one supporting line, and one direct CTA line. Keep it premium and confident, not discount-led or noisy.",
        supportingSystem:
          "Optional supporting cues can include visit timing, launch phase, or one locality cue, but the design should still read as a polished visit invitation first. Use at most one compact badge or cue line.",
        footer:
          "Use a compact footer or CTA band with clean booking-safe spacing. Preserve room for exact visit copy if provided.",
        styleMood:
          "Premium, inviting, trustworthy, conversion-aware, polished real-estate event poster.",
        negativePrompt:
          "cheap event flyer, crowded offer banner, too many badges, generic stock visitors, cluttered CTA blocks, low-resolution building, watermark, random logos, neon sale styling"
      },
      {
        key: "luxury-open-house-card",
        direction: "Premium open-house / site-visit social invite anchored in the project facade with a calm high-trust call to action.",
        hero:
          "Anchor the composition in the project image so the building feels real and visitable. Preserve facade detail, warm light, and an aspirational but truthful presentation.",
        layout:
          "Use a hero-led composition with a clear invitation block in the upper or lower third. Keep the CTA protected and readable, and avoid too many competing text zones.",
        typography:
          "Use refined sans-serif or serif-sans hierarchy with one invitation headline, one concise benefit line, and one strong CTA.",
        supportingSystem:
          "Secondary details should stay minimal: maybe one location or timing cue, not a busy schedule table.",
        footer:
          "Finish with one understated booking or contact cue in a premium footer treatment.",
        styleMood:
          "Sophisticated, premium, project-real, invite-led, balanced, calm, credible.",
        negativePrompt:
          "cheap registration poster, heavy discount language, collage of people, generic event signage, brochure clutter, too many icons, warped building, watermark, logo inventions"
      }
    ],
    buildSeed(input)
  );

  const projectImageLine = input.projectHasActualImage
    ? `Treat the actual project building image as the hero reference for this site-visit invite.`
    : `If no actual project image is attached, still write the prompt as a premium project-led site-visit invite with believable real-estate architecture as the hero.`;

  return {
    seedClauses: compactStrings([
      `Site-visit-invite direction family: ${recipe.direction}`,
      projectImageLine,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Supporting-system rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep the real project image dominant and invitation-led. Use a small readable reserve only if text or CTA is truly needed.`,
      `Style and mood: ${recipe.styleMood}`,
      `Generate materially different invite directions by varying the CTA-band treatment, overlay density, and headline placement while keeping the project image central.`,
      `Negative prompt cues: ${recipe.negativePrompt}`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed premium site-visit invite prompt, not a generic announcement.`,
      projectImageLine,
      `Composition family: ${recipe.direction}`,
      `Hero direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Supporting treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: Let the invite read cleanly from one dominant project scene with one protected readable reserve at most.`,
      `Style and mood: ${recipe.styleMood}`,
      input.brief.copyMode === "auto"
        ? `If copy mode is auto, the model may decide whether a headline or CTA is needed at all. Keep any copy sparse, premium, and booking-safe.`
        : `If exact visit or CTA text is supplied, preserve it and keep the booking-safe area visually protected.`,
      `Negative prompt: ${recipe.negativePrompt}`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: true,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt
    }
  };
}

function buildLocationAdvantageGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "context-led-editorial",
        direction: "Connectivity-led editorial poster that frames the project or location context with one disciplined text-safe zone and one compact location cue system.",
        hero:
          "Use a truthful project or context image that supports place recognition. Favor premium street, aerial, or context-led framing that feels urban, believable, and specific rather than a generic skyline collage.",
        layout:
          "Keep one dominant context or project image, one headline-safe negative-space zone, and one restrained support/callout zone. Avoid screenshot-map behavior, arrow clutter, or infographic-heavy layouts.",
        typography:
          "Use one strong location headline, one short support line, and optionally one compact locality or corridor cue. Keep the hierarchy premium and editorial.",
        supportingSystem:
          "Use only one restrained contextual detail treatment such as a compact landmark line, corridor note, or small location chip. Do not create route diagrams or dense travel-time blocks.",
        footer:
          "Use a quiet footer or signature strip that reinforces premium positioning without becoming a dense fact bar.",
        styleMood:
          "Urban, premium, connected, credible, editorial, calm, place-aware.",
        negativePrompt:
          "generic city collage, fake map screenshot, cluttered route arrows, invented landmarks, unsupported travel times, cheap flyer, dense infographic, watermark"
      },
      {
        key: "project-with-context-frame",
        direction: "Project-plus-context premium poster that keeps the project recognizable while quietly communicating premium geographic positioning.",
        hero:
          "Use the project or its surrounding context as the main visual truth. Keep the scene believable and premium, with enough context to suggest accessibility or neighborhood quality without inventing specifics.",
        layout:
          "Balance a dominant hero image with a clean text-safe area and one small context cue. Use only restrained overlays and generous breathing room.",
        typography:
          "Use a clean premium headline system with one location-led headline and one supporting line. Avoid long explanatory blocks.",
        supportingSystem:
          "If context details are needed, keep them to one concise line or one subtle badge. The poster should not become a data sheet.",
        footer:
          "Finish with a minimal footer or location signature line only.",
        styleMood:
          "Premium real-estate editorial, quiet confidence, urban context, crisp hierarchy, restrained graphics.",
        negativePrompt:
          "map-heavy flyer, fake metro map, unsupported location claims, busy arrows, dense landmark list, noisy brochure clutter, watermark, typo-heavy text"
      }
    ],
    buildSeed(input)
  );

  const projectImageLine = input.projectHasActualImage
    ? "If a real project or context image is supplied, preserve it as place-recognition truth."
    : "If no real project or context image is supplied, still write the prompt as a premium location-led poster with believable urban context rather than a generic skyline ad.";

  return {
    seedClauses: compactStrings([
      `Location-advantage direction family: ${recipe.direction}`,
      projectImageLine,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Supporting-system rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep one dominant project/context image and let any location cue stay short, sparse, and secondary.`,
      `Style and mood: ${recipe.styleMood}`,
      `Negative prompt cues: ${recipe.negativePrompt}`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed premium location-advantage poster prompt, not a generic skyline or map concept note.`,
      projectImageLine,
      `Composition family: ${recipe.direction}`,
      `Hero direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Supporting treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: Keep this context-led and image-first. At most one compact location cue and one short supporting line are allowed if they materially help clarity.`,
      `Do not invent landmarks, travel times, metro claims, or directional facts that are not present in the brief or project truth.`,
      `Style and mood: ${recipe.styleMood}`,
      `Negative prompt: ${recipe.negativePrompt}`,
      `CRITICAL: Reference any supplied truth or style images only in plain language by role. Never say "Image 1 is X, Image 2 is Y", and never enumerate filenames.`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: input.projectHasActualImage,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt
    }
  };
}

function buildTestimonialGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "editorial-quote-card",
        direction: "Quote-first editorial testimonial poster with a dominant readable quote block and a quiet supporting background.",
        hero:
          "Make the quote block the hero subject. If a portrait, interior, or lifestyle-support image is present, keep it secondary and subtle so the testimonial remains readable and premium.",
        layout:
          "Use one dominant quote zone, one clean attribution-safe area, generous negative space, and a quiet footer/signature strip. Avoid review-widget or card-stack behavior.",
        typography:
          "Use a premium editorial quote hierarchy with one dominant quote, one restrained attribution line, and calm supporting typography.",
        supportingSystem:
          "If graphic support is needed, limit it to one divider, quote-mark accent, or subtle textured panel. Do not add fake review stars, ratings, or feature lists.",
        footer:
          "Keep the footer subtle and brand-safe. It should not compete with the quote.",
        styleMood:
          "Warm, credible, editorial, quiet, premium, trust-building.",
        negativePrompt:
          "fake star rating, review widget, sales brochure clutter, overpowering background image, busy testimonial card, watermark, generic stock ad"
      },
      {
        key: "warm-proof-poster",
        direction: "Warm proof-led testimonial poster with one refined quote block and one understated human or interior support layer.",
        hero:
          "Lead with readable testimonial text. If a supporting person, home, or interior image is used, keep it soft, believable, and secondary.",
        layout:
          "Use one clear quote block, one attribution area, one subtle support-image field or texture, and a disciplined footer zone.",
        typography:
          "Use calm premium typography with generous spacing and clear hierarchy. Keep the quote prominent and the attribution smaller and clean.",
        supportingSystem:
          "Use only one restrained support device such as a texture panel, divider, or quote-mark accent. No badges or stacked proof systems.",
        footer:
          "Use a minimal footer or signature strip only.",
        styleMood:
          "Inviting, polished, readable, premium, human, credible.",
        negativePrompt:
          "fake customer review graphic, app-style review card, loud testimonial flyer, oversized badges, dense feature list, cluttered collage, watermark"
      }
    ],
    buildSeed(input)
  );

  return {
    seedClauses: compactStrings([
      `Testimonial direction family: ${recipe.direction}`,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Supporting-system rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep the testimonial readable and calm. The quote should lead, with only minimal supporting structure around it.`,
      `Style and mood: ${recipe.styleMood}`,
      `Negative prompt cues: ${recipe.negativePrompt}`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed premium testimonial poster prompt, not a generic quote card or review widget.`,
      `Composition family: ${recipe.direction}`,
      `Hero direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Supporting treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: Use one readable quote block with one clean attribution area and only subtle supporting imagery if it helps warmth or credibility.`,
      input.brief.exactText
        ? `Preserve the supplied quote text exactly and build the hierarchy around its readability.`
        : `Keep testimonial copy sparse and readable. Do not invent extra proof copy, review badges, or rating language.`,
      `Style and mood: ${recipe.styleMood}`,
      `Negative prompt: ${recipe.negativePrompt}`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: input.projectHasActualImage,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt
    }
  };
}

function buildFestiveGreetingGuidance(
  input: PostTypePromptInput & { aspectRatio: string; projectHasActualImage: boolean }
): PostTypePromptGuidance {
  const recipe = chooseRecipe(
    [
      {
        key: "symbol-led-greeting",
        direction: "Premium festive greeting poster with one symbolic focal arrangement, clear typographic blessing zone, and generous negative space.",
        hero:
          "Use one calm symbolic focal arrangement or refined festive motif. Do not turn the scene into a property ad or cluttered festival montage.",
        layout:
          "Keep one clear blessing/headline-safe zone, one symbolic focal area, and one small footer/logo zone only if enabled. Preserve generous breathing room.",
        typography:
          "Use one elegant greeting line or blessing, optionally one short support line, and small brand presence only if needed.",
        supportingSystem:
          "If subtle ornament or framing is used, keep it minimal and culturally specific rather than loud or kitsch.",
        footer:
          "Use a tiny footer/signature zone only if brand presence is required.",
        styleMood:
          "Respectful, elegant, calm, premium, ceremonial, restrained.",
        negativePrompt:
          "festival overload, loud kitsch flyer, property-ad clutter, excessive ornament collage, generic clipart, heavy sales text, watermark"
      },
      {
        key: "typographic-ceremonial",
        direction: "Typographic festive poster with a restrained ceremonial backdrop and clean premium hierarchy.",
        hero:
          "Let the greeting message and one ceremonial visual cue share the frame with calm balance. Keep the scene refined and uncluttered.",
        layout:
          "Use a clean text-safe center or upper zone, one quiet symbolic support area, and a very small footer only if needed.",
        typography:
          "Use premium celebratory typography with strong spacing and very sparse copy.",
        supportingSystem:
          "Use minimal framing or texture only. No event-flyer badges, no dense icons, and no property sales panels.",
        footer:
          "Keep the footer tiny, quiet, and secondary.",
        styleMood:
          "Premium greeting, respectful, calm, symbolic, text-led, elegant.",
        negativePrompt:
          "property flyer, festive sales banner, cluttered icon collage, loud gradient kitsch, brochure clutter, watermark, noisy text"
      }
    ],
    buildSeed(input)
  );

  return {
    seedClauses: compactStrings([
      `Festive-greeting direction family: ${recipe.direction}`,
      `Hero image rule: ${recipe.hero}`,
      `Layout rule: ${recipe.layout}`,
      `Typography rule: ${recipe.typography}`,
      `Supporting-system rule: ${recipe.supportingSystem}`,
      `Footer rule: ${recipe.footer}`,
      `Prompt-shape rule: Keep one symbolic focal arrangement, one clean readable blessing area, and generous negative space. Keep it project-free unless the brief explicitly asks otherwise.`,
      `Style and mood: ${recipe.styleMood}`,
      `Negative prompt cues: ${recipe.negativePrompt}`
    ]),
    finalClauses: compactStrings([
      `Write this as a detailed premium festive greeting poster prompt, not a project ad or generic holiday flyer.`,
      `Composition family: ${recipe.direction}`,
      `Hero direction: ${recipe.hero}`,
      `Layout and composition: ${recipe.layout}`,
      `Typography system: ${recipe.typography}`,
      `Supporting treatment: ${recipe.supportingSystem}`,
      `Footer treatment: ${recipe.footer}`,
      `Prompt-shape rule: Use one calm symbolic focal arrangement and one clean greeting area, with only tiny brand presence if enabled. Keep the composition project-free unless the brief explicitly requests project linkage.`,
      `Style and mood: ${recipe.styleMood}`,
      `Negative prompt: ${recipe.negativePrompt}`
    ]),
    manifest: {
      code: input.postType?.code ?? null,
      name: input.postType?.name ?? null,
      aspectRatio: input.aspectRatio,
      usesProjectImage: false,
      recipeKey: recipe.key,
      recipeDirection: recipe.direction,
      negativePrompt: recipe.negativePrompt,
      playbookKey: getPlaybookKey(input.postType?.code)
    }
  };
}

function emptyGuidance(aspectRatio: string): PostTypePromptGuidance {
  return {
    seedClauses: [],
    finalClauses: [],
    manifest: {
      code: null,
      name: null,
      aspectRatio,
      usesProjectImage: false,
      recipeKey: null,
      recipeDirection: "",
      negativePrompt: ""
    }
  };
}

function buildSeed(input: PostTypePromptInput & { aspectRatio?: string }) {
  return [
    input.postType?.code ?? "",
    input.projectName ?? "",
    input.brief.goal,
    input.brief.prompt,
    input.brief.channel,
    input.brief.format,
    input.brief.templateType ?? "",
    input.aspectRatio ?? ""
  ]
    .join("|")
    .trim();
}

function chooseRecipe<T>(recipes: T[], seed: string): T {
  if (recipes.length === 1) {
    return recipes[0]!;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return recipes[hash % recipes.length]!;
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function chooseAmenityFocus(
  input: PostTypePromptInput
): { focusAmenity: string | null; source: "explicit" | "inferred" | "none" } {
  const selection = resolveAmenityFocus({
    briefText: [input.brief.goal, input.brief.prompt, input.brief.exactText ?? ""].join(" "),
    projectAmenityNames: [
      ...(input.projectProfile?.heroAmenities ?? []),
      ...(input.projectProfile?.amenities ?? [])
    ],
    allAssets: input.brandAssets ?? [],
    projectId: input.projectId ?? null,
    seed: buildSeed(input),
  });

  return {
    focusAmenity: selection.focusAmenity,
    source: selection.source
  };
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}
