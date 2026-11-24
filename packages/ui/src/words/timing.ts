// Words for Variety and Podcast read-rate timing readouts, selection time and unread T= titles.

const formatRate = (rate: number): string => String(Number(rate.toFixed(4)));

export const TIMING_WORDS = Object.freeze({
  /** The timing readout's tooltip, with no trailing zeros on the read rate. */
  readoutTooltip: (rate: number): string =>
    `Timed at ${formatRate(rate)} characters a second`,
  /** The timing readout's accessible name. */
  readoutName: (duration: string): string => `Running time ${duration}`,
  /** The row label for a selection's time in Details → Selection. */
  selectionTime: "Time",
  /** The dotted underline's title on an unread T= form; a Podcast names a Cue instead of a Bracket. */
  unreadTime: (
    form: string,
    code: "malformed" | "repeated",
    podcast: boolean,
  ): string =>
    code === "malformed"
      ? `"${form}" sets no time — write minutes and two-digit seconds, as T=2:07.`
      : podcast
        ? `"${form}" is a second time in this Cue; only the first counts.`
        : `"${form}" is a second time in this Bracket; only the first counts.`,
  /** Unit shown after the Read rate number field in Project settings → Format and style. */
  readRateUnit: "characters a second",
  /** A read rate formatted with its unit and no trailing zeros. */
  readRateValue: (rate: number): string =>
    `${formatRate(rate)} characters a second`,
  /** Shown under the Read rate field when an entry is not accepted; the old value is kept. */
  readRateRefused: (entered: string): string =>
    `${entered} isn't a read rate — write characters a second from 1 to 50, as 11.25.`,
  /** A Details or Send Check row for a T= form that sets no time; before the first slug, the slug prefix is left out. */
  unreadTimeCheck: (
    slug: string | null,
    form: string,
    code: "malformed" | "repeated",
    podcast: boolean,
  ): string => {
    const body =
      code === "malformed"
        ? `"${form}" sets no time — write minutes and two-digit seconds, as T=2:07`
        : podcast
          ? `"${form}" is a second time in this Cue; only the first counts`
          : `"${form}" is a second time in this Bracket; only the first counts`;
    return slug === null || slug === "" ? body : `${slug} · ${body}`;
  },
  /** The Check row's action button that opens the bracket (or Cue in a Podcast). */
  seeBracket: (podcast: boolean): string =>
    podcast ? "See Cue" : "See Bracket",
});
