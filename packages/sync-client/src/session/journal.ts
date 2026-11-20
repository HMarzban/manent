// One document's meta and stored entries, kept in memory and written through to the store. A
// refused write leaves the session working in memory, and one refused because another tab now
// leads gives the lead up.
import { updateMeta } from "@manent/crdt";
import { planOutbox, waitingCount } from "../outbox/plan.ts";
import type { OutboxItem } from "../outbox/plan.ts";
import { LOCAL_CHECKPOINT_EVERY } from "../ports/defaults.ts";
import { StoreError } from "../ports/ports.ts";
import type {
  DeviceVersion,
  DocMeta,
  LoadedDocument,
  LocalStore,
  Random,
  RecoveredItem,
  StoredEntry,
  StoredSetting,
  StoredUpdate,
} from "../ports/ports.ts";
import { offerVersions } from "../recovery/versions.ts";
import type { UnsavedEdit } from "./edits.ts";

/**
 * `entries` holds every entry not yet both acknowledged and applied, by
 * `localSeq`. `storeRefusing`: a write was refused, so nothing is saved.
 * `memoryOnly`: nothing is written, because the store refused the document
 * when it was opened or the tab no longer leads. An own entry or a setting is
 * sent only once its write has settled, in order.
 */
export interface Journal {
  readonly meta: DocMeta;
  readonly entries: readonly StoredEntry[];
  readonly storeRefusing: boolean;
  readonly memoryOnly: boolean;
  /** Stores a new document (`loaded` null), or takes the store's refusal to load one. */
  open(loaded: LoadedDocument | StoreError | null): Promise<void>;
  /** The Recovered text the store holds; none when it refuses to give it. */
  loadRecovered(): Promise<RecoveredItem[]>;
  /** Settles once every write started so far has. */
  written(): Promise<unknown>;
  /** A Yjs client ID this device never used for the document, and not `taken`. */
  freshClientId(taken: number | null, random: Random): number;
  patch(patch: Partial<DocMeta>): void;
  /** As `patch`, taken in only once the store holds it; false when the store refused it or nothing is written. */
  commit(patch: Partial<DocMeta>): Promise<boolean>;
  /** An own edit; resolves once its write has settled. */
  appendOwn(edit: UnsavedEdit): Promise<void>;
  /** A server update, `applied` when it is in the document already; returns its local sequence. */
  appendServer(update: Uint8Array, applied: boolean): number;
  /** A setting requested here; `value` is JSON text. */
  appendSetting(key: string, value: string): StoredSetting;
  /** The entries up to `clientSeq` are acknowledged; the meta notes it in the same write. */
  acknowledge(clientSeq: number, serverSeq: number, syncedAt: number): void;
  /** Drops a setting refused for good; null when no setting has that sequence. */
  refuse(clientSeq: number): StoredSetting | null;
  /** Every server update up to `through` is in the document. */
  applied(through: number): void;
  /** Stores `items` as Recovered text, with the server entries up to `through` marked applied. */
  markApplied(through: number, items: RecoveredItem[]): void;
  /** A recovery's new start: `state` and `meta` replace what is stored, `items` are filed, and only waiting settings stay. */
  reset(state: Uint8Array, meta: DocMeta, items: RecoveredItem[]): void;
  /** Settles once the version is written. */
  addVersion(version: DeviceVersion): Promise<void>;
  /** Offers every device version not yet uploaded. */
  offer(upload: (version: DeviceVersion) => Promise<boolean>): void;
  /** The `clientSeq` a heal push takes now: below every waiting setting and every entry whose write has not settled. */
  healSeq(): number;
  /** The waiting entries after `afterSeq` that may be sent now, as items. */
  outbox(afterSeq: number): OutboxItem[];
  waiting(): number;
  /** The own updates not yet acknowledged, by `localSeq`. */
  waitingUpdates(): StoredUpdate[];
  /** Own entries and settings whose write has not settled. */
  unsavedWrites(): number;
  prune(): void;
  /** The tab no longer leads: nothing more is written, and the own edits whose write never settled are given back. */
  detach(): UnsavedEdit[];
}

interface JournalOptions {
  docId: string;
  store: LocalStore;
  /** What the store gave; null for a document it does not hold. */
  loaded: LoadedDocument | null;
  /** A new document's request; null to open one that may exist. */
  create: DocMeta["create"];
  /** Every update stored: the server's, this tab's, another tab's. */
  stored(update: Uint8Array): void;
  /** The meta changed, or the store refused a write. */
  changed(): void;
  /** An own entry's or a setting's write settled, so it may be sent. */
  sendable(): void;
  /** The store refused a write because another tab now leads. */
  lostLead(): void;
  /** The document's state for a checkpoint, and whether everything in it is synced. */
  checkpoint(): { state: Uint8Array; synced: boolean };
  /** Writes an entry to the store; rejects StoreError as the store does. */
  append(entry: StoredEntry): Promise<void>;
}

function freshMeta(docId: string, create: DocMeta["create"]): DocMeta {
  return {
    docId,
    generation: 0,
    lastServerSeq: 0,
    clientIds: [],
    ackedClocks: {},
    neverSynced: true,
    create,
    parked: null,
    recovering: null,
    lastDeviceVersionAt: 0,
    lastSyncedAt: null,
    moving: null,
  };
}

function serverEntry(
  localSeq: number,
  update: Uint8Array,
  applied: boolean,
): StoredEntry {
  return {
    kind: "update",
    localSeq,
    update,
    own: false,
    acked: true,
    applied,
    elements: [],
  };
}

class StoreJournal implements Journal {
  meta: DocMeta;
  entries: StoredEntry[];
  storeRefusing = false;
  memoryOnly = false;
  private nextLocalSeq: number;
  /** Own entries and settings whose store write has not settled: nothing after the first is sent. */
  private readonly unsettled = new Set<number>();
  private readonly pending = new Set<Promise<void>>();
  private sinceCheckpoint = 0;
  private readonly docId: string;
  private readonly store: LocalStore;
  private readonly options: JournalOptions;

  constructor(options: JournalOptions) {
    const { docId, loaded } = options;
    this.options = options;
    this.docId = docId;
    this.store = options.store;
    this.meta = loaded?.meta ?? freshMeta(docId, options.create);
    this.entries = loaded?.entries ?? [];
    const seqs = this.entries.map((e) => e.localSeq);
    const through = loaded?.checkpoint?.throughLocalSeq ?? 0;
    this.nextLocalSeq = Math.max(through, ...seqs) + 1;
  }

  async open(loaded: LoadedDocument | StoreError | null): Promise<void> {
    if (loaded instanceof StoreError) this.failed(loaded);
    this.memoryOnly = this.storeRefusing;
    if (loaded === null) await this.persist(() => this.store.create(this.meta));
    // a document the store could not create takes no writes: it lives in memory
    this.memoryOnly = this.storeRefusing;
  }

  loadRecovered(): Promise<RecoveredItem[]> {
    return this.store.recovered(this.docId).catch((error: unknown) => {
      this.failed(error);
      return [];
    });
  }

  written(): Promise<unknown> {
    return Promise.all(this.pending);
  }

  freshClientId(taken: number | null, random: Random): number {
    const used = new Set([...this.meta.clientIds, taken]);
    let clientId = random.clientId();
    while (used.has(clientId)) clientId = random.clientId();
    return clientId;
  }

  patch(patch: Partial<DocMeta>): void {
    this.meta = { ...this.meta, ...patch };
    void this.persist(() => this.store.patchMeta(this.docId, patch));
    this.options.changed();
  }

  async commit(patch: Partial<DocMeta>): Promise<boolean> {
    if (this.memoryOnly) return false;
    let held = true;
    await this.persist(() =>
      this.store.patchMeta(this.docId, patch).catch((error: unknown) => {
        held = false;
        throw error;
      }),
    );
    if (!held) return false;
    this.meta = { ...this.meta, ...patch };
    this.options.changed();
    return true;
  }

  appendOwn(edit: UnsavedEdit): Promise<void> {
    return this.append({
      kind: "update",
      localSeq: this.nextLocalSeq++,
      update: edit.update,
      own: true,
      acked: false,
      applied: true,
      elements: edit.elements,
    });
  }

  appendServer(update: Uint8Array, applied: boolean): number {
    const localSeq = this.nextLocalSeq++;
    this.append(serverEntry(localSeq, update, applied));
    return localSeq;
  }

  appendSetting(key: string, value: string): StoredSetting {
    const entry: StoredSetting = {
      kind: "set",
      localSeq: this.nextLocalSeq++,
      key,
      value,
      acked: false,
    };
    this.append(entry);
    return entry;
  }

  acknowledge(clientSeq: number, serverSeq: number, syncedAt: number): void {
    const isNew = (e: StoredEntry): boolean =>
      !e.acked && e.localSeq <= clientSeq;
    const ackedClocks = { ...this.meta.ackedClocks };
    for (const e of this.entries)
      if (e.kind === "update" && e.own && isNew(e))
        for (const { clientId, toClock } of updateMeta(e.update))
          ackedClocks[clientId] = Math.max(ackedClocks[clientId] ?? 0, toClock);
    this.entries = this.entries.map((e) =>
      isNew(e) ? { ...e, acked: true } : e,
    );
    this.prune();
    const patch: Partial<DocMeta> = {
      lastServerSeq: Math.max(this.meta.lastServerSeq, serverSeq),
      ackedClocks,
      neverSynced: false,
      lastSyncedAt: syncedAt,
    };
    this.meta = { ...this.meta, ...patch };
    void this.persist(() =>
      this.store.acknowledge(this.docId, clientSeq, patch),
    );
  }

  refuse(clientSeq: number): StoredSetting | null {
    const entry = this.entries.find(
      (e): e is StoredSetting => e.kind === "set" && e.localSeq === clientSeq,
    );
    if (entry === undefined) return null;
    this.entries = this.entries.filter((e) => e !== entry);
    void this.persist(() => this.store.refuse(this.docId, clientSeq));
    return entry;
  }

  applied(through: number): void {
    this.entries = this.entries.map((e) =>
      e.kind === "update" && !e.own && e.localSeq <= through
        ? { ...e, applied: true }
        : e,
    );
    this.prune();
  }

  markApplied(through: number, items: RecoveredItem[]): void {
    void this.persist(() => this.store.markApplied(this.docId, through, items));
  }

  reset(state: Uint8Array, meta: DocMeta, items: RecoveredItem[]): void {
    this.markApplied(0, items);
    void this.persist(() => this.store.reset(this.docId, state, meta));
    this.meta = meta;
    this.entries = this.entries.filter((e) => e.kind === "set" && !e.acked);
  }

  addVersion(version: DeviceVersion): Promise<void> {
    return this.persist(() => this.store.addVersion(version));
  }

  offer(upload: (version: DeviceVersion) => Promise<boolean>): void {
    void this.persist(() => offerVersions(this.store, this.docId, upload));
  }

  healSeq(): number {
    const waitingSettings = this.entries.flatMap((e) =>
      e.kind === "set" && !e.acked ? [e.localSeq] : [],
    );
    return (
      Math.min(this.nextLocalSeq, ...this.unsettled, ...waitingSettings) - 1
    );
  }

  outbox(afterSeq: number): OutboxItem[] {
    const first = Math.min(...this.unsettled);
    return planOutbox(
      this.entries.filter((e) => e.localSeq > afterSeq && e.localSeq < first),
    );
  }

  waiting(): number {
    return waitingCount(this.entries);
  }

  waitingUpdates(): StoredUpdate[] {
    return this.entries.filter(
      (e): e is StoredUpdate => e.kind === "update" && e.own && !e.acked,
    );
  }

  unsavedWrites(): number {
    return this.unsettled.size;
  }

  // acknowledged and applied entries are in the store and the document: nothing here needs them
  prune(): void {
    this.entries = this.entries.filter(
      (e) => !e.acked || (e.kind === "update" && !e.applied),
    );
  }

  detach(): UnsavedEdit[] {
    this.memoryOnly = true;
    return this.entries.flatMap((e) =>
      e.kind === "update" && e.own && this.unsettled.has(e.localSeq)
        ? [{ update: e.update, elements: e.elements }]
        : [],
    );
  }

  /** Stored at once and resolved once the write has settled; every update is told to `stored`. */
  private append(entry: StoredEntry): Promise<void> {
    this.entries.push(entry);
    if (entry.kind === "update") this.options.stored(entry.update);
    const waits = entry.kind === "set" || entry.own;
    if (waits) this.unsettled.add(entry.localSeq);
    const settled = this.persist(() => this.options.append(entry)).then(() => {
      if (!waits) return;
      this.unsettled.delete(entry.localSeq);
      this.options.sendable();
    });
    if (++this.sinceCheckpoint < LOCAL_CHECKPOINT_EVERY) return settled;
    this.sinceCheckpoint = 0;
    // the state holds every entry up to the first server update not yet applied
    const unapplied = this.entries.flatMap((e) =>
      e.kind === "update" && !e.applied ? [e.localSeq - 1] : [],
    );
    const through = Math.min(entry.localSeq, ...unapplied);
    const { state, synced } = this.options.checkpoint();
    void this.persist(() =>
      this.store.checkpoint(this.docId, state, through, synced),
    );
    return settled;
  }

  private persist(write: () => Promise<void>): Promise<void> {
    if (this.memoryOnly) return Promise.resolve();
    const done = write().catch((error: unknown) => this.failed(error));
    this.pending.add(done);
    void done.finally(() => this.pending.delete(done));
    return done;
  }

  /** A refused write: work goes on in memory, and the status says it is not saved. `lost_lead`: another tab leads. */
  private failed(error: unknown): void {
    if (!(error instanceof StoreError)) throw error;
    if (error.code === "lost_lead") {
      this.options.lostLead();
      return;
    }
    this.storeRefusing = true;
    this.options.changed();
  }
}

export function createJournal(options: JournalOptions): Journal {
  return new StoreJournal(options);
}
