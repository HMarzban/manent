// One document's subscription as its session drives it: what SUBSCRIBE and the heal push carry,
// the server's step 2, acknowledgements and refusals, what each ending stops or parks, and the
// recovery from a permanently rejected push.
import { createDoc, loadDoc, readStateVector, scriptBody } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import type { DocumentMessage, Message } from "@manent/sync-protocol";
import type { ServerGate } from "../link/gate.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import { SUBSCRIBE_CLIENT_IDS } from "../ports/defaults.ts";
import { ConnectError } from "../ports/ports.ts";
import type {
  SideState,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import type { ViewHandle } from "../view/view.ts";
import { createHandshake } from "./handshake.ts";
import type { Handshake, HandshakeHost } from "./handshake.ts";
import { needsHeal } from "./heal.ts";
import type { Journal } from "./journal.ts";
import type { LocalCopy } from "./local-copy.ts";
import type { Ending } from "./refusals.ts";

/**
 * `side`: what the server's answers set aside from syncing. `connection`
 * counts connections made and lost, so that an answer for an older one is
 * dropped. `readOnly` is set when the server answered 4408.
 */
export interface Subscription extends HandshakeHost {
  readonly handshake: Handshake;
  readonly side: ReadonlySet<SideState>;
  readonly connection: number;
  readonly readOnly: Subscribable<ViewHandle | null>;
  /** The document is loaded: a recovery it resumes is shown, and a parked one stays stopped. */
  ready(): void;
  connected(send: (message: Message) => void, gate: ServerGate): void;
  disconnected(): void;
}

interface SubscriptionOptions {
  docId: string;
  ports: SyncClientPorts;
  journal: Journal;
  copy: LocalCopy;
  /** The last state everything was synced at, as the store gave it; null when there is none. */
  syncedBase: Uint8Array | null;
  /** A reader of the document, for when it may not be edited. */
  view(): ViewHandle;
  /** What the session shows may have changed. */
  changed(): void;
  replaceConnection(reason: string): void;
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

class DocSubscription implements Subscription {
  readonly handshake: Handshake;
  readonly side = new Set<SideState>();
  readonly readOnly = createSubscribable<ViewHandle | null>(null);
  connection = 0;
  private stopped = false;
  private createdAgain = false;
  private headSeq = 0;
  private receipt: { sent: number; setAside: number } | null = null;
  private syncedBase: Uint8Array | null;
  private recovery: Recovery | null = null;
  /** The `clientSeq` of the heal push in flight on this subscription. */
  private healSeq: number | null = null;
  private readonly options: SubscriptionOptions;

  constructor(options: SubscriptionOptions) {
    const { docId, ports } = options;
    this.options = options;
    this.syncedBase = options.syncedBase;
    this.handshake = createHandshake({ docId, clock: ports.clock, host: this });
    const { recovering } = options.journal.meta;
    if (recovering !== null)
      this.recovery = {
        ...recovering,
        code: null,
        clientId: this.freshClientId(),
      };
  }

  ready(): void {
    if (this.recovery !== null) this.side.add("rejected");
    const { parked } = this.options.journal.meta;
    if (parked === null) this.options.changed();
    else this.stop(parked.reason);
  }

  connected(send: (message: Message) => void, gate: ServerGate): void {
    this.connection += 1;
    this.handshake.connect(send, gate);
    if (gate === "ok" && this.side.delete("server_old")) {
      this.stopped = false;
      this.handshake.resume();
    }
    if (this.stopped) return;
    const { create, neverSynced } = this.options.journal.meta;
    if (neverSynced && create !== null) this.createThenSubscribe(create);
    else this.handshake.subscribe();
  }

  disconnected(): void {
    this.connection += 1;
    this.handshake.disconnect();
    this.options.changed();
  }

  /** A recovery subscribes under its new client ID, with an empty state vector, to be sent the whole state. */
  subscription(): ReturnType<HandshakeHost["subscription"]> {
    const { recovery } = this;
    const { meta } = this.options.journal;
    const clientIds =
      recovery === null
        ? meta.clientIds
        : [...meta.clientIds, recovery.clientId];
    const { doc } = this.options.copy;
    return {
      generation: meta.generation,
      clientIds: clientIds.slice(-SUBSCRIBE_CLIENT_IDS),
      lastServerSeq: meta.lastServerSeq,
      vector: (recovery === null ? doc : createDoc()).encodeStateVector(),
    };
  }

  heal(serverVector: Uint8Array): ReturnType<HandshakeHost["heal"]> {
    this.healSeq = null;
    if (this.recovery !== null) return null;
    const { journal, copy } = this.options;
    const { meta } = journal;
    const due = needsHeal({
      headSeq: this.headSeq,
      lastServerSeq: meta.lastServerSeq,
      own: readStateVector(copy.doc.encodeStateVector()),
      server: readStateVector(serverVector),
      ownClientIds: new Set(meta.clientIds),
      ackedClocks: meta.ackedClocks,
    });
    if (!due) return null;
    this.healSeq = journal.healSeq();
    return { clientSeq: this.healSeq, update: copy.doc.diff(serverVector) };
  }

  outbox(afterSeq: number): ReturnType<HandshakeHost["outbox"]> {
    return this.options.journal.outbox(afterSeq);
  }

  subscribed(m: Extract<DocumentMessage, { type: "SUBSCRIBED" }>): void {
    this.headSeq = m.headSeq;
    this.options.journal.patch({ generation: m.generation });
  }

  /** The server's step 2. One that changes nothing is not stored, so it takes no local sequence. */
  stepTwo(update: Uint8Array): void {
    if (this.recovery !== null) this.recover(this.recovery, update);
    else this.merge(update);
    const { journal, ports } = this.options;
    journal.patch({
      lastServerSeq: Math.max(journal.meta.lastServerSeq, this.headSeq),
      ...(this.hasWaiting() ? {} : { lastSyncedAt: ports.clock.now() }),
    });
  }

  update(update: Uint8Array): void {
    this.options.copy.update(update);
  }

  acknowledged(clientSeq: number, serverSeq: number): void {
    const { journal, copy, ports } = this.options;
    journal.acknowledge(clientSeq, serverSeq, ports.clock.now());
    copy.acknowledged(clientSeq);
    this.settled();
  }

  refused(clientSeq: number, message: string): void {
    const entry = this.options.journal.refuse(clientSeq);
    if (entry === null) return;
    this.options.copy.refused(entry, message);
    this.settled();
  }

  ended(ending: Ending): void {
    const { journal, copy } = this.options;
    switch (ending.type) {
      case "stopped":
        if (ending.side === "rejected")
          this.reject(ending.code, ending.clientSeq);
        else if (ending.side === "deleted") this.park("deleted");
        else this.stop(ending.side);
        if (ending.side === "read_only") this.readOnly.set(this.options.view());
        return;
      case "forbidden": {
        const { create, neverSynced } = journal.meta;
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
        journal.patch({
          clientIds: journal.meta.clientIds.filter(
            (id) => id !== copy.doc.clientId,
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
    this.options.copy.awareness(update);
  }

  replaceConnection(reason: string): void {
    this.options.replaceConnection(reason);
  }

  private merge(update: Uint8Array): void {
    const { journal, copy } = this.options;
    const waiting = journal.waiting();
    if (waiting > 0 && !journal.meta.neverSynced)
      copy.recordVersion("device", "before_reconnect");
    if (waiting > 0)
      this.receipt = { sent: waiting, setAside: copy.recovered.length };
    copy.merge(update);
  }

  /**
   * Step 2 of a recovery holds the server's whole state: the document is
   * replaced by it, and what the rejected push held that the server lacks is
   * filed as Recovered text, never written into the new document.
   */
  private recover(recovery: Recovery, update: Uint8Array): void {
    const { journal, copy } = this.options;
    const next = loadDoc(update, { clientId: recovery.clientId });
    const theirs = scriptBody(next).materialize();
    const synced =
      this.syncedBase === null ? createDoc() : loadDoc(this.syncedBase);
    // after a refused heal push the server lost part of what was synced: theirs is the base
    const base = recovery.heal ? theirs : scriptBody(synced).materialize();
    const items = copy.rejected(base, theirs);
    const state = next.encodeState();
    const { meta } = journal;
    journal.reset(
      state,
      {
        ...meta,
        clientIds: [...meta.clientIds, recovery.clientId],
        recovering: null,
      },
      items,
    );
    this.syncedBase = state;
    this.recovery = null;
    this.healSeq = null;
    copy.replace(next, items);
    this.side.delete("rejected");
    copy.showReplaced(items);
    if (recovery.code !== null)
      copy.emit({
        type: "rejected",
        code: recovery.code,
        replayed: 0,
        setAside: items.length,
      });
  }

  /** A permanently rejected push: the document is kept as a version, and subscribed to afresh under a new client ID. */
  private reject(code: number, clientSeq: number | null): void {
    const heal = clientSeq !== null && clientSeq === this.healSeq;
    const versionId = this.options.copy.recordVersion(
      "recovered",
      "rejected",
    ).id;
    this.recovery = { versionId, heal, code, clientId: this.freshClientId() };
    this.side.add("rejected");
    this.options.journal.patch({ recovering: { versionId, heal } });
    this.handshake.resubscribe();
  }

  /** Access removed, or the document deleted, with edits waiting: they are kept and never sent. */
  private park(reason: "access_removed" | "deleted"): void {
    const { journal, ports } = this.options;
    if (this.hasWaiting())
      journal.patch({ parked: { reason, parkedAt: ports.clock.now() } });
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
    this.options.changed();
  }

  /** After an acknowledgement or a refusal: the receipt goes once nothing waits. */
  private settled(): void {
    this.options.changed();
    if (this.receipt === null || this.hasWaiting()) return;
    const { sent, setAside } = this.receipt;
    this.receipt = null;
    this.options.copy.emit({
      type: "receipt",
      sent,
      setAside: this.options.copy.recovered.length - setAside,
    });
  }

  private hasWaiting(): boolean {
    return this.options.journal.waiting() > 0;
  }

  /** A Yjs client ID this device never used for the document. */
  private freshClientId(): number {
    const { journal, ports } = this.options;
    return journal.freshClientId(this.recovery?.clientId ?? null, ports.random);
  }
}

export function createSubscription(options: SubscriptionOptions): Subscription {
  return new DocSubscription(options);
}
