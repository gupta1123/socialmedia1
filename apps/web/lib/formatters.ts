export function formatRelativeTime(date: string | Date | null) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  if (isToday) {
    return `Today ${timeStr}`;
  }
  if (isYesterday) {
    return `Yesterday ${timeStr}`;
  }
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${timeStr}`;
}

export function formatDisplayDate(date: string | Date | null) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Unknown";

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function formatDisplayDateRange(start: string | Date | null, end: string | Date | null) {
  if (!start && !end) return "No window";
  const startLabel = start ? formatDisplayDate(start) : "Open";
  const endLabel = end ? formatDisplayDate(end) : "Open";
  return `${startLabel} → ${endLabel}`;
}

export function formatDisplayDateTime(date: string | Date | null) {
  if (!date) return "Unknown";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Unknown";

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
