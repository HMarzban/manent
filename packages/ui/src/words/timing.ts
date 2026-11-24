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
});
