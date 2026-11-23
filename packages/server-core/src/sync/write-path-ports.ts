// What the write path is given, and what it publishes once a commit has written an update.
import type { TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { CopiesKeptControl } from "@manent/sync-protocol";
import type { TokenBucket } from "../limits/bucket.ts";
import type { Refusal } from "./errors.ts";
import type { HeldQueue } from "./held.ts";
import type { Peer, SettingRules, SyncLimits, Upstream } from "./ports.ts";
import type { Room, Rooms, Subscription } from "./rooms.ts";

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
  /** Step 5: issues joined to validatePush's, any of which refuses the push; `pusher` is the subscription it came through. */
  checkPush(
    room: Room,
    report: TransactionReport,
    pusher: Subscription,
  ): Issue[];
  /** Drawn from for the client id an authority write is made under in a relayed room, and for the ID a copy is given. */
  ids(): string;
  /** Step 6 left copies that differ in the room's script, which the person whose push made them reviews. */
  copiesKept(room: Room, control: CopiesKeptControl): void;
}
