// Live timing facts for each open Variety script, published by the editor's timing plugin.
import type { TimingFacts } from "@manent/editor";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

type Slot = Subscribable<TimingFacts | null> & {
  set(facts: TimingFacts | null): void;
};

const factsByDoc = new Map<string, Slot>();

function slotOf(docId: string): Slot {
  const known = factsByDoc.get(docId) ?? createValue<TimingFacts | null>(null);
  factsByDoc.set(docId, known);
  return known;
}

/** The live timing facts of `docId`, or null when no Variety script is timed there. */
export function timingFactsOf(docId: string): Subscribable<TimingFacts | null> {
  return slotOf(docId);
}

/** For the timing editor plugin only: publishes the latest facts for `docId`, or null when timing is off. */
export function publishTimingFacts(
  docId: string,
  facts: TimingFacts | null,
): void {
  slotOf(docId).set(facts);
}
