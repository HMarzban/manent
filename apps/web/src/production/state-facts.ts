// What the state bar says of production: the active revision, or for a day after an issue the issue with its
// Recall, and a mark mode other than Collated with its way back.
import {
  COLOUR_NAMES,
  RECALL_WINDOW_MS,
  REVISION_COLOURS,
  formatRevisionDate,
} from "@manent/revisions";
import type { MarkMode, RevisionColour } from "@manent/revisions";
import type { CachedProduction } from "@manent/sync-client";
import type { RevisionSetView } from "@manent/sync-protocol";
import {
  createValue,
  formatDay,
  formatTime,
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

/** The issue the state bar offers to recall: the newest, while it is an issue made within the window. */
function recallFact(
  state: CachedProduction["state"],
  now: number,
): StateFact | null {
  const [latest] = state.issues;
  if (latest === undefined || latest.kind !== "issue") return null;
  if (now - latest.issuedAt > RECALL_WINDOW_MS) return null;
  const set = state.sets.find((held) => held.setId === latest.setId);
  const colour = set === undefined ? null : colourOf(set.colour);
  if (set === undefined || colour === null) return null;
  return {
    kind: "recall",
    colour,
    name: set.name,
    at: `${formatDay(latest.issuedAt)} ${formatTime(latest.issuedAt)}`,
    people: latest.recipientUserIds.length,
  };
}

function marksFact(
  mode: Exclude<MarkMode, "collated">,
  sets: readonly RevisionSetView[],
): StateFact | null {
  if (mode === "all" || mode === "none")
    return { kind: "marks_not_collated", mode };
  const set =
    mode === "this_revision"
      ? sets.at(-1)
      : sets.findLast((held) => held.fullDraft && held.issuedAt !== null);
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
