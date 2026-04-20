import { describe, expect, it } from "vitest";
import type { PromptPackage } from "@image-lab/contracts";
import {
  buildCreativeBriefFingerprint,
  getPromptPackageBriefFingerprint
} from "./creative-brief-fingerprint";

function makePromptPackage(overrides: Partial<PromptPackage> = {}): PromptPackage {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    brandId: "33333333-3333-4333-8333-333333333333",
    deliverableId: null,
    projectId: "44444444-4444-4444-8444-444444444444",
    postTypeId: "55555555-5555-4555-8555-555555555555",
    creativeTemplateId: null,
    calendarItemId: null,
    creativeRequestId: "66666666-6666-4666-8666-666666666666",
    brandProfileVersionId: "77777777-7777-4777-8777-777777777777",
    promptSummary: "Compiled prompt package",
    finalPrompt: "Final prompt",
    aspectRatio: "4:5",
    chosenModel: "test-model",
    templateType: "announcement",
    referenceStrategy: "generated-template",
    referenceAssetIds: [],
    variations: [
      {
        id: "variation_1",
        title: "Primary route",
        strategy: "Primary route",
        finalPrompt: "Final prompt",
        resolvedConstraints: {},
        compilerTrace: {}
      }
    ],
    resolvedConstraints: {},
    compilerTrace: {
      sourceBrief: {
        brandId: "33333333-3333-4333-8333-333333333333",
        createMode: "post",
        projectId: "44444444-4444-4444-8444-444444444444",
        postTypeId: "55555555-5555-4555-8555-555555555555",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Launch the project",
        prompt: "Show a family on the rooftop at night",
        audience: "Families",
        copyMode: "auto",
        offer: "",
        exactText: "",
        includeBrandLogo: false,
        includeReraQr: false,
        variationCount: 1,
        referenceAssetIds: []
      }
    },
    ...overrides
  };
}

describe("creative brief fingerprint helpers", () => {
  it("normalizes auto copy fields so stale detection matches compiled briefs", () => {
    const first = buildCreativeBriefFingerprint({
      activeBrandId: "brand-1",
      creativeFlowVersion: "v2",
      styleVariationCount: 1,
      brief: {
        createMode: "post",
        projectId: "project-1",
        postTypeId: "post-type-1",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Launch the project",
        prompt: "Show a family on the rooftop at night",
        audience: "Families",
        copyMode: "auto",
        offer: "This should be ignored",
        exactText: "This should also be ignored",
        includeBrandLogo: false,
        includeReraQr: false,
        selectedReferenceAssetIds: []
      }
    });

    const second = buildCreativeBriefFingerprint({
      activeBrandId: "brand-1",
      creativeFlowVersion: "v2",
      styleVariationCount: 1,
      brief: {
        createMode: "post",
        projectId: "project-1",
        postTypeId: "post-type-1",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Launch the project",
        prompt: "Show a family on the rooftop at night",
        audience: "Families",
        copyMode: "auto",
        offer: "",
        exactText: "",
        includeBrandLogo: false,
        includeReraQr: false,
        selectedReferenceAssetIds: []
      }
    });

    expect(first).toBe(second);
  });

  it("derives a fingerprint from a compiled prompt package source brief", () => {
    const promptPackage = makePromptPackage();

    expect(getPromptPackageBriefFingerprint(promptPackage, "v2")).toBe(
      buildCreativeBriefFingerprint({
        activeBrandId: "33333333-3333-4333-8333-333333333333",
        creativeFlowVersion: "v2",
        styleVariationCount: 1,
        brief: {
          createMode: "post",
          projectId: "44444444-4444-4444-8444-444444444444",
          postTypeId: "55555555-5555-4555-8555-555555555555",
          channel: "instagram-feed",
          format: "portrait",
          templateType: "announcement",
          goal: "Launch the project",
          prompt: "Show a family on the rooftop at night",
          audience: "Families",
          copyMode: "auto",
          offer: "",
          exactText: "",
          includeBrandLogo: false,
          includeReraQr: false,
          selectedReferenceAssetIds: []
        }
      })
    );
  });

  it("marks an older compiled package as different when the brief prompt changes", () => {
    const promptPackage = makePromptPackage();
    const currentBriefFingerprint = buildCreativeBriefFingerprint({
      activeBrandId: "brand-1",
      creativeFlowVersion: "v2",
      styleVariationCount: 1,
      brief: {
        createMode: "post",
        projectId: "project-1",
        postTypeId: "post-type-1",
        channel: "instagram-feed",
        format: "portrait",
        goal: "Launch the project",
        prompt: "Show the building facade at sunrise with no people",
        audience: "Families",
        copyMode: "auto",
        offer: "",
        exactText: "",
        includeBrandLogo: false,
        includeReraQr: false,
        selectedReferenceAssetIds: []
      }
    });

    expect(getPromptPackageBriefFingerprint(promptPackage, "v2")).not.toBe(currentBriefFingerprint);
  });
});
