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

async function runFullLocationAdvantageDryRun() {
  console.log("=".repeat(80));
  console.log("DRY RUN: Location Advantage with Project Image + Map + Logo");
  console.log("=".repeat(80));
  console.log("");

  const workspaceId = "610ea654-5163-4f68-a8d9-41cbd4a49b2f";
  const brandId = "71eaacfe-583c-4235-bfe8-48b027563ca6";
  const projectId = "c2ba3fe7-9f18-47aa-ab6c-2e6b2292c6df";

  const locationMapAssetId = "c88c255c-fa0e-4068-bfc4-deceb2552b3c";
  const projectExteriorAssetId = "11111111-1111-1111-1111-111111111111";
  const logoAssetId = "22222222-2222-2222-2222-222222222222";

  const output = await compilePromptPackageV2({
    workspaceId,
    brandName: "Sankla Buildcoon",
    brandProfile: buildBrandProfile(),
    brandAssets: [
      // Location map asset
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
      },
      // Project exterior image
      {
        id: projectExteriorAssetId,
        workspaceId,
        brandId,
        projectId,
        kind: "reference" as const,
        label: "East World Building Exterior",
        fileName: "exterior.jpg",
        mimeType: "image/jpeg",
        storagePath: `brand-assets/${projectExteriorAssetId}.jpg`,
        thumbnailStoragePath: null,
        metadataJson: {
          tags: ["exterior", "building", "project"],
          viewType: "facade",
          qualityTier: "hero",
          subjectType: "project_exterior",
          usageIntent: "truth_anchor",
          preserveIdentity: true
        }
      },
      // Brand logo
      {
        id: logoAssetId,
        workspaceId,
        brandId,
        projectId: null,
        kind: "logo" as const,
        label: "Sankla Buildcoon Logo",
        fileName: "logo.png",
        mimeType: "image/png",
        storagePath: `brand-assets/${logoAssetId}.png`,
        thumbnailStoragePath: null,
        metadataJson: {}
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
      referenceAssetIds: [locationMapAssetId, projectExteriorAssetId],
      includeBrandLogo: true,
      includeReraQr: false,
      logoAssetId: logoAssetId,
      postTypeId: "9bbf1923-2796-49ae-8971-03bbe7df3f45"
    },
    referenceLabels: [
      "East World - Location Map with Nearby Landmarks",
      "East World Building Exterior"
    ],
    projectId,
    projectName: "East World",
    projectStage: "launch",
    projectProfile: null,
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
  console.log("");
  console.log("=== ASSETS PASSED ===");
  console.log("1. Location Map:", locationMapAssetId);
  console.log("2. Project Exterior:", projectExteriorAssetId);
  console.log("3. Brand Logo:", logoAssetId);
  console.log("");
  console.log("=== USER PROMPT ===");
  console.log("goal: Showcase the location advantage of East World");
  console.log("prompt: Create a premium location advantage poster that highlights East World's strategic position near key destinations in Pune");
  console.log("exactText: Location Advantage");
  console.log("includeBrandLogo: true");
  console.log("");
  console.log("=".repeat(80));
  console.log("=== COMPILED OUTPUT ===");
  console.log("=".repeat(80));
  console.log("");
  console.log("--- Seed Prompt ---");
  console.log(output.seedPrompt);
  console.log("");
  console.log("=".repeat(80));
  console.log("=== METADATA ===");
  console.log("aspectRatio:", output.aspectRatio);
  console.log("chosenModel:", output.chosenModel);
  console.log("templateType:", output.templateType);
  console.log("referenceStrategy:", output.referenceStrategy);
  console.log("variations count:", output.variations?.length ?? 0);
  console.log("promptSummary:", output.promptSummary);
  console.log("");
  console.log("=== REFERENCE ASSET HANDLING ===");
  console.log("Expected to use:");
  console.log("  - location_map as: location truth anchor (landmark/connectivity proof)");
  console.log("  - project_exterior as: project identity anchor (building hero)");
  console.log("  - logo as: small footer/signature element");
}

runFullLocationAdvantageDryRun().catch(console.error);