import type {
  BrandAssetRecord,
  BrandProfile,
  CalendarItemRecord,
  CreativeBrief,
  CreativeTemplateRecord,
  FestivalRecord,
  PostTypeRecord,
  ProjectProfile,
  PromptPackage
} from "@image-lab/contracts";
import { env } from "./config.js";
import { buildBrandPromptGuidance } from "./brand-prompt-guidance.js";
import { buildFestivalPromptGuidance } from "./festival-prompt-guidance.js";
import { buildPostTypePromptGuidance } from "./post-type-prompt-guidance.js";
import { buildProjectPromptGuidance } from "./project-prompt-guidance.js";
import { dedupeStrings, deriveAspectRatio } from "./utils.js";

type Input = {
  brandName: string;
  brandProfile: BrandProfile;
  brief: CreativeBrief;
  referenceLabels: string[];
  brandAssets?: BrandAssetRecord[] | null;
  projectId?: string | null;
  projectName?: string | null;
  projectProfile?: ProjectProfile | null;
  festival?: Pick<FestivalRecord, "id" | "code" | "name" | "category" | "community" | "regions" | "meaning" | "dateLabel" | "nextOccursOn"> | null;
  postType?: Pick<PostTypeRecord, "code" | "name" | "config"> | null;
  template?: Pick<CreativeTemplateRecord, "name" | "basePrompt" | "config"> | null;
  series?: {
    id: string;
    name: string;
    description: string | null;
    contentFormat: "static" | "carousel" | "video" | "story" | null;
    sourceBriefJson: Record<string, unknown>;
  } | null;
  calendarItem?: Pick<CalendarItemRecord, "title" | "objective" | "scheduledFor" | "status"> | null;
  deliverableSnapshot?: {
    id: string;
    title: string;
    briefText: string | null;
    objectiveCode: string;
    placementCode: string;
    contentFormat: string;
    ctaText: string | null;
    scheduledFor: string;
    priority: string;
    status: string;
    campaign?: {
      id: string;
      name: string;
      objectiveCode: string;
      keyMessage: string;
      ctaText: string | null;
    } | null;
    persona?: {
      id: string;
      name: string;
      description: string | null;
    } | null;
    channelAccount?: {
      id: string;
      platform: string;
      handle: string;
    } | null;
  } | null;
};

function isFestivalGreetingInput(input: Pick<Input, "festival" | "postType">) {
  return Boolean(input.festival) && (!input.postType || input.postType.code === "festive-greeting");
}

export function compilePromptPackageMock(input: Input) {
  const aspectRatio = deriveAspectRatio(input.brief.format);
  const chosenModel =
    env.IMAGE_GENERATION_PROVIDER === "openrouter"
      ? env.OPENROUTER_FINAL_MODEL
      : env.IMAGE_GENERATION_PROVIDER === "openai"
        ? env.OPENAI_FINAL_MODEL
        : env.FAL_FINAL_MODEL;
  const templateType = input.brief.templateType;
  const briefDirective = input.brief.prompt.trim();
  const seriesOutputKind = input.brief.seriesOutputKind ?? "single_image";
  const slideCount =
    typeof input.brief.slideCount === "number" && input.brief.slideCount >= 2
      ? input.brief.slideCount
      : null;
  const templateFamily = input.template?.config.templateFamily?.trim() || input.template?.name || null;
  const templatePromptScaffold =
    input.template?.config.promptScaffold?.trim() || input.template?.basePrompt?.trim() || null;
  const carouselRecipe = dedupeStrings(input.template?.config.carouselRecipe ?? []);
  const seriesUseCases = dedupeStrings(input.template?.config.seriesUseCases ?? []);
  const referenceStrategy: PromptPackage["referenceStrategy"] =
    input.referenceLabels.length > 0 ? "uploaded-references" : "generated-template";
  const useProjectContext = !isFestivalGreetingInput(input);

  const brandGuidance = buildBrandPromptGuidance({
    brandProfile: input.brandProfile
  });
  const festivalGuidance = buildFestivalPromptGuidance(input.festival, input.brandName);
  const projectGuidance = buildProjectPromptGuidance(useProjectContext ? input.projectProfile : null);
  const postTypeGuidance = buildPostTypePromptGuidance({
    brandName: input.brandName,
    brief: input.brief,
    postType: input.postType,
    projectName: useProjectContext ? input.projectName : null,
    projectProfile: useProjectContext ? input.projectProfile : null,
    brandAssets: input.brandAssets ?? [],
    projectId: useProjectContext ? input.projectId : null,
    selectedReferenceAssetIds: input.brief.referenceAssetIds
  });
  const { styleDescriptors, approvedVocabulary, bannedTerms: banned } = brandGuidance;
  const safeZoneNotes = dedupeStrings([
    ...(input.postType?.config.safeZoneGuidance ?? []),
    ...(input.template?.config.safeZoneNotes ?? [])
  ]);
  const exactTextInstruction = input.brief.exactText
    ? `Include this exact on-image text without paraphrasing: "${input.brief.exactText}".`
    : input.brief.copyMode === "auto"
      ? "Write concise on-image copy only if it improves the concept. Choose suitable premium headline or CTA language yourself. Treat the result as final consumer-facing creative: never use placeholders, bracketed notes, sample contact information, sample URLs, sample calendar text, dummy phone numbers, or any 'replace this later' scaffolding. If the real detail is not available, leave it out."
    : "Avoid adding dense text overlays unless it improves the concept.";
  const brandLogoSeedInstruction = input.brief.includeBrandLogo
    ? "If a supplied brand logo reference is attached, use that exact logo as a small footer or signature element. Match the exact lockup, shape, colors, and spacing from the supplied logo reference. Integrate it into the composition as a natural brand-signature zone with proper margin, scale, and tonal harmony; it must never feel like a sticker, pasted overlay, or floating badge on top of the image. If the logo is not shown cleanly, keep a restrained blank footer or signature zone instead. During style exploration, never render an invented logo, monogram, emblem, footer mark, or placeholder brand symbol."
    : null;
  const reraQrSeedInstruction = input.brief.includeReraQr
    ? "If a supplied RERA QR reference is attached, use that exact QR as a small compliance element. Match the exact QR matrix from the supplied reference. If the QR is not shown cleanly, keep a small blank compliance-safe corner or footer zone instead. During style exploration, never render an invented QR code, barcode, compliance badge, seal, or placeholder block."
    : null;
  const brandLogoFinalInstruction = input.brief.includeBrandLogo
    ? "Include the supplied brand logo exactly as provided. Treat it as a small footer or signature element. Match the exact lockup, shape, colors, and spacing from the supplied logo reference. Integrate it into a quiet designed signature zone with proper margin, scale, and contrast so it feels built into the layout rather than pasted on top. Do not redraw, reinterpret, stylize, invent a new logo mark, add glow/shadows, place it as a sticker, or let it dominate the frame. If you cannot preserve it faithfully, leave the zone blank instead of generating a substitute."
    : null;
  const reraQrFinalInstruction = input.brief.includeReraQr
    ? "Include the supplied RERA QR exactly as provided as a small compliance element. Match the exact QR matrix from the supplied reference. Keep it flat, unobstructed, high-contrast, and legible. Do not stylize, repaint, distort, or decorate the QR. If you cannot preserve it faithfully, leave the zone blank instead of inventing a fake QR."
    : null;
  const amenityImageReferenceInstruction =
    "If any supplied reference is an amenity image, use exactly one amenity image as the subject-truth reference for that output. Do not merge multiple amenity references or different facilities into the same scene.";
  const briefFirstClassInstruction = briefDirective
    ? `User brief to honor exactly in spirit: ${briefDirective}. Treat explicit requests about lighting, time of day, atmosphere, mood, camera angle, framing, styling, or subject emphasis as first-class creative direction unless they conflict with compliance, factual project truth, or a required source image.`
    : null;
  const briefSeedVariationInstruction = briefDirective
    ? `Let the explored directions materially reflect the user's brief rather than only the default post-type recipe. If the brief asks for a sunset, night scene, aerial, close-up, minimal treatment, cinematic mood, or any other visual shift, carry that into the seed directions.`
    : null;

  const promptSummary = `Create a ${
    seriesOutputKind === "carousel"
      ? `${slideCount ?? 5}-slide carousel`
      : input.postType?.name ?? input.brief.templateType ?? "brand-safe"
  } ${input.brief.channel} creative for ${
    useProjectContext && input.projectName ? `${input.brandName} / ${input.projectName}` : input.brandName
  } focused on ${input.brief.goal}.`;

  const seedPrompt = [
    `Design a reusable style seed for ${input.brandName}.`,
    useProjectContext && input.projectName ? `Project: ${input.projectName}.` : null,
    input.postType ? `Post type: ${input.postType.name} (${input.postType.code}).` : null,
    input.festival ? `Festival: ${input.festival.name}.` : null,
    `Channel: ${input.brief.channel}. Format: ${input.brief.format}. Aspect ratio: ${aspectRatio}.`,
    input.brief.createMode === "series_episode"
      ? `Series: ${input.series?.name ?? "series episode"}. Output: ${
          seriesOutputKind === "carousel"
            ? `${slideCount ?? 5}-slide carousel concept`
            : "single-image post"
        }.`
      : null,
    isFestivalGreetingInput(input)
      ? `This is a standalone festive greeting poster. Do not turn it into a property ad or pull in project sales facts unless the brief explicitly asks for that.`
      : null,
    `Goal: ${input.brief.goal}.`,
    briefFirstClassInstruction,
    ...brandGuidance.seedClauses,
    ...festivalGuidance.seedClauses,
    ...projectGuidance.seedClauses,
    ...postTypeGuidance.seedClauses,
    templateType ? `Template type: ${templateType}.` : null,
    templateFamily ? `Template family: ${templateFamily}.` : null,
    input.template?.name ? `Use reusable template "${input.template.name}" as the compositional starting point.` : null,
    templatePromptScaffold ? `Template prompt scaffold: ${templatePromptScaffold}.` : null,
    seriesUseCases.length > 0 ? `Best used for: ${seriesUseCases.join(", ")}.` : null,
    carouselRecipe.length > 0 && seriesOutputKind === "carousel"
      ? `Carousel system recipe: ${carouselRecipe.join("; ")}.`
      : null,
    brandLogoSeedInstruction,
    reraQrSeedInstruction,
    amenityImageReferenceInstruction,
    input.series?.description ? `Series concept: ${input.series.description}.` : null,
    input.deliverableSnapshot?.campaign?.keyMessage
      ? `Campaign message: ${input.deliverableSnapshot.campaign.keyMessage}.`
      : null,
    input.deliverableSnapshot?.persona?.name
      ? `Target persona: ${input.deliverableSnapshot.persona.name}.`
      : null,
    input.deliverableSnapshot?.channelAccount
      ? `Primary publishing endpoint: ${input.deliverableSnapshot.channelAccount.platform} / ${input.deliverableSnapshot.channelAccount.handle}.`
      : null,
    seriesOutputKind === "carousel"
      ? `Design a reusable carousel cover and layout language that can carry a ${slideCount ?? 5}-slide story with consistent typography, pacing, and safe zones.`
      : `Keep composition editable, with clear safe zones for brand copy and CTA.`,
    `Across the batch of generated seed images, explore clearly different creative routes instead of minor variations of the same composition.`,
    `Each generated seed image must contain exactly one poster or one coherent composition. Never make a grid, collage, contact sheet, artboard, mood board, or multiple alternate poster designs inside a single frame.`,
    briefSeedVariationInstruction,
    safeZoneNotes.length > 0 ? `Safe-zone guidance: ${safeZoneNotes.join("; ")}.` : null,
    exactTextInstruction,
    input.referenceLabels.length > 0
      ? `Use uploaded references as style anchors: ${input.referenceLabels.join(", ")}. Follow their mood, material language, and composition discipline without recreating the exact source image or text layout.`
      : `Invent a clean, brand-specific visual language instead of imitating generic SaaS ads.`,
    input.calendarItem?.objective ? `Calendar objective: ${input.calendarItem.objective}.` : null,
    banned.length > 0 ? `Avoid: ${banned.join(", ")}.` : null
  ]
    .filter(Boolean)
    .join(" ");

  const finalPrompt = [
    `Generate the final social image for ${input.brandName}.`,
    useProjectContext && input.projectName ? `Project: ${input.projectName}.` : null,
    input.brief.createMode === "series_episode"
      ? `Series episode: ${input.series?.name ?? "Series"}. Output: ${
          seriesOutputKind === "carousel"
            ? `${slideCount ?? 5}-slide carousel cover / system`
            : "single-image post"
        }.`
      : null,
    `Brief: ${input.brief.prompt}.`,
    `Honor the user's explicit visual requests as first-class direction. Do not let the default post-type recipe flatten or override them unless they conflict with compliance, factual accuracy, or a required source image.`,
    input.postType ? `Post type: ${input.postType.name}.` : null,
    input.festival ? `Festival: ${input.festival.name}.` : null,
    isFestivalGreetingInput(input)
      ? `Treat this as a premium festive greeting poster with no required input images and no property-ad clutter.`
      : null,
    input.brief.audience ? `Audience: ${input.brief.audience}.` : null,
    input.brief.offer ? `Offer: ${input.brief.offer}.` : null,
    input.deliverableSnapshot?.campaign?.keyMessage
      ? `Campaign message: ${input.deliverableSnapshot.campaign.keyMessage}.`
      : null,
    ...brandGuidance.finalClauses,
    ...festivalGuidance.finalClauses,
    ...projectGuidance.finalClauses,
    ...postTypeGuidance.finalClauses,
    brandLogoFinalInstruction,
    reraQrFinalInstruction,
    amenityImageReferenceInstruction,
    templateFamily ? `Anchor the output in the ${templateFamily} template family.` : null,
    carouselRecipe.length > 0 && seriesOutputKind === "carousel"
      ? `Use this carousel recipe: ${carouselRecipe.join("; ")}.`
      : null,
    input.referenceLabels.length > 0
      ? `Treat references and reusable templates as style anchors, not exact source images. Preserve the visual language without replicating the original composition pixel-for-pixel.`
      : null,
    seriesOutputKind === "carousel"
      ? `This should feel like slide 1 of a premium carousel system with a clear headline zone, disciplined copy density, and a visual language that can extend across ${slideCount ?? 5} slides.`
      : `This should resolve as one finished post image, not a slide deck.`,
    `Return exactly one finished design per generated image. Never present multiple alternate posters, tiled concepts, contact-sheet layouts, mood boards, or side-by-side design options in one frame.`,
    safeZoneNotes.length > 0 ? `Respect safe zones: ${safeZoneNotes.join("; ")}.` : null,
    exactTextInstruction,
    `Composition must feel native to ${input.brief.channel} and leave readable safe zones for cropping.`
  ]
    .filter(Boolean)
    .join(" ");

  return {
    promptSummary,
    seedPrompt,
    finalPrompt,
    aspectRatio,
    chosenModel,
    templateType,
    referenceStrategy,
    resolvedConstraints: {
      exactText: input.brief.exactText ?? null,
      palette: input.brandProfile.palette,
      styleDescriptors,
      brandIdentity: input.brandProfile.identity,
      approvedVocabulary,
      banned,
      projectFacts: projectGuidance.manifest,
      format: input.brief.format,
      seriesOutputKind,
      slideCount,
      channel: input.brief.channel,
      projectName: input.projectName ?? null,
      postTypeCode: input.postType?.code ?? null,
      festival: festivalGuidance.manifest,
      postTypeGuidance: postTypeGuidance.manifest,
      includeBrandLogo: input.brief.includeBrandLogo,
      includeReraQr: input.brief.includeReraQr,
      templateName: input.template?.name ?? null,
      templateFamily,
      calendarTitle: input.calendarItem?.title ?? null,
      deliverableId: input.deliverableSnapshot?.id ?? null,
      campaignId: input.deliverableSnapshot?.campaign?.id ?? null,
      seriesId: input.series?.id ?? null,
      personaName: input.deliverableSnapshot?.persona?.name ?? null,
      channelAccount: input.deliverableSnapshot?.channelAccount?.handle ?? null
    },
    compilerTrace: {
      mode: "mock",
      referenceLabels: input.referenceLabels,
      projectProfileUsed: Boolean(input.projectProfile),
      postTypeUsed: input.postType?.code ?? null,
      templateUsed: input.template?.name ?? null,
      templateFamily,
      seriesOutputKind,
      slideCount,
      deliverableId: input.deliverableSnapshot?.id ?? null,
      brandGuidanceManifest: brandGuidance.manifest,
      festivalGuidanceManifest: festivalGuidance.manifest,
      projectGuidanceManifest: projectGuidance.manifest,
      postTypeGuidanceManifest: postTypeGuidance.manifest
    }
  };
}
