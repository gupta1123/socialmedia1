import { afterEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.OPENAI_API_KEY ??= "test-openai-key";

vi.mock("../lib/storage.js", () => ({
  downloadStorageBlob: vi.fn(async (storagePath: string) => {
    const type = storagePath.endsWith(".jpg") ? "image/jpeg" : "image/png";
    return new Blob(["test-image"], { type });
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("generateOpenAiImages", () => {
  it("sends multiple edit reference images as image[] fields", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.getAll("image[]")).toHaveLength(2);
      expect(body.getAll("image")).toHaveLength(0);
      expect(body.get("size")).toBe("1024x1536");
      expect(body.get("quality")).toBe("high");

      return new Response(
        JSON.stringify({
          data: [{ b64_json: "Zm9v" }],
          output_format: "png",
        }),
        {
          status: 200,
          headers: { "x-request-id": "openai-test-request" },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { generateOpenAiImages } = await import("../lib/openai-images.js");

    const result = await generateOpenAiImages({
      model: "gpt-image-2-2026-04-21",
      prompt: "Create a premium portrait launch poster",
      aspectRatio: "4:5",
      count: 1,
      referencePaths: ["references/hero.png", "references/detail.jpg"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.request_id).toBe("openai-test-request");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.url).toBe("data:image/png;base64,Zm9v");
  });
});

describe("applyOpenAiDirectEdit", () => {
  it("sends a direct image edit request with the uploaded source image", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("model")).toBe("gpt-image-2");
      expect(body.get("prompt")).toBe("Remove the extra text and keep the building unchanged");
      expect(body.get("n")).toBe("1");
      expect(body.get("size")).toBe("1024x1536");
      expect(body.get("quality")).toBe("high");
      expect(body.get("output_format")).toBe("png");
      expect(body.get("input_fidelity")).toBeNull();
      expect(body.getAll("image[]")).toHaveLength(1);

      return new Response(
        JSON.stringify({
          data: [{ b64_json: "ZWRpdGVk" }],
          output_format: "png",
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { applyOpenAiDirectEdit } = await import("../lib/openai-images.js");

    const result = await applyOpenAiDirectEdit({
      model: "gpt-image-2",
      prompt: "Remove the extra text and keep the building unchanged",
      width: 1080,
      height: 1350,
      image: {
        buffer: Buffer.from("source-image"),
        contentType: "image/png",
        fileName: "source.png",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.model).toBe("gpt-image-2");
    expect(result.imageUrl).toBe("data:image/png;base64,ZWRpdGVk");
    expect(result.imageDataUrl).toBe("data:image/png;base64,ZWRpdGVk");
  });
});
