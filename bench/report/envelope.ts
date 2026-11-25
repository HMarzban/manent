// The comfort envelope: typing at each length on each tier, classified against the typing budget,
// and the longest length each tier types comfortably.

import { judge, judgeInterval } from "../budgets.ts";
import type { Budget } from "../budgets.ts";
import { CORPUS_PAGES } from "../corpus/documents.ts";
import type { MetricSummary } from "../result.ts";
import {
  NOT_MEASURED,
  columnsOf,
  formatCount,
  formatStat,
  metricOf,
  scenarioIn,
  table,
} from "./format.ts";
import type { Column, Run } from "./format.ts";

const BOOK_PAGES = [1000, 2000] as const;

/** typing-120's p95 row: every length is classified against it. */
const TYPING_P95: Budget = Object.freeze({
  scenario: "typing-120",
  metric: "keystroke_paint",
  stat: "p95",
  budget: 33,
  hardFail: 50,
});
/** The fewest kept samples a p95 is decided over, across all processes, and of keystrokes in each process. */
const MIN_P95_SAMPLES = 40;
const MIN_KEYSTROKES_A_PROCESS = 200;

const COMFORTS = [
  "comfortable",
  "usable",
  "uncomfortable",
  "undecided",
  NOT_MEASURED,
] as const;
type Comfort = (typeof COMFORTS)[number];

const BY_VERDICT: Readonly<Record<ReturnType<typeof judgeInterval>, Comfort>> =
  Object.freeze({
    pass: "comfortable",
    over_budget: "usable",
    hard_fail: "uncomfortable",
    inconclusive: "undecided",
  });

/** The keystroke p95 classified as a budget is judged: on its interval when a process sampled more than once. */
export function classify(m: MetricSummary | null): Comfort {
  if (m === null) return NOT_MEASURED;
  if (!m.raw.some((process) => process.length > 1))
    return BY_VERDICT[judge(m.p95, TYPING_P95)];
  const pooled = m.raw.flat();
  if (pooled.every((sample) => sample === pooled[0])) return "undecided";
  if (
    pooled.length < MIN_P95_SAMPLES ||
    m.raw.some((p) => p.length < MIN_KEYSTROKES_A_PROCESS)
  )
    return "undecided";
  return BY_VERDICT[judgeInterval(m.intervals.p95, TYPING_P95)];
}

const keystrokesOf = (
  runs: readonly Run[],
  column: Column,
  id: string,
): MetricSummary | null =>
  metricOf(scenarioIn(runs, column, id), "keystroke_paint");

/** The blocks scenario `id` loaded in a column; null when it did not say. */
export function blocksOf(
  runs: readonly Run[],
  column: Column,
  id: string,
): number | null {
  return metricOf(scenarioIn(runs, column, id), "input_blocks")?.max ?? null;
}

function cell(runs: readonly Run[], column: Column, id: string): string {
  const m = keystrokesOf(runs, column, id);
  return m === null ? NOT_MEASURED : `${formatStat(m, "p95")} ${classify(m)}`;
}

/** The longest length that, with every shorter one, is classified as one of `accepted`; null when the shortest is not. */
function reach(
  runs: readonly Run[],
  column: Column,
  accepted: readonly Comfort[],
): number | null {
  let longest: number | null = null;
  for (const pages of CORPUS_PAGES) {
    if (
      !accepted.includes(
        classify(keystrokesOf(runs, column, `typing-${pages}`)),
      )
    )
      break;
    longest = pages;
  }
  return longest;
}

function reachText(
  runs: readonly Run[],
  column: Column,
  word: string,
  pages: number | null,
): string {
  if (pages === null) return `${word} at no measured length`;
  const blocks = blocksOf(runs, column, `typing-${pages}`);
  return `${word} to ${formatCount(pages)} pages${blocks === null ? "" : ` (${formatCount(blocks)} blocks)`}`;
}

/** The columns of the envelope: the tiers that run typing. */
export const envelopeColumns = (runs: readonly Run[]): Column[] =>
  columnsOf(runs, ["client"]);

/** The measured comfort limit of each tier, in column order: `<tier> <n> pages`, or `<tier> none`. */
export function comfortLimits(runs: readonly Run[]): string {
  const limits = envelopeColumns(runs).map((c) => {
    const pages = reach(runs, c, ["comfortable"]);
    return pages === null
      ? `${c.label} none`
      : `${c.label} ${formatCount(pages)} pages`;
  });
  return limits.length === 0 ? NOT_MEASURED : limits.join(", ");
}

export function envelopeSection(runs: readonly Run[]): string {
  const columns = envelopeColumns(runs);
  const ids = [
    ...CORPUS_PAGES.map((p) => `typing-${p}`),
    ...BOOK_PAGES.map((p) => `typing-book-${p}`),
  ];
  const rows = ids.map((id) => [id, ...columns.map((c) => cell(runs, c, id))]);
  const lines = columns.map((c) => {
    const comfortable = reachText(
      runs,
      c,
      "comfortable",
      reach(runs, c, ["comfortable"]),
    );
    const usable = reachText(
      runs,
      c,
      "usable",
      reach(runs, c, ["comfortable", "usable"]),
    );
    return `${c.label}: ${comfortable}; ${usable}.`;
  });
  return [
    table(["Scenario", ...columns.map((c) => c.label)], rows),
    ...lines,
  ].join("\n\n");
}
