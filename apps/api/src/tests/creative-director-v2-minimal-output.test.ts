import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrandProfile } from "@image-lab/contracts";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
      textDensity: "minimal",
      realismLevel: "elevated_real"
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env.CREATIVE_DIRECTOR_V2_MODE;
  delete process.env.CREATIVE_DIRECTOR_V2_TRANSPORT;
  delete process.env.AGNO_AGENT_V2_SERVER_URL;
  delete process.env.IMAGE_GENERATION_PROVIDER;
  delete process.env.FAL_FINAL_MODEL;
  delete process.env.OPENROUTER_FINAL_MODEL;
});

describe("compilePromptPackageV2 minimal worker output", () => {
  it("normalizes a compact V2 worker response into the compatibility prompt package", async () => {
    process.env.CREATIVE_DIRECTOR_V2_MODE = "agno";
    process.env.CREATIVE_DIRECTOR_V2_TRANSPORT = "server";
    process.env.AGNO_AGENT_V2_SERVER_URL = "http://agno.local/api/compile-v2";
    process.env.IMAGE_GENERATION_PROVIDER = "fal";
    process.env.FAL_FINAL_MODEL = "fal-ai/nano-banana-2/edit";

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            promptSummary: "A premium site-visit invite route.",
            variations: [
              {
                title: "Primary route",
                strategy: "Hero-led invitation",
                finalPrompt:
                  "Create exactly one finished design: a premium 1:1 site-visit invitation poster with one residential tower hero, warm sunset light, disciplined headline hierarchy, and a clean CTA-safe footer."
              }
            ],
            compilerTrace: {
              pipeline: "agno-sequential-workflow-v2"
            }
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const { compilePromptPackageV2 } = await import("../lib/creative-director.js");

    const output = await compilePromptPackageV2({
      brandName: "Briefly Social Demo",
      brandProfile: buildBrandProfile(),
      variationCount: 1,
      brief: {
        brandId: "brand-1",
        createMode: "post",
        copyMode: "auto",
        projectId: "project-1",
        postTypeId: "post-type-1",
        channel: "instagram-feed",
        format: "square",
        goal: "Drive enquiries",
        prompt: "Create a premium site visit post with one hero tower image.",
        audience: "Homebuyers",
        offer: "",
        exactText: "",
        referenceAssetIds: [],
        includeBrandLogo: false,
        includeReraQr: false,
        logoAssetId: null,
        templateType: "hero"
      },
      referenceLabels: [],
      projectName: "41 Zillenia",
      projectProfile: null,
      festival: null,
      postType: {
        code: "site-visit-invite",
        name: "Site visit invite",
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["square"],
          recommendedTemplateTypes: ["hero"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: ["Keep CTA and contact area unobstructed"],
          ctaStyle: "restrained",
          copyDensity: "minimal"
        }
      },
      template: null,
      series: null,
      calendarItem: null,
      deliverableSnapshot: null
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(output.promptSummary).toBe("A premium site-visit invite route.");
    expect(output.variations).toHaveLength(1);
    expect(output.variations?.[0]?.title).toBe("Primary route");
    expect(output.variations?.[0]?.strategy).toBe("Hero-led invitation");
    expect(output.variations?.[0]?.finalPrompt).toContain("Create a premium 1:1 site-visit invitation poster for social media");
    expect(output.variations?.[0]?.seedPrompt).toBe(output.variations?.[0]?.finalPrompt);
    expect(output.seedPrompt).toBe(output.finalPrompt);
    expect(output.finalPrompt).toBe(output.variations?.[0]?.finalPrompt);
    expect(output.chosenModel).toBe("fal-ai/nano-banana-2/edit");
    expect(output.aspectRatio).toBe("1:1");
    expect(output.referenceStrategy).toBe("generated-template");
    expect(output.compilerTrace?.pipeline).toBe("agno-sequential-workflow-v2");
    expect(output.compilerTrace?.returnedVariationCount).toBe(1);
  });
});
