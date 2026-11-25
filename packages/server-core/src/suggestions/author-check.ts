// Who a suggestion may name: a push names only its pusher, unless the room already held that suggestion under that name.
import { ORIGIN_LOAD, createDoc, loadDoc, scriptBody } from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { BlockJSON, Issue } from "@manent/schema";
import type { SyncHooks } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";
import { PUSH_VALIDATORS } from "../sync/validate.ts";

const SUGGESTION_MARKS: readonly string[] = Object.freeze([
  "suggest_insert",
  "suggest_delete",
]);

/** One suggestion a block carries, in a mark or in its own `suggest` attribute. */
interface Suggestion {
  suggestionId: string | null;
  authorUserId: string | null;
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/** Null for a suggestion without an id, which no room can have held. */
function heldKeyOf({ suggestionId, authorUserId }: Suggestion): string | null {
  return suggestionId === null || suggestionId === ""
    ? null
    : JSON.stringify([suggestionId, authorUserId]);
}

function suggestionsOf(block: BlockJSON): Suggestion[] {
  const attrs = block.attrs ?? {};
  const found: Suggestion[] =
    typeof attrs.suggest === "string"
      ? [
          {
            suggestionId: stringOrNull(attrs.suggestId),
            authorUserId: stringOrNull(attrs.suggestAuthorUserId),
          },
        ]
      : [];
  for (const run of block.content ?? [])
    for (const mark of run.marks ?? [])
      if (SUGGESTION_MARKS.includes(mark.type))
        found.push({
          suggestionId: stringOrNull(mark.attrs?.id),
          authorUserId: stringOrNull(mark.attrs?.authorUserId),
        });
  return found;
}

const touchedBlocks = (report: TransactionReport): BlockJSON[] => [
  ...report.inserted.map((entry) => entry.block),
  ...report.changed,
];

function addHeld(held: Set<string>, blocks: readonly BlockJSON[]): void {
  for (const block of blocks)
    for (const suggestion of suggestionsOf(block)) {
      const key = heldKeyOf(suggestion);
      if (key !== null) held.add(key);
    }
}

/** The suggestions of what the room's log holds, without the push being checked, which is in the room's document already. */
function readHeld(room: Room): Set<string> {
  const { file } = room;
  const { id, generation } = file.log.get(room.docId) ?? room.row;
  const checkpoint = file.checkpoints.newest(id, generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  try {
    const tail = file.log.tail(id, generation, checkpoint?.seq ?? 0, {
      quarantine: false,
    });
    for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
    const sections = scriptBody(doc).materialize().content ?? [];
    const held = new Set<string>();
    addHeld(
      held,
      sections.flatMap((section) => section.content ?? []),
    );
    return held;
  } finally {
    doc.destroy();
  }
}

/**
 * The suggestion author check, for rooms validated as a script. In each block a push inserts or
 * changes, every `suggest_insert` or `suggest_delete` mark and every block `suggest` attribute names
 * the pusher, or carries a suggestion the room already held under the same author; any other block
 * is one `reject` issue. The suggestions a room holds are read from its log the first time a push
 * needs them after it loads, extended by each commit, and dropped when the room is forgotten.
 */
export function createSuggestionHooks(_options: {}): SyncHooks {
  const known = new Map<Room, Set<string>>();

  const heldOf = (room: Room): Set<string> => {
    const kept = known.get(room);
    if (kept !== undefined) return kept;
    try {
      const held = readHeld(room);
      known.set(room, held);
      return held;
    } catch {
      // an unreadable log leaves nothing held, so only the pusher's own suggestions pass; the next push reads it again
      return new Set();
    }
  };

  return {
    checkPush(room, report, pusher) {
      if (PUSH_VALIDATORS[room.kind] !== undefined) return [];
      // without the pusher, only suggestions the room already held pass
      const pusherUserId = pusher?.peer.userId ?? null;
      // the log is read only for a suggestion naming someone else, so a plain push never walks the script
      const isAllowed = (suggestion: Suggestion): boolean => {
        if (pusherUserId !== null && suggestion.authorUserId === pusherUserId)
          return true;
        const key = heldKeyOf(suggestion);
        return key !== null && heldOf(room).has(key);
      };
      return touchedBlocks(report).flatMap((block): Issue[] => {
        if (suggestionsOf(block).every(isAllowed)) return [];
        const blockId = stringOrNull(block.attrs?.id);
        return [
          {
            path: `blocks.${blockId}`,
            code: "unknown_node",
            severity: "reject",
            message: `a suggestion in block ${blockId} names someone other than its pusher ${pusherUserId}`,
          },
        ];
      });
    },
    committed({ room, report }) {
      const held = known.get(room);
      if (held === undefined) return;
      // a setting or a replay reports no blocks: the next push reads the log again
      if (report === null) known.delete(room);
      else addHeld(held, touchedBlocks(report));
    },
    forgotten(room) {
      known.delete(room);
    },
  };
}
