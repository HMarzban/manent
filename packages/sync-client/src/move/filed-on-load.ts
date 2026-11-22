// What a move files as Recovered text when the new document loads: what the replay's answer
// names, what was typed meanwhile, and what the replay wrote that a later row removed since.
import type { DocJSON } from "@manent/schema";
import type { ReplayResponse } from "@manent/sync-protocol";
import { differingText, textLeftover } from "../recovery/recover.ts";
import type { Leftover, MineMerge } from "../recovery/recover.ts";
import { wordingsOf } from "../review/overlaps.ts";

/**
 * One load: the replay's answer (null when none was made), the script as synced, as sent, as typed
 * meanwhile and as loaded, and whether the loaded document holds deleted text the replay wrote.
 */
interface Load {
  answer: ReplayResponse | null;
  synced: DocJSON;
  sent: DocJSON;
  local: MineMerge | null;
  theirs: DocJSON;
  removed: boolean;
}

/**
 * Sent's text of each block this device changed against synced that theirs does not hold as sent
 * and that is not `named` (the blocks already filed). A later row removed some of what the replay
 * wrote before this device held it, so the device cannot tell whether that row's writer had seen
 * the text, nor which block held it: each such block is set aside, as a block of mine with no
 * anchor is.
 */
function removedAfterReplay(
  load: Load,
  named: ReadonlySet<string | null>,
): Leftover[] {
  const { synced, sent, theirs } = load;
  const changed = new Set(
    differingText(sent, synced, () => true).map((item) => item.blockId),
  );
  const filing = (id: string): boolean => changed.has(id) && !named.has(id);
  return differingText(sent, theirs, filing)
    .filter((item) => item.text !== "")
    .map((item): Leftover => ({ ...item, cause: "merge" }));
}

/** The answer's overlaps with the block as sent and as theirs holds it, then the local merge's leftovers, then the answer's set-aside text, then what the replay wrote that theirs lost since. */
export function filedOnLoad(load: Load): Leftover[] {
  const { answer, sent, theirs } = load;
  const filed = [
    ...wordingsOf(answer?.overlaps ?? [], sent, theirs),
    ...(load.local?.leftovers ?? []),
    ...(answer?.setAside ?? []).map((block) => textLeftover(block, "merge")),
  ];
  if (!load.removed) return filed;
  const named = new Set(filed.map((item) => item.blockId));
  return [...filed, ...removedAfterReplay(load, named)];
}
