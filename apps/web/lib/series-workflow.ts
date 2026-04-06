import type { SeriesRecord } from "@image-lab/contracts";

type SeriesWeekday = SeriesRecord["cadence"]["weekdays"][number];

export const SERIES_WEEKDAY_OPTIONS = [
  { code: "monday", label: "Mon" },
  { code: "tuesday", label: "Tue" },
  { code: "wednesday", label: "Wed" },
  { code: "thursday", label: "Thu" },
  { code: "friday", label: "Fri" },
  { code: "saturday", label: "Sat" },
  { code: "sunday", label: "Sun" }
] as const;

export function sortSeriesWeekdays(weekdays: SeriesWeekday[]) {
  const order = new Map<SeriesWeekday, number>(
    SERIES_WEEKDAY_OPTIONS.map((day, index) => [day.code, index])
  );
  return [...weekdays].sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99));
}

export function hasSeriesPlanningRhythm(series: Pick<SeriesRecord, "cadence">) {
  return (series.cadence.weekdays?.length ?? 0) > 0;
}

export function canMaterializeSeries(series: SeriesRecord) {
  return Boolean(
    hasSeriesPlanningRhythm(series) &&
      series.postTypeId &&
      series.placementCode &&
      series.contentFormat
  );
}

export function getSeriesActionLabel(series: SeriesRecord) {
  if (!hasSeriesPlanningRhythm(series)) {
    return "Set up recurring work";
  }

  if (!canMaterializeSeries(series)) {
    return "Complete recurring setup";
  }

  return "Create upcoming tasks";
}

export function describeSeriesReadiness(series: SeriesRecord) {
  if (!hasSeriesPlanningRhythm(series)) {
    return "Concept only · no planning rhythm yet.";
  }

  const rhythmLabel = `Planning rhythm: ${series.cadence.weekdays.map(formatSeriesWeekdayShort).join(" · ")}`;
  if (canMaterializeSeries(series)) {
    return `${rhythmLabel} · ready to create recurring post tasks.`;
  }

  return `${rhythmLabel} · add post type, placement, and format to create post tasks.`;
}

export function formatSeriesWeekdayShort(value: SeriesWeekday) {
  const match = SERIES_WEEKDAY_OPTIONS.find((day) => day.code === value);
  return match?.label ?? value.slice(0, 3);
}
