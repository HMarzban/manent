// The sync service and its ports: the clock, a peer, the checkpointer, the upstream of a relay,
// the setting rules, the hooks of the features it serves, the write path, and the limits it keeps to.
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { Overlap, SetAsideBlock } from "@manent/revisions";
import type { Issue } from "@manent/schema";
import type { DocFile, Home, Storage, StorageError } from "@manent/storage";
import type {
  ControlKind,
  DocRef,
  DocRole,
  LockAnchorRecord,
  Message,
  PreparedMessage,
  VersionSet,
} from "@manent/sync-protocol";
import type { RebuildStats } from "../rebuild/rebuilder.ts";
import type { ReplayItem } from "../rebuild/replay-write.ts";
import type { ReplayOutcome } from "../rebuild/replay.ts";
import type { DocumentAccess } from "./access.ts";
import type { IngestItem } from "./ingest.ts";
import type { Room, Subscription } from "./rooms.ts";
import type { QueuedItem } from "./write-path.ts";
import type { Committed } from "./write-path-ports.ts";

/** The returned function cancels what `schedule` set. */
export interface Clock {
  now: () => number;
  schedule(fn: () => void, delayMs: number): () => void;
}

/** One connection after WELCOME, whatever carries it; compared by identity. */
export interface Peer {
  /** From the session. */
  readonly userId: string;
  readonly name: string;
  /** From HELLO. */
  readonly deviceId: string;
  readonly versions: VersionSet;
  readonly address: string;
  /** Framed by this connection's own encoder and message IDs. */
  send(message: Message | PreparedMessage): void;
  close(code: number, reason: string): void;
}

export interface Checkpointer {
  /** Returns at once; the work happens elsewhere. */
  request(job: { home: Home; docId: string }): void;
  /** Resolves when nothing requested is unfinished. */
  idle(): Promise<void>;
  close(): Promise<void>;
}

export type WriteMode = "authority" | "relay";

export type UpstreamItem =
  | {
      kind: "update";
      docId: string;
      generation: number;
      seq: number;
      update: Uint8Array;
    }
  | {
      kind: "set";
      docId: string;
      generation: number;
      userId: string;
      clientSeq: number;
      key: string;
      value: Uint8Array;
    };

/** Relay mode only: what this node stored, for its own outbox toward the authority. */
export interface Upstream {
  enqueue(item: UpstreamItem): void;
}

/** The keys a script's `settings` map may hold, by registry key (`script.paper`). */
export interface SettingRules {
  check(
    key: string,
    value: unknown,
  ): { ok: true } | { ok: false; code: "unknown_key" | "bad_value" };
  /** May not change once page numbers are locked. */
  isGuarded(key: string): boolean;
}

/** What a hook gives SUBSCRIBED in place of its plain lock and revision fields. */
export interface SubscribedExtras {
  lockLevel: number;
  lockAnchors: LockAnchorRecord[] | null;
  revision: { setId: string; baselineVersionId: string } | null;
}

/** What the sync service tells a feature and asks it; every member returns at once and never throws. */
export interface SyncHooks {
  /** After each commit, in commit order. */
  committed?(committed: Committed): void;
  /** An edit subscription ended: the peer is no longer among the room's editors. */
  editorLeft?(room: Room, userId: string): void;
  /** The room was forgotten: nobody holds it, and its document is unloaded. */
  forgotten?(room: Room): void;
  /** Null leaves SUBSCRIBED to the next hook, and after the last to its plain values. */
  subscribed?(docId: string): SubscribedExtras | null;
  /**
   * Step 5 of the write path adds these to validatePush's issues, any of which refuses the push.
   * `pusher` is the subscription it came through; the write path always gives it.
   */
  checkPush?(
    room: Room,
    report: TransactionReport,
    pusher?: Subscription,
  ): Issue[];
}

/** A write the authority makes into a loaded room, at its turn in the write path's queue. */
export interface AuthorityWrite {
  userId: string;
  origin: "restore" | "system";
  /** Runs after every push queued before it; its updates are merged into one. ok false: nothing is written. */
  edit(doc: CrdtDoc): { ok: true } | { ok: false; reason: string };
  /**
   * Inside the commit, after the update's append. `before` is the head just before it; `seq` is
   * the update's, null when `edit` wrote nothing.
   */
  inTransaction(
    file: DocFile,
    at: { generation: number; before: number; seq: number | null },
  ): void;
}

/** busy: the room could not be loaded; refused: `edit` answered ok false. */
export type AuthorityWriteResult =
  | { ok: true; generation: number; seq: number | null }
  | { ok: false; code: "busy" | "commit_failed" }
  | { ok: false; code: "refused"; reason: string };

/** Knows no key: every SET is refused `unknown_key`. */
export const NO_SETTINGS: SettingRules = Object.freeze<SettingRules>({
  check: () => ({ ok: false, code: "unknown_key" }),
  isGuarded: () => false,
});

export interface SyncLimits {
  backpressureBytes: number;
  documentBytes: number;
  awarenessStateBytes: number;
  awarenessBatchMs: number;
  awarenessTimeoutMs: number;
  roomIdleMs: number;
  /** Updates between two checkpoints. */
  checkpointEvery: number;
  maxLoadedRooms: number;
  roomLoadsPerSecond: number;
  /** Per connection. */
  framesPerSecond: number;
  frameBurst: number;
  bytesPerSecond: number;
  byteBurst: number;
  connectionsPerUser: number;
  connectionsPerAddress: number;
  subscribersPerDocument: number;
  clientIdsPerSubscribe: number;
  poisonRetryMs: number;
  helloTimeoutMs: number;
  /** The bytes trigger: live bytes over this many times the plain-text bytes. */
  rebuildBytesRatio: number;
  /** Below this many live bytes the bytes trigger never fires. */
  rebuildMinBytes: number;
  /** The client ids trigger: more than this many. */
  rebuildClientIds: number;
  /** The section trigger: a section of more than this many blocks. */
  rebuildSectionBlocks: number;
  /** A room is quiet this long after its last committed write or edit SUBSCRIBE. */
  rebuildQuietMs: number;
  /** How long a closed generation can still be replayed into. */
  frozenKeepMs: number;
  replayBodyBytes: number;
}

export const DEFAULT_LIMITS: SyncLimits = Object.freeze({
  backpressureBytes: 4 * 1024 * 1024,
  documentBytes: 64 * 1024 * 1024,
  awarenessStateBytes: 4096,
  awarenessBatchMs: 100,
  awarenessTimeoutMs: 30_000,
  roomIdleMs: 30_000,
  checkpointEvery: 2000,
  maxLoadedRooms: 64,
  roomLoadsPerSecond: 20,
  framesPerSecond: 300,
  frameBurst: 600,
  bytesPerSecond: 4 * 1024 * 1024,
  byteBurst: 16 * 1024 * 1024,
  connectionsPerUser: 32,
  connectionsPerAddress: 256,
  subscribersPerDocument: 1000,
  clientIdsPerSubscribe: 256,
  poisonRetryMs: 1000,
  helloTimeoutMs: 10_000,
  rebuildBytesRatio: 10,
  rebuildMinBytes: 262_144,
  rebuildClientIds: 10_000,
  rebuildSectionBlocks: 400,
  rebuildQuietMs: 10_000,
  frozenKeepMs: 7_776_000_000,
  replayBodyBytes: 64 * 1024 * 1024,
});

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
  /** Queued like a push; a failed commit poisons the room, then calls done({ ok: false }). */
  replay(room: Room, item: ReplayItem["write"], done: ReplayItem["done"]): void;
  /**
   * Runs `edit` now, then is queued like a push; a failed commit poisons the room, then answers
   * commit_failed. RangeError for a room that is not loaded.
   */
  authority(
    room: Room,
    write: AuthorityWrite,
    done: (result: AuthorityWriteResult) => void,
  ): void;
  /** Queued like a push, acknowledged to nobody, published to every editor, handed upstream never. */
  ingest(item: IngestItem): void;
  /** Drops what the room has queued: no ACK and nothing upstream; a replay or an authority write is answered as failed. */
  discard(room: Room): void;
  /** One file's held items in one transaction, then acknowledged in arrival order; false when it did not commit. */
  commitHeld(items: readonly QueuedItem[]): boolean;
  /** The full disk that began holding the file's commits; null when nothing of it is held. */
  holdError(file: DocFile): StorageError | null;
  /** What the document's held items append, in arrival order: in its room, and in no log yet. */
  heldUpdates(docId: string): readonly Uint8Array[];
  /** What of the document's held items its windows were sent, in arrival order: all but what waits for its commit. */
  heldShownUpdates(docId: string): readonly Uint8Array[];
  /** Commits what is queued, now. */
  flush(): void;
  /** What is queued or held: written to no log yet. */
  queued(): number;
}

export interface ServiceStats extends RebuildStats {
  peers: number;
  rooms: number;
  loadedRooms: number;
  /** Transactions committed. */
  commits: number;
  /** Updates and settings appended to a log. */
  appended: number;
  /** Pushes and settings acknowledged as resends. */
  duplicates: number;
  /** ERRORs sent, by message. */
  refused: Record<string, number>;
  /** Rooms poisoned by a failed commit. */
  poisoned: number;
  awarenessDropped: number;
  /** Document frames a peer's decoder skipped. */
  skipped: number;
}

export interface SyncService {
  /** After WELCOME; refused (4429) over a connection cap or while shutting down. */
  attach(peer: Peer): { ok: true } | { ok: false; code: number };
  /** Every message after HELLO but PING and PONG. */
  receive(peer: Peer, message: Message): void;
  /** The peer's decoder skipped a document frame. */
  skipped(peer: Peer, doc: DocRef): void;
  detach(peer: Peer): void;
  readonly access: DocumentAccess;
  /** A role was changed: resolves it again, and ends what is no longer allowed. */
  accessChanged(docId: string, userId: string): void;
  /**
   * The person's role on the document is now `role` (null: removed), changed by `byUserId`. First
   * the room hears CONTROL `membership_changed`: the person's own subscriptions with
   * `{ userId, role, byUserId }`, every other one with `{}`. Then a removal ends every one of their
   * subscriptions to it `forbidden`; otherwise their access is resolved again and an edit
   * subscription it no longer allows ends `read_only_role`.
   */
  membershipChanged(
    docId: string,
    userId: string,
    role: DocRole | null,
    byUserId: string,
  ): void;
  /** A document was deleted: tells and unsubscribes everyone. */
  removed(docId: string): void;
  /** A backup was put back: every placed document is flagged `restore` at its head. */
  restored(): void;
  /** Rebuilds the document at its room's next quiet moment, whatever its measure. */
  requestRebuild(docId: string): void;
  /** POST /api/docs/replay: `body` is the route's JSON, not yet checked. */
  replay(userId: string, body: unknown): Promise<ReplayOutcome>;
  /**
   * Loads the room (busy when that is refused) and writes through the write path; after the
   * commit the update reaches every editor, echo included, and viewers their patch. RangeError for
   * a document this node has not placed.
   */
  authorityWrite(
    docId: string,
    write: AuthorityWrite,
  ): Promise<AuthorityWriteResult>;
  /**
   * CONTROL { seq: the room's head, kind, data } to every editor and viewer of the loaded room;
   * nothing when it is not loaded. `data` is sent as given.
   */
  broadcast(docId: string, kind: ControlKind, data: Uint8Array): void;
  /** Relay only: commits what `produce` returns beyond the room's state vector, as `userId`'s, whose upstream it came through. */
  ingest(
    docId: string,
    userId: string,
    produce: (roomVector: Uint8Array) => Uint8Array,
  ): void;
  /** Asks `mode` again for that room. */
  modeChanged(docId: string): void;
  /** Relay only: the room keeps committing and acknowledging, and hands nothing upstream until it follows. */
  pauseRelay(docId: string): void;
  /** Relay only: a new generation from `theirs`, the upstream's state, with the room's own changes merged in by block. */
  follow(
    docId: string,
    theirs: Uint8Array,
  ): { update: Uint8Array; overlaps: Overlap[]; setAside: SetAsideBlock[] };
  stats(): ServiceStats;
  shutdown(): Promise<void>;
}

/**
 * Defaults: "authority", DEFAULT_LIMITS, an inline checkpointer, no upstream, NO_SETTINGS, no schema floor, never
 * inside an air window and none told at SUBSCRIBED, no hooks.
 */
export interface SyncSettings {
  storage: Storage;
  clock: Clock;
  defer(fn: () => void): void;
  /** A new version id. */
  ids(): string;
  /** A function is asked when a room is created and on `modeChanged`. */
  mode?: WriteMode | ((docId: string) => WriteMode);
  /** What a room does when the disk is full: "poison" (the default) ends its editors; "hold" keeps what it could not commit and retries. */
  fullDisk?: "poison" | "hold";
  /** Called on each change of whether held commits are waiting. */
  onDeviceStorage?: (state: "ok" | "failing") => void;
  limits?: Partial<SyncLimits>;
  checkpointer?: Checkpointer;
  upstream?: Upstream;
  registry?: SettingRules;
  schemaFloor?: (touched: readonly unknown[]) => number;
  airWindow?: (docId: string, now: number) => boolean;
  /** SUBSCRIBED's air window: the document's next or current one; null: none. */
  airWindowOf?: (docId: string) => { startsAt: number; endsAt: number } | null;
  /** Each is told and asked in list order. */
  hooks?: readonly SyncHooks[];
}
