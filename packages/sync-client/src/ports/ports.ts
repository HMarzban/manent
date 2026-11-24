// The client's ports and the shapes it stores and reports. The core reaches time, chance,
// the network, the disk and other tabs only through these.
import type { BlockJSON, DocJSON } from "@manent/schema";
import type {
  DriverReleaseRequest,
  DriverTakeRequest,
  Identity,
  ReplayRefusal,
  ReplayResponse,
} from "@manent/sync-protocol";

/** The returned function cancels what `schedule` set. */
export interface Clock {
  now: () => number;
  schedule(fn: () => void, delayMs: number): () => void;
}

export interface Random {
  /** In [0, 1). */
  next(): number;
  /** A fresh Yjs client ID: an unsigned 32-bit integer. */
  clientId(): number;
  /** For document, version and item IDs. */
  bytes(length: number): Uint8Array;
}

/** An animation frame, which may never fire (a hidden tab); the returned function cancels it. */
export interface Frames {
  request(fn: () => void): () => void;
}

/** `sign_in`: nobody is signed in, or the server refused the session. */
export class ConnectError extends Error {
  readonly code: "unreachable" | "sign_in";

  constructor(code: ConnectError["code"], options?: { cause?: unknown }) {
    super(code, options);
    this.name = "ConnectError";
    this.code = code;
  }
}

export interface Connection {
  send(frame: Uint8Array): void;
  close(code: number, reason: string): void;
}

export type DriverCurrentOutcome =
  | { ok: true; driver: Identity | null }
  | { ok: false; code: "forbidden" | "deleted" };

export type DriverTakeOutcome =
  | { ok: true; driver: Identity | null }
  | { ok: false; code: "driver_taken"; driver: Identity }
  | { ok: false; code: "forbidden" | "deleted" };

export type DriverReleaseOutcome =
  | { ok: true; driver: Identity | null }
  | { ok: false; code: "not_driver" | "forbidden" | "deleted" };

export interface DriverTransport {
  current(docId: string): Promise<DriverCurrentOutcome>;
  take(request: DriverTakeRequest): Promise<DriverTakeOutcome>;
  release(request: DriverReleaseRequest): Promise<DriverReleaseOutcome>;
}

export interface Transport {
  /** Resolves when open (a ticket was obtained and the socket accepted); rejects ConnectError. */
  connect(handlers: {
    onFrame(frame: Uint8Array): void;
    onClose(code: number, reason: string): void;
  }): Promise<Connection>;
  /** Idempotent; rejects ConnectError. `workspaceId` is sent only when it is not null. */
  createDocument(request: {
    docId: string;
    kind: string;
    home: string;
    workspaceId: string | null;
  }): Promise<{ ok: true } | { ok: false; code: "forbidden" | "deleted" }>;
  /** Edits made against a generation the document has left, posted once under `key`; rejects ConnectError. */
  replay(request: {
    docId: string;
    generation: number;
    lastServerSeq: number;
    key: string;
    updates: readonly Uint8Array[];
  }): Promise<
    { ok: true; response: ReplayResponse } | { ok: false; code: ReplayRefusal }
  >;
  readonly driver?: DriverTransport;
}

export class StoreError extends Error {
  readonly code: "quota" | "unavailable" | "write_failed" | "lost_lead";

  constructor(code: StoreError["code"], options?: { cause?: unknown }) {
    super(code, options);
    this.name = "StoreError";
    this.code = code;
  }
}

export interface StoredUpdate {
  kind: "update";
  localSeq: number;
  update: Uint8Array;
  /** Made on this device: an outbox entry until acknowledged. */
  own: boolean;
  /** The server has it; true from the start for an update that came from the server. */
  acked: boolean;
  /** It is in the bound document; false for a server update stored but not yet shown. */
  applied: boolean;
  /** IDs of the blocks it inserted, changed or removed: the waiting count. */
  elements: string[];
}

/** A waiting script setting; `value` is JSON text. */
export interface StoredSetting {
  kind: "set";
  localSeq: number;
  key: string;
  value: string;
  acked: boolean;
}

export type StoredEntry = StoredUpdate | StoredSetting;

export interface DocMeta {
  docId: string;
  /** 0 until the server names one. */
  generation: number;
  lastServerSeq: number;
  /** Every Yjs client ID this device used for the document, newest last. */
  clientIds: number[];
  /** Own client ID → highest acknowledged clock. */
  ackedClocks: Record<string, number>;
  neverSynced: boolean;
  /** `workspaceId`: the workspace whose index a new script takes its roles from; null for any other document. */
  create: { kind: string; home: string; workspaceId: string | null } | null;
  parked: { reason: "access_removed" | "deleted"; parkedAt: number } | null;
  /**
   * A rejected push being recovered; `heal`: the rejected push was the heal
   * push; `replaying`: the recovery's own writes are waiting.
   */
  recovering: { versionId: string; heal: boolean; replaying: boolean } | null;
  lastDeviceVersionAt: number;
  /**
   * `clock.now()` at the last acknowledgement, or at the last subscribe that left
   * nothing waiting; a label, never an order.
   */
  lastSyncedAt: number | null;
  /**
   * A move from generation `from` to `to` under way: `key` is the replay's
   * idempotency key (null when nothing was waiting), and the replay carries the
   * own entries up to `throughLocalSeq`.
   */
  moving: {
    from: number;
    to: number;
    key: string | null;
    throughLocalSeq: number;
  } | null;
}

export interface DeviceVersion {
  id: string;
  docId: string;
  kind: "device" | "recovered";
  label:
    | "session_end"
    | "hourly"
    | "before_reconnect"
    | "manual"
    | "rejected"
    | "past_window"
    | "named"
    | "before_restore";
  /** The draft's name for a `named` version; null for any other. */
  name: string | null;
  /** A label, never an order. */
  createdAt: number;
  /** The canonical form. */
  content: DocJSON;
  uploaded: boolean;
}

/** A device version as a store holds it: one stored before drafts were named on the device lacks `name`. */
export type StoredDeviceVersion = Omit<DeviceVersion, "name"> &
  Partial<Pick<DeviceVersion, "name">>;

/**
 * For an overlap, `mine` and `theirs` are the block as this device and the
 * other side wrote it (null where that side no longer holds it), and
 * `otherClientIds` the other side's Yjs client IDs, ascending, where known;
 * null, null and [] for any other cause.
 */
export interface RecoveredItem {
  id: string;
  docId: string;
  blockId: string | null;
  nearBlockId: string | null;
  text: string;
  recoveredAt: number;
  cause: "merge" | "rejected" | "overlap";
  mine: BlockJSON | null;
  theirs: BlockJSON | null;
  otherClientIds: number[];
}

/** A recovered item as a store holds it: one stored before overlaps carried wordings lacks them. */
export type StoredRecoveredItem = Omit<
  RecoveredItem,
  "mine" | "theirs" | "otherClientIds"
> &
  Partial<RecoveredItem>;

/** The item a store holds, with no wordings where it was stored without them. */
export function toRecoveredItem(stored: StoredRecoveredItem): RecoveredItem {
  return { mine: null, theirs: null, otherClientIds: [], ...stored };
}

export interface LoadedDocument {
  meta: DocMeta;
  checkpoint: { state: Uint8Array; throughLocalSeq: number } | null;
  syncedBase: Uint8Array | null;
  /** Every stored entry after the checkpoint, plus every unacknowledged own entry, by `localSeq`. */
  entries: StoredEntry[];
}

/** The device's store, one per user: another user's store shows none of this one's documents. */
export interface LocalStore {
  readonly userId: string;
  load(docId: string): Promise<LoadedDocument | null>;
  create(meta: DocMeta): Promise<void>;
  /** Durable when it resolves; rejects StoreError. */
  append(docId: string, entry: StoredEntry): Promise<void>;
  /** Unacknowledged entries up to `throughLocalSeq` become acked, and the patch is merged, in one write. */
  acknowledge(
    docId: string,
    throughLocalSeq: number,
    patch: Partial<DocMeta>,
  ): Promise<void>;
  /** A refused setting: that one entry is removed. */
  refuse(docId: string, localSeq: number): Promise<void>;
  /** Server entries up to `throughLocalSeq` become applied, and the items are stored, in one write; an item under an id already held replaces it. */
  markApplied(
    docId: string,
    throughLocalSeq: number,
    setAside: readonly RecoveredItem[],
  ): Promise<void>;
  /**
   * Replaces the checkpoint and drops the entries up to it that are acked and
   * applied; when `synced`, the state is also the synced base.
   */
  checkpoint(
    docId: string,
    state: Uint8Array,
    throughLocalSeq: number,
    synced: boolean,
  ): Promise<void>;
  patchMeta(docId: string, patch: Partial<DocMeta>): Promise<void>;
  /**
   * Replaces checkpoint, base, updates and meta, and keeps waiting settings,
   * versions and recovered items. The new checkpoint's `throughLocalSeq` is the
   * highest `localSeq` the document ever held, so a local sequence never repeats.
   */
  reset(docId: string, state: Uint8Array, meta: DocMeta): Promise<void>;
  addVersion(version: DeviceVersion): Promise<void>;
  versions(docId: string): Promise<DeviceVersion[]>;
  markUploaded(versionId: string): Promise<void>;
  recovered(docId: string): Promise<RecoveredItem[]>;
  dismissRecovered(itemId: string): Promise<void>;
  documents(): Promise<DocMeta[]>;
  close(): Promise<void>;
}

/** One leader per user. */
export interface LeaderPort {
  readonly tabId: string;
  /**
   * Asks to lead for this user. `onElected` runs at most once; `onDeposed` only
   * when a lease was taken away, never with Web Locks. The returned function
   * gives the lead up, or withdraws.
   */
  campaign(handlers: { onElected(): void; onDeposed(): void }): () => void;
  /** To this user's other tabs; structured-clonable values only. */
  post(message: unknown): void;
  listen(handler: (message: unknown) => void): () => void;
}

export interface SyncClientPorts {
  transport: Transport;
  store: LocalStore;
  leader: LeaderPort;
  clock: Clock;
  random: Random;
  frames: Frames;
}

/** Read with `DocSyncState`: offline, connecting, authenticating, then syncing or synced once online. */
export type LinkState = "offline" | "connecting" | "authenticating" | "online";

/** `local`: no live subscription. */
export type DocSyncState = "local" | "syncing" | "synced";

/** `view_only`: the person's role cannot edit the document, so it is read through a viewer. */
export type SideState =
  | "access_removed"
  | "deleted"
  | "read_only"
  | "rejected"
  | "not_saved"
  | "sign_in"
  | "server_old"
  | "view_only";

export interface DocStatus {
  /** Every edit made here is committed to the local store. */
  saved: boolean;
  /** Link online, subscription live, outbox empty, everything acknowledged. */
  synced: boolean;
  /** Distinct edited elements, plus settings, not yet acknowledged. */
  waiting: number;
  link: LinkState;
  docSync: DocSyncState;
  wentOfflineAt: number | null;
  neverSynced: boolean;
  recovered: number;
  side: readonly SideState[];
}

/** One document as the store holds it, read without opening it. */
export interface DocSummary {
  docId: string;
  neverSynced: boolean;
  waiting: number;
  parked: DocMeta["parked"];
  recovered: number;
}

/** While the store refuses an entry, it is written again this often. */
export const STORE_RETRY_MS = 5_000;

/** The listener runs only when the value changed, by deep equality. */
export interface Subscribable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}
