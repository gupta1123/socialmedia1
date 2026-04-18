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

function buildBrandAsset(input: {
  brandId: string;
  workspaceId: string;
  projectId?: string | null;
  id?: string;
  kind: "reference" | "logo" | "rera_qr" | "inspiration";
  label: string;
  metadataJson?: Record<string, unknown>;
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
    thumbnailStoragePath: null,
    metadataJson: input.metadataJson ?? {}
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
        copyMode: "manual",
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
        logoAssetId: null,
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
        copyMode: "manual",
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
        logoAssetId: null,
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

  it("adds project amenity assets to amenity spotlight candidate bundles before sample flats", async () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const projectExteriorAssetId = crypto.randomUUID();
    const sampleFlatAssetId = crypto.randomUUID();
    const amenityAssetId = crypto.randomUUID();

    const output = await compilePromptPackageV2({
      workspaceId,
      brandName: "Briefly Social Demo",
      brandProfile: buildBrandProfile(),
      brandAssets: [
        buildBrandAsset({
          id: projectExteriorAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Miami elevation hero",
          metadataJson: {
            subjectType: "project_exterior",
            usageIntent: "truth_anchor",
            qualityTier: "hero"
          }
        }),
        buildBrandAsset({
          id: sampleFlatAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Miami sample flat living room",
          metadataJson: {
            subjectType: "sample_flat"
          }
        }),
        buildBrandAsset({
          id: amenityAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Miami Sky Lounge hero",
          metadataJson: {
            subjectType: "amenity",
            amenityName: "Sky Lounge",
            qualityTier: "hero"
          }
        })
      ],
      brief: {
        brandId,
        createMode: "post",
        copyMode: "manual",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Build interest in a key project amenity",
        prompt: "Spotlight the Sky Lounge with an aspirational lifestyle angle.",
        audience: "Homebuyers",
        offer: "",
        exactText: "Amenity Spotlight",
        referenceAssetIds: [],
        includeBrandLogo: false,
        includeReraQr: false,
        logoAssetId: null,
        templateType: "product-focus"
      },
      referenceLabels: [],
      projectId,
      projectName: "Miami",
      projectStage: "launch",
      projectProfile: buildProjectProfile({
        heroAmenities: ["Sky Lounge", "Gym"],
        actualProjectImageIds: [projectExteriorAssetId],
        sampleFlatImageIds: [sampleFlatAssetId]
      }),
      festival: null,
      postType: {
        code: "amenity-spotlight",
        name: "Amenity spotlight",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait"],
          recommendedTemplateTypes: ["product-focus"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep amenity title readable without blocking the hero scene"],
          ctaStyle: "soft-enquiry",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    const truthBundleSummary = getTruthBundleSummary(output);
    expect(truthBundleSummary.candidateAssetIds).toContain(amenityAssetId);
    expect(truthBundleSummary.candidateAssetIds).toContain(projectExteriorAssetId);
    expect(truthBundleSummary.candidateAssetIds).not.toContain(sampleFlatAssetId);
  });

  it("keeps only the amenity asset that matches the requested amenity focus", async () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const projectExteriorAssetId = crypto.randomUUID();
    const poolAssetId = crypto.randomUUID();
    const parkAssetId = crypto.randomUUID();

    const output = await compilePromptPackageV2({
      workspaceId,
      brandName: "Briefly Social Demo",
      brandProfile: buildBrandProfile(),
      brandAssets: [
        buildBrandAsset({
          id: projectExteriorAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Miami elevation hero",
          metadataJson: {
            subjectType: "project_exterior",
            usageIntent: "truth_anchor",
            qualityTier: "hero"
          }
        }),
        buildBrandAsset({
          id: poolAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Miami pool hero",
          metadataJson: {
            subjectType: "amenity",
            amenityName: "Swimming Pool",
            qualityTier: "hero"
          }
        }),
        buildBrandAsset({
          id: parkAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Miami park hero",
          metadataJson: {
            subjectType: "amenity",
            amenityName: "Park",
            qualityTier: "hero"
          }
        })
      ],
      brief: {
        brandId,
        createMode: "post",
        copyMode: "manual",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Build interest in the swimming pool amenity",
        prompt: "Spotlight the swimming pool with an aspirational lifestyle angle.",
        audience: "Homebuyers",
        offer: "",
        exactText: "Amenity Spotlight",
        referenceAssetIds: [],
        includeBrandLogo: false,
        includeReraQr: false,
        logoAssetId: null,
        templateType: "product-focus"
      },
      referenceLabels: [],
      projectId,
      projectName: "Miami",
      projectStage: "launch",
      projectProfile: buildProjectProfile({
        heroAmenities: ["Swimming Pool", "Park"],
        actualProjectImageIds: [projectExteriorAssetId],
      }),
      festival: null,
      postType: {
        code: "amenity-spotlight",
        name: "Amenity spotlight",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait"],
          recommendedTemplateTypes: ["product-focus"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep amenity title readable without blocking the hero scene"],
          ctaStyle: "soft-enquiry",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    const truthBundleSummary = getTruthBundleSummary(output);
    expect(truthBundleSummary.candidateAssetIds).toContain(poolAssetId);
    expect(truthBundleSummary.candidateAssetIds).toContain(projectExteriorAssetId);
    expect(truthBundleSummary.candidateAssetIds).not.toContain(parkAssetId);
    expect(output.compilerTrace.postTypeGuidanceManifest).toMatchObject({
      code: "amenity-spotlight",
      amenityFocus: "Swimming Pool",
      amenitySelectionSource: "explicit"
    });
    const amenityResolutionSummary = (output.compilerTrace as Record<string, any>).amenityResolutionSummary;
    expect(amenityResolutionSummary).toMatchObject({
      selectedAmenity: "Swimming Pool",
      selectedAssetIds: [poolAssetId],
      hasExactAssetMatch: true,
    });
    expect(amenityResolutionSummary.availableAmenities).toEqual(
      expect.arrayContaining(["Swimming Pool", "Park"])
    );
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
        copyMode: "manual",
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
        logoAssetId: null,
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

  it("generates single-image prompts for amenity spotlight", async () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const amenityAssetId = crypto.randomUUID();
    const projectExteriorAssetId = crypto.randomUUID();

    const output = await compilePromptPackageV2({
      workspaceId,
      brandName: "Pride Group",
      brandProfile: buildBrandProfile(),
      brandAssets: [
        buildBrandAsset({
          id: amenityAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Sky Lounge Hero",
          metadataJson: {
            subjectType: "amenity",
            amenityName: "Sky Lounge",
            qualityTier: "hero"
          }
        }),
        buildBrandAsset({
          id: projectExteriorAssetId,
          workspaceId,
          brandId,
          projectId,
          kind: "reference",
          label: "Project exterior",
          metadataJson: {
            subjectType: "project_exterior"
          }
        })
      ],
      brief: {
        brandId,
        createMode: "post",
        copyMode: "manual",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Build interest in a key project amenity",
        prompt: "Spotlight the Sky Lounge with an aspirational lifestyle angle.",
        audience: "Homebuyers",
        offer: "",
        exactText: "Sky Lounge",
        referenceAssetIds: [],
        includeBrandLogo: false,
        includeReraQr: false,
        logoAssetId: null,
        templateType: "product-focus"
      },
      referenceLabels: [],
      projectId,
      projectName: "Miami",
      projectStage: "launch",
      projectProfile: buildProjectProfile({
        heroAmenities: ["Sky Lounge", "Gym"],
        amenities: ["Sky Lounge", "Gym", "Pool"],
        actualProjectImageIds: [projectExteriorAssetId],
        sampleFlatImageIds: []
      }),
      festival: null,
      postType: {
        code: "amenity-spotlight",
        name: "Amenity spotlight",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait"],
          recommendedTemplateTypes: ["product-focus"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep amenity title readable without blocking the hero scene"],
          ctaStyle: "soft-enquiry",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    console.log("=== INPUT ===");
    console.log("Brand: Pride Group");
    console.log("Project: Miami");
    console.log("Post Type: Amenity spotlight");
    console.log("Brief Prompt: Spotlight the Sky Lounge with an aspirational lifestyle angle.");
    console.log("");
    console.log("=== OUTPUT ===");
    console.log("Seed Prompt:");
    console.log(output.seedPrompt);
    console.log("");
    console.log("Final Prompt:");
    console.log(output.finalPrompt);

    expect(output.seedPrompt).toBeTruthy();
    expect(output.finalPrompt).toBeTruthy();
    const imageRefPattern = /(?:Image \d+ is [^.]+\.(?:jpg|jpeg|png|webp)[^,]*(?:,|and)|filename.*(?:jpg|jpeg|png|webp).*Image \d+)/i;
    const hasActualImageRefs = imageRefPattern.test(output.finalPrompt);
    expect(hasActualImageRefs).toBe(false);
    expect(output.finalPrompt).toContain("Create a premium 4:5 amenity spotlight poster for social media");
    expect(output.finalPrompt).toContain("Poster structure:");
    expect(output.finalPrompt).toContain("Negative prompt:");
    expect(output.compilerTrace.promptDetailMode).toBe("poster-spec");
  });

  it("strips inherited CTA and exact text when copy mode is auto", async () => {
    const output = await compilePromptPackageV2({
      brandName: "Briefly Social Demo",
      brandProfile: buildBrandProfile(),
      variationCount: 1,
      brief: {
        brandId: crypto.randomUUID(),
        createMode: "post",
        copyMode: "auto",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Invite buyers to visit the project",
        prompt: "Create a premium site visit invite with a warm, trustworthy tone.",
        audience: "Homebuyers",
        offer: "Book your site visit",
        exactText: "Visit the Experience Centre",
        referenceAssetIds: [],
        includeBrandLogo: false,
        includeReraQr: false,
        logoAssetId: null,
        templateType: "offer"
      },
      referenceLabels: [],
      projectName: "Zoy+",
      projectProfile: buildProjectProfile(),
      festival: null,
      postType: {
        code: "site-visit-invite",
        name: "Site visit invite",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["portrait"],
          recommendedTemplateTypes: ["offer"],
          requiredBriefFields: ["goal", "offer", "exactText"],
          safeZoneGuidance: ["Keep CTA and contact area unobstructed"],
          ctaStyle: "site-visit",
          copyDensity: "balanced"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    expect(output.finalPrompt).not.toContain("Visit the Experience Centre");
    expect(output.finalPrompt).not.toContain("Book your site visit");
    expect(output.compilerTrace.autoCopySanitized).toBe(true);
    expect(output.resolvedConstraints.promptDetailMode).toBe("poster-spec");
  });

  it("filters references correctly for amenity spotlight", async () => {
    type RoleAwareReferencePlan = {
      primaryAnchor: { role: string; label: string; storagePath: string } | null;
      sourcePost: { role: string; label: string; storagePath: string } | null;
      amenityAnchor: { role: string; label: string; storagePath: string; amenityName?: string | null } | null;
      projectAnchor: { role: string; label: string; storagePath: string } | null;
      brandLogo: { role: string; label: string; storagePath: string } | null;
      complianceQr: { role: string; label: string; storagePath: string } | null;
      references: Array<{ role: string; label: string; storagePath: string }>;
    };

    function filterReferenceStoragePathsForPrompt(
      plan: RoleAwareReferencePlan,
      prompt: string,
      postTypeCode: string
    ): string[] {
      const alwaysInclude = [
        plan.brandLogo?.storagePath,
        plan.complianceQr?.storagePath
      ].filter((v): v is string => typeof v === "string" && v.length > 0);

      const heroReference: string[] = [];
      const secondaryReference: string[] = [];
      const pushSecondary = (value: string | null | undefined) => {
        if (!value || heroReference.includes(value) || secondaryReference.includes(value)) return;
        secondaryReference.push(value);
      };
      if (postTypeCode === "amenity-spotlight") {
        if (plan.amenityAnchor?.storagePath) {
          heroReference.push(plan.amenityAnchor.storagePath);
        }
        pushSecondary(plan.projectAnchor?.storagePath);
      }

      return [...heroReference, ...secondaryReference.slice(0, 1), ...alwaysInclude];
    }

    const plan: RoleAwareReferencePlan = {
      primaryAnchor: null,
      sourcePost: null,
      amenityAnchor: { role: "amenity_image", label: "Pool amenity", storagePath: "amenities/pool.jpg", amenityName: null },
      projectAnchor: { role: "project_image", label: "Building", storagePath: "project/building.jpg" },
      brandLogo: { role: "brand_logo", label: "Logo", storagePath: "brand/logo.png" },
      complianceQr: null,
      references: [
        { role: "reference", label: "Interior", storagePath: "interior/kids.png" },
        { role: "reference", label: "Mood", storagePath: "mood/lounge.png" }
      ]
    };

    const filtered = filterReferenceStoragePathsForPrompt(plan, "", "amenity-spotlight");
    console.log("Filtered refs for amenity-spotlight:", filtered);
    expect(filtered.length).toBe(3);
    expect(filtered).toContain("amenities/pool.jpg");
    expect(filtered).toContain("project/building.jpg");
    expect(filtered).toContain("brand/logo.png");

    const noAmenityPlan: RoleAwareReferencePlan = {
      ...plan,
      amenityAnchor: null,
    };
    const filteredWithoutAmenity = filterReferenceStoragePathsForPrompt(noAmenityPlan, "", "amenity-spotlight");
    expect(filteredWithoutAmenity).toEqual(["project/building.jpg", "brand/logo.png"]);
  });
});
