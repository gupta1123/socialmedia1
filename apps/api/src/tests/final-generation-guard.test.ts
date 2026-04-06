import { describe, expect, it } from "vitest";

function canGenerateFinal(referenceUrls: string[], selectedTemplateId?: string) {
  return Boolean(selectedTemplateId) || referenceUrls.length > 0;
}

describe("final generation guard", () => {
  it("rejects final generation when no references exist", () => {
    expect(canGenerateFinal([])).toBe(false);
  });

  it("allows final generation when a template is selected", () => {
    expect(canGenerateFinal([], "template-1")).toBe(true);
  });
});

