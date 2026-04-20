import { describe, expect, it } from "vitest";
import { toViewerResponse } from "../lib/viewer.js";

describe("toViewerResponse", () => {
  it("maps the authenticated viewer to the public bootstrap shape", () => {
    expect(
      toViewerResponse({
        userId: "35e5197a-8536-4d46-89ae-dc04647da7ee",
        email: "demo@imagelab.local"
      })
    ).toEqual({
      id: "35e5197a-8536-4d46-89ae-dc04647da7ee",
      email: "demo@imagelab.local",
      isPlatformAdmin: false
    });
  });
});
