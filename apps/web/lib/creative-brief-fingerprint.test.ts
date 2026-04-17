import { describe, expect, it } from "vitest";
import type { PromptPackage } from "@image-lab/contracts";
import {
  buildCreativeBriefFingerprint,
  getPromptPackageBriefFingerprint
} from "./creative-brief-fingerprint";

function makePromptPackage(overrides: Partial<PromptPackage> = {}): PromptPackage {
  return {
    id: "prompt-package-1",
    workspaceId: "workspace-1",
    brandId: "brand-1",
    deliverableId: null,
    projectId: "project-1",
    postTypeId: "post-type-1",
    creativeTemplateId: null,
    calendarItemId: null,
    creativeRequestId: "request-1",
    brandProfileVersionId: "brand-profile-1",
    promptSummary: "Compiled prompt package",
    seedPrompt: "Seed prompt",
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
        seedPrompt: "Seed prompt",
        finalPrompt: "Final prompt",
        referenceStrategy: "generated-template",
        resolvedConstraints: {},
        compilerTrace: {}
      }
    ],
    resolvedConstraints: {},
    compilerTrace: {
      sourceBrief: {
        brandId: "brand-1",
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
        activeBrandId: "brand-1",
        creativeFlowVersion: "v2",
        styleVariationCount: 1,
        brief: {
          createMode: "post",
          projectId: "project-1",
          postTypeId: "post-type-1",
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
