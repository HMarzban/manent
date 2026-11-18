// One open document: its copy and its store, what waits to be sent, and what it shows.
import {
  ORIGIN_LOAD,
  ORIGIN_REMOTE,
  applyRemote,
  createDoc,
  loadDoc,
  observeScript,
  readStateVector,
  scriptBody,
  updateMeta,
} from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import type { DocumentMessage, Message } from "@manent/sync-protocol";
import { createCoalescer } from "../coalescer/coalescer.ts";
import type { Coalescer } from "../coalescer/coalescer.ts";
import type { ServerGate } from "../link/gate.ts";
import type { LinkIssue } from "../link/machine.ts";
import { planOutbox, waitingCount } from "../outbox/plan.ts";
import { deriveStatus } from "../outbox/status.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import {
  DEVICE_VERSION_INTERVAL_MS,
  LOCAL_CHECKPOINT_EVERY,
  SUBSCRIBE_CLIENT_IDS,
} from "../ports/defaults.ts";
import { ConnectError, StoreError } from "../ports/ports.ts";
import type {
  DeviceVersion,
  DocMeta,
  DocStatus,
  LinkState,
  LoadedDocument,
  RecoveredItem,
  SideState,
  StoredEntry,
  StoredSetting,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import { rejectedItems } from "../recovery/recover.ts";
import { deviceVersion, offerVersions } from "../recovery/versions.ts";
import { createHandshake, needsHeal } from "./handshake.ts";
import type { Ending, Handshake, HandshakeHost } from "./handshake.ts";
import { createSettingsOverlay } from "./settings.ts";

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

/** What a session hears from the link. */
export interface SessionLink {
  state: LinkState;
  issue: LinkIssue;
  wentOfflineAt: number | null;
}

/** One open document as its client drives it. */
export interface Session {
  readonly handle: DocHandle;
  link(facts: SessionLink): void;
  connected(send: (message: Message) => void, gate: ServerGate): void;
  disconnected(): void;
  receive(message: DocumentMessage): void;
  error(message: Extract<Message, { type: "ERROR" }>): void;
  skipped(): void;
  writeSchema(version: number): void;
}

interface SessionOptions {
  docId: string;
  ports: SyncClientPorts;
  /** A new document's request; null to open one that may exist. */
  create: DocMeta["create"];
  link: SessionLink;
  writeSchema: number;
  uploadVersion: ((version: DeviceVersion) => Promise<boolean>) | null;
  replaceConnection(reason: string): void;
  closed(): void;
}

/**
 * A permanently rejected push being recovered: the device version that keeps
 * the document, whether the push was the heal push, the code it was refused
 * with (null when a reopened session resumes one), and the new client ID.
 */
interface Recovery {
  versionId: string;
  heal: boolean;
  code: number | null;
  clientId: number;
}

const LINK_SIDE: Readonly<Record<LinkIssue, SideState | null>> = Object.freeze({
  none: null,
  sign_in: "sign_in",
  too_old: null,
  server_old: "server_old",
});

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
  };
}

/** Ids of the blocks a change inserted, changed or removed. */
function elementsOf(report: TransactionReport): string[] {
  const ids = [...report.inserted.map((i) => i.block), ...report.changed].map(
    (b) => b.attrs?.id,
  );
  return [
    ...new Set(
      [...ids, ...report.removed].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];
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

/** Loads the document before anything is sent: from the store, or in memory when the store cannot be read. */
export async function openSession(options: SessionOptions): Promise<Session> {
  const loaded = await options.ports.store
    .load(options.docId)
    .catch((error: unknown) => {
      if (!(error instanceof StoreError)) throw error;
      return error;
    });
  const readable = loaded instanceof StoreError ? null : loaded;
  const session = new DocSession(options, readable);
  await session.ready(loaded);
  return session;
}

class DocSession implements Session, HandshakeHost {
  readonly handle: DocHandle;
  private meta: DocMeta;
  private doc: CrdtDoc;
  private entries: StoredEntry[];
  private nextLocalSeq: number;
  private recovered: RecoveredItem[] = [];
  private storeRefusing = false;
  private memoryOnly = false;
  private facts: SessionLink;
  private readonly side = new Set<SideState>();
  /** Own entries and settings whose store write has not settled: nothing after the first is sent. */
  private readonly unsettled = new Set<number>();
  private readonly pending = new Set<Promise<void>>();
  private readonly listeners = new Set<(event: DocEvent) => void>();
  private readonly awarenessListeners = new Set<(update: Uint8Array) => void>();
  /** The local sequence of the newest server update stored. */
  private storedThrough = 0;
  private sinceCheckpoint = 0;
  private holding = 0;
  private remoteChanged = false;
  private createdAgain = false;
  private stopped = false;
  /** Counts connections made and lost, so that an answer for an older one is dropped. */
  private connection = 0;
  private headSeq = 0;
  private receipt: { sent: number; setAside: number } | null = null;
  private readonly options: SessionOptions;
  private readonly handshake: Handshake;
  private coalescer: Coalescer;
  private readonly overlay = createSettingsOverlay(() => this.doc);
  private readonly status: ReturnType<typeof createSubscribable<DocStatus>>;
  private readonly recoveredView = createSubscribable<readonly RecoveredItem[]>(
    [],
  );
  private readonly schema: ReturnType<typeof createSubscribable<number>>;
  private unobserve: () => void = () => {};
  /** The last state everything was synced at, as the store gave it; null when there is none. */
  private syncedBase: Uint8Array | null;
  private recovery: Recovery | null = null;
  /** The `clientSeq` of the heal push in flight on this subscription. */
  private healSeq: number | null = null;
  /** The connection the device versions were last offered on. */
  private offeredOn = -1;

  constructor(options: SessionOptions, loaded: LoadedDocument | null) {
    const { docId, ports } = options;
    this.options = options;
    this.meta = loaded?.meta ?? freshMeta(docId, options.create);
    this.facts = options.link;
    this.syncedBase = loaded?.syncedBase ?? null;
    const clientId = this.freshClientId();
    const checkpoint = loaded?.checkpoint ?? null;
    this.doc =
      checkpoint === null
        ? createDoc({ clientId })
        : loadDoc(checkpoint.state, { clientId });
    this.entries = loaded?.entries ?? [];
    for (const e of this.entries)
      if (e.kind === "update" && e.applied)
        this.doc.applyUpdate(e.update, ORIGIN_LOAD);
    const seqs = this.entries.map((e) => e.localSeq);
    this.nextLocalSeq = Math.max(checkpoint?.throughLocalSeq ?? 0, ...seqs) + 1;
    this.handshake = createHandshake({ docId, clock: ports.clock, host: this });
    this.coalescer = this.bind(this.doc);
    this.status = createSubscribable(this.computeStatus());
    this.schema = createSubscribable(options.writeSchema);
    const { recovering } = this.meta;
    if (recovering !== null)
      this.recovery = {
        ...recovering,
        code: null,
        clientId: this.freshClientId(),
      };
    this.handle = this.handleOf();
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

  /** A Yjs client ID this device never used for the document. */
  private freshClientId(): number {
    const { random } = this.options.ports;
    const used = new Set([...this.meta.clientIds, this.recovery?.clientId]);
    let clientId = random.clientId();
    while (used.has(clientId)) clientId = random.clientId();
    return clientId;
  }

  /**
   * Stores a new document and the new client ID, then applies what was stored
   * but not yet applied. `loaded` is what the store gave: a refusal means the
   * session works in memory.
   */
  async ready(loaded: LoadedDocument | StoreError | null): Promise<void> {
    const { store } = this.options.ports;
    const { docId } = this.options;
    if (loaded instanceof StoreError) this.storeFailed(loaded);
    this.memoryOnly = this.storeRefusing;
    if (loaded === null) await this.persist(() => store.create(this.meta));
    // a document the store could not create takes no writes: it lives in memory
    this.memoryOnly = this.storeRefusing;
    this.patch({ clientIds: [...this.meta.clientIds, this.doc.clientId] });
    await Promise.all(this.pending);
    if (!this.memoryOnly)
      this.recovered = await store.recovered(docId).catch((error: unknown) => {
        this.storeFailed(error);
        return [];
      });
    this.recoveredView.set(this.recovered);
    for (const e of this.entries) {
      if (e.kind === "set" && !e.acked) this.overlay.request(e);
      if (e.kind !== "update" || e.applied) continue;
      this.storedThrough = Math.max(this.storedThrough, e.localSeq);
      this.coalescer.push(e.update, e.localSeq);
    }
    this.coalescer.flushNow();
    this.prune();
    this.overlay.show();
    if (this.recovery !== null) this.side.add("rejected");
    const { parked } = this.meta;
    if (parked === null) this.refresh();
    else this.stop(parked.reason);
  }

  link(facts: SessionLink): void {
    this.facts = facts;
    this.refresh();
  }

  connected(send: (message: Message) => void, gate: ServerGate): void {
    this.connection += 1;
    this.handshake.connect(send, gate);
    if (gate === "ok" && this.side.delete("server_old")) {
      this.stopped = false;
      this.handshake.resume();
    }
    if (this.stopped) return;
    const { create } = this.meta;
    if (this.meta.neverSynced && create !== null)
      this.createThenSubscribe(create);
    else this.handshake.subscribe();
  }

  disconnected(): void {
    this.connection += 1;
    this.handshake.disconnect();
    this.refresh();
  }

  receive(message: DocumentMessage): void {
    this.handshake.receive(message);
  }

  error(message: Extract<Message, { type: "ERROR" }>): void {
    this.handshake.error(message);
  }

  skipped(): void {
    this.handshake.skipped();
  }

  writeSchema(version: number): void {
    this.schema.set(version);
  }

  /** A recovery subscribes under its new client ID, with an empty state vector, to be sent the whole state. */
  subscription(): ReturnType<HandshakeHost["subscription"]> {
    const { meta, recovery } = this;
    const clientIds =
      recovery === null
        ? meta.clientIds
        : [...meta.clientIds, recovery.clientId];
    return {
      generation: meta.generation,
      clientIds: clientIds.slice(-SUBSCRIBE_CLIENT_IDS),
      lastServerSeq: meta.lastServerSeq,
      vector: (recovery === null ? this.doc : createDoc()).encodeStateVector(),
    };
  }

  heal(serverVector: Uint8Array): ReturnType<HandshakeHost["heal"]> {
    this.healSeq = null;
    if (this.recovery !== null) return null;
    const { meta } = this;
    const due = needsHeal({
      headSeq: this.headSeq,
      lastServerSeq: meta.lastServerSeq,
      own: readStateVector(this.doc.encodeStateVector()),
      server: readStateVector(serverVector),
      ownClientIds: new Set(meta.clientIds),
      ackedClocks: meta.ackedClocks,
    });
    if (!due) return null;
    this.healSeq = this.nextLocalSeq - 1;
    return { clientSeq: this.healSeq, update: this.doc.diff(serverVector) };
  }

  outbox(afterSeq: number): ReturnType<HandshakeHost["outbox"]> {
    const first = Math.min(...this.unsettled);
    return planOutbox(
      this.entries.filter((e) => e.localSeq > afterSeq && e.localSeq < first),
    );
  }

  subscribed(m: Extract<DocumentMessage, { type: "SUBSCRIBED" }>): void {
    this.headSeq = m.headSeq;
    this.patch({ generation: m.generation });
  }

  /** The server's step 2. One that changes nothing is not stored, so it takes no local sequence. */
  stepTwo(update: Uint8Array): void {
    if (this.recovery !== null) this.recover(this.recovery, update);
    else this.merge(update);
    this.patch({
      lastServerSeq: Math.max(this.meta.lastServerSeq, this.headSeq),
      ...(this.hasWaiting() ? {} : { lastSyncedAt: this.now() }),
    });
  }

  private merge(update: Uint8Array): void {
    const waiting = waitingCount(this.entries);
    if (waiting > 0 && !this.meta.neverSynced)
      this.recordVersion("device", "before_reconnect");
    if (waiting > 0)
      this.receipt = { sent: waiting, setAside: this.recovered.length };
    if (this.holding > 0) this.update(update);
    else {
      this.coalescer.flushNow();
      this.remoteChanged = false;
      const items = this.applyServer(update);
      if (this.remoteChanged) {
        const localSeq = this.nextLocalSeq++;
        this.storedThrough = localSeq;
        this.save(serverEntry(localSeq, update, true));
        this.appliedTo(localSeq, items);
      }
    }
  }

  /**
   * Step 2 of a recovery holds the server's whole state: the document is
   * replaced by it, and what the rejected push held that the server lacks is
   * filed as Recovered text, never written into the new document.
   */
  private recover(recovery: Recovery, update: Uint8Array): void {
    const { docId, ports } = this.options;
    const next = loadDoc(update, { clientId: recovery.clientId });
    const theirs = scriptBody(next).materialize();
    const synced =
      this.syncedBase === null ? createDoc() : loadDoc(this.syncedBase);
    // after a refused heal push the server lost part of what was synced: theirs is the base
    const base = recovery.heal ? theirs : scriptBody(synced).materialize();
    const mine = scriptBody(this.doc).materialize();
    const items = rejectedItems({
      docId,
      base,
      mine,
      theirs,
      recoveredAt: this.now(),
      newId: () => this.newId(),
    });
    const state = next.encodeState();
    const meta: DocMeta = {
      ...this.meta,
      clientIds: [...this.meta.clientIds, recovery.clientId],
      recovering: null,
    };
    void this.persist(() => ports.store.markApplied(docId, 0, items));
    void this.persist(() => ports.store.reset(docId, state, meta));
    this.meta = meta;
    this.syncedBase = state;
    this.recovery = null;
    this.healSeq = null;
    this.entries = this.entries.filter((e) => e.kind === "set" && !e.acked);
    const previous = this.coalescer;
    this.doc = next;
    this.coalescer = this.bind(next);
    previous.dispose();
    this.recovered = [...this.recovered, ...items];
    this.recoveredView.set(this.recovered);
    this.side.delete("rejected");
    this.overlay.show();
    this.emit({ type: "replaced", reason: "rejected" });
    if (items.length > 0) this.emit({ type: "recovered", items });
    if (recovery.code !== null)
      this.emit({
        type: "rejected",
        code: recovery.code,
        replayed: 0,
        setAside: items.length,
      });
  }

  /** A permanently rejected push: the document is kept as a version, and subscribed to afresh under a new client ID. */
  private reject(code: number, clientSeq: number | null): void {
    const heal = clientSeq !== null && clientSeq === this.healSeq;
    const versionId = this.recordVersion("recovered", "rejected").id;
    this.recovery = { versionId, heal, code, clientId: this.freshClientId() };
    this.side.add("rejected");
    this.patch({ recovering: { versionId, heal } });
    this.handshake.resubscribe();
  }

  /** A server update is stored at once and shown at the next frame. */
  update(update: Uint8Array): void {
    const localSeq = this.nextLocalSeq++;
    this.storedThrough = localSeq;
    this.save(serverEntry(localSeq, update, false));
    this.coalescer.push(update, localSeq);
  }

  acknowledged(clientSeq: number, serverSeq: number): void {
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
      lastSyncedAt: this.now(),
    };
    this.meta = { ...this.meta, ...patch };
    const { store } = this.options.ports;
    void this.persist(() =>
      store.acknowledge(this.options.docId, clientSeq, patch),
    );
    this.overlay.acknowledge(clientSeq, this.storedThrough);
    this.settled();
  }

  refused(clientSeq: number, message: string): void {
    const entry = this.entries.find(
      (e): e is StoredSetting => e.kind === "set" && e.localSeq === clientSeq,
    );
    if (entry === undefined) return;
    this.entries = this.entries.filter((e) => e !== entry);
    const { store } = this.options.ports;
    void this.persist(() => store.refuse(this.options.docId, clientSeq));
    this.overlay.refuse(clientSeq);
    this.emit({ type: "setting_refused", key: entry.key, message });
    this.settled();
  }

  ended(ending: Ending): void {
    switch (ending.type) {
      case "stopped":
        if (ending.side === "rejected")
          this.reject(ending.code, ending.clientSeq);
        else if (ending.side === "deleted") this.park("deleted");
        else this.stop(ending.side);
        return;
      case "forbidden": {
        const { create, neverSynced } = this.meta;
        if (!neverSynced) this.park("access_removed");
        else if (create === null || this.createdAgain)
          this.stop("access_removed");
        else {
          this.createdAgain = true;
          this.createThenSubscribe(create);
        }
        return;
      }
      case "client_id_taken":
        this.patch({
          clientIds: this.meta.clientIds.filter(
            (id) => id !== this.doc.clientId,
          ),
        });
        this.reject(CODE.BAD_FRAME, null);
        return;
      case "moved":
        this.stop(null);
        return;
      default:
        ending satisfies never;
    }
  }

  awareness(update: Uint8Array): void {
    for (const listener of this.awarenessListeners) listener(update);
  }

  replaceConnection(reason: string): void {
    this.options.replaceConnection(reason);
  }

  /** A change made here, or the formatting Yjs tidies after a remote one: an own entry. */
  private changed(report: TransactionReport): void {
    if (report.origin === ORIGIN_LOAD) return;
    if (report.origin === ORIGIN_REMOTE) {
      this.remoteChanged = true;
      return;
    }
    this.save({
      kind: "update",
      localSeq: this.nextLocalSeq++,
      update: report.update,
      own: true,
      acked: false,
      applied: true,
      elements: elementsOf(report),
    });
    const since = this.now() - this.meta.lastDeviceVersionAt;
    const due = since >= DEVICE_VERSION_INTERVAL_MS || since < 0;
    if (this.facts.state !== "online" && due)
      this.recordVersion("device", "hourly");
    this.refresh();
  }

  /** Stored at once; an own entry or a setting is sent only once its write has settled, in order. */
  private save(entry: StoredEntry): void {
    const { store } = this.options.ports;
    const { docId } = this.options;
    this.entries.push(entry);
    const waits = entry.kind === "set" || entry.own;
    if (waits) this.unsettled.add(entry.localSeq);
    void this.persist(() => store.append(docId, entry)).then(() => {
      if (!waits) return;
      this.unsettled.delete(entry.localSeq);
      this.refresh();
      this.handshake.pump();
    });
    if (++this.sinceCheckpoint < LOCAL_CHECKPOINT_EVERY) return;
    this.sinceCheckpoint = 0;
    // the state holds every entry up to the first server update not yet applied
    const unapplied = this.entries.flatMap((e) =>
      e.kind === "update" && !e.applied ? [e.localSeq - 1] : [],
    );
    const through = Math.min(entry.localSeq, ...unapplied);
    const state = this.doc.encodeState();
    const synced = this.computeStatus().synced;
    void this.persist(() => store.checkpoint(docId, state, through, synced));
  }

  private applyServer(update: Uint8Array): RecoveredItem[] {
    const setAside = applyRemote(
      this.doc,
      update,
      new Set(this.meta.clientIds),
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
    this.entries = this.entries.map((e) =>
      e.kind === "update" && !e.own && e.localSeq <= through
        ? { ...e, applied: true }
        : e,
    );
    this.prune();
    const { store } = this.options.ports;
    void this.persist(() =>
      store.markApplied(this.options.docId, through, items),
    );
    if (items.length > 0) {
      this.recovered = [...this.recovered, ...items];
      this.recoveredView.set(this.recovered);
      this.emit({ type: "recovered", items });
    }
    this.overlay.applied(through);
    this.refresh();
  }

  /** Keeps the document as a device version; `stored` settles once it is written. */
  private recordVersion(
    kind: DeviceVersion["kind"],
    label: DeviceVersion["label"],
  ): { id: string; stored: Promise<void> } {
    const createdAt = this.now();
    const { docId, ports } = this.options;
    const id = this.newId();
    const version = deviceVersion(this.doc, {
      id,
      docId,
      kind,
      label,
      createdAt,
    });
    this.patch({ lastDeviceVersionAt: createdAt });
    return { id, stored: this.persist(() => ports.store.addVersion(version)) };
  }

  /** Access removed, or the document deleted, with edits waiting: they are kept and never sent. */
  private park(reason: "access_removed" | "deleted"): void {
    if (this.hasWaiting())
      this.patch({ parked: { reason, parkedAt: this.now() } });
    this.stop(reason);
  }

  private createThenSubscribe(create: { kind: string; home: string }): void {
    const at = this.connection;
    const request = { docId: this.options.docId, ...create };
    this.options.ports.transport.createDocument(request).then(
      (result) => {
        if (at !== this.connection) return;
        if (result.ok) this.handshake.subscribe();
        else
          this.stop(result.code === "deleted" ? "deleted" : "access_removed");
      },
      (error: unknown) => {
        // unreachable or signed out: the document stays local until the next connection
        if (!(error instanceof ConnectError)) throw error;
      },
    );
  }

  private stop(why: SideState | null): void {
    this.stopped = true;
    this.handshake.stop();
    if (why !== null) this.side.add(why);
    this.refresh();
  }

  /** After an acknowledgement or a refusal: the receipt goes once nothing waits. */
  private settled(): void {
    this.refresh();
    if (this.receipt === null || this.hasWaiting()) return;
    const { sent, setAside } = this.receipt;
    this.receipt = null;
    this.emit({
      type: "receipt",
      sent,
      setAside: this.recovered.length - setAside,
    });
  }

  private patch(patch: Partial<DocMeta>): void {
    this.meta = { ...this.meta, ...patch };
    const { store } = this.options.ports;
    void this.persist(() => store.patchMeta(this.options.docId, patch));
    this.refresh();
  }

  private persist(write: () => Promise<void>): Promise<void> {
    if (this.memoryOnly) return Promise.resolve();
    const done = write().catch((error: unknown) => this.storeFailed(error));
    this.pending.add(done);
    void done.finally(() => this.pending.delete(done));
    return done;
  }

  /** A refused write: work goes on in memory, and the status says it is not saved. */
  private storeFailed(error: unknown): void {
    if (!(error instanceof StoreError)) throw error;
    this.storeRefusing = true;
    this.refresh();
  }

  // acknowledged and applied entries are in the store and the document: nothing here needs them
  private prune(): void {
    this.entries = this.entries.filter(
      (e) => !e.acked || (e.kind === "update" && !e.applied),
    );
  }

  private hasWaiting(): boolean {
    return waitingCount(this.entries) > 0;
  }

  private computeStatus(): DocStatus {
    const linkSide = LINK_SIDE[this.facts.issue];
    return deriveStatus({
      link: this.facts.state,
      subscribed: this.handshake.subscribed(),
      merged: this.handshake.merged(),
      entries: this.entries,
      unsavedWrites: this.unsettled.size,
      storeRefusing: this.storeRefusing,
      wentOfflineAt: this.facts.wentOfflineAt,
      neverSynced: this.meta.neverSynced,
      recovered: this.recovered.length,
      side: linkSide === null ? [...this.side] : [...this.side, linkSide],
    });
  }

  /** Shows the status; once synced on a connection, offers the device versions for upload. */
  private refresh(): void {
    const status = this.computeStatus();
    this.status.set(status);
    const upload = this.options.uploadVersion;
    if (upload === null || !status.synced || this.offeredOn === this.connection)
      return;
    this.offeredOn = this.connection;
    const { store } = this.options.ports;
    void this.persist(() => offerVersions(store, this.options.docId, upload));
  }

  private emit(event: DocEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private newId(): string {
    return this.options.ports.random.bytes(16).toHex();
  }

  private now(): number {
    return this.options.ports.clock.now();
  }

  private handleOf(): DocHandle {
    return {
      docId: this.options.docId,
      doc: () => this.doc,
      status: this.status,
      recovered: this.recoveredView,
      settings: this.overlay.view,
      writeSchema: this.schema,
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
      sendAwareness: (update) => this.handshake.sendAwareness(update),
      onAwareness: (listener) => {
        this.awarenessListeners.add(listener);
        return () => this.awarenessListeners.delete(listener);
      },
      saveVersion: (label) => this.recordVersion("device", label).stored,
      close: () => this.close(),
    };
  }

  private setSetting(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    if (text === undefined)
      throw new TypeError(
        `a setting must be a JSON value, not ${String(value)}`,
      );
    const entry: StoredSetting = {
      kind: "set",
      localSeq: this.nextLocalSeq++,
      key,
      value: text,
      acked: false,
    };
    this.save(entry);
    this.overlay.request(entry);
    this.refresh();
  }

  private async close(): Promise<void> {
    this.unobserve();
    this.coalescer.dispose();
    this.handshake.close();
    this.options.closed();
    await Promise.all(this.pending);
  }
}
