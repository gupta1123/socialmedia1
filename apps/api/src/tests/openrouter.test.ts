import { describe, expect, it } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { extractOpenRouterImages } = await import("../lib/openrouter.js");

describe("extractOpenRouterImages", () => {
  it("reads image urls from message.images", () => {
    const images = extractOpenRouterImages({
      choices: [
        {
          message: {
            images: [
              {
                image_url: {
                  url: "https://example.com/one.png"
                }
              }
            ]
          }
        }
      ]
    });

    expect(images).toEqual([
      {
        url: "https://example.com/one.png",
        content_type: null,
        file_name: null
      }
    ]);
  });

  it("reads image urls from message.content output_image items", () => {
    const images = extractOpenRouterImages({
      choices: [
        {
          message: {
            content: [
              {
                type: "output_image",
                imageUrl: {
                  url: "data:image/png;base64,abc"
                }
              }
            ]
          }
        }
      ]
    });

    expect(images).toEqual([
      {
        url: "data:image/png;base64,abc",
        content_type: null,
        file_name: null
      }
    ]);
  });
});
