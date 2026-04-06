import { describe, expect, it } from "vitest";
import type { SeriesRecord } from "@image-lab/contracts";
import {
  canMaterializeSeries,
  describeSeriesReadiness,
  getSeriesActionLabel,
  hasSeriesPlanningRhythm,
  sortSeriesWeekdays
} from "./series-workflow";

function makeSeries(overrides: Partial<SeriesRecord> = {}): SeriesRecord {
  return {
    id: "series-1",
    workspaceId: "workspace-1",
    brandId: "brand-1",
    projectId: null,
    contentPillarId: null,
    name: "Weekly update",
    description: null,
    objectiveCode: null,
    postTypeId: null,
    creativeTemplateId: null,
    channelAccountId: null,
    placementCode: null,
    contentFormat: null,
    ownerUserId: null,
    cadence: {
      frequency: "weekly",
      interval: 1,
      weekdays: [],
      occurrencesAhead: 30
    },
    startAt: null,
    endAt: null,
    status: "active",
    sourceBriefJson: {},
    ...overrides
  };
}

describe("series workflow helpers", () => {
  it("sorts weekdays in a stable monday-first order", () => {
    expect(sortSeriesWeekdays(["thursday", "monday", "sunday"])).toEqual(["monday", "thursday", "sunday"]);
  });

  it("treats a series with no weekdays as concept-only", () => {
    const series = makeSeries();

    expect(hasSeriesPlanningRhythm(series)).toBe(false);
    expect(getSeriesActionLabel(series)).toBe("Set up recurring work");
    expect(describeSeriesReadiness(series)).toBe("Concept only · no planning rhythm yet.");
  });

  it("asks for defaults when a planning rhythm exists but work defaults are missing", () => {
    const series = makeSeries({
      cadence: {
        frequency: "weekly",
        interval: 1,
        weekdays: ["monday", "thursday"],
        occurrencesAhead: 30
      }
    });

    expect(hasSeriesPlanningRhythm(series)).toBe(true);
    expect(canMaterializeSeries(series)).toBe(false);
    expect(getSeriesActionLabel(series)).toBe("Complete recurring setup");
    expect(describeSeriesReadiness(series)).toContain("Planning rhythm: Mon · Thu");
  });

  it("is ready to create recurring post tasks only when rhythm and defaults both exist", () => {
    const series = makeSeries({
      postTypeId: "post-type-1",
      placementCode: "instagram-story",
      contentFormat: "story",
      cadence: {
        frequency: "weekly",
        interval: 1,
        weekdays: ["thursday"],
        occurrencesAhead: 30
      }
    });

    expect(canMaterializeSeries(series)).toBe(true);
    expect(getSeriesActionLabel(series)).toBe("Create upcoming tasks");
    expect(describeSeriesReadiness(series)).toContain("ready to create recurring post tasks");
  });
});
