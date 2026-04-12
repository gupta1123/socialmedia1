import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BrandAssetRecord, BrandProfile, ProjectProfile } from "@image-lab/contracts";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.CREATIVE_DIRECTOR_V2_MODE = "mock";

const { compilePromptPackageV2 } = await import("../lib/creative-director.js");

function buildBrandProfile(): BrandProfile {
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

function buildBrandAsset(input: {
  brandId: string;
  workspaceId: string;
  projectId?: string | null;
  id?: string;
  kind: "reference" | "logo" | "rera_qr" | "inspiration";
  label: string;
}): BrandAssetRecord {
  const assetId = input.id ?? crypto.randomUUID();
  return {
    id: assetId,
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    projectId: input.projectId ?? null,
    kind: input.kind,
    label: input.label,
    fileName: `${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.png`,
    mimeType: "image/png",
    storagePath: `brand-assets/${assetId}.png`,
    metadataJson: {}
  };
}

function buildProjectProfile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
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
    pricingBand: "",
    startingPrice: "",
    priceRangeByConfig: [],
    bookingAmount: "",
    paymentPlanSummary: "",
    currentOffers: [],
    financingPartners: [],
    offerValidity: "",
    amenities: [],
    heroAmenities: [],
    nearbyLandmarks: [],
    connectivityPoints: [],
    travelTimes: [],
    locationAdvantages: [],
    constructionStatus: "",
    milestoneHistory: [],
    latestUpdate: "",
    completionWindow: "",
    approvedClaims: [],
    bannedClaims: [],
    legalNotes: [],
    approvalsSummary: "",
    credibilityFacts: [],
    investorAngle: "",
    endUserAngle: "",
    keyObjections: [],
    faqs: [],
    actualProjectImageIds: [],
    sampleFlatImageIds: [],
    ...overrides
  };
}

function getTruthBundleSummary(output: any) {
  return (output.compilerTrace as Record<string, any>).truthBundleSummary as {
    postTypeCode: string;
    playbookKey: string;
    candidateAssetIds: string[];
    exactAssetIds: {
      logo: string | null;
      reraQr: string | null;
      projectAnchor: string | null;
    };
  };
}

describe("compilePromptPackageV2", () => {
  it("can run in isolated mock mode without invoking the production compiler worker", async () => {
    const output = await compilePromptPackageV2({
      brandName: "Briefly Social Demo",
      brandProfile: buildBrandProfile(),
      variationCount: 3,
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        channel: "instagram-feed",
        format: "square",
        goal: "Project launch",
        prompt: "Create a premium project launch post with one hero tower image and clean editorial hierarchy.",
        audience: "Homebuyers",
        offer: "",
        exactText: "Now launched",
        referenceAssetIds: [],
        includeBrandLogo: false,
        includeReraQr: false,
        templateType: "hero"
      },
      referenceLabels: [],
      projectName: "Zoy+",
      projectProfile: null,
      festival: null,
      postType: {
        code: "project-launch",
        name: "Project launch",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["square"],
          recommendedTemplateTypes: ["hero"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep headline readable without blocking the hero tower"],
          ctaStyle: "restrained",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    expect(output.promptSummary).toBeTruthy();
    expect(output.seedPrompt).toContain("exactly one finished design");
    expect(output.finalPrompt).toContain("exactly one finished design");
    expect(output.variations).toHaveLength(3);
    expect(output.variations?.[0]?.seedPrompt).toBe(output.seedPrompt);
    expect(output.variations?.[0]?.seedPrompt).toBe(output.variations?.[0]?.finalPrompt);
    expect(new Set(output.variations?.map((variation) => variation.strategy))).toHaveLength(3);
    expect(output.compilerTrace.requestedVariationCount).toBe(3);
    expect(output.compilerTrace.returnedVariationCount).toBe(3);
    expect(output.compilerTrace.pipeline).toBe("v2-mock");
    expect(getTruthBundleSummary(output).postTypeCode).toBe("project-launch");
    expect(output.resolvedConstraints.compilerMode).toBe("v2-mock");
  });

  it("keeps foreign project assets out of a selected project's candidate bundle", async () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const localProjectId = crypto.randomUUID();
    const foreignProjectId = crypto.randomUUID();
    const localProjectAssetId = crypto.randomUUID();
    const foreignProjectAssetId = crypto.randomUUID();
    const logoAssetId = crypto.randomUUID();

    const brandProfile = buildBrandProfile();
    brandProfile.referenceAssetIds = [foreignProjectAssetId];

    const output = await compilePromptPackageV2({
      workspaceId,
      brandName: "Briefly Social Demo",
      brandProfile,
      brandAssets: [
        buildBrandAsset({
          id: localProjectAssetId,
          workspaceId,
          brandId,
          projectId: localProjectId,
          kind: "reference",
          label: "Local tower hero"
        }),
        buildBrandAsset({
          id: foreignProjectAssetId,
          workspaceId,
          brandId,
          projectId: foreignProjectId,
          kind: "reference",
          label: "Foreign tower hero"
        }),
        buildBrandAsset({
          id: logoAssetId,
          workspaceId,
          brandId,
          kind: "logo",
          label: "Brand logo"
        })
      ],
      variationCount: 2,
      brief: {
        brandId,
        createMode: "post",
        projectId: localProjectId,
        postTypeId: crypto.randomUUID(),
        channel: "instagram-feed",
        format: "portrait",
        goal: "Project launch",
        prompt: "Create a premium launch visual that keeps the selected project identity clear.",
        audience: "Homebuyers",
        offer: "",
        exactText: "Now launched",
        referenceAssetIds: [],
        includeBrandLogo: true,
        includeReraQr: false,
        templateType: "hero"
      },
      referenceLabels: [],
      projectName: "Local Project",
      projectId: localProjectId,
      projectStage: "launch",
      projectProfile: buildProjectProfile({
        tagline: "Live local",
        positioning: "Premium project",
        constructionStatus: "Launch phase",
        actualProjectImageIds: [localProjectAssetId],
        sampleFlatImageIds: []
      }),
      festival: null,
      postType: {
        code: "project-launch",
        name: "Project launch",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait"],
          recommendedTemplateTypes: ["hero"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep headline readable without blocking the tower"],
          ctaStyle: "restrained",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    const truthBundleSummary = getTruthBundleSummary(output);
    expect(truthBundleSummary.candidateAssetIds).toContain(localProjectAssetId);
    expect(truthBundleSummary.candidateAssetIds).toContain(logoAssetId);
    expect(truthBundleSummary.candidateAssetIds).not.toContain(foreignProjectAssetId);
    expect(truthBundleSummary.exactAssetIds.projectAnchor).toBe(localProjectAssetId);
    expect(truthBundleSummary.exactAssetIds.logo).toBe(logoAssetId);
  });

  it("keeps festive prompts project-free unless a project asset is explicitly selected", async () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const foreignProjectId = crypto.randomUUID();
    const foreignProjectAssetId = crypto.randomUUID();
    const logoAssetId = crypto.randomUUID();

    const brandProfile = buildBrandProfile();
    brandProfile.referenceAssetIds = [foreignProjectAssetId];

    const output = await compilePromptPackageV2({
      workspaceId,
      brandName: "Briefly Social Demo",
      brandProfile,
      brandAssets: [
        buildBrandAsset({
          id: foreignProjectAssetId,
          workspaceId,
          brandId,
          projectId: foreignProjectId,
          kind: "reference",
          label: "Foreign tower hero"
        }),
        buildBrandAsset({
          id: logoAssetId,
          workspaceId,
          brandId,
          kind: "logo",
          label: "Brand logo"
        })
      ],
      variationCount: 2,
      brief: {
        brandId,
        createMode: "post",
        festivalId: crypto.randomUUID(),
        postTypeId: crypto.randomUUID(),
        channel: "instagram-feed",
        format: "portrait",
        goal: "Festive greeting",
        prompt: "Create a premium Holika Dahan greeting with restrained symbolism and sparse copy.",
        audience: "Homebuyers",
        offer: "",
        exactText: "",
        referenceAssetIds: [],
        includeBrandLogo: true,
        includeReraQr: false,
        templateType: "quote"
      },
      referenceLabels: [],
      projectName: null,
      projectId: null,
      projectStage: null,
      projectProfile: null,
      festival: {
        id: crypto.randomUUID(),
        code: "holika-dahan",
        name: "Holika Dahan",
        category: "religious",
        community: null,
        regions: ["India"],
        meaning: "Celebration of good over evil",
        dateLabel: "March",
        nextOccursOn: null
      },
      postType: {
        code: "festive-greeting",
        name: "Festive greeting",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait"],
          recommendedTemplateTypes: ["quote"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Maintain celebratory hierarchy with clear logo lockup"],
          ctaStyle: "restrained",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    const truthBundleSummary = getTruthBundleSummary(output);
    expect(truthBundleSummary.candidateAssetIds).toContain(logoAssetId);
    expect(truthBundleSummary.candidateAssetIds).not.toContain(foreignProjectAssetId);
    expect(truthBundleSummary.exactAssetIds.projectAnchor).toBeNull();
  });
});
