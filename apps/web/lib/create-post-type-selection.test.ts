import { describe, expect, it } from "vitest";
import { resolvePlacementForPostTypeSelection } from "./create-post-type-selection";

describe("resolvePlacementForPostTypeSelection", () => {
  it("preserves a valid user-selected placement when the post type changes", () => {
    const next = resolvePlacementForPostTypeSelection({
      current: {
        channel: "instagram-feed",
        format: "portrait",
        templateType: "announcement"
      },
      postType: {
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["square", "landscape"],
          recommendedTemplateTypes: ["hero"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: [],
        }
      }
    });

    expect(next.channel).toBe("instagram-feed");
    expect(next.format).toBe("portrait");
    expect(next.templateType).toBe("announcement");
  });

  it("falls back to a valid channel and keeps the current format when it becomes valid there", () => {
    const next = resolvePlacementForPostTypeSelection({
      current: {
        channel: "instagram-story",
        format: "landscape",
        templateType: undefined
      },
      postType: {
        config: {
          defaultChannels: ["instagram-feed"],
          allowedFormats: ["square", "portrait"],
          recommendedTemplateTypes: ["announcement"],
          requiredBriefFields: ["goal", "prompt"],
          safeZoneGuidance: [],
        }
      }
    });

    expect(next.channel).toBe("instagram-feed");
    expect(next.format).toBe("landscape");
    expect(next.templateType).toBe("announcement");
  });
});
