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
import { textLeftover } from "../recovery/recover.ts";
import type { Leftover } from "../recovery/recover.ts";
import { RecoveredList } from "../recovery/recovered-list.ts";
import { deviceVersion } from "../recovery/versions.ts";
import { OverlapWindow } from "../review/online.ts";
import type { UpstreamEvent, UpstreamStatus } from "../upstream/status.ts";
import type { UpstreamWindow } from "../upstream/window.ts";
import type { ViewHandle } from "../view/view.ts";
import type { DocEvent, DocHandle } from "./doc-handle.ts";
import { elementsOf } from "./edits.ts";
import type { UnsavedEdit } from "./edits.ts";
import type { Journal } from "./journal.ts";
import { createSettingsOverlay } from "./settings.ts";
import { StepTwo } from "./step-two.ts";

type ReplacedReason = Extract<DocEvent, { type: "replaced" }>["reason"];

/** `doc` is the bound document, which a recovery or a move replaces. */
export interface LocalCopy {
  readonly doc: CrdtDoc;
  readonly recovered: readonly RecoveredItem[];
  /** Shows `recovered` and every waiting setting, applies the server updates stored but not yet applied, and stores the edits a leader never saved. */
  load(recovered: RecoveredItem[], unsaved: UnsavedEdit[]): void;
  /** A following tab's edit; resolves once its write has settled. */
  edit(edit: UnsavedEdit): Promise<void>;
  /** A server update is stored at once and shown at the next frame. */
  update(update: Uint8Array): void;
  /** The server's step 2: applied now, or once remote updates are no longer held, after the updates buffered; stored only when it changes something, and then with the reconnect's `overlaps` filed in the same write. */
  merge(update: Uint8Array, overlaps: Leftover[]): void;
  /** The document's content before it is replaced. Server updates still buffered or held are applied first, so what they set aside is filed as merged, not lost with the document. */
  mine(): DocJSON;
  /** Recovered text of this document, each piece under a new id. */
  items(leftovers: readonly Leftover[]): RecoveredItem[];
  /** A recovery's or a move's document is bound in place of this one, and `items` join the Recovered text. */
  replace(next: CrdtDoc, items: RecoveredItem[]): void;
  /** The settings of the replaced document are shown, and the app told. */
  showReplaced(items: RecoveredItem[], reason: ReplacedReason): void;
  /** Stores `items` as Recovered text, with the server entries up to `through` marked applied. */
  file(items: RecoveredItem[], through: number): void;
  /** The requests up to `clientSeq` are acknowledged. */
  acknowledged(clientSeq: number): void;
  refused(entry: StoredSetting, message: string): void;
  /** An event of this document's own; one of a kind the upstream reports for it is dropped. */
  emit(event: DocEvent): void;
  /** An event of the upstream's, told as it is. */
  tell(event: UpstreamEvent): void;
  awareness(update: Uint8Array): void;
  /** Keeps the document as a device version, returned; `stored` settles once it is written. */
  recordVersion(
    kind: DeviceVersion["kind"],
    label: DeviceVersion["label"],
    name?: string,
  ): DeviceVersion & { stored: Promise<void> };
  writeSchema(version: number): void;
  /** Stops observing the document and applying server updates. */
  dispose(): void;
  /** The handle the app holds, with the parts its session keeps. */
  handleOf(parts: SessionParts): DocHandle;
}

/** The parts of a handle its session keeps. */
interface SessionParts extends Pick<
  DocHandle,
  | "nameVersion"
  | "restoreLocally"
  | "deviceVersions"
  | "lastServerSeq"
  | "viewers"
> {
  status: Subscribable<DocStatus>;
  readOnly: Subscribable<ViewHandle | null>;
  sendAwareness(update: Uint8Array): void;
  adoptClientIds(ids: readonly number[]): void;
  reserveClientId(): Promise<number>;
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
  /** Nothing holds remote updates, and the app read `doc()` or released its last hold. */
  idle(): void;
  /** The client IDs whose text a server update may set aside. */
  ownClientIds(): readonly number[];
  /** Through the local node: its upstream's status and events stand for this copy's, and its Recovered text comes before the copy's own. */
  upstream: UpstreamWindow | null;
}

class BoundCopy implements LocalCopy {
  doc: CrdtDoc;
  private coalescer: Coalescer;
  private unobserve: () => void = () => {};
  /** The local sequence of the newest server update stored. */
  private storedThrough = 0;
  private readonly steps = new StepTwo({
    doc: () => this.doc,
    coalescer: () => this.coalescer,
    applyServer: (update) => this.applyServer(update),
    items: (leftovers) => this.items(leftovers),
    dropOnline: () => this.window.take(),
    store: (update, items) => {
      const localSeq = this.options.journal.appendServer(update, true);
      this.storedThrough = localSeq;
      this.appliedTo(localSeq, items);
    },
  });
  private readonly overlay = createSettingsOverlay(() => this.doc);
  private readonly list: RecoveredList;
  private readonly schema: ReturnType<typeof createSubscribable<number>>;
  private readonly listeners = new Set<(event: DocEvent) => void>();
  private readonly awarenessListeners = new Set<(update: Uint8Array) => void>();
  private readonly options: LocalCopyOptions;
  private readonly window: OverlapWindow;

  constructor(options: LocalCopyOptions) {
    this.options = options;
    this.window = new OverlapWindow(this, options.ports.clock);
    this.list = new RecoveredList(options.upstream?.recovered ?? null);
    this.doc = options.doc;
    if (options.checkpoint !== null)
      this.doc.applyUpdate(options.checkpoint, ORIGIN_LOAD);
    for (const e of options.journal.entries)
      if (e.kind === "update" && e.applied)
        this.doc.applyUpdate(e.update, ORIGIN_LOAD);
    this.coalescer = this.bind(this.doc);
    this.schema = createSubscribable(options.writeSchema);
  }

  get recovered(): readonly RecoveredItem[] {
    return this.list.items;
  }

  load(recovered: RecoveredItem[], unsaved: UnsavedEdit[]): void {
    const { journal } = this.options;
    this.list.reset(recovered);
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

  merge(update: Uint8Array, overlaps: Leftover[]): void {
    this.steps.merge(update, overlaps);
  }

  mine(): DocJSON {
    // this document is replaced next, so a hold protects nothing in it
    this.steps.flushAll();
    return scriptBody(this.doc).materialize();
  }

  items(leftovers: readonly Leftover[]): RecoveredItem[] {
    const { docId } = this.options;
    return leftovers.map((leftover) => ({
      id: this.newId(),
      docId,
      ...leftover,
      recoveredAt: this.now(),
    }));
  }

  replace(next: CrdtDoc, items: RecoveredItem[]): void {
    const previous = this.coalescer;
    this.doc = next;
    this.coalescer = this.bind(next);
    previous.dispose();
    this.list.file(items);
  }

  showReplaced(items: RecoveredItem[], reason: ReplacedReason): void {
    this.overlay.show();
    this.emit({ type: "replaced", reason });
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
    if (this.options.upstream?.drops(event) !== true) this.tell(event);
  }

  tell(event: DocEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  awareness(update: Uint8Array): void {
    for (const listener of this.awarenessListeners) listener(update);
  }

  recordVersion(
    kind: DeviceVersion["kind"],
    label: DeviceVersion["label"],
    name?: string,
  ): DeviceVersion & { stored: Promise<void> } {
    const createdAt = this.now();
    const { docId, journal } = this.options;
    const version = deviceVersion(this.doc, {
      id: this.newId(),
      docId,
      kind,
      label,
      name: name ?? null,
      createdAt,
    });
    journal.patch({ lastDeviceVersionAt: createdAt });
    return { ...version, stored: journal.addVersion(version) };
  }

  writeSchema(version: number): void {
    this.schema.set(version);
  }

  dispose(): void {
    this.list.dispose();
    this.unobserve();
    this.coalescer.dispose();
  }

  handleOf(parts: SessionParts): DocHandle {
    const { upstream } = this.options;
    return {
      ...parts,
      docId: this.options.docId,
      doc: () => {
        if (!this.steps.held) this.options.idle();
        return this.doc;
      },
      recovered: this.list.view,
      settings: this.overlay.view,
      writeSchema: this.schema,
      upstream:
        upstream?.status ?? createSubscribable<UpstreamStatus | null>(null),
      on: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      setSetting: (key, value) => this.setSetting(key, value),
      holdRemote: () => this.steps.hold(),
      releaseRemote: () => {
        if (this.steps.release()) this.options.idle();
      },
      onAwareness: (listener) => {
        this.awarenessListeners.add(listener);
        return () => this.awarenessListeners.delete(listener);
      },
      saveVersion: (label) => this.recordVersion("device", label).stored,
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
    this.steps.holdAll(coalescer);
    return coalescer;
  }

  /** A change made here, or the formatting Yjs tidies after a remote one: an own entry. */
  private changed(report: TransactionReport): void {
    if (report.origin === ORIGIN_LOAD) return;
    const { journal } = this.options;
    if (report.origin === ORIGIN_REMOTE) {
      this.steps.remote();
      this.window.remote(report, new Set(this.options.ownClientIds()));
      return;
    }
    this.window.own(report);
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
    const own = new Set(this.options.ownClientIds());
    const setAside = applyRemote(this.doc, update, own);
    return this.items(setAside.map((a) => textLeftover(a, "merge")));
  }

  /** Server entries up to `through` are in the document, and `items` is what they set aside; the overlaps found online are filed with them. */
  private appliedTo(through: number, items: RecoveredItem[]): void {
    this.options.journal.applied(through);
    this.file([...items, ...this.window.take()], through);
    this.overlay.applied(through);
    this.options.changed();
  }

  file(items: RecoveredItem[], through: number): void {
    this.options.journal.markApplied(through, items);
    if (items.length === 0) return;
    this.list.file(items);
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
