// The one write path: a push or a setting is checked against the room's document and queued, and
// each turn's queue is committed per file before anything is acknowledged or published.
import { CrdtUpdateError, applyInspecting, updateMeta } from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type {
  AppendItem,
  DocFile,
  StorageError,
  UpdateOrigin,
} from "@manent/storage";
import { CODE } from "@manent/sync-protocol";
import type { TokenBucket } from "../limits/bucket.ts";
import type { ReplayItem } from "../rebuild/replay-write.ts";
import { admit, refusal } from "./admission.ts";
import { writeOnCopy } from "./authority-write.ts";
import type { AuthorityItem } from "./authority-write.ts";
import {
  answer,
  answerFailed,
  appendedBy,
  commitFile,
  isAuthorityWrite,
  settle,
  shownWhileHeld,
  upstreamOf,
} from "./commit.ts";
import type { Refusal } from "./errors.ts";
import type { HeldQueue } from "./held.ts";
import type { IngestItem } from "./ingest.ts";
import type {
  Peer,
  SettingRules,
  SyncLimits,
  Upstream,
  WritePath,
} from "./ports.ts";
import type { Room, Rooms, Subscription } from "./rooms.ts";
import { applySetting } from "./settings.ts";
import { validateRoomPush } from "./validate.ts";

export interface Committed {
  room: Room;
  sender: Peer | null;
  seq: number;
  update: Uint8Array;
  /** Null for a setting the authority wrote. */
  report: TransactionReport | null;
  /** Also send the update to the sender: a setting, or a replay, whose sender is null. */
  echo: boolean;
}

export interface WritePathPorts {
  limits: SyncLimits;
  now: () => number;
  /** Runs `fn` when this turn's messages have been handled: the group commit. */
  defer(fn: () => void): void;
  rooms: Pick<Rooms, "reload" | "drop" | "changed">;
  bucketOf(peer: Peer): { frames: TokenBucket; bytes: TokenBucket };
  ack(peer: Peer, room: Room, clientSeq: number, serverSeq: number): void;
  refuse(peer: Peer, room: Room, refusal: Refusal): void;
  /** SYNC update to the room's editors (but the sender, unless echo); VIEW_PATCH to its viewers. */
  publish(committed: Committed): void;
  /** Tells and unsubscribes everyone in these rooms. */
  poisoned(rooms: readonly Room[]): void;
  /** Ends the subscriptions of editors below `toVersion`, before the update is published. */
  schemaRaised(room: Room, toVersion: number): void;
  /** Whether the heal rule admits these ranges of client ids that are not the pusher's. */
  admitsForeign(
    room: Room,
    userId: string,
    heal: boolean,
    ranges: readonly { clientId: number; toClock: number }[],
  ): boolean;
  /** Inside the transaction, before each push's append. */
  beforeAppend(room: Room, userId: string, heal: boolean): void;
  /** Relayed rooms only. */
  upstream: Upstream | null;
  /** On a full disk, "poison" ends the file's rooms; "hold" gives what the commit could not write to `held`. */
  fullDisk: "poison" | "hold";
  held: HeldQueue;
  registry: SettingRules;
  schemaFloor: ((touched: readonly unknown[]) => number) | null;
  /** Step 5: issues joined to validatePush's, any of which refuses the push. */
  checkPush(room: Room, report: TransactionReport): Issue[];
  /** Drawn from for the client id an authority write is made under in a relayed room. */
  ids(): string;
}

/** What a turn holds until its commit. `ack` is a resend, acknowledged in its place. */
type PeerItem = {
  room: Room;
  subscription: Subscription;
  clientSeq: number;
  /** A setting request, not a push. */
  setting: boolean;
  /** Set by the commit: the sequence given, or for any other item the head it is answered at. */
  seq: number;
} & (
  | {
      kind: "append";
      append: AppendItem;
      report: TransactionReport | null;
      schemaTo: number | null;
      /** The push was marked `heal`, whatever client ids it carries. */
      heal: boolean;
    }
  | { kind: "ack" }
  | { kind: "relay_set"; request: { key: string; value: Uint8Array } }
);
/** An entry of the write path's queue: what a commit writes, then answers. */
export type QueuedItem = PeerItem | ReplayItem | IngestItem | AuthorityItem;

/** What `fn` gives; "bad" when the bytes it read are not a whole update. */
function readUpdate<T>(fn: () => T): T | "bad" {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CrdtUpdateError) return "bad";
    throw error;
  }
}

/** A client id's clock range in an update, `toClock` exclusive. */
interface Meta {
  clientId: number;
  toClock: number;
}

function appendOf(
  room: Room,
  userId: string,
  update: Uint8Array,
  origin: UpdateOrigin,
  metas: readonly Meta[],
): AppendItem {
  const { docId, row } = room;
  const clocks = metas.map((m) => ({ clientId: m.clientId, clock: m.toClock }));
  return { docId, generation: row.generation, update, userId, origin, clocks };
}

export function createWritePath(ports: WritePathPorts): WritePath {
  const { rooms } = ports;
  let queue: QueuedItem[] = [];
  /** Files with held items, and the full disk that began it: what comes after waits behind them. */
  const heldFiles = new Map<DocFile, StorageError>();
  /** By document: what its held items append, in arrival order. */
  const heldUpdates = new Map<string, Uint8Array[]>();
  /** By document: what of its held items its windows were sent, in arrival order. */
  const heldShownUpdates = new Map<string, Uint8Array[]>();

  const keepHeld = (item: QueuedItem): void => {
    const update = appendedBy(item);
    if (update === null) return;
    const { docId } = item.room;
    heldUpdates.set(docId, [...(heldUpdates.get(docId) ?? []), update]);
    if (shownWhileHeld(item) === null) return;
    const shown = heldShownUpdates.get(docId) ?? [];
    heldShownUpdates.set(docId, [...shown, update]);
  };

  const enqueue = (item: QueuedItem): void => {
    queue.push(item);
    if (queue.length === 1) ports.defer(flush);
  };

  /** A permanent refusal stalls the subscription until its next SUBSCRIBE. */
  function refusePush(room: Room, sub: Subscription, refused: Refusal): void {
    if (refused.permanent) sub.stalled = true;
    ports.refuse(sub.peer, room, refused);
  }

  /**
   * Step 2: the push's origin, or null when it carries a client id the pusher may not write. A
   * heal the rule admits is a heal, whether or not it carries anyone else's ids.
   */
  function originOf(
    room: Room,
    peer: Peer,
    heal: boolean,
    metas: readonly Meta[],
  ): UpdateOrigin | null {
    const foreign = metas.filter(
      ({ clientId }) => room.owners.get(clientId) !== peer.userId,
    );
    // only a heal can be admitted, and asking reads the document's whole ledger
    const admitted =
      heal &&
      room.mode === "authority" &&
      ports.admitsForeign(room, peer.userId, heal, foreign);
    if (admitted) return "heal";
    return foreign.length === 0 ? "edit" : null;
  }

  /** The highest clientSeq of this person and device already queued as a setting; 0 when none. */
  function queuedSetting(peer: Peer, room: Room): number {
    const theirs = queue.filter((item): item is PeerItem => {
      if (!("subscription" in item)) return false;
      const from = item.subscription.peer;
      const same =
        from.userId === peer.userId && from.deviceId === peer.deviceId;
      return item.room === room && item.setting && same;
    });
    return Math.max(0, ...theirs.map((item) => item.clientSeq));
  }

  function flush(): void {
    const items = queue;
    queue = [];
    const byFile = new Map<DocFile, QueuedItem[]>();
    for (const item of items)
      byFile.set(item.room.file, [...(byFile.get(item.room.file) ?? []), item]);
    const failed = new Set<DocFile>();
    for (const [file, fileItems] of byFile) {
      const failure = heldFiles.get(file) ?? commitFile(file, fileItems, ports);
      if (failure === null) continue;
      if (failure.code === "disk_full" && ports.fullDisk === "hold") {
        heldFiles.set(file, failure);
        ports.held.hold(fileItems);
        for (const item of fileItems) keepHeld(item);
        continue;
      }
      failed.add(file);
      const poisoned = [...new Set(fileItems.map((item) => item.room))];
      ports.poisoned(poisoned);
      rooms.drop(poisoned);
      for (const item of fileItems) answerFailed(item);
    }
    const done = items.filter((item) => !failed.has(item.room.file));
    for (const item of done) {
      const forwarded = upstreamOf(item);
      if (forwarded !== null) ports.upstream?.enqueue(forwarded);
    }
    for (const item of done) {
      if (!heldFiles.has(item.room.file)) {
        answer(item, ports);
        continue;
      }
      // a held item is shown now, but for what the authority wrote, and acknowledged once it commits;
      // a replay and an authority write answer whole then
      const shown = shownWhileHeld(item);
      if (shown !== null) ports.publish(shown);
    }
  }

  return {
    push(room, subscription, message) {
      if (subscription.stalled) return;
      const { clientSeq, update, heal } = message;
      const { peer } = subscription;
      const base = { setting: false, room, subscription, clientSeq, seq: 0 };
      const no = (code: number, text: string): void =>
        refusePush(room, subscription, refusal(code, text, clientSeq));
      const admitted = admit(
        ports,
        room,
        subscription,
        message,
        update.byteLength,
      );
      if (admitted !== null) return refusePush(room, subscription, admitted);
      // an editor holds the room loaded; a viewer of an unloaded one was refused above
      const { doc } = room;
      if (doc === null)
        throw new RangeError(`the room of ${room.docId} is not loaded`);
      const metas = readUpdate(() => updateMeta(update));
      if (metas === "bad") return no(CODE.BAD_FRAME, "bad_update");
      const origin = originOf(room, peer, heal, metas);
      if (origin === null) return no(CODE.BAD_FRAME, "foreign_client_id");
      const report = readUpdate(() => applyInspecting(doc, update));
      if (report === "bad") return no(CODE.BAD_FRAME, "bad_update");
      // the update is in the room's document: what is queued commits, then the room is the log again
      const reloadAnd = (code: number, text: string): void => {
        flush();
        rooms.reload(room);
        no(code, text);
      };
      // an update that only waits for another reports no change, so it is not taken for a resend
      if (doc.hasPendingStructs())
        return reloadAnd(CODE.BAD_FRAME, "incomplete");
      if (report === null) return enqueue({ kind: "ack", ...base });
      const issues = validateRoomPush(report, room);
      issues.push(...ports.checkPush(room, report));
      if (issues.length > 0)
        return reloadAnd(CODE.VALIDATION_FAILED, "invalid");
      const floor =
        room.mode === "authority" && ports.schemaFloor !== null
          ? ports.schemaFloor(report.touched())
          : 0;
      const append = appendOf(room, peer.userId, update, origin, metas);
      const schemaTo = floor > room.row.schemaVersion ? floor : null;
      enqueue({ kind: "append", ...base, append, report, schemaTo, heal });
    },
    set(room, subscription, message) {
      if (subscription.stalled) return;
      const { clientSeq, key, value } = message;
      const { peer } = subscription;
      const base = { setting: true, room, subscription, clientSeq, seq: 0 };
      const admitted = admit(
        ports,
        room,
        subscription,
        message,
        value.byteLength,
      );
      if (admitted !== null) return ports.refuse(peer, room, admitted);
      if (room.mode === "relay")
        return enqueue({ kind: "relay_set", ...base, request: { key, value } });
      const { registry } = ports;
      const queued = queuedSetting(peer, room);
      const at = ports.now();
      const applied = applySetting(room, peer, message, at, registry, queued);
      if (!applied.ok)
        return ports.refuse(peer, room, {
          code: CODE.SETTING_REFUSED,
          message: applied.message,
          permanent: false,
          retryAfterMs: null,
          clientSeq,
        });
      if ("duplicate" in applied) return enqueue({ kind: "ack", ...base });
      const { update } = applied;
      const metas = updateMeta(update);
      const made = appendOf(room, peer.userId, update, "system", metas);
      const append = {
        ...made,
        setRequest: { deviceId: peer.deviceId, clientSeq },
      };
      enqueue({
        kind: "append",
        ...base,
        append,
        report: null,
        schemaTo: null,
        heal: false,
      });
    },
    replay: (room, write, done) =>
      enqueue({ kind: "replay", room, write, done, seq: 0 }),
    authority(room, write, done) {
      const { userId, origin, inTransaction } = write;
      const written = writeOnCopy(room, origin, write.edit, ports.ids);
      if (!written.ok)
        return done({ ok: false, code: "refused", reason: written.reason });
      const { update, report } = written;
      const append =
        update === null
          ? null
          : appendOf(room, userId, update, origin, updateMeta(update));
      enqueue({
        kind: "authority",
        room,
        append,
        report,
        inTransaction,
        done,
        seq: 0,
      });
    },
    ingest: enqueue,
    discard(room) {
      const dropped = queue.filter((item) => item.room === room);
      queue = queue.filter((item) => item.room !== room);
      for (const item of dropped) answerFailed(item);
    },
    commitHeld(items) {
      const file = items[0]?.room.file;
      if (file === undefined) return true;
      if (commitFile(file, items, ports) !== null) return false;
      heldFiles.delete(file);
      for (const item of items) {
        heldUpdates.delete(item.room.docId);
        heldShownUpdates.delete(item.room.docId);
        // published when they were held, but for what the authority wrote
        if (isAuthorityWrite(item)) answer(item, ports);
        else settle(item, ports);
      }
      return true;
    },
    holdError: (file) => heldFiles.get(file) ?? null,
    heldUpdates: (docId) => heldUpdates.get(docId) ?? [],
    heldShownUpdates: (docId) => heldShownUpdates.get(docId) ?? [],
    flush,
    queued: () => queue.length + ports.held.size(),
  };
}
