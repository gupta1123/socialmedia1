import type { CreativeOutputRecord, DeliverableStatus } from "@image-lab/contracts";

export const DEFAULT_CALENDAR_SURFACE_STATUSES: DeliverableStatus[] = ["scheduled", "published"];

export function getQueueNextActionHref(deliverableId: string, status: DeliverableStatus) {
  switch (status) {
    case "planned":
    case "brief_ready":
    case "generating":
      return `/studio/create?deliverableId=${deliverableId}`;
    case "review":
      return `/studio/review?deliverableId=${deliverableId}`;
    case "approved":
    case "scheduled":
      return `/studio/deliverables/${deliverableId}?intent=schedule`;
    default:
      return `/studio/deliverables/${deliverableId}`;
  }
}

export function isVisibleOnCalendar(status: DeliverableStatus, statusFilter: "all" | DeliverableStatus) {
  if (statusFilter === "all") {
    return DEFAULT_CALENDAR_SURFACE_STATUSES.includes(status);
  }

  return status === statusFilter;
}

export function isEligibleCalendarCandidate(status: DeliverableStatus) {
  return status === "approved";
}

export function isMovableCalendarStatus(status: DeliverableStatus) {
  return status !== "published" && status !== "archived";
}

export function canGenerateCandidates(selectedReferenceCount: number, hasReusableTemplate: boolean) {
  return selectedReferenceCount > 0 || hasReusableTemplate;
}

export function getCurrentCreatePostTaskId(params: {
  selectedDeliverableId?: string | null | undefined;
  promptPackageDeliverableId?: string | null | undefined;
  finalOutputs?: Array<Pick<CreativeOutputRecord, "deliverableId">> | undefined;
}) {
  return (
    params.selectedDeliverableId ??
    params.promptPackageDeliverableId ??
    params.finalOutputs?.find((output) => output.deliverableId)?.deliverableId ??
    null
  );
}
