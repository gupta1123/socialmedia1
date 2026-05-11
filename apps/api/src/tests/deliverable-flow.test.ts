import { describe, expect, it } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { mapVerdictToApprovalAction, resolveApprovalState } = await import("../lib/deliverable-flow.js");

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
