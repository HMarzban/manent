// One document's subscription as its session drives it: what SUBSCRIBE and the heal push carry,
// the server's step 2, acknowledgements and refusals, what each ending stops or parks, and the
// recovery from a permanently rejected push or a move to a new generation it hands over to.
import { createDoc, readStateVector } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import type { DocumentMessage, Message } from "@manent/sync-protocol";
import type { ServerGate } from "../link/gate.ts";
import { Move } from "../move/move.ts";
import type { LeftDoc, MoveHost } from "../move/move.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import { SUBSCRIBE_CLIENT_IDS } from "../ports/defaults.ts";
import { ConnectError } from "../ports/ports.ts";
import { PushRecovery } from "../recovery/recover.ts";
import { SyncedBase } from "../recovery/synced-base.ts";
import type {
  DocMeta,
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
 * dropped. `readOnly` is set when the server answered 4408 or 4403
 * `read_only_role`. `moving`: a move to a new generation is under way;
 * `left`: the document a move left, while something may still write to it.
 */
export interface Subscription extends HandshakeHost {
  readonly handshake: Handshake;
  readonly side: ReadonlySet<SideState>;
  readonly connection: number;
  readonly readOnly: Subscribable<ViewHandle | null>;
  readonly moving: boolean;
  readonly left: LeftDoc | null;
  /** The document is loaded: a recovery it resumes is shown, and a parked one stays stopped. */
  ready(): void;
  connected(send: (message: Message) => void, gate: ServerGate): void;
  disconnected(): void;
  /** The session ends: a move sends nothing more. */
  close(): void;
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
  /** The tabs following this document. */
  followers(): string[];
  /** When a sync is recorded as made now; null: the last sync is not this subscription's to record. */
  syncedAt(): number | null;
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
  private readonly base: SyncedBase;
  private readonly recovery: PushRecovery;
  private move: Move | null = null;
  left: LeftDoc | null = null;
  private online = false;
  private readonly options: SubscriptionOptions;

  constructor(options: SubscriptionOptions) {
    const { docId, ports } = options;
    this.options = options;
    this.base = new SyncedBase(options.syncedBase);
    this.handshake = createHandshake({ docId, clock: ports.clock, host: this });
    const { journal, copy } = options;
    this.recovery = new PushRecovery({
      journal,
      copy,
      freshClientId: (taken) => journal.freshClientId(taken, ports.random),
      resubscribe: () => this.handshake.subscribeAfresh(),
      show: (recovering) => {
        if (recovering) this.side.add("rejected");
        else this.side.delete("rejected");
        this.options.changed();
      },
    });
    const { moving } = journal.meta;
    if (moving !== null) this.move = new Move(this.moveHost(), moving);
  }

  get moving(): boolean {
    return this.move?.active === true;
  }

  /** A move the stored meta names is taken up here. */
  ready(): void {
    this.move?.resume();
    if (this.recovery.active) this.side.add("rejected");
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
    this.online = true;
    if (this.stopped) return;
    const { create, neverSynced } = this.options.journal.meta;
    if (this.move !== null) this.move.connected();
    else if (neverSynced && create !== null) this.createThenSubscribe(create);
    else this.handshake.subscribe();
  }

  disconnected(): void {
    this.connection += 1;
    this.online = false;
    this.handshake.disconnect();
    this.options.changed();
  }

  close(): void {
    this.move?.stop();
  }

  /** A recovery subscribes under its new client ID, and a move under the new generation's, with an empty state vector, to be sent the whole state. With own entries waiting, step 1 carries the synced base's vector, so that step 2 is everything the server holds beyond it. */
  subscription(): ReturnType<HandshakeHost["subscription"]> {
    const loading = this.move?.subscription() ?? null;
    if (loading !== null) return loading;
    const { fresh } = this.recovery;
    const { meta } = this.options.journal;
    const clientIds =
      fresh === null ? meta.clientIds : [...meta.clientIds, fresh.clientId];
    const synced =
      fresh === null && this.hasWaiting() ? this.base.vector() : null;
    const from = fresh === null ? this.options.copy.doc : createDoc();
    return {
      generation: fresh?.generation ?? meta.generation,
      clientIds: clientIds.slice(-SUBSCRIBE_CLIENT_IDS),
      lastServerSeq: this.recovery.redirected ? 0 : meta.lastServerSeq,
      vector: synced ?? from.encodeStateVector(),
    };
  }

  heal(serverVector: Uint8Array): ReturnType<HandshakeHost["heal"]> {
    this.base.heal = null;
    if (this.recovery.fresh !== null || this.move !== null) return null;
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
    const heal = {
      clientSeq: journal.healSeq(),
      update: copy.doc.diff(serverVector),
    };
    this.base.heal = heal;
    return heal;
  }

  outbox(afterSeq: number): ReturnType<HandshakeHost["outbox"]> {
    return this.options.journal.outbox(afterSeq);
  }

  /**
   * During a move, or a recovery a move redirected, the generation changes
   * with the new document only.
   */
  subscribed(m: Extract<DocumentMessage, { type: "SUBSCRIBED" }>): void {
    this.headSeq = m.headSeq;
    if (this.move === null && !this.recovery.redirected)
      this.options.journal.patch({ generation: m.generation });
  }

  /**
   * The server's step 2, which also says the document exists there. One that
   * changes nothing is not stored, so it takes no local sequence.
   */
  stepTwo(update: Uint8Array): void {
    const { fresh } = this.recovery;
    if (this.move !== null) {
      this.move.loaded(update, this.headSeq);
      this.move = null;
      this.base.reset(update);
    } else if (fresh !== null) {
      const { base, headSeq } = this;
      base.reset(this.recovery.loaded(fresh, update, base, headSeq));
    } else this.merge(update);
    const { journal } = this.options;
    const syncedAt = this.hasWaiting() ? null : this.options.syncedAt();
    journal.patch({
      neverSynced: false,
      lastServerSeq: Math.max(journal.meta.lastServerSeq, this.headSeq),
      ...(syncedAt === null ? {} : { lastSyncedAt: syncedAt }),
    });
  }

  update(update: Uint8Array): void {
    this.options.copy.update(update);
    this.base.take(update);
  }

  acknowledged(clientSeq: number, serverSeq: number): void {
    const { journal, copy } = this.options;
    // one that comes while a recovery waits may cover the refused push: the fresh state is the base
    if (this.recovery.fresh === null)
      this.base.acknowledged(clientSeq, journal.waitingUpdates());
    journal.acknowledge(clientSeq, serverSeq, this.options.syncedAt());
    copy.acknowledged(clientSeq);
    this.recovery.acknowledged(clientSeq);
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
        if (ending.side === "read_only" || ending.side === "view_only")
          this.readOnly.set(this.options.view());
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
        if (this.recovery.moved(ending.newGeneration))
          this.handshake.subscribe();
        else if (this.move !== null) this.move.raise(ending.newGeneration);
        else this.beginMove(ending.newGeneration);
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
    const mine =
      waiting > 0 && !journal.meta.neverSynced
        ? copy.recordVersion("device", "before_reconnect").content
        : null;
    if (waiting > 0)
      this.receipt = { sent: waiting, setAside: copy.recovered.length };
    const { clientIds } = journal.meta;
    copy.merge(update, this.base.stepTwo(update, mine, clientIds));
  }

  /** A permanently rejected push; the heal push when its `clientSeq` is the heal push's. */
  private reject(code: number, clientSeq: number | null): void {
    this.recovery.reject(
      code,
      clientSeq !== null && clientSeq === this.base.heal?.clientSeq,
    );
  }

  /** GENERATION_MOVED for the edit subscription: no receipt is shown for the reconnect it ended. */
  private beginMove(to: number): void {
    this.receipt = null;
    const from = this.options.journal.meta.generation;
    const moving = { from, to, key: null, throughLocalSeq: 0 };
    this.move = new Move(this.moveHost(), moving);
    void this.move.begin();
  }

  private moveHost(): MoveHost {
    const { docId, ports, journal, copy } = this.options;
    return {
      docId,
      ports,
      journal,
      copy,
      connected: () => this.online,
      changed: () => this.options.changed(),
      subscribe: () => this.handshake.subscribe(),
      park: (reason) => this.park(reason),
      ended: () => {
        this.move = null;
        this.handshake.subscribe();
      },
      followers: () => this.options.followers(),
      syncedAt: () => this.options.syncedAt(),
      leave: (left) => {
        this.left = left;
      },
    };
  }

  /** Access removed, or the document deleted, with edits waiting: they are kept and never sent. */
  private park(reason: "access_removed" | "deleted"): void {
    const { journal, ports } = this.options;
    if (this.hasWaiting())
      journal.patch({ parked: { reason, parkedAt: ports.clock.now() } });
    this.stop(reason);
  }

  private createThenSubscribe(create: NonNullable<DocMeta["create"]>): void {
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

  private stop(why: SideState): void {
    this.stopped = true;
    this.handshake.stop();
    this.side.add(why);
    this.options.changed();
  }

  /** After an acknowledgement or a refusal: the receipt goes once nothing waits, counting the items filed since the reconnect by cause. */
  private settled(): void {
    this.options.changed();
    if (this.receipt === null || this.hasWaiting()) return;
    const { sent, setAside } = this.receipt;
    this.receipt = null;
    const { copy } = this.options;
    const filed = copy.recovered.slice(setAside);
    const overlaps = filed.filter((item) => item.cause === "overlap").length;
    const unplaced = filed.length - overlaps;
    copy.emit({ type: "receipt", sent, setAside: unplaced, overlaps });
  }

  private hasWaiting(): boolean {
    return this.options.journal.waiting() > 0;
  }
}

export function createSubscription(options: SubscriptionOptions): Subscription {
  return new DocSubscription(options);
}
