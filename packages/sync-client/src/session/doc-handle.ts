// The handle an app holds for one open document, and the events it hears on it.
import type { CrdtDoc } from "@manent/crdt";
import type { DocStatus, RecoveredItem, Subscribable } from "../ports/ports.ts";
import type { ViewHandle } from "../view/view.ts";

/**
 * `replaced`: `doc()` now returns another document; bind again, and undo
 * starts over. `rejected`: `replayed` blocks were written back and `setAside`
 * items filed as Recovered text. `receipt`: once per reconnect that had
 * something waiting; its counts are elements.
 */
export type DocEvent =
  | { type: "replaced"; reason: "rejected" | "generation" }
  | { type: "rejected"; code: number; replayed: number; setAside: number }
  | { type: "recovered"; items: RecoveredItem[] }
  | { type: "setting_refused"; key: string; message: string }
  | { type: "receipt"; sent: number; setAside: number };

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
  /** Set when the server answered 4408: the app shows this reader instead of an editor. */
  readonly readOnly: Subscribable<ViewHandle | null>;
  on(listener: (event: DocEvent) => void): () => void;
  /** A request: shown at once, sent as SET, dropped if refused. TypeError for a value JSON cannot hold. */
  setSetting(key: string, value: unknown): void;
  /** Around an input-method composition: nothing from the server is applied in between. */
  holdRemote(): void;
  releaseRemote(): void;
  sendAwareness(update: Uint8Array): void;
  onAwareness(listener: (update: Uint8Array) => void): () => void;
  saveVersion(label: "session_end" | "manual"): Promise<void>;
  close(): Promise<void>;
}
