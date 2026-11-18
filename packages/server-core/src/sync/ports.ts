// The sync service's ports: the clock, a peer, the checkpointer, the upstream of a relay,
// the setting rules, and the limits it keeps to.
import type { Home } from "@manent/storage";
import type {
  Message,
  PreparedMessage,
  VersionSet,
} from "@manent/sync-protocol";

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
});
