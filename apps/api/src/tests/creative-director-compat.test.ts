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
});

describe("compilePromptPackage compatibility alias", () => {
  it("delegates the deprecated V1 helper to the V2 compiler path", async () => {
    process.env.CREATIVE_DIRECTOR_V2_MODE = "agno";
    process.env.CREATIVE_DIRECTOR_V2_TRANSPORT = "server";
    process.env.AGNO_AGENT_V2_SERVER_URL = "http://agno.local/api/compile-v2";
    process.env.IMAGE_GENERATION_PROVIDER = "fal";
    process.env.FAL_FINAL_MODEL = "fal-ai/nano-banana-pro/edit";

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            promptSummary: "A premium project launch route.",
            variations: [
              {
                title: "Primary route",
                strategy: "Hero-led launch poster",
                finalPrompt:
                  "Create exactly one finished design: a premium 1:1 project-launch poster with one residential tower hero, warm sunset light, clean headline reserve, and disciplined footer hierarchy."
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { compilePromptPackage } = await import("../lib/creative-director.js");

    const output = await compilePromptPackage({
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
        prompt: "Create a premium launch post with one hero tower image.",
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[compilePromptPackage] deprecated V1 compile path invoked; delegating to compilePromptPackageV2"
    );
    expect(output.promptSummary).toBe("A premium project launch route.");
    expect(output.finalPrompt).toContain("Create a premium 1:1 launch image for social media");
    expect(output.compilerTrace?.pipeline).toBe("agno-sequential-workflow-v2");
  });
});
