import { describe, expect, it } from "vitest";
import { getCampaignKpiSummary, getCampaignNextStep, splitCampaignCreatedPostTasks } from "./campaign-detail";

describe("campaign detail helpers", () => {
  it("summarizes KPI primary text directly", () => {
    expect(getCampaignKpiSummary({ primary: "120 target leads" })).toBe("120 target leads");
  });

  it("summarizes KPI fallback numeric keys", () => {
    expect(getCampaignKpiSummary({ targetLeads: 120 })).toBe("120 target leads");
  });

  it("uses add-plan as the first campaign next step", () => {
    expect(
      getCampaignNextStep({
        campaignId: "abc",
        planCount: 0,
        createdCount: 0,
        reviewCount: 0,
        approvedCount: 0,
        scheduledCount: 0,
        publishedCount: 0
      }).intent
    ).toBe("add-plan");
  });

  it("uses materialize when plans exist but no post tasks have been created yet", () => {
    expect(
      getCampaignNextStep({
        campaignId: "abc",
        planCount: 3,
        createdCount: 0,
        reviewCount: 0,
        approvedCount: 0,
        scheduledCount: 0,
        publishedCount: 0
      }).intent
    ).toBe("materialize");
  });

  it("prioritizes scheduling approved posts", () => {
    const nextStep = getCampaignNextStep({
      campaignId: "abc",
      planCount: 3,
      createdCount: 3,
      reviewCount: 0,
      approvedCount: 1,
      scheduledCount: 0,
      publishedCount: 0
    });

    expect(nextStep.intent).toBe("open-calendar");
    if (nextStep.intent !== "open-calendar") {
      throw new Error("Expected open-calendar intent");
    }
    expect(nextStep.primaryHref).toBe("/studio/calendar");
    expect(nextStep.secondaryLabel).toBeUndefined();
  });

  it("does not send review-state campaigns to a separate campaign work page", () => {
    const nextStep = getCampaignNextStep({
      campaignId: "abc",
      planCount: 3,
      createdCount: 3,
      reviewCount: 2,
      approvedCount: 0,
      scheduledCount: 0,
      publishedCount: 0
    });

    expect(nextStep.intent).toBe("summary");
  });

  it("maps created post tasks back to planned posts", () => {
    const grouped = splitCampaignCreatedPostTasks(["plan-a", "plan-b"], [
      { id: "1", title: "A", status: "planned", scheduledFor: "2026-03-31T00:00:00.000Z", campaignPlanId: "plan-a" },
      { id: "2", title: "B", status: "review", scheduledFor: "2026-04-01T00:00:00.000Z", campaignPlanId: "plan-a" },
      { id: "3", title: "C", status: "planned", scheduledFor: "2026-04-02T00:00:00.000Z", campaignPlanId: null }
    ]);

    expect(grouped.byPlanId.get("plan-a")?.map((item) => item.id)).toEqual(["1", "2"]);
    expect(grouped.byPlanId.get("plan-b")).toEqual([]);
    expect(grouped.unmapped.map((item) => item.id)).toEqual(["3"]);
  });
});
