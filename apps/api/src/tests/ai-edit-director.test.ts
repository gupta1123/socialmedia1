import { beforeAll, describe, expect, it } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.AI_EDIT_DIRECTOR_MODE ??= "mock";

let buildMockImageEditPlan: typeof import("../lib/ai-edit-director.js").buildMockImageEditPlan;

beforeAll(async () => {
  ({ buildMockImageEditPlan } = await import("../lib/ai-edit-director.js"));
});

describe("buildMockImageEditPlan", () => {
  it("detects a remove intent and person target", () => {
    const result = buildMockImageEditPlan({
      brandName: "Krisala Developers",
      prompt: "remove the person from the entrance walkway"
    });

    expect(result.targetObject).toBe("person");
    expect(result.editIntent).toBe("remove");
    expect(result.rewrittenPrompt).toContain("Remove only the masked person");
  });

  it("detects recolor requests for a sofa", () => {
    const result = buildMockImageEditPlan({
      brandName: "Krisala Developers",
      prompt: "change the sofa color to beige"
    });

    expect(result.targetObject).toBe("sofa");
    expect(result.editIntent).toBe("recolor");
    expect(result.rewrittenPrompt).toContain("masked sofa");
  });

  it("marks vague prompts as ambiguous", () => {
    const result = buildMockImageEditPlan({
      brandName: "Krisala Developers",
      prompt: "fix this"
    });

    expect(result.targetObject).toBe("target region");
    expect(result.ambiguityNotes.length).toBeGreaterThan(0);
    expect(result.segmentationHints.requiresPointSelection).toBe(true);
  });
});
