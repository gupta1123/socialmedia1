import crypto from "node:crypto";
import { compilePromptPackageV2 } from "../lib/creative-director.js";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.CREATIVE_DIRECTOR_V2_MODE = "mock";

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
    audienceSegments: [],
    lifestyleAngle: "",
    configurations: [],
    sizeRanges: [],
    towersCount: "",
    floorsCount: "",
    totalUnits: "",
    specialUnitTypes: [],
    parkingFacts: "",
    nearbyLandmarks: [],
    metroStations: [],
    heroAmenities: [],
    amenities: [],
    actualProjectImageIds: [],
    sampleFlatImageIds: [],
    areaRange: "450-1200 sq.ft",
    priceRange: "₹45L - ₹1.5Cr"
  };
}

async function runLocationAdvantageDryRun() {
  console.log("=".repeat(80));
  console.log("DRY RUN: Location Advantage Post for East World (Sankla Buildcoon)");
  console.log("=".repeat(80));
  console.log("");

  const workspaceId = "610ea654-5163-4f68-a8d9-41cbd4a49b2f";
  const brandId = "71eaacfe-583c-4235-bfe8-48b027563ca6";
  const projectId = "c2ba3fe7-9f18-47aa-ab6c-2e6b2292c6df";

  // The location map asset we uploaded
  const locationMapAssetId = "c88c255c-fa0e-4068-bfc4-deceb2552b3c";

  const output = await compilePromptPackageV2({
    workspaceId,
    brandName: "Sankla Buildcoon",
    brandProfile: buildBrandProfile(),
    brandAssets: [
      {
        id: locationMapAssetId,
        workspaceId,
        brandId,
        projectId,
        kind: "reference" as const,
        label: "East World - Location Map with Nearby Landmarks",
        fileName: "LA.png",
        mimeType: "image/png",
        storagePath: `brand-assets/${locationMapAssetId}.png`,
        thumbnailStoragePath: null,
        metadataJson: {
          tags: ["location", "map", "nearby landmarks", "area map", "connectivity", "transport"],
          viewType: "map",
          amenityName: null,
          qualityTier: "hero",
          subjectType: "location_map",
          usageIntent: "truth_anchor",
          preserveIdentity: true
        }
      }
    ],
    brief: {
      brandId,
      createMode: "post",
      copyMode: "auto",
      channel: "instagram-feed",
      format: "portrait",
      goal: "Showcase the location advantage of East World",
      prompt: "Create a premium location advantage poster that highlights East World's strategic position near key destinations in Pune",
      audience: "Homebuyers and investors",
      offer: "",
      exactText: "Location Advantage",
      referenceAssetIds: [locationMapAssetId],
      includeBrandLogo: false,
      includeReraQr: false,
      logoAssetId: null,
      postTypeId: "9bbf1923-2796-49ae-8971-03bbe7df3f45" // location-advantage
    },
    referenceLabels: ["East World - Location Map with Nearby Landmarks"],
    projectId,
    projectName: "East World",
    projectStage: "launch",
    projectProfile: null, // Use null to avoid project context issues
    festival: null,
    postType: {
      code: "location-advantage",
      name: "Location advantage",
      config: {
        defaultChannels: ["instagram-feed"],
        allowedFormats: ["portrait", "square"],
        recommendedTemplateTypes: ["hero"],
        requiredBriefFields: ["goal", "prompt"],
        safeZoneGuidance: ["Keep location details readable", "Maintain brand-safe imagery"],
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
  console.log("Brand: Sankla Buildcoon");
  console.log("Project: East World");
  console.log("Post Type: Location advantage");
  console.log("Format: Portrait (4:5)");
  console.log("Channel: Instagram Feed");
  console.log("Location Map Asset ID:", locationMapAssetId);
  console.log("");
  console.log("=== USER PROMPT ===");
  console.log("goal: Showcase the location advantage of East World");
  console.log("prompt: Create a premium location advantage poster that highlights East World's strategic position near key destinations in Pune");
  console.log("exactText: Location Advantage");
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

runLocationAdvantageDryRun().catch(console.error);