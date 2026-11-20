// Healing: when the log has lost what clients hold, a client that is ahead sends it back, and the
// acknowledgement ledger bounds what it may carry of other people's work.
import type { DocumentRow, HealingRow, Storage } from "@manent/storage";
import type { WriteMode } from "./ports.ts";
import type { Room } from "./rooms.ts";
import type { WritePathPorts } from "./write-path.ts";

/** SUBSCRIBED.headSeq: the head, or what precedes the first quarantined row while that is unhealed. */
export function verifiedHead(
  row: DocumentRow,
  healing: HealingRow | null,
): number {
  return healing?.reason === "quarantine"
    ? Math.min(row.headSeq, healing.verifiedSeq)
    : row.headSeq;
}

/**
 * The server's heal rule: a push marked `heal` on a flagged document may carry another person's
 * client ids, each only as far as the ledger shows the server acknowledged. `ranges` are the
 * pusher's foreign ranges; `toClock` is exclusive, as the ledger's `ackedClock` is.
 */
export function admitsForeign(
  healing: HealingRow | null,
  ledger: ReadonlyMap<number, { userId: string; ackedClock: number }>,
  userId: string,
  heal: boolean,
  ranges: readonly { clientId: number; toClock: number }[],
): boolean {
  if (!heal || healing === null) return false;
  return ranges.every(({ clientId, toClock }) => {
    const acked = ledger.get(clientId);
    return (
      acked !== undefined &&
      acked.userId !== userId &&
      toClock <= acked.ackedClock
    );
  });
}

/** The service's part in healing; for a relayed room it does nothing and the head is the plain head. */
export interface Healing {
  /** SUBSCRIBED.headSeq for the room. */
  headOf(room: Room): number;
  /** A SUBSCRIBE that passed: one that reports a head beyond the server's flags the document `behind`. */
  subscribed(room: Room, lastServerSeq: number): void;
  ports: Pick<WritePathPorts, "admitsForeign" | "beforeAppend">;
  /** Flags every placed document this server is the authority for with reason `restore`, at its head. */
  restored(): void;
}

/** `modeOf` is asked of a document no room holds. */
export function createHealing(options: {
  modeOf(docId: string): WriteMode;
  storage: Storage;
  now: () => number;
  ids(): string;
}): Healing {
  const { storage, now, ids } = options;
  return {
    headOf: (room) =>
      room.mode === "relay"
        ? room.row.headSeq
        : verifiedHead(room.row, room.file.log.healing(room.docId)),
    subscribed({ file, docId, row, mode }, lastServerSeq) {
      if (mode === "authority" && lastServerSeq > row.headSeq)
        file.log.flagHealing(docId, "behind", row.headSeq);
    },
    ports: {
      // the write path asks only of a room in authority
      admitsForeign: ({ file, docId }, userId, heal, ranges) =>
        admitsForeign(
          file.log.healing(docId),
          file.log.ledger(docId),
          userId,
          heal,
          ranges,
        ),
      // the first accepted heal on a flagged document keeps what the log held before it
      beforeAppend({ file, docId, mode }, userId, heal) {
        const healing = file.log.healing(docId);
        const row = file.log.get(docId);
        if (
          mode === "relay" ||
          !heal ||
          healing === null ||
          healing.preHealVersionId !== null ||
          row === null
        )
          return;
        const id = ids();
        file.versions.add({
          id,
          docId,
          generation: row.generation,
          seq: row.headSeq,
          kind: "pre_heal",
          name: null,
          createdByUserId: userId,
          createdAt: now(),
          deviceId: null,
        });
        file.log.notePreHeal(docId, id);
      },
    },
    restored() {
      for (const home of storage.directory.homes()) {
        const { log } = storage.open(home);
        for (const docId of storage.directory.documentsIn(home)) {
          const row =
            options.modeOf(docId) === "authority" ? log.get(docId) : null;
          if (row !== null) log.flagHealing(docId, "restore", row.headSeq);
        }
      }
    },
  };
}
