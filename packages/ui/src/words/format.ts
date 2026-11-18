// Counts, days, dates, times and lists of names, as every interface sentence writes them.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const twoDigits = (n: number): string => String(n).padStart(2, "0");

/** Digits with thousands separators: "1,212". */
export function formatCount(n: number): string {
  return n.toLocaleString("en-GB");
}

/** The day of the week in local time: "Mon". */
export function formatDay(at: number): string {
  return DAYS[new Date(at).getDay()] ?? "";
}

/** The day and month in local time: "12 Nov". */
export function formatDate(at: number): string {
  const date = new Date(at);
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""}`;
}

/** The 24-hour local time: "14:10", "09:00". */
export function formatTime(at: number): string {
  const date = new Date(at);
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/** How long ago `at` was, for the Library's Last edited column: "just now", "14 min ago", "1 hr ago", "Mon", then "12 Nov". */
export function formatWhen(at: number, now: number): string {
  const ago = now - at;
  if (ago < MINUTE_MS) return "just now";
  if (ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)} min ago`;
  if (ago < DAY_MS) return `${Math.floor(ago / HOUR_MS)} hr ago`;
  if (ago < WEEK_MS) return formatDay(at);
  return formatDate(at);
}

/** "Dana", "Dana and Sam", "Dana, Sam and Priya". */
export function joinNames(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
