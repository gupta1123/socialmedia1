import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BrandAssetRecord } from "@image-lab/contracts";
import {
  buildProjectAmenityCatalog,
  buildInferredReferenceSelection,
  inferAmenityNameFromAssetParts,
  isAmenityReferenceAsset,
  resolveAmenityFocus
} from "../lib/creative-reference-selection.js";

function buildAsset(input: {
  workspaceId: string;
  brandId: string;
  projectId?: string | null;
  kind?: BrandAssetRecord["kind"];
  label: string;
  metadataJson?: Record<string, unknown>;
}): BrandAssetRecord {
  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    projectId: input.projectId ?? null,
    kind: input.kind ?? "reference",
    label: input.label,
    fileName: `${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.png`,
    mimeType: "image/png",
    storagePath: `brand-assets/${crypto.randomUUID()}.png`,
    thumbnailStoragePath: null,
    metadataJson: input.metadataJson ?? {},
  };
}

describe("creative reference selection", () => {
  it("detects amenity assets from metadata and label cues", () => {
    expect(inferAmenityNameFromAssetParts("Miami sky lounge hero", {})).toBe("sky lounge");
    expect(inferAmenityNameFromAssetParts("Scene 01", { amenityName: "Yoga Deck" })).toBe("Yoga Deck");

    const amenityAsset = buildAsset({
      workspaceId: crypto.randomUUID(),
      brandId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      label: "Miami terrace dusk view",
      metadataJson: { subjectType: "amenity" },
    });

    expect(isAmenityReferenceAsset(amenityAsset)).toBe(true);
  });

  it("prefers project amenity refs over sample flats for amenity spotlight", () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const explicitReferenceId = crypto.randomUUID();
    const projectImageId = crypto.randomUUID();
    const sampleFlatId = crypto.randomUUID();

    const amenityAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami Sky Lounge 01",
      metadataJson: {
        subjectType: "amenity",
        amenityName: "Sky Lounge",
      },
    });

    const sampleFlatAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami living room render",
      metadataJson: {
        subjectType: "sample_flat",
      },
    });

    const selection = buildInferredReferenceSelection({
      postTypeCode: "amenity-spotlight",
      explicitReferenceAssetIds: [explicitReferenceId],
      projectImageAssetIds: [projectImageId],
      sampleFlatImageIds: [sampleFlatId],
      brandReferenceAssetIds: [],
      allAssets: [
        { ...amenityAsset, id: amenityAsset.id },
        { ...sampleFlatAsset, id: sampleFlatId },
      ],
      projectId,
    });

    expect(selection.amenityAssetIds).toContain(amenityAsset.id);
    expect(selection.referenceAssetIds).toEqual([
      explicitReferenceId,
      amenityAsset.id,
    ]);
  });

  it("locks amenity focus and references to the matching amenity asset", () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    const poolAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami pool hero",
      metadataJson: {
        subjectType: "amenity",
        amenityName: "Swimming Pool",
      },
    });

    const parkAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami park hero",
      metadataJson: {
        subjectType: "amenity",
        amenityName: "Park",
      },
    });

    const amenityFocus = resolveAmenityFocus({
      briefText: "Spotlight the pool with a premium lifestyle angle.",
      projectAmenityNames: ["Swimming Pool", "Park"],
      allAssets: [poolAsset, parkAsset],
      projectId,
      seed: "amenity-selection",
    });

    expect(amenityFocus.focusAmenity).toBe("Swimming Pool");
    expect(amenityFocus.amenityAssetIds).toEqual([poolAsset.id]);

    const selection = buildInferredReferenceSelection({
      postTypeCode: "amenity-spotlight",
      explicitReferenceAssetIds: [],
      projectImageAssetIds: [],
      sampleFlatImageIds: [],
      brandReferenceAssetIds: [],
      allAssets: [poolAsset, parkAsset],
      projectId,
      focusAmenity: amenityFocus.focusAmenity,
    });

    expect(selection.amenityAssetIds).toEqual([poolAsset.id]);
    expect(selection.referenceAssetIds).toEqual([poolAsset.id]);
  });

  it("does not fall back to unrelated amenity refs when the focused amenity has no matching asset", () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const projectImageId = crypto.randomUUID();

    const parkAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami park hero",
      metadataJson: {
        subjectType: "amenity",
        amenityName: "Park",
      },
    });

    const selection = buildInferredReferenceSelection({
      postTypeCode: "amenity-spotlight",
      explicitReferenceAssetIds: [],
      projectImageAssetIds: [projectImageId],
      sampleFlatImageIds: [],
      brandReferenceAssetIds: [],
      allAssets: [parkAsset],
      projectId,
      focusAmenity: "Sky Lounge with Cafe and Juice bar",
    });

    expect(selection.amenityAssetIds).toEqual([]);
    expect(selection.referenceAssetIds).toEqual([]);
  });

  it("does not mix sample-flat defaults into project launch reference selection", () => {
    const projectImageId = crypto.randomUUID();
    const sampleFlatId = crypto.randomUUID();
    const brandReferenceId = crypto.randomUUID();

    const selection = buildInferredReferenceSelection({
      postTypeCode: "project-launch",
      explicitReferenceAssetIds: [],
      projectImageAssetIds: [projectImageId],
      sampleFlatImageIds: [sampleFlatId],
      brandReferenceAssetIds: [brandReferenceId],
      allAssets: [],
      projectId: crypto.randomUUID(),
    });

    expect(selection.referenceAssetIds).toEqual([projectImageId, brandReferenceId]);
  });

  it("keeps sample-flat defaults only for sample-flat showcase posts", () => {
    const projectImageId = crypto.randomUUID();
    const sampleFlatId = crypto.randomUUID();

    const selection = buildInferredReferenceSelection({
      postTypeCode: "sample-flat-showcase",
      explicitReferenceAssetIds: [],
      projectImageAssetIds: [projectImageId],
      sampleFlatImageIds: [sampleFlatId],
      brandReferenceAssetIds: [],
      allAssets: [],
      projectId: crypto.randomUUID(),
    });

    expect(selection.referenceAssetIds).toEqual([projectImageId, sampleFlatId]);
  });

  it("builds a project-scoped amenity catalog from profile names and asset metadata", () => {
    const workspaceId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    const loungeAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami sky lounge dusk",
      metadataJson: {
        subjectType: "amenity",
        amenityName: "Sky Lounge",
      },
    });

    const poolAsset = buildAsset({
      workspaceId,
      brandId,
      projectId,
      label: "Miami pool hero",
      metadataJson: {
        subjectType: "amenity",
        amenityName: "Swimming Pool",
      },
    });

    const catalog = buildProjectAmenityCatalog({
      projectAmenityNames: ["Sky Lounge with Cafe and Juice bar", "Swimming Pool", "Gym"],
      allAssets: [loungeAsset, poolAsset],
      projectId,
    });

    expect(catalog.map((entry) => entry.name)).toEqual([
      "Sky Lounge with Cafe and Juice bar",
      "Swimming Pool",
      "Gym",
    ]);
    expect(catalog[0]?.assetIds).toEqual([loungeAsset.id]);
    expect(catalog[0]?.hasAssets).toBe(true);
    expect(catalog[2]?.assetIds).toEqual([]);
    expect(catalog[2]?.hasAssets).toBe(false);
  });
});
