import { describe, expect, it } from "vitest";
import {
  buildProtectedImageEditPrompt,
  detectProtectedImageEditPermissions
} from "../lib/image-edit-prompt-protection.js";

describe("image edit prompt protection", () => {
  it("keeps protected areas locked for unrelated edits", () => {
    const permissions = detectProtectedImageEditPermissions("Make the sky warmer and remove the person in the corner.");

    expect(permissions).toEqual({
      buildingTruth: false,
      brandMarks: false,
      textAndCompliance: false
    });

    const prompt = buildProtectedImageEditPrompt("Make the sky warmer and remove the person in the corner.");

    expect(prompt).toContain("Building/elevation truth: not requested.");
    expect(prompt).toContain("Logo/brand marks: not requested.");
    expect(prompt).toContain("Text/compliance: not requested.");
    expect(prompt).toContain("Never invent a more complete, premium, fantasy, or different building.");
  });

  it("only unlocks a protected area when the user explicitly asks", () => {
    expect(detectProtectedImageEditPermissions("Replace the logo with the newer black version.")).toMatchObject({
      brandMarks: true,
      buildingTruth: false
    });
    expect(detectProtectedImageEditPermissions("Change the tower facade to a white finish.")).toMatchObject({
      buildingTruth: true,
      brandMarks: false
    });
    expect(detectProtectedImageEditPermissions("Update the RERA number and phone text.")).toMatchObject({
      textAndCompliance: true
    });
  });

  it("does not treat preserve instructions as permission to change", () => {
    const permissions = detectProtectedImageEditPermissions(
      "Brighten the foreground, but do not change the logo, building elevation, RERA QR, or any text."
    );

    expect(permissions).toEqual({
      buildingTruth: false,
      brandMarks: false,
      textAndCompliance: false
    });
  });
});
