import { describe, expect, it } from "vitest";
import {
  buildV2RoleAwarePrompt,
  filterReferenceStoragePathsForPrompt,
  type RoleAwareReferencePlan
} from "../lib/creative-reference-plan.js";

describe("creative reference plan", () => {
  it("keeps site visit variations anchored to a single project image", () => {
    const plan: RoleAwareReferencePlan = {
      primaryAnchor: null,
      sourcePost: null,
      amenityAnchor: null,
      locationMapAnchor: null,
      projectAnchor: {
        role: "project_image",
        label: "Miami elevation Cam011Final_1.jpg",
        storagePath: "project/cam011final_1.jpg"
      },
      brandLogo: null,
      complianceQr: null,
      references: [
        {
          role: "reference",
          label: "Miami elevation Cam017Final_1.jpg",
          storagePath: "project/cam017final_1.jpg"
        }
      ]
    };

    const filtered = filterReferenceStoragePathsForPrompt(plan, "site visit prompt", "site-visit-invite");

    expect(filtered).toEqual(["project/cam011final_1.jpg"]);
  });

  it("falls back to the first truthful reference when project anchor metadata is missing", () => {
    const plan: RoleAwareReferencePlan = {
      primaryAnchor: null,
      sourcePost: null,
      amenityAnchor: null,
      locationMapAnchor: null,
      projectAnchor: null,
      brandLogo: {
        role: "brand_logo",
        label: "pwc_logo_linear_white_bg.png",
        storagePath: "logos/pwc.png"
      },
      complianceQr: null,
      references: [
        {
          role: "reference",
          label: "Miami elevation Cam011Final_1.jpg",
          storagePath: "project/cam011final_1.jpg"
        },
        {
          role: "reference",
          label: "Miami elevation Cam017Final_1.jpg",
          storagePath: "project/cam017final_2.jpg"
        }
      ]
    };

    const filtered = filterReferenceStoragePathsForPrompt(plan, "site visit prompt", "site-visit-invite");
    const prompt = buildV2RoleAwarePrompt("Create a site visit poster.", plan, "final", "site-visit-invite");

    expect(filtered).toEqual(["project/cam011final_1.jpg", "logos/pwc.png"]);
    expect(prompt).toContain("Use the supplied reference image as the primary truth anchor.");
  });

  it("adds exact logo fidelity instructions without changing the project truth anchor", () => {
    const plan: RoleAwareReferencePlan = {
      primaryAnchor: null,
      sourcePost: null,
      amenityAnchor: null,
      locationMapAnchor: null,
      projectAnchor: {
        role: "project_image",
        label: "Miami elevation Cam011Final_1.jpg",
        storagePath: "project/cam011final_1.jpg"
      },
      brandLogo: {
        role: "brand_logo",
        label: "pwc_logo_linear_white_bg.png",
        storagePath: "logos/pwc.png"
      },
      complianceQr: null,
      references: [
        {
          role: "reference",
          label: "Miami elevation Cam017Final_1.jpg",
          storagePath: "project/cam017final_1.jpg"
        }
      ]
    };

    const filtered = filterReferenceStoragePathsForPrompt(plan, "launch prompt", "project-launch");
    const prompt = buildV2RoleAwarePrompt("Create a premium project launch poster.", plan, "final", "project-launch");

    expect(filtered).toEqual(["project/cam011final_1.jpg", "logos/pwc.png"]);
    expect(prompt).toContain("Use the project building as the primary reference.");
    expect(prompt).toContain("Treat the first attached image as the primary truth anchor.");
    expect(prompt).toContain("Use the brand logo (pwc_logo_linear_white_bg.png) as a small footer signature element.");
  });

  it("keeps amenity spotlight anchored to the amenity image", () => {
    const plan: RoleAwareReferencePlan = {
      primaryAnchor: null,
      sourcePost: null,
      amenityAnchor: {
        role: "amenity_image",
        label: "Swimming Pool hero",
        storagePath: "amenities/pool.jpg",
        amenityName: "Swimming Pool"
      },
      locationMapAnchor: null,
      projectAnchor: {
        role: "project_image",
        label: "Building hero",
        storagePath: "project/building.jpg"
      },
      brandLogo: null,
      complianceQr: null,
      references: []
    };

    const filtered = filterReferenceStoragePathsForPrompt(plan, "pool spotlight", "amenity-spotlight");
    const prompt = buildV2RoleAwarePrompt("Create an amenity spotlight poster.", plan, "final", "amenity-spotlight");

    expect(filtered).toEqual(["amenities/pool.jpg"]);
    expect(prompt).toContain("Use the amenity as the hero subject.");
    expect(prompt).toContain("Preserve the supplied project identity and do not switch to a different development");
    expect(prompt).not.toContain("Treat the first attached image as the primary truth anchor.");
    expect(prompt).not.toContain("use the project reference only for project identity context");
  });
});
