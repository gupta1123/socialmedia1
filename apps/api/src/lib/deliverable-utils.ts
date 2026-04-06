import type {
  CalendarItemStatus,
  ContentFormat,
  CreativeFormat,
  DeliverableStatus,
  PlacementCode
} from "@image-lab/contracts";

export function mapCreativeFormatToContentFormat(format: CreativeFormat): ContentFormat {
  if (format === "story") {
    return "story";
  }

  return "static";
}

export function deriveLegacyCreativeFormat(
  placementCode: PlacementCode,
  contentFormat: ContentFormat,
  sourceJson?: Record<string, unknown> | null
): CreativeFormat {
  const preferred = typeof sourceJson?.creativeFormat === "string" ? sourceJson.creativeFormat : null;

  if (preferred && isCreativeFormat(preferred)) {
    return preferred;
  }

  if (contentFormat === "story") {
    return "story";
  }

  switch (placementCode) {
    case "instagram-story":
      return "story";
    case "linkedin-feed":
    case "x-post":
      return "landscape";
    case "tiktok-cover":
      return "cover";
    case "ad-creative":
      return "portrait";
    case "instagram-feed":
    default:
      return "square";
  }
}

export function mapDeliverableStatusToCalendarStatus(status: DeliverableStatus): CalendarItemStatus {
  if (status === "blocked") {
    return "review";
  }

  return status;
}

export function mapCalendarStatusToDeliverableStatus(status: CalendarItemStatus): DeliverableStatus {
  return status;
}

export function inferDeliverableStatusFromExecution(args: {
  hasApprovedPostVersion: boolean;
  hasPendingPostVersion: boolean;
  hasFailedJob: boolean;
  hasRunningJob: boolean;
  latestOutputReviewState?: "pending_review" | "approved" | "needs_revision" | "closed" | null;
}): DeliverableStatus {
  if (args.hasApprovedPostVersion) {
    return "approved";
  }

  if (args.hasRunningJob) {
    return "generating";
  }

  if (args.hasPendingPostVersion || args.latestOutputReviewState === "pending_review") {
    return "review";
  }

  if (args.hasFailedJob || args.latestOutputReviewState === "needs_revision") {
    return "blocked";
  }

  return "brief_ready";
}

export function materializeScheduledAt(startAt: string | null, offsetDays: number | null, fallback: string) {
  const base = startAt ? new Date(startAt) : new Date(fallback);

  if (Number.isNaN(base.getTime())) {
    return fallback;
  }

  if (typeof offsetDays === "number") {
    base.setUTCDate(base.getUTCDate() + offsetDays);
  }

  return base.toISOString();
}

function isCreativeFormat(value: string): value is CreativeFormat {
  return ["square", "portrait", "landscape", "story", "cover"].includes(value);
}
