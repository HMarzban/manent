// The document as the leading tab holds it: bound to its journal, each edit made here stored as
// an own entry, each server update applied at the next frame with what it set aside filed as
// Recovered text, and the parts of the handle that show it.
import {
  ORIGIN_LOAD,
  ORIGIN_REMOTE,
  applyRemote,
  observeScript,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import { createCoalescer } from "../coalescer/coalescer.ts";
import type { Coalescer } from "../coalescer/coalescer.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import { DEVICE_VERSION_INTERVAL_MS } from "../ports/defaults.ts";
import type {
  DeviceVersion,
  DocStatus,
  RecoveredItem,
  StoredSetting,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import { rejectedItems } from "../recovery/recover.ts";
import { deviceVersion } from "../recovery/versions.ts";
import type { ViewHandle } from "../view/view.ts";
import type { DocEvent, DocHandle } from "./doc-handle.ts";
import { elementsOf } from "./edits.ts";
import type { UnsavedEdit } from "./edits.ts";
import type { Journal } from "./journal.ts";
import { createSettingsOverlay } from "./settings.ts";

/** `doc` is the bound document, which a recovery replaces. */
export interface LocalCopy {
  readonly doc: CrdtDoc;
  readonly recovered: readonly RecoveredItem[];
  /**
   * Shows `recovered` and every waiting setting, applies the server updates
   * stored but not yet applied, and stores the edits a leader never saved.
   */
  load(recovered: RecoveredItem[], unsaved: UnsavedEdit[]): void;
  /** A following tab's edit; resolves once its write has settled. */
  edit(edit: UnsavedEdit): Promise<void>;
  /** A server update is stored at once and shown at the next frame. */
  update(update: Uint8Array): void;
  /** The server's step 2: applied now unless remote updates are held, and stored only when it changes something. */
  merge(update: Uint8Array): void;
  /** The Recovered text a rejected push leaves: what this document holds that `theirs` lacks, against `base`. */
  rejected(base: DocJSON, theirs: DocJSON): RecoveredItem[];
  /** A recovery's document is bound in place of this one, and `items` join the Recovered text. */
  replace(next: CrdtDoc, items: RecoveredItem[]): void;
  /** The settings of the replaced document are shown, and the app told. */
  showReplaced(items: RecoveredItem[]): void;
  /** The requests up to `clientSeq` are acknowledged. */
  acknowledged(clientSeq: number): void;
  refused(entry: StoredSetting, message: string): void;
  emit(event: DocEvent): void;
  awareness(update: Uint8Array): void;
  /** Keeps the document as a device version; `stored` settles once it is written. */
  recordVersion(
    kind: DeviceVersion["kind"],
    label: DeviceVersion["label"],
  ): { id: string; stored: Promise<void> };
  writeSchema(version: number): void;
  /** Stops observing the document and applying server updates. */
  dispose(): void;
  /** The handle the app holds, with the parts its session keeps. */
  handleOf(parts: SessionParts): DocHandle;
}

/** The parts of a handle its session keeps. */
interface SessionParts {
  status: Subscribable<DocStatus>;
  readOnly: Subscribable<ViewHandle | null>;
  sendAwareness(update: Uint8Array): void;
  close(): Promise<void>;
}

interface LocalCopyOptions {
  docId: string;
  ports: SyncClientPorts;
  journal: Journal;
  /** The document to load the stored state into. */
  doc: CrdtDoc;
  /** The stored checkpoint's state; null when there is none. */
  checkpoint: Uint8Array | null;
  writeSchema: number;
  /** What the session shows may have changed. */
  changed(): void;
  /** Whether the link is online: offline, an edit keeps a device version once an hour. */
  online(): boolean;
}

class BoundCopy implements LocalCopy {
  doc: CrdtDoc;
  recovered: RecoveredItem[] = [];
  private coalescer: Coalescer;
  private unobserve: () => void = () => {};
  private holding = 0;
  private remoteChanged = false;
  /** The local sequence of the newest server update stored. */
  private storedThrough = 0;
  private readonly overlay = createSettingsOverlay(() => this.doc);
  private readonly recoveredView = createSubscribable<readonly RecoveredItem[]>(
    [],
  );
  private readonly schema: ReturnType<typeof createSubscribable<number>>;
  private readonly listeners = new Set<(event: DocEvent) => void>();
  private readonly awarenessListeners = new Set<(update: Uint8Array) => void>();
  private readonly options: LocalCopyOptions;

  constructor(options: LocalCopyOptions) {
    this.options = options;
    this.doc = options.doc;
    if (options.checkpoint !== null)
      this.doc.applyUpdate(options.checkpoint, ORIGIN_LOAD);
    for (const e of options.journal.entries)
      if (e.kind === "update" && e.applied)
        this.doc.applyUpdate(e.update, ORIGIN_LOAD);
    this.coalescer = this.bind(this.doc);
    this.schema = createSubscribable(options.writeSchema);
  }

  load(recovered: RecoveredItem[], unsaved: UnsavedEdit[]): void {
    const { journal } = this.options;
    this.recovered = recovered;
    this.recoveredView.set(this.recovered);
    for (const e of journal.entries) {
      if (e.kind === "set" && !e.acked) this.overlay.request(e);
      if (e.kind !== "update" || e.applied) continue;
      this.storedThrough = Math.max(this.storedThrough, e.localSeq);
      this.coalescer.push(e.update, e.localSeq);
    }
    this.coalescer.flushNow();
    journal.prune();
    for (const edit of unsaved) journal.appendOwn(edit);
    this.overlay.show();
  }

  /** Text it carries that a remote delete already removed is found, as for an edit of this tab. */
  edit(edit: UnsavedEdit): Promise<void> {
    this.file(this.applyServer(edit.update), 0);
    return this.options.journal.appendOwn(edit);
  }

  update(update: Uint8Array): void {
    const localSeq = this.options.journal.appendServer(update, false);
    this.storedThrough = localSeq;
    this.coalescer.push(update, localSeq);
  }

  merge(update: Uint8Array): void {
    if (this.holding > 0) this.update(update);
    else {
      this.coalescer.flushNow();
      this.remoteChanged = false;
      const items = this.applyServer(update);
      if (this.remoteChanged) {
        const localSeq = this.options.journal.appendServer(update, true);
        this.storedThrough = localSeq;
        this.appliedTo(localSeq, items);
      }
    }
  }

  rejected(base: DocJSON, theirs: DocJSON): RecoveredItem[] {
    const mine = scriptBody(this.doc).materialize();
    return rejectedItems({
      docId: this.options.docId,
      base,
      mine,
      theirs,
      recoveredAt: this.now(),
      newId: () => this.newId(),
    });
  }

  replace(next: CrdtDoc, items: RecoveredItem[]): void {
    const previous = this.coalescer;
    this.doc = next;
    this.coalescer = this.bind(next);
    previous.dispose();
    this.recovered = [...this.recovered, ...items];
    this.recoveredView.set(this.recovered);
  }

  showReplaced(items: RecoveredItem[]): void {
    this.overlay.show();
    this.emit({ type: "replaced", reason: "rejected" });
    if (items.length > 0) this.emit({ type: "recovered", items });
  }

  acknowledged(clientSeq: number): void {
    this.overlay.acknowledge(clientSeq, this.storedThrough);
  }

  refused(entry: StoredSetting, message: string): void {
    this.overlay.refuse(entry.localSeq);
    this.emit({ type: "setting_refused", key: entry.key, message });
  }

  emit(event: DocEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  awareness(update: Uint8Array): void {
    for (const listener of this.awarenessListeners) listener(update);
  }

  recordVersion(
    kind: DeviceVersion["kind"],
    label: DeviceVersion["label"],
  ): { id: string; stored: Promise<void> } {
    const createdAt = this.now();
    const { docId, journal } = this.options;
    const id = this.newId();
    const version = deviceVersion(this.doc, {
      id,
      docId,
      kind,
      label,
      createdAt,
    });
    journal.patch({ lastDeviceVersionAt: createdAt });
    return { id, stored: journal.addVersion(version) };
  }

  writeSchema(version: number): void {
    this.schema.set(version);
  }

  dispose(): void {
    this.unobserve();
    this.coalescer.dispose();
  }

  handleOf(parts: SessionParts): DocHandle {
    return {
      docId: this.options.docId,
      doc: () => this.doc,
      status: parts.status,
      recovered: this.recoveredView,
      settings: this.overlay.view,
      writeSchema: this.schema,
      readOnly: parts.readOnly,
      on: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      setSetting: (key, value) => this.setSetting(key, value),
      holdRemote: () => {
        this.coalescer.hold();
        this.holding += 1;
      },
      releaseRemote: () => {
        this.coalescer.release();
        this.holding -= 1;
      },
      sendAwareness: parts.sendAwareness,
      onAwareness: (listener) => {
        this.awarenessListeners.add(listener);
        return () => this.awarenessListeners.delete(listener);
      },
      saveVersion: (label) => this.recordVersion("device", label).stored,
      close: parts.close,
    };
  }

  /** Observes `doc` for local changes, and makes the coalescer that applies server updates to the bound document. */
  private bind(doc: CrdtDoc): Coalescer {
    this.unobserve();
    this.unobserve = observeScript(doc, (report) => {
      // nothing may throw into Yjs: what does is thrown again once the change is done
      try {
        this.changed(report);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    });
    const { frames, clock } = this.options.ports;
    const coalescer = createCoalescer({
      apply: (merged, through) =>
        this.appliedTo(through, this.applyServer(merged)),
      frames,
      clock,
    });
    for (let i = 0; i < this.holding; i++) coalescer.hold();
    return coalescer;
  }

  /** A change made here, or the formatting Yjs tidies after a remote one: an own entry. */
  private changed(report: TransactionReport): void {
    if (report.origin === ORIGIN_LOAD) return;
    if (report.origin === ORIGIN_REMOTE) {
      this.remoteChanged = true;
      return;
    }
    const { journal } = this.options;
    void journal.appendOwn({
      update: report.update,
      elements: elementsOf(report),
    });
    const since = this.now() - journal.meta.lastDeviceVersionAt;
    const due = since >= DEVICE_VERSION_INTERVAL_MS || since < 0;
    if (!this.options.online() && due) this.recordVersion("device", "hourly");
    this.options.changed();
  }

  private applyServer(update: Uint8Array): RecoveredItem[] {
    const setAside = applyRemote(
      this.doc,
      update,
      new Set(this.options.journal.meta.clientIds),
    );
    return setAside.map((a) => ({
      id: this.newId(),
      docId: this.options.docId,
      ...a,
      recoveredAt: this.now(),
      cause: "merge",
    }));
  }

  /** Server entries up to `through` are in the document, and `items` is what they set aside. */
  private appliedTo(through: number, items: RecoveredItem[]): void {
    this.options.journal.applied(through);
    this.file(items, through);
    this.overlay.applied(through);
    this.options.changed();
  }

  /** Stores `items` as Recovered text, with the server entries up to `through` marked applied. */
  private file(items: RecoveredItem[], through: number): void {
    this.options.journal.markApplied(through, items);
    if (items.length === 0) return;
    this.recovered = [...this.recovered, ...items];
    this.recoveredView.set(this.recovered);
    this.emit({ type: "recovered", items });
  }

  private setSetting(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    if (text === undefined)
      throw new TypeError(
        `a setting must be a JSON value, not ${String(value)}`,
      );
    const entry = this.options.journal.appendSetting(key, text);
    this.overlay.request(entry);
    this.options.changed();
  }

  private newId(): string {
    return this.options.ports.random.bytes(16).toHex();
  }

  private now(): number {
    return this.options.ports.clock.now();
  }
}

export function createLocalCopy(options: LocalCopyOptions): LocalCopy {
  return new BoundCopy(options);
}
