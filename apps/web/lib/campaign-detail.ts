type CampaignNextStepInput = {
  campaignId: string;
  planCount: number;
  createdCount: number;
  reviewCount: number;
  approvedCount: number;
  scheduledCount: number;
  publishedCount: number;
};

export type CampaignCreatedPostTask = {
  id: string;
  title: string;
  status: string;
  scheduledFor: string;
  campaignPlanId: string | null;
  previewUrl?: string;
};

export type CampaignNextStep =
  | {
      intent: "add-plan";
      title: string;
      body: string;
      primaryLabel: string;
      secondaryHref?: string;
      secondaryLabel?: string;
    }
  | {
      intent: "materialize";
      title: string;
      body: string;
      primaryLabel: string;
      secondaryHref?: string;
      secondaryLabel?: string;
    }
  | {
      intent: "summary";
      title: string;
      body: string;
    }
  | {
      intent: "open-calendar";
      title: string;
      body: string;
      primaryLabel: string;
      primaryHref: string;
      secondaryHref?: string;
      secondaryLabel?: string;
    };

export function getCampaignKpiSummary(value: Record<string, unknown>) {
  const primary = value.primary;
  if (typeof primary === "string" && primary.trim().length > 0) {
    return primary.trim();
  }

  const scalarEntries = Object.entries(value).filter(([, entryValue]) =>
    typeof entryValue === "string" || typeof entryValue === "number"
  );

  if (scalarEntries.length === 0) {
    return null;
  }

  return scalarEntries
    .map(([key, entryValue]) => {
      const label = key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .toLowerCase();

      if (typeof entryValue === "number") {
        return `${entryValue} ${label}`;
      }

      return `${label}: ${entryValue}`;
    })
    .join(" · ");
}

export function getCampaignNextStep(input: CampaignNextStepInput): CampaignNextStep {
  if (input.planCount === 0) {
    return {
      intent: "add-plan",
      title: "Define the first planned posts",
      body: "Campaigns only become actionable once you decide which posts the team should create.",
      primaryLabel: "Add planned post"
    };
  }

  if (input.createdCount === 0) {
    return {
      intent: "materialize",
      title: "Create the first batch of work",
      body: `${input.planCount} planned posts are ready to become active work for the team.`,
      primaryLabel: "Create planned work"
    };
  }

  if (input.reviewCount > 0) {
    return {
      intent: "summary",
      title: "Keep the campaign moving",
      body: `${input.reviewCount} post${input.reviewCount === 1 ? " is" : "s are"} waiting on review or revision.`
    };
  }

  if (input.approvedCount > 0) {
    return {
      intent: "open-calendar",
      title: "Schedule the approved posts",
      body: `${input.approvedCount} approved post${input.approvedCount === 1 ? " is" : "s are"} ready to be scheduled.`,
      primaryLabel: "Open calendar",
      primaryHref: "/studio/calendar"
    };
  }

  if (input.scheduledCount > 0 || input.publishedCount > 0) {
    return {
      intent: "open-calendar",
      title: "Track scheduled campaign work",
      body: `${input.scheduledCount + input.publishedCount} post${input.scheduledCount + input.publishedCount === 1 ? " is" : "s are"} already on the calendar or live.`,
      primaryLabel: "Open calendar",
      primaryHref: "/studio/calendar"
    };
  }

  return {
    intent: "summary",
    title: "Manage the campaign workload",
    body: `${input.createdCount} post${input.createdCount === 1 ? " is" : "s are"} already tied to this campaign.`
  };
}

export function splitCampaignCreatedPostTasks(planIds: string[], postTasks: CampaignCreatedPostTask[]) {
  const byPlanId = new Map<string, CampaignCreatedPostTask[]>();
  const knownIds = new Set(planIds);
  const unmapped: CampaignCreatedPostTask[] = [];

  for (const planId of planIds) {
    byPlanId.set(planId, []);
  }

  for (const postTask of postTasks) {
    if (postTask.campaignPlanId && knownIds.has(postTask.campaignPlanId)) {
      byPlanId.get(postTask.campaignPlanId)?.push(postTask);
    } else {
      unmapped.push(postTask);
    }
  }

  return {
    byPlanId,
    unmapped
  };
}
