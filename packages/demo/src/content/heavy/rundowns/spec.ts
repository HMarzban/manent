// Shapes and compact builders for Lanternfield Studios' live-show and news rundowns.
export interface ShowRowSpec {
  readonly kind: "header" | "item" | "script";
  readonly segment: string;
  readonly writer: string | null;
  readonly durMs: number | null;
  readonly docKey: string | null;
}

export interface ShowRundownSpec {
  readonly dayOffset: number;
  readonly docKey: string;
  readonly createdSpec: string;
  readonly rows: readonly ShowRowSpec[];
}

export interface NewsRowSpec {
  readonly kind: "item" | "script";
  readonly story: string;
  readonly presenter: string | null;
  readonly type: string;
  readonly durMs: number | null;
  readonly docKey: string | null;
  readonly unnumbered: boolean;
}

export interface NewsRundownSpec {
  readonly dayOffset: number;
  readonly edition: "1300" | "1830";
  readonly docKey: string;
  readonly creatorUserId: "nadia-petrenko" | "joaquin-ibarra";
  readonly createdSpec: string;
  readonly rows: readonly NewsRowSpec[];
}

const DUR_PATTERN = /^(\d+):([0-5]\d)$/;

/** Converts an `m:ss` duration literal into integer milliseconds. */
export function parseDurMs(text: string): number {
  const match = DUR_PATTERN.exec(text);
  if (match === null) throw new RangeError(`invalid rundown duration: ${text}`);
  return (Number(match[1]) * 60 + Number(match[2])) * 1_000;
}

const daySlug = (offset: number): string =>
  offset === 0
    ? "day"
    : `day-${offset < 0 ? "minus" : "plus"}-${Math.abs(offset)}`;

const dayClock = (offset: number, clock: string): string =>
  offset === 0
    ? `D ${clock}`
    : `D${offset < 0 ? "-" : "+"}${Math.abs(offset)} ${clock}`;

export const showHeader = (segment: string): ShowRowSpec =>
  Object.freeze({
    kind: "header",
    segment,
    writer: null,
    durMs: null,
    docKey: null,
  });

export const showItem = (
  segment: string,
  writer: string | null,
  dur: string,
): ShowRowSpec =>
  Object.freeze({
    kind: "item",
    segment,
    writer,
    durMs: parseDurMs(dur),
    docKey: null,
  });

export const showLead = (
  segment: string,
  writer: string,
  docKey: string,
): ShowRowSpec =>
  Object.freeze({
    kind: "script",
    segment,
    writer,
    durMs: null,
    docKey,
  });

export const showRundown = (
  dayOffset: number,
  rows: readonly ShowRowSpec[],
): ShowRundownSpec =>
  Object.freeze({
    dayOffset,
    docKey: `heavy/h30/rundowns/${daySlug(dayOffset)}`,
    createdSpec: dayOffset <= 0 ? dayClock(dayOffset - 1, "15:00") : "N-3:00",
    rows: Object.freeze(rows),
  });

export const newsItem = (
  story: string,
  presenter: string | null,
  type: string,
  dur: string,
): NewsRowSpec =>
  Object.freeze({
    kind: "item",
    story,
    presenter,
    type,
    durMs: parseDurMs(dur),
    docKey: null,
    unnumbered: false,
  });

export const newsUnnumbered = (
  story: string,
  presenter: string | null,
  type: string,
  dur: string,
): NewsRowSpec =>
  Object.freeze({
    kind: "item",
    story,
    presenter,
    type,
    durMs: parseDurMs(dur),
    docKey: null,
    unnumbered: true,
  });

export const newsLead = (
  story: string,
  presenter: string,
  type: string,
  docKey: string,
): NewsRowSpec =>
  Object.freeze({
    kind: "script",
    story,
    presenter,
    type,
    durMs: null,
    docKey,
    unnumbered: false,
  });

export const newsRundown = (
  dayOffset: number,
  edition: "1300" | "1830",
  rows: readonly NewsRowSpec[],
): NewsRundownSpec => {
  const isMidday = edition === "1300";
  const createdSpec =
    dayOffset <= 0
      ? isMidday
        ? dayClock(dayOffset - 1, "16:00")
        : dayClock(dayOffset, "09:00")
      : isMidday
        ? "N-2:00"
        : "N-1:30";
  return Object.freeze({
    dayOffset,
    edition,
    docKey: `heavy/h31/rundowns/${daySlug(dayOffset)}-${edition}`,
    creatorUserId: isMidday ? "nadia-petrenko" : "joaquin-ibarra",
    createdSpec,
    rows: Object.freeze(rows),
  });
};
