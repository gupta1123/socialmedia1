import crypto from "node:crypto";
import { compilePromptPackageV2 } from "../lib/creative-director.js";

function buildBrandProfile() {
  return {
    identity: {
      positioning: "Premium real-estate brand",
      promise: "Design-led city living",
      audienceSummary: "Urban homebuyers and investors"
    },
    voice: {
      summary: "Confident and refined",
      adjectives: ["confident", "refined"],
      approvedVocabulary: ["premium", "crafted"],
      bannedPhrases: []
    },
    palette: {
      primary: "#111111",
      secondary: "#f4eee7",
      accent: "#c7a14a",
      neutrals: ["#ffffff"]
    },
    styleDescriptors: ["premium", "architectural", "restrained"],
    visualSystem: {
      typographyMood: "Editorial sans serif",
      headlineFontFamily: "Cormorant Garamond",
      bodyFontFamily: "Avenir Next",
      typographyNotes: ["Elegant serif headlines", "Restrained sans supporting copy"],
      compositionPrinciples: ["Use generous whitespace"],
      imageTreatment: ["Warm natural light"],
      textDensity: "minimal" as const,
      realismLevel: "elevated_real" as const
    },
    doRules: ["Keep layouts premium"],
    dontRules: ["No clutter"],
    bannedPatterns: [],
    compliance: {
      bannedClaims: [],
      reviewChecks: []
    },
    referenceAssetIds: [],
    referenceCanon: {
      antiReferenceNotes: [],
      usageNotes: []
    }
  };
}

function buildProjectProfile() {
  return {
    tagline: "",
    possessionStatus: "",
    reraNumber: "",
    positioning: "",
    audienceSegments: [] as string[],
    lifestyleAngle: "",
    configurations: [] as string[],
    sizeRanges: [] as string[],
    towersCount: "",
    floorsCount: "",
    totalUnits: "",
    specialUnitTypes: [] as string[],
    parkingFacts: "",
    pricingBand: "",
    startingPrice: "",
    priceRangeByConfig: [] as string[],
    bookingAmount: "",
    paymentPlanSummary: "",
    currentOffers: [] as string[],
    financingPartners: [] as string[],
    offerValidity: "",
    amenities: ["Rooftop Pool", "Sky Lounge", "Gym", "Club House", "Kids Play Area"],
    heroAmenities: ["Rooftop Pool", "Sky Lounge", "Gym"],
    nearbyLandmarks: [] as string[],
    connectivityPoints: [] as string[],
    travelTimes: [] as string[],
    locationAdvantages: [] as string[],
    constructionStatus: "",
    milestoneHistory: [] as string[],
    latestUpdate: "",
    completionWindow: "",
    approvedClaims: [] as string[],
    bannedClaims: [] as string[],
    legalNotes: [] as string[],
    approvalsSummary: "",
    credibilityFacts: [] as string[],
    investorAngle: "",
    endUserAngle: "",
    keyObjections: [] as string[],
    faqs: [],
    actualProjectImageIds: [],
    sampleFlatImageIds: [],
    areaRange: "450-1200 sq.ft",
    priceRange: "₹45L - ₹1.5Cr"
  };
}

async function runDryRun() {
  console.log("=".repeat(80));
  console.log("DRY RUN: Creating festive greeting for Lohri");
  console.log("=".repeat(80));
  console.log("");

  const workspaceId = crypto.randomUUID();
  const brandId = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  const festivalId = "5f7bdb86-b3de-48a0-93f2-a74b5c972837";
  const postTypeId = "e3d68db6-244d-40d3-ad5e-bd24618d6b33";

  const output = await compilePromptPackageV2({
    workspaceId,
    brandName: "Krisala Developers",
    brandProfile: buildBrandProfile(),
    brandAssets: [],
    brief: {
      brandId,
      createMode: "post",
      copyMode: "auto",
      channel: "instagram-feed",
      format: "portrait",
      goal: "Celebrate Lohri with our audience",
      prompt: "Create a premium Lohri greeting that feels respectful, elegant, and brand-safe",
      audience: "Homebuyers and investors",
      offer: "",
      exactText: "Happy Lohri",
      referenceAssetIds: [],
      includeBrandLogo: false,
      includeReraQr: false,
      logoAssetId: null,
      festivalId: festivalId,
      postTypeId: postTypeId,
      templateType: "hero"
    },
    referenceLabels: [],
    projectId,
    projectName: "Prescon Midtown Bay",
    projectStage: "launch",
    projectProfile: buildProjectProfile(),
    festival: {
      id: festivalId,
      code: "lohri",
      name: "Lohri",
      category: "cultural",
      community: null,
      regions: ["punjab", "india"],
      meaning: "A Punjab harvest festival celebrating winter solstice, bonfires, and the end of the coldest period.",
      dateLabel: "13 Jan 2026",
      nextOccursOn: "2026-01-13"
    },
    postType: {
      code: "festive-greeting",
      name: "Festive greeting",
      config: {
        defaultChannels: ["instagram-feed"],
        allowedFormats: ["portrait", "square"],
        recommendedTemplateTypes: ["hero"],
        requiredBriefFields: ["goal", "prompt"],
        safeZoneGuidance: ["Keep festival name prominent", "Maintain brand-safe imagery"],
        ctaStyle: "minimal",
        copyDensity: "minimal"
      }
    },
    template: null,
    series: null,
    calendarItem: null,
    deliverableSnapshot: null
  });

  console.log("=== BRIEF INPUT ===");
  console.log("Brand: Krisala Developers");
  console.log("Project: Prescon Midtown Bay");
  console.log("Festival: Lohri (13 Jan 2026)");
  console.log("Post Type: Festive greeting");
  console.log("Format: Portrait (4:5)");
  console.log("Channel: Instagram Feed");
  console.log("");
  console.log("=== USER PROMPT ===");
  console.log("goal: Celebrate Lohri with our audience");
  console.log("prompt: Create a premium Lohri greeting that feels respectful, elegant, and brand-safe");
  console.log("exactText: Happy Lohri");
  console.log("");
  console.log("=".repeat(80));
  console.log("=== COMPILED OUTPUT ===");
  console.log("=".repeat(80));
  console.log("");
  console.log("--- Seed Prompt ---");
  console.log(output.seedPrompt);
  console.log("");
  console.log("--- Final Prompt ---");
  console.log(output.finalPrompt);
  console.log("");
  console.log("=".repeat(80));
  console.log("=== METADATA ===");
  console.log("aspectRatio:", output.aspectRatio);
  console.log("chosenModel:", output.chosenModel);
  console.log("templateType:", output.templateType);
  console.log("referenceStrategy:", output.referenceStrategy);
  console.log("variations count:", output.variations?.length ?? 0);
  console.log("promptSummary:", output.promptSummary);
}

runDryRun().catch(console.error);