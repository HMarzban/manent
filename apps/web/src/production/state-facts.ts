// What the state bar says of production: the active revision, or for a day after an issue the issue with its
// Recall, and a mark mode other than Collated with its way back.
import {
  COLOUR_NAMES,
  RECALL_WINDOW_MS,
  REVISION_COLOURS,
  formatRevisionDate,
} from "@manent/revisions";
import type {
  MarkMode,
  NumberingScheme,
  RevisionColour,
} from "@manent/revisions";
import type { CachedProduction } from "@manent/sync-client";
import type {
  IssueView,
  ProductionState,
  RevisionSetView,
} from "@manent/sync-protocol";
import {
  PRODUCTION_WORDS,
  createValue,
  formatDayTime,
  useSubscribable,
} from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useEnvironment } from "../services/context.tsx";
import { useProductionServices } from "./live-services.ts";

const twoDigits = (n: number): string => String(n).padStart(2, "0");

/** The device's calendar day of `at`, YYYY-MM-DD, as a revision is dated. */
export function deviceDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/** Null for a colour this build does not know. */
export const colourOf = (value: string): RevisionColour | null =>
  REVISION_COLOURS.find((colour) => colour === value) ?? null;

/** The first `count` names of `order` and what follows: "White → Blue → Pink …". */
export function colourOrderStart(
  order: readonly RevisionColour[],
  count: number,
): string {
  const names = order.slice(0, count).map((colour) => COLOUR_NAMES[colour]);
  return `${names.join(" → ")} …`;
}

// the defaults line names the first three colours of the order
const DEFAULTS_COLOURS = 3;

/** "Scene numbers 12A · White → Blue → Pink …": what a script is locked with, or would be. */
export function defaultsLine(
  numbering: NumberingScheme,
  order: readonly RevisionColour[],
): string {
  return PRODUCTION_WORDS.lockDefaults(
    PRODUCTION_WORDS.numberingChoices[numbering],
    colourOrderStart(order, DEFAULTS_COLOURS),
  );
}

/** The newest issue, with the revision it issued, while it is an issue and not a correction; null before the first. */
export function latestIssue(
  state: ProductionState,
): { issue: IssueView; set: RevisionSetView } | null {
  const [issue] = state.issues;
  if (issue === undefined || issue.kind !== "issue") return null;
  const set = state.sets.find((held) => held.setId === issue.setId);
  return set === undefined ? null : { issue, set };
}

/** The issue the state bar offers to recall: the latest issue, while it was made within the window. */
function recallFact(state: ProductionState, now: number): StateFact | null {
  const latest = latestIssue(state);
  if (latest === null || now - latest.issue.issuedAt > RECALL_WINDOW_MS)
    return null;
  const { issue, set } = latest;
  const colour = colourOf(set.colour);
  if (colour === null) return null;
  return {
    kind: "recall",
    colour,
    name: set.name,
    at: formatDayTime(issue.issuedAt, now),
    people: issue.recipientUserIds.length,
  };
}

function marksFact(
  mode: Exclude<MarkMode, "collated">,
  sets: readonly RevisionSetView[],
): StateFact | null {
  if (mode === "all" || mode === "none")
    return { kind: "marks_not_collated", mode };
  // with no full draft issued yet, the marks run from the lock's White set, as the pages draw them
  const set =
    mode === "this_revision"
      ? sets.at(-1)
      : (sets.findLast((held) => held.fullDraft && held.issuedAt !== null) ??
        sets[0]);
  const colour = set === undefined ? null : colourOf(set.colour);
  if (set === undefined || colour === null) return null;
  return { kind: "marks_not_collated", mode, colour, name: set.name };
}

/**
 * The production facts of `state`: the recall of the latest issue within RECALL_WINDOW_MS, else the active
 * revision with `revisedPages`, started on `dayOf` its start; then the mark mode when it is not Collated.
 */
export function productionFacts(
  state: CachedProduction | null,
  now: number,
  revisedPages: number,
  mode: MarkMode,
  dayOf: (at: number) => string,
): StateFact[] {
  if (state === null || !state.state.locked) return [];
  const { sets } = state.state;
  const active = sets.at(-1);
  const colour = active === undefined ? null : colourOf(active.colour);
  const facts: StateFact[] = [];
  const recall = recallFact(state.state, now);
  if (recall !== null) facts.push(recall);
  else if (active !== undefined && colour !== null)
    facts.push({
      kind: "revision",
      colour,
      name: active.name,
      started: formatRevisionDate(dayOf(active.startedAt)),
      pages: revisedPages,
    });
  const marks = mode === "collated" ? null : marksFact(mode, sets);
  if (marks !== null) facts.push(marks);
  return facts;
}

const NOTHING = createValue<CachedProduction | null>(null);
const NO_PAGES = createValue<readonly string[]>([]);
const COLLATED = createValue<MarkMode>("collated");

/** The state bar's production facts for `docId`; none until its production services exist. */
export function useProductionFacts(docId: string): readonly StateFact[] {
  const services = useProductionServices(docId);
  const { now } = useEnvironment();
  const state = useSubscribable(services?.client.current() ?? NOTHING);
  const revised = useSubscribable(services?.revisedPages ?? NO_PAGES);
  const mode = useSubscribable(services?.mode ?? COLLATED);
  return productionFacts(state, now(), revised.length, mode, deviceDay);
}
