import { describe, expect, it } from "vitest";
import { buildStoragePath, buildThumbnailStoragePath, deriveAspectRatio } from "../lib/utils.js";

describe("storage paths", () => {
  it("namespaces objects under workspace and brand", () => {
    const path = buildStoragePath({
      workspaceId: "workspace-1",
      brandId: "brand-1",
      section: "references",
      id: "asset-1",
      fileName: "Hero Image.PNG"
    });

    expect(path).toBe("workspace-1/brand-1/references/asset-1/hero-image.png");
  });

  it("stores thumbnails beside the original in a thumb folder", () => {
    expect(
      buildThumbnailStoragePath("workspace-1/brand-1/outputs/output-1/hero-image.png")
    ).toBe("workspace-1/brand-1/outputs/output-1/thumb/hero-image.webp");
  });
});

describe("deriveAspectRatio", () => {
  it("uses story ratio for story format", () => {
    expect(deriveAspectRatio("story")).toBe("9:16");
  });
});
