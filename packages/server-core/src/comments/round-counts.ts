// The open count of each round of a comments document, counted after a committed push to its threads or rounds.
import { readCommentRounds, readCommentThreads } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { SyncHooks } from "../sync/ports.ts";
import type { RoundCounts, RoundOpenCount } from "./ports.ts";

/** The maps whose writes change a round's open count. */
const COUNTED_MAPS: readonly string[] = Object.freeze(["threads", "rounds"]);

/** Every round of `doc`, by id ascending, with the number of its threads that are open. */
function countOpen(doc: CrdtDoc): RoundOpenCount[] {
  const open = new Map<string, number>();
  for (const { roundId, state } of Object.values(readCommentThreads(doc)))
    if (roundId !== null && state.kind === "open")
      open.set(roundId, (open.get(roundId) ?? 0) + 1);
  return Object.entries(readCommentRounds(doc)).map(([roundId, round]) => ({
    roundId,
    name: round.name,
    createdAt: round.createdAt,
    open: open.get(roundId) ?? 0,
  }));
}

/**
 * Tells `roundCounts` the open counts of a comments document after each committed push that wrote its threads or
 * rounds. Counting reads every thread and round of that document, never the script's.
 */
export function createRoundCountHooks(options: {
  roundCounts: RoundCounts;
}): SyncHooks {
  const { roundCounts } = options;
  return {
    committed({ room, report }) {
      if (room.kind !== "comments" || room.doc === null || report === null)
        return;
      if (report.maps.some((name) => COUNTED_MAPS.includes(name)))
        roundCounts.counted(room.docId, countOpen(room.doc));
    },
  };
}
