// One open document as its client drives it: its journal in the store, its local copy and its
// subscription to the server, and the status it shows.
import { createDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { CODE, indexDocId } from "@manent/sync-protocol";
import type { DocumentMessage, Message } from "@manent/sync-protocol";
import type { ServerGate } from "../link/gate.ts";
import type { LinkIssue } from "../link/machine.ts";
import { deriveStatus } from "../outbox/status.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import { StoreError } from "../ports/ports.ts";
import type {
  DeviceVersion,
  DocMeta,
  DocStatus,
  LinkState,
  LoadedDocument,
  SideState,
  SyncClientPorts,
} from "../ports/ports.ts";
import type { ViewHandle } from "../view/view.ts";
import type { DocHandle } from "./doc-handle.ts";
import type { UnsavedEdit } from "./edits.ts";
import type { Handshake } from "./handshake.ts";
import { createJournal } from "./journal.ts";
import type { Journal } from "./journal.ts";
import { KeptWrites } from "./kept-writes.ts";
import { createLocalCopy } from "./local-copy.ts";
import type { LocalCopy } from "./local-copy.ts";
import { createSubscription } from "./subscription.ts";
import type { Subscription } from "./subscription.ts";

/** What a session hears from the link. */
export interface SessionLink {
  state: LinkState;
  issue: LinkIssue;
  wentOfflineAt: number | null;
}

/** One open document as its client drives it. */
export interface Session {
  readonly handle: DocHandle;
  /** A following tab's client ID: listed from now on, subscribing again when it is new. */
  addClient(clientId: number): void;
  /**
   * A following tab's edit, made in `generation`: applied and stored as an own
   * entry, or, made in the document a move left, carried from it; resolves
   * `refused` once its write settled.
   */
  edit(edit: UnsavedEdit, generation: number): Promise<boolean>;
  /** A following tab moved to the new document, or closed it: the document a move left is not kept for it. */
  released(tabId: string): void;
  /** The document as this tab holds it, for a tab that opens it. */
  state(): { state: Uint8Array; meta: DocMeta };
  /** This tab no longer leads: the session stops using the store and the connection. */
  detach(): { doc: CrdtDoc; unsaved: UnsavedEdit[] };
  /** Another document's meta changed: a creation waiting for that document asks again. */
  metaChanged(docId: string): void;
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
  /** The tab's own document when it takes the lead, keeping its client ID; null for a new one. */
  doc: CrdtDoc | null;
  /** What the tab's leader never saved, stored first. */
  unsaved: UnsavedEdit[];
  /** Every update stored: the server's, this tab's, another tab's. */
  stored(update: Uint8Array): void;
  /** A reader of the document, for when it may not be edited. */
  view(): ViewHandle;
  /** The store refused a write because another tab now leads. */
  lostLead(): void;
  /** The tabs following this document. */
  followers(): string[];
  /** A new document's request; null to open one that may exist. */
  create: DocMeta["create"];
  link: SessionLink;
  writeSchema: number;
  uploadVersion: ((version: DeviceVersion) => Promise<boolean>) | null;
  replaceConnection(reason: string): void;
  /** This document's meta changed, and every write started so far has settled. */
  metaChanged(): void;
  closed(): void;
}

const LINK_SIDE: Readonly<Record<LinkIssue, SideState | null>> = Object.freeze({
  none: null,
  sign_in: "sign_in",
  too_old: null,
  server_old: "server_old",
});

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

class DocSession implements Session {
  readonly handle: DocHandle;
  private readonly options: SessionOptions;
  private readonly journal: Journal;
  private readonly kept: KeptWrites;
  private readonly copy: LocalCopy;
  private readonly subscription: Subscription;
  private readonly handshake: Handshake;
  private facts: SessionLink;
  private readonly status: ReturnType<typeof createSubscribable<DocStatus>>;
  /** The connection the device versions were last offered on. */
  private offeredOn = -1;
  /** A connection held back until the store holds the index of the workspace a new script is created in. */
  private held: {
    send: (message: Message) => void;
    gate: ServerGate;
    indexId: string;
  } | null = null;

  constructor(options: SessionOptions, loaded: LoadedDocument | null) {
    const { docId, ports } = options;
    this.options = options;
    this.kept = new KeptWrites({
      docId,
      ports,
      entries: () => this.journal.entries,
      changed: () => this.refresh(),
      lostLead: options.lostLead,
    });
    const journal = createJournal({
      docId,
      store: ports.store,
      loaded,
      create: options.create,
      stored: options.stored,
      changed: () => this.changedMeta(),
      sendable: () => {
        this.refresh();
        this.handshake.pump();
      },
      lostLead: options.lostLead,
      checkpoint: () => ({
        state: this.copy.doc.encodeState(),
        synced: this.computeStatus().synced,
      }),
      append: (entry) => this.kept.append(entry),
    });
    this.journal = journal;
    this.facts = options.link;
    const doc =
      options.doc ??
      createDoc({ clientId: journal.freshClientId(null, ports.random) });
    this.copy = createLocalCopy({
      docId,
      ports,
      journal,
      doc,
      checkpoint: loaded?.checkpoint?.state ?? null,
      writeSchema: options.writeSchema,
      changed: () => this.refresh(),
      online: () => this.facts.state === "online",
      idle: () => this.subscription.left?.idle(),
    });
    this.subscription = createSubscription({
      docId,
      ports,
      journal,
      copy: this.copy,
      syncedBase: loaded?.syncedBase ?? null,
      view: options.view,
      changed: () => this.refresh(),
      replaceConnection: options.replaceConnection,
      followers: options.followers,
    });
    this.handshake = this.subscription.handshake;
    this.status = createSubscribable(this.computeStatus());
    this.handle = this.copy.handleOf({
      status: this.status,
      readOnly: this.subscription.readOnly,
      sendAwareness: (update) => this.handshake.sendAwareness(update),
      close: () => this.close(),
    });
  }

  /**
   * Stores a new document and the new client ID, then applies what was stored
   * but not yet applied. `loaded` is what the store gave: a refusal means the
   * session works in memory.
   */
  async ready(loaded: LoadedDocument | StoreError | null): Promise<void> {
    const { journal } = this;
    await journal.open(loaded);
    this.addId(this.copy.doc.clientId);
    await journal.written();
    const recovered = journal.memoryOnly ? [] : await journal.loadRecovered();
    this.copy.load(recovered, this.options.unsaved);
    this.subscription.ready();
  }

  addClient(clientId: number): void {
    if (this.journal.meta.clientIds.includes(clientId)) return;
    this.addId(clientId);
    this.handshake.resubscribe();
  }

  edit(edit: UnsavedEdit, generation: number): Promise<boolean> {
    const { left } = this.subscription;
    const refused = (): boolean => this.refusing();
    if (left?.generation !== generation)
      return this.copy.edit(edit).then(refused);
    left.edit(edit.update);
    return this.journal.written().then(refused);
  }

  released(tabId: string): void {
    this.subscription.left?.released(tabId);
  }

  state(): { state: Uint8Array; meta: DocMeta } {
    return { state: this.copy.doc.encodeState(), meta: this.journal.meta };
  }

  detach(): { doc: CrdtDoc; unsaved: UnsavedEdit[] } {
    const kept = this.kept
      .entries()
      .flatMap((e) =>
        e.kind === "update" && e.own
          ? [{ update: e.update, elements: e.elements }]
          : [],
      );
    this.kept.stop();
    this.held = null;
    const unsaved = [...kept, ...this.journal.detach()];
    this.subscription.close();
    this.copy.dispose();
    this.handshake.disconnect();
    this.handshake.stop();
    return { doc: this.copy.doc, unsaved };
  }

  link(facts: SessionLink): void {
    this.facts = facts;
    this.refresh();
  }

  metaChanged(docId: string): void {
    if (docId === this.held?.indexId) void this.connectOnceIndexed();
  }

  connected(send: (message: Message) => void, gate: ServerGate): void {
    const indexId = this.awaitedIndex();
    if (indexId === null) {
      this.subscription.connected(send, gate);
      return;
    }
    this.held = { send, gate, indexId };
    void this.connectOnceIndexed();
  }

  disconnected(): void {
    this.held = null;
    this.subscription.disconnected();
  }

  receive(message: DocumentMessage): void {
    this.handshake.receive(message);
  }

  /** A refusal of the old generation while a move is under way is not acted on. */
  error(message: Extract<Message, { type: "ERROR" }>): void {
    const old = message.code === CODE.GENERATION_MISMATCH;
    if (!old || !this.subscription.moving) this.handshake.error(message);
  }

  skipped(): void {
    this.handshake.skipped();
  }

  writeSchema(version: number): void {
    this.copy.writeSchema(version);
  }

  /** The workspace index a never-synced script's creation waits for; null when nothing waits. */
  private awaitedIndex(): string | null {
    const { neverSynced, create } = this.journal.meta;
    const workspaceId = create?.workspaceId ?? null;
    if (!neverSynced || workspaceId === null) return null;
    return indexDocId("workspace", workspaceId);
  }

  /** The server has named a generation for the index once the store holds one above 0. */
  private async connectOnceIndexed(): Promise<void> {
    const { held } = this;
    if (held === null) return;
    const stored = await this.options.ports.store
      .load(held.indexId)
      .catch((error: unknown) => {
        // an index the store cannot read is not there yet: the next connection asks again
        if (!(error instanceof StoreError)) throw error;
        return null;
      });
    if (this.held !== held || (stored?.meta.generation ?? 0) === 0) return;
    this.held = null;
    this.subscription.connected(held.send, held.gate);
  }

  /** The meta changed, or the store refused a write: shown, and told once the writes started so far have settled. */
  private changedMeta(): void {
    this.refresh();
    void this.journal.written().then(() => this.options.metaChanged());
  }

  private refusing(): boolean {
    return this.journal.storeRefusing || this.kept.size > 0;
  }

  private addId(clientId: number): void {
    const { clientIds } = this.journal.meta;
    this.journal.patch({ clientIds: [...clientIds, clientId] });
  }

  private computeStatus(): DocStatus {
    const linkSide = LINK_SIDE[this.facts.issue];
    const { journal } = this;
    const { side } = this.subscription;
    return deriveStatus({
      link: this.facts.state,
      // while moving the document is syncing, though no subscription is live
      subscribed: this.handshake.subscribed() || this.subscription.moving,
      merged: this.handshake.merged(),
      entries: journal.entries,
      unsavedWrites: journal.unsavedWrites(),
      storeRefusing: this.refusing(),
      wentOfflineAt: this.facts.wentOfflineAt,
      neverSynced: journal.meta.neverSynced,
      recovered: this.copy.recovered.length,
      side: linkSide === null ? [...side] : [...side, linkSide],
    });
  }

  /** Shows the status; once synced on a connection, offers the device versions for upload. */
  private refresh(): void {
    const status = this.computeStatus();
    this.status.set(status);
    const upload = this.options.uploadVersion;
    const { connection } = this.subscription;
    if (upload === null || !status.synced || this.offeredOn === connection)
      return;
    this.offeredOn = connection;
    this.journal.offer(upload);
  }

  private async close(): Promise<void> {
    this.kept.stop();
    this.held = null;
    this.subscription.close();
    this.copy.dispose();
    this.handshake.close();
    this.options.closed();
    await this.journal.written();
  }
}
