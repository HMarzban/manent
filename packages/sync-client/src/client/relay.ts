// The handle an app holds: one object for a document's whole life in a tab, linked to the session
// that leads it here or to the follower that mirrors another tab's.
import type { CrdtDoc } from "@manent/crdt";
import { createSubscribable } from "../outbox/subscribable.ts";
import type { DocStatus, RecoveredItem, Subscribable } from "../ports/ports.ts";
import type { DocEvent, DocHandle } from "../session/doc-handle.ts";
import type { ViewHandle } from "../view/view.ts";

/**
 * The handle an app holds: the same object, with the same subscribables and
 * listeners, while the document is led by a session here or followed from
 * another tab. `close` unlinks it and lets the client release the document,
 * which stays open while another tab holds it; `attach` links it again.
 */
export interface RelayHandle extends DocHandle {
  attach(backend: DocHandle): void;
}

type Views = Pick<
  DocHandle,
  "status" | "recovered" | "settings" | "writeSchema" | "readOnly"
>;
const VIEWS = [
  "status",
  "recovered",
  "settings",
  "writeSchema",
  "readOnly",
] as const;

class Relay implements RelayHandle {
  readonly docId: string;
  readonly status: ReturnType<typeof createSubscribable<DocStatus>>;
  readonly recovered: ReturnType<
    typeof createSubscribable<readonly RecoveredItem[]>
  >;
  readonly settings: ReturnType<
    typeof createSubscribable<Readonly<Record<string, unknown>>>
  >;
  readonly writeSchema: ReturnType<typeof createSubscribable<number>>;
  readonly readOnly: ReturnType<typeof createSubscribable<ViewHandle | null>>;
  private backend: DocHandle;
  private readonly release: () => Promise<void>;
  private readonly listeners = new Set<(event: DocEvent) => void>();
  private readonly awarenessListeners = new Set<(update: Uint8Array) => void>();
  private links: (() => void)[] = [];

  constructor(options: { backend: DocHandle; release(): Promise<void> }) {
    const { backend } = options;
    this.docId = backend.docId;
    this.backend = backend;
    this.release = options.release;
    this.status = createSubscribable(backend.status.get());
    this.recovered = createSubscribable(backend.recovered.get());
    this.settings = createSubscribable(backend.settings.get());
    this.writeSchema = createSubscribable(backend.writeSchema.get());
    this.readOnly = createSubscribable(backend.readOnly.get());
    this.attach(backend);
  }

  attach(backend: DocHandle): void {
    for (const unlink of this.links) unlink();
    this.backend = backend;
    this.links = [
      ...VIEWS.map((key) => this.relay(key, backend)),
      backend.on((event) => {
        for (const listener of this.listeners) listener(event);
      }),
      backend.onAwareness((update) => {
        for (const listener of this.awarenessListeners) listener(update);
      }),
    ];
  }

  doc(): CrdtDoc {
    return this.backend.doc();
  }

  on(listener: (event: DocEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSetting(key: string, value: unknown): void {
    this.backend.setSetting(key, value);
  }

  holdRemote(): void {
    this.backend.holdRemote();
  }

  releaseRemote(): void {
    this.backend.releaseRemote();
  }

  sendAwareness(update: Uint8Array): void {
    this.backend.sendAwareness(update);
  }

  onAwareness(listener: (update: Uint8Array) => void): () => void {
    this.awarenessListeners.add(listener);
    return () => this.awarenessListeners.delete(listener);
  }

  saveVersion(label: "session_end" | "manual"): Promise<void> {
    return this.backend.saveVersion(label);
  }

  close(): Promise<void> {
    for (const unlink of this.links) unlink();
    return this.release();
  }

  private relay<K extends keyof Views>(key: K, backend: DocHandle): () => void {
    const view: Subscribable<unknown> = backend[key];
    const mine: { set(value: unknown): void } = this[key];
    mine.set(view.get());
    return view.subscribe((value) => mine.set(value));
  }
}

export function createRelayHandle(options: {
  backend: DocHandle;
  release(): Promise<void>;
}): RelayHandle {
  return new Relay(options);
}
