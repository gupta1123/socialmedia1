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

type PostingWindowSuggestionOptions = {
  sameDayOnly?: boolean;
};

export function buildPostingWindowSuggestions(
  postingWindows: PostingWindowRecord[],
  channel: CreativeChannel,
  anchorDate: Date,
  limit = 4,
  options: PostingWindowSuggestionOptions = { sameDayOnly: true }
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

  const maxOffset = options.sameDayOnly === false ? 20 : 0;

  for (let offset = 0; offset <= maxOffset && suggestions.length < limit; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const weekday = weekdayByIndex[day.getDay()];

    for (const postingWindow of uniqueWindows) {
      if (postingWindow.weekday !== weekday) continue;
      const dateTime = applyPostingWindowTimeToDate(day, postingWindow.localTime, postingWindow.timezone);
      suggestions.push({
        key: `${postingWindow.channel}-${dateTime.toISOString()}`,
        label: formatSuggestionLabel(day, postingWindow.localTime, anchorDate, postingWindow.timezone),
        dateTime,
        postingWindow
      });
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions;
}

function applyPostingWindowTimeToDate(date: Date, localTime: string, timezone: string | null | undefined) {
  if (!timezone) {
    return applyLocalTimeToDate(date, localTime);
  }

  const [hours = "00", minutes = "00"] = localTime.split(":");
  try {
    return zonedDateTimeToDate(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Number(hours),
      Number(minutes),
      timezone
    );
  } catch {
    return applyLocalTimeToDate(date, localTime);
  }
}

function zonedDateTimeToDate(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
) {
  const targetUtc = Date.UTC(year, monthIndex, day, hours, minutes, 0, 0);
  let guess = new Date(targetUtc);

  for (let index = 0; index < 2; index += 1) {
    const parts = getDatePartsInTimeZone(guess, timezone);
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    guess = new Date(guess.getTime() + targetUtc - representedUtc);
  }

  return guess;
}

function getDatePartsInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const rawHour = Number(byType.get("hour") ?? "0");

  return {
    year: Number(byType.get("year") ?? "1970"),
    month: Number(byType.get("month") ?? "1"),
    day: Number(byType.get("day") ?? "1"),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(byType.get("minute") ?? "0")
  };
}

function formatSuggestionLabel(date: Date, localTime: string, anchorDate: Date, timezone: string | null | undefined) {
  const dayLabel = isSameDay(date, anchorDate)
    ? "Today"
    : date.toLocaleDateString([], { weekday: "short" });
  const timezoneLabel = formatTimezoneLabel(timezone);
  return `${dayLabel} · ${formatLocalTimeLabel(localTime)}${timezoneLabel ? ` ${timezoneLabel}` : ""}`;
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

function formatTimezoneLabel(timezone: string | null | undefined) {
  if (!timezone) {
    return "";
  }

  try {
    const formatter = new Intl.DateTimeFormat([], {
      timeZone: timezone,
      timeZoneName: "short"
    });
    const zoneName = formatter.formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
    return zoneName ?? timezone;
  } catch {
    return timezone;
  }
}
