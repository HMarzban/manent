// The handle an app holds for one open document, and the events it hears on it.
import type { CrdtDoc } from "@manent/crdt";
import type { DocStatus, RecoveredItem, Subscribable } from "../ports/ports.ts";
import type { UpstreamStatus } from "../upstream/status.ts";
import type { ViewHandle } from "../view/view.ts";

/**
 * `replaced`: `doc()` now returns another document; bind again, and undo
 * starts over. `rejected`: `replayed` blocks were written back and `setAside`
 * items filed as Recovered text. `receipt`: once per reconnect that had
 * something waiting; `sent` counts elements, `setAside` and `overlaps` the
 * items that reconnect filed. `rebuilt`: after the `replaced` of a move,
 * `applied` blocks of this device's were written into the new document, and
 * `overlaps` and `setAside` items filed as Recovered text.
 * `past_window`: the edits made against the old document are kept as the
 * device version `versionId`, never merged.
 */
export type DocEvent =
  | { type: "replaced"; reason: "rejected" | "generation" }
  | { type: "rejected"; code: number; replayed: number; setAside: number }
  | { type: "recovered"; items: RecoveredItem[] }
  | { type: "setting_refused"; key: string; message: string }
  | { type: "receipt"; sent: number; setAside: number; overlaps: number }
  | { type: "rebuilt"; applied: number; overlaps: number; setAside: number }
  | { type: "past_window"; versionId: string };

export interface DocHandle {
  readonly docId: string;
  /** The document to bind an editor to. */
  doc(): CrdtDoc;
  readonly status: Subscribable<DocStatus>;
  readonly recovered: Subscribable<readonly RecoveredItem[]>;
  /** The stored settings with every waiting value laid over them. */
  readonly settings: Subscribable<Readonly<Record<string, unknown>>>;
  /** The newest schema version this document may be written in right now. */
  readonly writeSchema: Subscribable<number>;
  /** Set when the server answered 4408, or 4403 `read_only_role`: the app shows this reader instead of an editor. */
  readonly readOnly: Subscribable<ViewHandle | null>;
  /** The latest upstream status the local node sent; always null unless the client runs with `via` "local_node". */
  readonly upstream: Subscribable<UpstreamStatus | null>;
  on(listener: (event: DocEvent) => void): () => void;
  /** A request: shown at once, sent as SET, dropped if refused. TypeError for a value JSON cannot hold. */
  setSetting(key: string, value: unknown): void;
  /** Around an input-method composition: nothing from the server is applied in between. */
  holdRemote(): void;
  releaseRemote(): void;
  sendAwareness(update: Uint8Array): void;
  onAwareness(listener: (update: Uint8Array) => void): () => void;
  saveVersion(label: "session_end" | "manual"): Promise<void>;
  /**
   * The IDs not yet held join this document's own client IDs and are stored,
   * so that the heal counts them as this client's; a subscribed document
   * subscribes again, so that the server registers them. RangeError in a tab
   * that does not lead.
   */
  adoptClientIds(ids: readonly number[]): void;
  close(): Promise<void>;
}
