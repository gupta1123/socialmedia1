import type { CreativeChannel, PostingWindowRecord, WeekdayCode } from "@image-lab/contracts";

export const weekdayOptions: Array<{ value: WeekdayCode; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" }
];

const weekdayByIndex: WeekdayCode[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function formatWeekdayLabel(weekday: WeekdayCode) {
  return weekdayOptions.find((option) => option.value === weekday)?.label ?? weekday;
}

export function formatLocalTimeLabel(localTime: string) {
  const [hours = "00", minutes = "00"] = localTime.split(":");
  const value = new Date();
  value.setHours(Number(hours), Number(minutes), 0, 0);
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function applyLocalTimeToDate(date: Date, localTime: string) {
  const [hours = "00", minutes = "00"] = localTime.split(":");
  const next = new Date(date);
  next.setHours(Number(hours), Number(minutes), 0, 0);
  return next;
}

export function buildPostingWindowSuggestions(
  postingWindows: PostingWindowRecord[],
  channel: CreativeChannel,
  anchorDate: Date,
  limit = 4
) {
  const activeWindows = postingWindows
    .filter((postingWindow) => postingWindow.active && postingWindow.channel === channel)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      if (left.weekday !== right.weekday) return weekdayOptions.findIndex((item) => item.value === left.weekday) - weekdayOptions.findIndex((item) => item.value === right.weekday);
      return left.localTime.localeCompare(right.localTime);
    });

  const uniqueWindows = Array.from(
    new Map(
      activeWindows.map((postingWindow) => [
        `${postingWindow.channel}:${postingWindow.weekday}:${normalizeLocalTime(postingWindow.localTime)}`,
        postingWindow
      ])
    ).values()
  );

  const suggestions: Array<{
    key: string;
    label: string;
    dateTime: Date;
    postingWindow: PostingWindowRecord;
  }> = [];

  const start = new Date(anchorDate);
  start.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < 21 && suggestions.length < limit; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const weekday = weekdayByIndex[day.getDay()];

    for (const postingWindow of uniqueWindows) {
      if (postingWindow.weekday !== weekday) continue;
      const dateTime = applyLocalTimeToDate(day, postingWindow.localTime);
      suggestions.push({
        key: `${postingWindow.channel}-${dateTime.toISOString()}`,
        label: formatSuggestionLabel(day, postingWindow.localTime, anchorDate),
        dateTime,
        postingWindow
      });
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions;
}

function formatSuggestionLabel(date: Date, localTime: string, anchorDate: Date) {
  const dayLabel = isSameDay(date, anchorDate)
    ? "Today"
    : date.toLocaleDateString([], { weekday: "short" });
  return `${dayLabel} · ${formatLocalTimeLabel(localTime)}`;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function normalizeLocalTime(localTime: string) {
  return localTime.slice(0, 5);
}
