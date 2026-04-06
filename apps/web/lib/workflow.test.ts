import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_SURFACE_STATUSES,
  canGenerateCandidates,
  getCurrentCreatePostTaskId,
  getQueueNextActionHref,
  isEligibleCalendarCandidate,
  isVisibleOnCalendar
} from "./workflow";

describe("web workflow helpers", () => {
  it("routes queue actions to the correct next screen", () => {
    expect(getQueueNextActionHref("task-1", "planned")).toBe("/studio/create?deliverableId=task-1");
    expect(getQueueNextActionHref("task-1", "generating")).toBe("/studio/create?deliverableId=task-1");
    expect(getQueueNextActionHref("task-1", "review")).toBe("/studio/review?deliverableId=task-1");
    expect(getQueueNextActionHref("task-1", "approved")).toBe("/studio/deliverables/task-1?intent=schedule");
    expect(getQueueNextActionHref("task-1", "published")).toBe("/studio/deliverables/task-1");
  });

  it("keeps the default calendar surface limited to schedule-ready work", () => {
    expect(DEFAULT_CALENDAR_SURFACE_STATUSES).toEqual(["scheduled", "published"]);
    expect(isVisibleOnCalendar("scheduled", "all")).toBe(true);
    expect(isVisibleOnCalendar("published", "all")).toBe(true);
    expect(isVisibleOnCalendar("approved", "all")).toBe(false);
    expect(isVisibleOnCalendar("review", "all")).toBe(false);
  });

  it("allows explicit status filters to override the default calendar surface", () => {
    expect(isVisibleOnCalendar("approved", "approved")).toBe(true);
    expect(isVisibleOnCalendar("scheduled", "approved")).toBe(false);
  });

  it("only offers approved work as add-to-calendar candidates", () => {
    expect(isEligibleCalendarCandidate("approved")).toBe(true);
    expect(isEligibleCalendarCandidate("review")).toBe(false);
    expect(isEligibleCalendarCandidate("scheduled")).toBe(false);
  });

  it("requires either selected references or a reusable template for direct candidates", () => {
    expect(canGenerateCandidates(0, false)).toBe(false);
    expect(canGenerateCandidates(1, false)).toBe(true);
    expect(canGenerateCandidates(0, true)).toBe(true);
  });

  it("prefers the most specific current post-task id in create handoff", () => {
    expect(
      getCurrentCreatePostTaskId({
        selectedDeliverableId: "deliverable-1",
        promptPackageDeliverableId: "deliverable-2",
        finalOutputs: [{ deliverableId: "deliverable-3" }]
      })
    ).toBe("deliverable-1");

    expect(
      getCurrentCreatePostTaskId({
        promptPackageDeliverableId: "deliverable-2",
        finalOutputs: [{ deliverableId: "deliverable-3" }]
      })
    ).toBe("deliverable-2");

    expect(
      getCurrentCreatePostTaskId({
        finalOutputs: [{ deliverableId: null }, { deliverableId: "deliverable-3" }]
      })
    ).toBe("deliverable-3");
  });
});
