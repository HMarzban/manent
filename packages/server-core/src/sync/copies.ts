// Step 6 of the write path: the blocks a push left twice, repaired by the authority in a write of
// its own straight after the push, and the copies that differ told to the person who pushed them.
import { repairCopies } from "@manent/crdt";
import type { CopyPair, RepairedCopy } from "@manent/crdt";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { CopiesKeptControl } from "@manent/sync-protocol";
import type { AuthorityWrite, AuthorityWriteResult } from "./ports.ts";
import type { Room } from "./rooms.ts";
import type { WritePathPorts } from "./write-path.ts";

/** The copy as a wording of the block it copies: its content under the kept block's `id` and `from`. */
function wordingOf({ kept, copy }: RepairedCopy): BlockJSON {
  const id = kept.attrs?.id ?? null;
  const from = kept.attrs?.from ?? null;
  return canonicalBlock({ ...copy, attrs: { ...copy.attrs, id, from } });
}

/** The people besides `userId` who wrote the kept block, ascending. */
function othersOf(
  room: Room,
  userId: string,
  authors: readonly number[],
): string[] {
  const people = authors.flatMap((clientId) => room.owners.get(clientId) ?? []);
  return [...new Set(people)].filter((id) => id !== userId).toSorted();
}

/**
 * The authority write that repairs `pairs` under `userId`, the pusher, with a `pre_merge` version of
 * the script as the push left it whenever the repair writes; its `done` tells `copiesKept` of each
 * copy that differs.
 */
export function copiesRepair(
  room: Room,
  userId: string,
  pairs: readonly CopyPair[],
  ports: Pick<WritePathPorts, "ids" | "now" | "copiesKept">,
): { write: AuthorityWrite; done: (result: AuthorityWriteResult) => void } {
  let left: RepairedCopy[] = [];
  const write: AuthorityWrite = {
    userId,
    origin: "system",
    edit(doc) {
      left = repairCopies(doc, pairs, ports.ids);
      return { ok: true };
    },
    inTransaction(file, at) {
      if (at.seq === null) return;
      file.versions.add({
        id: ports.ids(),
        docId: room.docId,
        generation: at.generation,
        seq: at.before,
        kind: "pre_merge",
        name: null,
        createdByUserId: userId,
        createdAt: ports.now(),
        deviceId: null,
      });
    },
  };
  const done = (result: AuthorityWriteResult): void => {
    if (!result.ok || left.length === 0) return;
    const control: CopiesKeptControl = {
      userId,
      at: ports.now(),
      copies: left.map((copy) => ({
        blockId: copy.blockId,
        copyId: copy.copyId,
        mine: wordingOf(copy),
        theirs: copy.kept,
        otherUserIds: othersOf(room, userId, copy.keptAuthors),
      })),
    };
    ports.copiesKept(room, control);
  };
  return { write, done };
}
