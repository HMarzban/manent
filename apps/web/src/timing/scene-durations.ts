// Duration of each slug (or Podcast segment) in a Variety script, for the Scenes tab's length column.
import type { TimingFacts } from "@manent/editor";
import { durationMs } from "@manent/pagination";
import { formatDuration } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { readRateOf } from "./read-rate.ts";
import { timingFactsOf } from "./timing-facts.ts";

const EMPTY: ReadonlyMap<string, string> = new Map();

function buildDurations(
  facts: TimingFacts | null,
  rate: number,
): ReadonlyMap<string, string> {
  if (facts === null || facts.slugs.length === 0) return EMPTY;
  const durations = new Map<string, string>();
  for (const slug of facts.slugs) {
    if (slug.slugId === null) continue;
    durations.set(slug.slugId, formatDuration(durationMs([slug.total], rate)));
  }
  return durations.size === 0 ? EMPTY : durations;
}

function sameDurations(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, text] of a) if (b.get(id) !== text) return false;
  return true;
}

/** Slug block id → formatted duration (`2:10`), empty when `docId` is not timed. */
export function sceneDurations(
  docId: string,
): Subscribable<ReadonlyMap<string, string>> {
  const facts = timingFactsOf(docId);
  const rate = readRateOf(docId);
  let lastFacts: TimingFacts | null | undefined;
  let lastRate: number | undefined;
  let current: ReadonlyMap<string, string> = EMPTY;
  const read = (): ReadonlyMap<string, string> => {
    const nextFacts = facts.get();
    const nextRate = rate.get();
    if (nextFacts !== lastFacts || nextRate !== lastRate) {
      lastFacts = nextFacts;
      lastRate = nextRate;
      const next = buildDurations(nextFacts, nextRate);
      if (!sameDurations(current, next)) current = next;
    }
    return current;
  };
  return {
    get: read,
    subscribe(listener) {
      let notified = read();
      const notify = (): void => {
        const next = read();
        if (next === notified) return;
        notified = next;
        listener(next);
      };
      const stopFacts = facts.subscribe(notify);
      const stopRate = rate.subscribe(notify);
      return () => {
        stopFacts();
        stopRate();
      };
    },
  };
}
