import type {
  CalendarItemStatus,
  ContentFormat,
  CreativeFormat,
  DeliverableRecord,
  DeliverableStatus,
  PlacementCode
} from "@image-lab/contracts";

export function deriveCreativeFormatFromDeliverable(
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

export function mapCreativeFormatToContentFormat(format: CreativeFormat): ContentFormat {
  return format === "story" ? "story" : "static";
}

export function summarizeDeliverable(deliverable: DeliverableRecord) {
  return {
    channel: deliverable.placementCode,
    format: deriveCreativeFormatFromDeliverable(
      deliverable.placementCode,
      deliverable.contentFormat,
      deliverable.sourceJson
    )
  };
}

function isCreativeFormat(value: string): value is CreativeFormat {
  return ["square", "portrait", "landscape", "story", "cover"].includes(value);
}
