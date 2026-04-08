import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { compilePromptPackageMock } = await import("../lib/mock-creative-director.js");

function buildBaseBrandProfile() {
  return {
    identity: {
      positioning: "Premium real-estate brand",
      promise: "Clarity with aspiration",
      audienceSummary: "Urban buyers and investors"
    },
    voice: {
      summary: "Confident, clear, editorial",
      adjectives: ["confident", "editorial"],
      approvedVocabulary: ["crafted", "credible"],
      bannedPhrases: ["synergy"]
    },
    palette: {
      primary: "#111111",
      secondary: "#f4eee7",
      accent: "#ff5c39",
      neutrals: ["#d9d0c6"]
    },
    styleDescriptors: ["graphic", "cinematic", "structured"],
    visualSystem: {
      typographyMood: "Editorial",
      compositionPrinciples: ["Protect whitespace"],
      imageTreatment: ["Warm natural light"],
      textDensity: "balanced" as const,
      realismLevel: "elevated_real" as const
    },
    doRules: ["Use bold hierarchy"],
    dontRules: ["No stock-photo smiles"],
    bannedPatterns: ["generic gradients"],
    compliance: {
      bannedClaims: [],
      reviewChecks: ["Check promise stays credible"]
    },
    referenceAssetIds: [],
    referenceCanon: {
      antiReferenceNotes: ["Avoid generic condo brochure clutter"],
      usageNotes: ["Use references for material language, not literal copy"]
    }
  };
}

function buildBaseProjectProfile(overrides: Record<string, unknown> = {}) {
  return {
    tagline: "Skyline calm in the city core",
    possessionStatus: "Launching soon",
    reraNumber: "P52100012345",
    positioning: "Premium residences designed for calm, connected city living",
    audienceSegments: ["Upgraders", "Investors"],
    lifestyleAngle: "Urban calm with skyline views and wellness-led amenities",
    configurations: ["2 BHK residences", "3 BHK residences"],
    sizeRanges: ["780 to 1180 sq ft"],
    towersCount: "2 towers",
    floorsCount: "G + 3P + 28 floors",
    totalUnits: "300 residences",
    specialUnitTypes: ["corner residences"],
    parkingFacts: "Podium parking",
    pricingBand: "premium",
    startingPrice: "Starting from ₹1.25 Cr",
    priceRangeByConfig: ["2 BHK from ₹1.25 Cr", "3 BHK from ₹1.78 Cr"],
    bookingAmount: "₹5 lakh",
    paymentPlanSummary: "Construction-linked plan",
    currentOffers: [],
    financingPartners: ["HDFC", "ICICI"],
    offerValidity: "",
    amenities: ["Sky lounge", "Clubhouse", "Fitness studio"],
    heroAmenities: ["Sky lounge", "Fitness studio"],
    nearbyLandmarks: ["Metro station nearby"],
    connectivityPoints: ["Business district access"],
    travelTimes: ["5 minutes to Metro"],
    locationAdvantages: ["Connected to the city core"],
    constructionStatus: "Construction underway with structure and glazing progressing tower by tower",
    milestoneHistory: ["Groundbreaking completed"],
    latestUpdate: "Tower A structure has crossed level 18 and facade framing has started",
    completionWindow: "December 2028",
    approvedClaims: ["Connected premium city residences"],
    bannedClaims: ["Guaranteed returns"],
    legalNotes: ["Subject to RERA registration details"],
    approvalsSummary: "Approvals in process",
    credibilityFacts: ["By a developer with delivered projects in Pune"],
    investorAngle: "Strong metro-led connectivity and rental demand",
    endUserAngle: "Balanced city access with calmer residential living",
    keyObjections: ["Traffic in peak hours"],
    faqs: [{ question: "Where is the project located?", answer: "In the city core near the metro corridor." }],
    actualProjectImageIds: [crypto.randomUUID()],
    sampleFlatImageIds: [],
    ...overrides
  };
}

describe("compilePromptPackageMock", () => {
  it("derives a festive prompt package that stays brand-led and image-free by default", () => {
    const output = compilePromptPackageMock({
      brandName: "Northstar",
      brandProfile: buildBaseBrandProfile(),
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-story",
        format: "story",
        goal: "Launch announcement",
        prompt: "Create a launch visual for the new product line",
        referenceAssetIds: [],
        templateType: "announcement"
      },
      referenceLabels: [],
      festival: {
        id: crypto.randomUUID(),
        code: "diwali",
        name: "Diwali",
        category: "religious",
        community: "Hindu",
        regions: ["india"],
        meaning: "the festival of lights celebrating hope, renewal, and the victory of light over darkness",
        dateLabel: "8 Nov 2026",
        nextOccursOn: "2026-11-08"
      },
      projectName: "Northstar Residences",
      projectProfile: buildBaseProjectProfile({ actualProjectImageIds: [] })
    });

    expect(output.aspectRatio).toBe("9:16");
    expect(output.referenceStrategy).toBe("generated-template");
    expect(output.promptSummary).toContain("Launch announcement");
    expect(output.seedPrompt).toContain("style seed");
    expect(output.seedPrompt).toContain("Reference canon usage notes");
    expect(output.seedPrompt).toContain("anti-reference cues");
    expect(output.seedPrompt).toContain("Festival context: Diwali");
    expect(output.seedPrompt).toContain("Do not assume or require input reference images for festive greetings");
    expect(output.seedPrompt).toContain("Main composition direction");
    expect(output.seedPrompt).toContain("Each generated image must be one complete festive poster only");
    expect(output.seedPrompt).toContain("Each generated seed image must contain exactly one poster or one coherent composition");
    expect(output.finalPrompt).toContain("Write this as a highly detailed poster-style image prompt");
    expect(output.finalPrompt).toContain("Festival: Diwali");
    expect(output.finalPrompt).toContain("Use references this way");
    expect(output.finalPrompt).toContain("Do not imitate these reference traits");
    expect(output.finalPrompt).toContain("Review checks to satisfy");
    expect(output.finalPrompt).toContain("Do not use project buildings, facades, amenities, brochures, floor plans, maps, or sales overlays");
    expect(output.finalPrompt).toContain("Render exactly one festive poster composition per output");
    expect(output.finalPrompt).toContain("Return exactly one finished design per generated image");
    expect(output.finalPrompt).toContain('render the exact brand name "Northstar" as plain text only');
    expect(output.finalPrompt).toContain("Do not render any logo, monogram, emblem, icon mark, brand symbol, or house icon");
    expect(output.finalPrompt).not.toContain("Starting price fact");
    expect(output.finalPrompt).not.toContain("RERA reference");
    expect(output.seedPrompt).not.toContain("Project positioning");
    expect(output.seedPrompt).toContain('Use the exact brand name "Northstar" as plain text only');
    expect(output.seedPrompt).toContain("Do not generate, invent, or imply any logo, monogram, emblem, icon mark, or house symbol");
    expect(output.compilerTrace.festivalGuidanceManifest).toMatchObject({
      name: "Diwali",
      meaning: "the festival of lights celebrating hope, renewal, and the victory of light over darkness"
    });
    expect(output.compilerTrace.brandGuidanceManifest).toMatchObject({
      usageNotes: ["Use references for material language, not literal copy"],
      antiReferenceNotes: ["Avoid generic condo brochure clutter"],
      reviewChecks: ["Check promise stays credible"]
    });
    expect(output.compilerTrace.projectGuidanceManifest).toMatchObject({
      tagline: "",
      approvedClaims: []
    });
  });

  it("builds a detailed project-image-led prompt for construction updates", () => {
    const output = compilePromptPackageMock({
      brandName: "Northstar",
      brandProfile: buildBaseBrandProfile(),
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Construction progress update",
        prompt: "Show the latest site progress with a premium trustworthy feel",
        referenceAssetIds: [],
        templateType: "announcement"
      },
      referenceLabels: ["Northstar Phase 2 construction hero"],
      postType: {
        code: "construction-update",
        name: "Construction update",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait", "square"],
          recommendedTemplateTypes: ["announcement", "hero"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep progress headline and date visible"],
          ctaStyle: "trust-building",
          copyDensity: "balanced"
        }
      },
      projectName: "Northstar Phase 2",
      projectProfile: buildBaseProjectProfile()
    });

    expect(output.finalPrompt).toContain("detailed premium construction-progress image prompt");
    expect(output.finalPrompt).toContain("Treat the actual project construction image as the hero reference");
    expect(output.finalPrompt).toContain("Progress panel treatment:");
    expect(output.finalPrompt).toContain("Do not repeat one fixed stock headline, date, or progress percentage on every run");
    expect(output.compilerTrace.postTypeGuidanceManifest).toMatchObject({
      code: "construction-update",
      usesProjectImage: true
    });
  });

  it("builds a detailed project-image hero prompt for project launches", () => {
    const output = compilePromptPackageMock({
      brandName: "Northstar",
      brandProfile: buildBaseBrandProfile(),
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Project hero reveal",
        prompt: "Create a premium property-image launch reveal for the new tower",
        referenceAssetIds: [],
        templateType: "hero"
      },
      referenceLabels: ["Northstar tower hero"],
      postType: {
        code: "project-launch",
        name: "Project launch",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait", "square"],
          recommendedTemplateTypes: ["hero", "announcement"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Reserve top and lower thirds for name and CTA"],
          ctaStyle: "site-visit",
          copyDensity: "balanced"
        }
      },
      projectName: "Northstar Phase 2",
      projectProfile: buildBaseProjectProfile({
        constructionStatus: "Launch-ready premium tower",
        latestUpdate: "New tower phase now open for launch communication"
      })
    });

    expect(output.finalPrompt).toContain("detailed premium property-image / project-launch prompt");
    expect(output.finalPrompt).toContain("Treat the actual project building image as the hero reference");
    expect(output.finalPrompt).toContain("Supporting zone treatment:");
    expect(output.finalPrompt).toContain("Do not reuse one canned launch headline");
    expect(output.compilerTrace.postTypeGuidanceManifest).toMatchObject({
      code: "project-launch",
      usesProjectImage: true
    });
  });

  it("locks amenity spotlight to one amenity and prefers the explicitly mentioned amenity", () => {
    const output = compilePromptPackageMock({
      brandName: "Northstar",
      brandProfile: buildBaseBrandProfile(),
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-feed",
        format: "square",
        goal: "Amenity spotlight",
        prompt: "Create an amenity spotlight for the Sky lounge with a premium lifestyle feel",
        referenceAssetIds: [],
        templateType: "product-focus"
      },
      referenceLabels: ["Northstar tower hero"],
      postType: {
        code: "amenity-spotlight",
        name: "Amenity spotlight",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["square", "portrait"],
          recommendedTemplateTypes: ["product-focus", "hero"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep amenity title and CTA readable without blocking architecture"],
          ctaStyle: "soft-enquiry",
          copyDensity: "minimal"
        }
      },
      projectName: "Northstar Phase 2",
      projectProfile: buildBaseProjectProfile({
        heroAmenities: ["Sky lounge", "Fitness studio", "Clubhouse"]
      })
    });

    expect(output.finalPrompt).toContain('The brief already names the amenity "Sky lounge". Spotlight that specific amenity');
    expect(output.finalPrompt).toContain("Keep the output focused on one amenity per image");
    expect(output.compilerTrace.postTypeGuidanceManifest).toMatchObject({
      code: "amenity-spotlight",
      amenityFocus: "Sky lounge",
      amenitySelectionSource: "explicit"
    });
  });

  it("builds a project-image-led site visit invite prompt", () => {
    const output = compilePromptPackageMock({
      brandName: "Northstar",
      brandProfile: buildBaseBrandProfile(),
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Site visit invite",
        prompt: "Invite buyers to book a site visit this weekend",
        referenceAssetIds: [],
        templateType: "offer",
        exactText: "Site visits now open"
      },
      referenceLabels: ["Northstar tower hero"],
      postType: {
        code: "site-visit-invite",
        name: "Site visit invite",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait", "square"],
          recommendedTemplateTypes: ["offer", "announcement"],
          requiredBriefFields: ["goal", "offer", "exactText"],
          safeZoneGuidance: ["Keep CTA and contact area unobstructed"],
          ctaStyle: "site-visit",
          copyDensity: "balanced"
        }
      },
      projectName: "Northstar Phase 2",
      projectProfile: buildBaseProjectProfile()
    });

    expect(output.finalPrompt).toContain("detailed premium site-visit invite prompt");
    expect(output.finalPrompt).toContain("Treat the actual project building image as the hero reference");
    expect(output.finalPrompt).toContain("If exact visit or CTA text is supplied, preserve it");
    expect(output.compilerTrace.postTypeGuidanceManifest).toMatchObject({
      code: "site-visit-invite",
      usesProjectImage: true
    });
  });

  it("treats brief-specific visual directions as first-class input in seeds and finals", () => {
    const output = compilePromptPackageMock({
      brandName: "Northstar",
      brandProfile: buildBaseBrandProfile(),
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Project hero reveal",
        prompt: "Create a sunset view with a dramatic skyline and warm amber lighting",
        referenceAssetIds: [],
        templateType: "hero"
      },
      referenceLabels: ["Northstar tower hero"],
      postType: {
        code: "project-launch",
        name: "Project launch",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait", "square"],
          recommendedTemplateTypes: ["hero", "announcement"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Reserve top and lower thirds for name and CTA"],
          ctaStyle: "site-visit",
          copyDensity: "balanced"
        }
      },
      projectName: "Northstar Phase 2",
      projectProfile: buildBaseProjectProfile({
        constructionStatus: "Launch-ready premium tower",
        latestUpdate: "New tower phase now open for launch communication"
      })
    });

    expect(output.seedPrompt).toContain(
      "User brief to honor exactly in spirit: Create a sunset view with a dramatic skyline and warm amber lighting."
    );
    expect(output.seedPrompt).toContain("Let the explored directions materially reflect the user's brief");
    expect(output.finalPrompt).toContain(
      "Brief: Create a sunset view with a dramatic skyline and warm amber lighting."
    );
    expect(output.finalPrompt).toContain(
      "Honor the user's explicit visual requests as first-class direction."
    );
  });
});
