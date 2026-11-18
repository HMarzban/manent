// The one write path: a push or a setting is checked against the room's document and queued, and
// each turn's queue is committed per file before anything is acknowledged or published.
import { CrdtUpdateError, applyInspecting, updateMeta } from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { AppendItem, DocFile, UpdateOrigin } from "@manent/storage";
import {
  CODE,
  MESSAGE_LIMIT_BYTES,
  isPermanentPushError,
} from "@manent/sync-protocol";
import type { TokenBucket } from "../limits/bucket.ts";
import type { Refusal } from "./errors.ts";
import type {
  Peer,
  SettingRules,
  SyncLimits,
  Upstream,
  UpstreamItem,
  WriteMode,
} from "./ports.ts";
import type { Room, Rooms, Subscription } from "./rooms.ts";
import { applySetting } from "./settings.ts";
import { isStorageError } from "./storage-error.ts";
import { validatePush } from "./validate.ts";

export interface Committed {
  room: Room;
  sender: Peer;
  seq: number;
  update: Uint8Array;
  /** Null for a setting the authority wrote. */
  report: TransactionReport | null;
  /** Also send the update to the sender: a setting. */
  echo: boolean;
}

export interface WritePathPorts {
  mode: WriteMode;
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
  /** Relay mode only. */
  upstream: Upstream | null;
  registry: SettingRules;
  schemaFloor: ((touched: readonly unknown[]) => number) | null;
}

export interface WritePath {
  push(
    room: Room,
    subscription: Subscription,
    message: {
      clientSeq: number;
      update: Uint8Array;
      heal: boolean;
      generation: number;
    },
  ): void;
  set(
    room: Room,
    subscription: Subscription,
    message: {
      clientSeq: number;
      key: string;
      value: Uint8Array;
      generation: number;
    },
  ): void;
  /** Commits what is queued, now. */
  flush(): void;
  queued(): number;
}

/** What a turn holds until its commit. `ack` is a resend, acknowledged in its place. */
type Item = {
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

function refusal(
  code: number,
  message: string,
  clientSeq: number,
  retryAfterMs: number | null = null,
): Refusal {
  const permanent = isPermanentPushError(code);
  const named = permanent ? clientSeq : null;
  return { code, message, permanent, retryAfterMs, clientSeq: named };
}

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
  const { mode, limits, rooms } = ports;
  let queue: Item[] = [];

  const enqueue = (item: Item): void => {
    queue.push(item);
    if (queue.length === 1) ports.defer(flush);
  };

  /** Steps 0 and 1: the subscription, the generation, the buckets and the sizes. Null admits. */
  function admit(
    room: Room,
    subscription: Subscription,
    message: { clientSeq: number; generation: number },
    bytes: number,
  ): Refusal | null {
    const no = (
      code: number,
      text: string,
      retryAfterMs: number | null = null,
    ) => refusal(code, text, message.clientSeq, retryAfterMs);
    if (subscription.mode !== "edit")
      return no(CODE.FORBIDDEN, "not_subscribed");
    if (message.generation !== room.row.generation)
      return no(CODE.GENERATION_MISMATCH, "generation_moved");
    const { frames, bytes: volume } = ports.bucketOf(subscription.peer);
    // a bucket refuses a cost above its burst for ever: a larger message waits for a full one
    const cost = Math.min(bytes, limits.byteBurst);
    const frame = frames.take(1);
    const taken = frame.ok ? volume.take(cost) : frame;
    if (!taken.ok)
      return no(CODE.RATE_LIMITED, "rate_limited", taken.retryAfterMs);
    const tooLarge =
      bytes > MESSAGE_LIMIT_BYTES ||
      room.sizeBytes + bytes > limits.documentBytes;
    return tooLarge ? no(CODE.TOO_LARGE, "too_large") : null;
  }

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
      mode === "authority" &&
      ports.admitsForeign(room, peer.userId, heal, foreign);
    if (admitted) return "heal";
    return foreign.length === 0 ? "edit" : null;
  }

  /** The highest clientSeq of this person and device already queued as a setting; 0 when none. */
  function queuedSetting(peer: Peer, room: Room): number {
    const theirs = queue.filter((item) => {
      const from = item.subscription.peer;
      const same =
        from.userId === peer.userId && from.deviceId === peer.deviceId;
      return item.room === room && item.setting && same;
    });
    return Math.max(0, ...theirs.map((item) => item.clientSeq));
  }

  /** One transaction for the file's items, in arrival order; false when it did not commit. */
  function commitFile(file: DocFile, items: readonly Item[]): boolean {
    const heads = new Map<Room, number>();
    try {
      file.transaction(() => {
        for (const item of items) {
          const { room } = item;
          if (item.kind !== "append") {
            item.seq = heads.get(room) ?? room.row.headSeq;
            continue;
          }
          const { append } = item;
          if (!item.setting) ports.beforeAppend(room, append.userId, item.heal);
          item.seq = file.log.append(append);
          if (item.schemaTo !== null)
            file.log.raiseSchema(room.docId, item.schemaTo);
          heads.set(room, item.seq);
        }
      });
    } catch (error) {
      if (!isStorageError(error)) throw error;
      return false;
    }
    return true;
  }

  /** Steps 9 and 10 for one committed item; a setting is published before it is acknowledged. */
  function answer(item: Item): void {
    const { room, subscription, clientSeq, setting, seq } = item;
    const { peer } = subscription;
    if (item.kind !== "append") return ports.ack(peer, room, clientSeq, seq);
    const { append, report } = item;
    const { update } = append;
    const echo = setting;
    const committed = { room, sender: peer, seq, update, report, echo };
    if (setting) ports.publish(committed);
    ports.ack(peer, room, clientSeq, seq);
    rooms.changed(room, update.byteLength);
    if (item.schemaTo !== null) ports.schemaRaised(room, item.schemaTo);
    if (!setting) ports.publish(committed);
  }

  function upstreamOf(item: Item): UpstreamItem | null {
    const { room, subscription, clientSeq, seq } = item;
    const ref = { docId: room.docId, generation: room.row.generation };
    const userId = subscription.peer.userId;
    if (item.kind === "relay_set")
      return { kind: "set", ...ref, userId, clientSeq, ...item.request };
    if (item.kind === "ack") return null;
    return { kind: "update", ...ref, seq, update: item.append.update };
  }

  function flush(): void {
    const items = queue;
    queue = [];
    const byFile = new Map<DocFile, Item[]>();
    for (const item of items)
      byFile.set(item.room.file, [...(byFile.get(item.room.file) ?? []), item]);
    const failed = new Set<DocFile>();
    for (const [file, fileItems] of byFile) {
      if (commitFile(file, fileItems)) continue;
      failed.add(file);
      const poisoned = [...new Set(fileItems.map((item) => item.room))];
      ports.poisoned(poisoned);
      rooms.drop(poisoned);
    }
    const done = items.filter((item) => !failed.has(item.room.file));
    const { upstream } = ports;
    for (const item of upstream === null ? [] : done) {
      const forwarded = upstreamOf(item);
      if (forwarded !== null) upstream?.enqueue(forwarded);
    }
    for (const item of done) answer(item);
  }

  return {
    push(room, subscription, message) {
      if (subscription.stalled) return;
      const { clientSeq, update, heal } = message;
      const { peer } = subscription;
      const base = { setting: false, room, subscription, clientSeq, seq: 0 };
      const no = (code: number, text: string): void =>
        refusePush(room, subscription, refusal(code, text, clientSeq));
      const admitted = admit(room, subscription, message, update.byteLength);
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
      if (validatePush(report).length > 0)
        return reloadAnd(CODE.VALIDATION_FAILED, "invalid");
      const floor =
        mode === "authority" && ports.schemaFloor !== null
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
      const admitted = admit(room, subscription, message, value.byteLength);
      if (admitted !== null) return ports.refuse(peer, room, admitted);
      if (mode === "relay")
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
    flush,
    queued: () => queue.length,
  };
}
