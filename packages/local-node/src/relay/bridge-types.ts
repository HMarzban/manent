import type { SyncService, Upstream } from "@manent/server-core";
import type { Storage } from "@manent/storage";
import type { ControlKind } from "@manent/sync-protocol";
import type {
  Clock,
  HandoffRefusal,
  SyncClient,
  UpstreamStatus,
} from "@manent/sync-client";
import type { UpstreamFactory } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";
import type { Line, SetItem } from "./follow.ts";

export type StatusListener = (docId: string, status: UpstreamStatus) => void;

/** `enqueue` is server-core's port, called after the node commits. */
export interface RelayBridge extends Upstream {
  /** Before the first enqueue. */
  attach(service: SyncService): void;
  /** The upstream handle for that person and document, reconciled both ways; it resolves once the handle holds the cloud's state. */
  open(userId: string, docId: string): Promise<void>;
  /** Persons with an upstream client. */
  people(): string[];
  /** Every upstream client. */
  setOnline(wanted: boolean): void;
  reconnect(): void;
  /** The demo's Connection: offline is setOnline(false); slow holds every item and update relayed either way for `delayMs`, in order. */
  setConnection(mode: "online" | "offline" | "slow", delayMs: number): void;
  /** What is sent to the window. */
  status(docId: string): UpstreamStatus;
  /** Throttled, on change. */
  onStatus(listener: StatusListener): () => void;
  /** As on change, and even when it equals the last status sent: a window that was acknowledged waits for one. */
  resendStatus(docId: string): void;
  /** The document's first sync was refused: every setting request held for it is answered with `message`. */
  refuseHeld(docId: string, message: string): void;
  /**
   * A new client ID stored on that person's upstream document, for the cloud to write under on their
   * behalf: what someone later removes there without having seen it is set aside as their Recovered
   * text, as a window's own typing is. Null while the document is not relayed yet.
   */
  reserveClientId(userId: string, docId: string): Promise<number | null>;
  close(): Promise<void>;
}

/** What the bridge keeps of one document across people. */
export interface Relayed {
  /** The person whose line the status reports. */
  current: string | null;
  events: UpstreamStatus["events"];
  /** Requests seen, as `userId:clientSeq`: a window re-sends one whose acknowledgement it lost. */
  seen: Set<string>;
  /** Requests made during the first sync, until it is answered. */
  held: SetItem[];
  /** Items the slow connection holds back. */
  delayed: number;
}

export interface Person {
  client: SyncClient;
  lines: Map<string, Line>;
}

export interface RelayBridgeOptions {
  storage: Storage;
  records: NodeRecords;
  upstream: UpstreamFactory;
  clock: Clock;
  defer(fn: () => void): void;
  deviceStorage: () => "ok" | "failing";
  ownerOf: (docId: string, clientId: number) => string | null;
  handoffRefused: (docId: string) => HandoffRefusal | null;
  /** The data of a CONTROL `upstream_refused` for that person's editors of the document. */
  onRefused(docId: string, userId: string, data: Uint8Array): void;
  /** Relayed cloud CONTROL frames for that person's windows holding the document. */
  onControl?(
    docId: string,
    userId: string,
    control: { kind: ControlKind; data: Uint8Array },
  ): void;
}
