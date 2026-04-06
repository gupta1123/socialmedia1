import { describe, expect, it } from "vitest";
import {
  deriveLegacyCreativeFormat,
  inferDeliverableStatusFromExecution,
  mapCalendarStatusToDeliverableStatus,
  mapCreativeFormatToContentFormat,
  mapDeliverableStatusToCalendarStatus,
  materializeScheduledAt
} from "../lib/deliverable-utils.js";

describe("deliverable utils", () => {
  it("maps legacy creative formats into content formats", () => {
    expect(mapCreativeFormatToContentFormat("story")).toBe("story");
    expect(mapCreativeFormatToContentFormat("square")).toBe("static");
  });

  it("derives a legacy creative format from placement and stored source hints", () => {
    expect(deriveLegacyCreativeFormat("instagram-story", "story")).toBe("story");
    expect(deriveLegacyCreativeFormat("linkedin-feed", "static")).toBe("landscape");
    expect(
      deriveLegacyCreativeFormat("instagram-feed", "static", {
        creativeFormat: "portrait"
      })
    ).toBe("portrait");
  });

  it("maps deliverable and calendar statuses both ways", () => {
    expect(mapDeliverableStatusToCalendarStatus("blocked")).toBe("review");
    expect(mapDeliverableStatusToCalendarStatus("approved")).toBe("approved");
    expect(mapCalendarStatusToDeliverableStatus("scheduled")).toBe("scheduled");
  });

  it("infers deliverable execution state from post version and job signals", () => {
    expect(
      inferDeliverableStatusFromExecution({
        hasApprovedPostVersion: true,
        hasPendingPostVersion: false,
        hasFailedJob: false,
        hasRunningJob: false
      })
    ).toBe("approved");

    expect(
      inferDeliverableStatusFromExecution({
        hasApprovedPostVersion: false,
        hasPendingPostVersion: false,
        hasFailedJob: false,
        hasRunningJob: true
      })
    ).toBe("generating");
  });

  it("materializes schedule offsets from the campaign anchor date", () => {
    expect(materializeScheduledAt("2026-03-27T00:00:00.000Z", 2, "2026-03-20T00:00:00.000Z")).toBe(
      "2026-03-29T00:00:00.000Z"
    );
  });
});
