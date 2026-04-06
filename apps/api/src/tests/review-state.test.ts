import { describe, expect, it } from "vitest";
import { mapVerdictToReviewState } from "../lib/review-state.js";

describe("mapVerdictToReviewState", () => {
  it("marks approved outputs as approved", () => {
    expect(mapVerdictToReviewState("approved")).toBe("approved");
  });

  it("marks close verdicts as closed", () => {
    expect(mapVerdictToReviewState("close")).toBe("closed");
  });

  it("routes revision verdicts to needs_revision", () => {
    expect(mapVerdictToReviewState("off-brand")).toBe("needs_revision");
    expect(mapVerdictToReviewState("wrong-layout")).toBe("needs_revision");
    expect(mapVerdictToReviewState("wrong-text")).toBe("needs_revision");
  });
});
