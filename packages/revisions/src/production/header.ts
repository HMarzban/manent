// The print text of a revision's dates, page headers and memos.

// The same abbreviations as the interface writes in its dates.
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
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const DAY = new RegExp("^(\\d{4})-(\\d{2})-(\\d{2})$");

interface Day {
  readonly year: string;
  readonly month: string;
  readonly date: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseDay(day: string): Day {
  const [, year = "", month = "", date = ""] = DAY.exec(day) ?? [];
  const m = Number(month);
  const d = Number(date);
  const leapDay = m === 2 && isLeapYear(Number(year)) ? 1 : 0;
  const last = (DAYS_IN_MONTH[m - 1] ?? 0) + leapDay;
  const name = MONTHS[m - 1];
  if (name === undefined || d < 1 || d > last) {
    throw new RangeError(`a revision day must be a YYYY-MM-DD day, not ${day}`);
  }
  return { year, month: name, date: d };
}

function pagesWord(pages: readonly string[]): string {
  if (pages.length === 0) {
    throw new RangeError("a list of pages must hold at least 1 page, not 0");
  }
  return pages.length === 1 ? "p." : "pp.";
}

/** "2026-11-16" → "16 Nov 2026"; RangeError for a day that is not YYYY-MM-DD. */
export function formatRevisionDate(day: string): string {
  const { year, month, date } = parseDay(day);
  return `${date} ${month} ${year}`;
}

/** "2026-11-17" → "17 Nov"; RangeError for a day that is not YYYY-MM-DD. */
export function formatMemoDate(day: string): string {
  const { month, date } = parseDay(day);
  return `${date} ${month}`;
}

/** A revised page's header: "Blue Rev. (16 Nov 2026)". */
export function revisionHeader(name: string, day: string): string {
  return `${name} Rev. (${formatRevisionDate(day)})`;
}

/** "p. 3", "pp. 17 and 21A", "pp. 3, 9 and 17"; RangeError for no pages. */
export function pageList(pages: readonly string[]): string {
  const word = pagesWord(pages);
  if (pages.length === 1) return `${word} ${pages[0]}`;
  return `${word} ${pages.slice(0, -1).join(", ")} and ${pages.at(-1)}`;
}

/** An issue's memo: "Pink revisions 17 Nov: pp. 3, 9, 17A", every label in the order given; RangeError for no pages. */
export function memoText(
  name: string,
  day: string,
  pages: readonly string[],
): string {
  return `${name} revisions ${formatMemoDate(day)}: ${pagesWord(pages)} ${pages.join(", ")}`;
}

/** The start of a correction's memo, which the person's own words follow: "Blue (corrected), 17 Nov. Replaces p. 9 of Blue as issued on 16 Nov. Corrected: ". */
export function recallMemo(
  name: string,
  day: string,
  pages: readonly string[],
  issuedDay: string,
): string {
  return `${name} (corrected), ${formatMemoDate(day)}. Replaces ${pageList(pages)} of ${name} as issued on ${formatMemoDate(issuedDay)}. Corrected: `;
}
