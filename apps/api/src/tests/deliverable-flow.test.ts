import { describe, expect, it } from "vitest";
import { mapVerdictToApprovalAction, resolveApprovalState } from "../lib/deliverable-flow.js";

describe("deliverable feedback transitions", () => {
  it("maps off-brand feedback to a hard reject action", () => {
    expect(mapVerdictToApprovalAction("off-brand")).toBe("reject");
  });

  it("blocks the deliverable when a version is rejected", () => {
    expect(resolveApprovalState("reject", null)).toEqual({
      postVersionStatus: "rejected",
      deliverableStatus: "blocked",
      approvedPostVersionId: null
    });
  });
});
