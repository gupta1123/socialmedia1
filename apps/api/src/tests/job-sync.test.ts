import { describe, expect, it } from "vitest";
import { extractFalImages, serializeProviderError, shouldMarkJobFailed } from "../lib/job-sync.js";

describe("extractFalImages", () => {
  it("reads queue results from the official result.data.images shape", () => {
    const images = extractFalImages({
      requestId: "req_123",
      data: {
        images: [{ url: "https://files.example.com/seed.png", content_type: "image/png" }]
      }
    });

    expect(images).toEqual([
      {
        url: "https://files.example.com/seed.png",
        content_type: "image/png",
        file_name: null
      }
    ]);
  });

  it("still supports direct images payloads", () => {
    const images = extractFalImages({
      images: [{ url: "https://files.example.com/final.png", file_name: "final.png" }]
    });

    expect(images).toEqual([
      {
        url: "https://files.example.com/final.png",
        content_type: null,
        file_name: "final.png"
      }
    ]);
  });

  it("returns an empty list for invalid payloads", () => {
    expect(extractFalImages({ requestId: "req_123", data: {} })).toEqual([]);
    expect(extractFalImages(null)).toEqual([]);
  });

  it("marks provider 422s as terminal job failures", () => {
    expect(shouldMarkJobFailed({ status: 422 })).toBe(true);
    expect(shouldMarkJobFailed({ response: { status: 404 } })).toBe(true);
    expect(shouldMarkJobFailed({ statusCode: 400 })).toBe(true);
    expect(shouldMarkJobFailed({ status: 500 })).toBe(false);
  });

  it("serializes provider errors for storage", () => {
    expect(serializeProviderError({ status: 422, message: "bad request" })).toEqual({
      message: "bad request",
      statusCode: 422
    });
  });
});
