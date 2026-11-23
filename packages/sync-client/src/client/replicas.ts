// The documents a tab holds open: each led by a session while the tab leads, or followed from
// the tab that does, behind the one handle its app holds; and what the tabs tell each other
// about them.
import { createDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocMeta } from "../ports/ports.ts";
import type { DocHandle } from "../session/doc-handle.ts";
import type { UnsavedEdit } from "../session/edits.ts";
import { openSession } from "../session/session.ts";
import type { Session } from "../session/session.ts";
import { readTabMessage, tabMessage } from "../tabs/messages.ts";
import type { TabBody, TabMessage } from "../tabs/messages.ts";
import { createFollower } from "./follower.ts";
import { createRelayHandle } from "./relay.ts";
import type { RelayHandle } from "./relay.ts";
import { eventBody } from "./replica.ts";
import type { Replica, ReplicasOptions } from "./replica.ts";

/** `sessions` holds a session per document this tab leads; `opening`, those being opened, which a connect waits for. */
export interface Replicas {
  readonly sessions: ReadonlyMap<string, Session>;
  readonly opening: ReadonlyMap<string, Promise<Session>>;
  /** This tab's app holds the document: its handle, linked again when the app had closed it. */
  hold(docId: string, create: DocMeta["create"]): Promise<DocHandle>;
  /** This tab now leads: the other tabs are told, and the documents it followed are opened from the store. */
  elected(): void;
  /** The lead was taken: the store is left, and each document this tab's app holds is followed. */
  deposed(): void;
  /** A message another tab posted. */
  heard(value: unknown): void;
  /** No tab of this client holds any document any more; settles once each is closed. */
  close(): Promise<unknown>;
}

class TabReplicas implements Replicas {
  readonly sessions = new Map<string, Session>();
  readonly opening = new Map<string, Promise<Session>>();
  private readonly replicas = new Map<string, Replica>();
  private leaderKnown = false;
  /** Per following tab and document, the highest `n` of an edit stored; dropped when that tab closes the document. */
  private readonly storedEdits = new Map<string, number>();
  /**
   * Per document, the last `n` this tab gave an edit. `n` is unique per tab and
   * document for the client's whole life, so a document opened again, or
   * followed again after a change of leader, never repeats one.
   */
  private readonly lastEdit = new Map<string, number>();
  private readonly options: ReplicasOptions;

  constructor(options: ReplicasOptions) {
    this.options = options;
  }

  hold(docId: string, create: DocMeta["create"]): Promise<DocHandle> {
    const replica = this.replica(docId, create);
    const { tabId } = this.options.ports.leader;
    if (!replica.holders.has(tabId)) {
      replica.holders.add(tabId);
      const backend = this.backend(docId, replica);
      if (backend !== null) replica.relay?.attach(backend);
    }
    return replica.ready.promise;
  }

  elected(): void {
    this.post({ t: "leader" });
    for (const [docId, replica] of this.replicas) {
      const follower = replica.follower;
      if (follower === null) continue;
      replica.follower = null;
      const { doc, unsaved } = follower.detach();
      this.lead(docId, replica, doc, unsaved);
    }
  }

  deposed(): void {
    this.leaderKnown = false;
    for (const [docId, replica] of this.replicas) {
      const session = this.sessions.get(docId);
      if (session === undefined) continue;
      replica.unwire();
      this.sessions.delete(docId);
      this.leave(docId, replica, session);
    }
  }

  heard(value: unknown): void {
    const m = readTabMessage(value);
    const { tabId } = this.options.ports.leader;
    if (m === null || m.from === tabId) return;
    const leading = this.options.leading();
    if (m.t === "who") {
      if (leading) this.post({ t: "leader" });
    } else if (m.t === "leader") {
      if (leading) return;
      this.leaderKnown = true;
      for (const replica of this.replicas.values())
        replica.follower?.announce();
    } else if (leading) this.host(m);
    else if ("docId" in m && (!("to" in m) || m.to === tabId))
      this.replicas.get(m.docId)?.follower?.receive(m);
  }

  close(): Promise<unknown> {
    const replicas = [...this.replicas.values()];
    for (const replica of replicas) replica.holders.clear();
    return Promise.all(replicas.map((replica) => replica.relay?.close()));
  }

  /** What is behind the replica's handle; null while its session is being opened. */
  private backend(docId: string, replica: Replica): DocHandle | null {
    return this.sessions.get(docId)?.handle ?? replica.follower?.handle ?? null;
  }

  /** Closes the document once no tab holds it. */
  private release(docId: string, replica: Replica): Promise<void> {
    if (replica.holders.size > 0) return Promise.resolve();
    return this.backend(docId, replica)?.close() ?? Promise.resolve();
  }

  /** The replica of a document, made at once, so that a connect waits for it to load. */
  private replica(docId: string, create: DocMeta["create"]): Replica {
    const known = this.replicas.get(docId);
    if (known !== undefined) return known;
    const replica: Replica = {
      create,
      holders: new Set(),
      clients: new Map(),
      replaced: new Map(),
      relay: null,
      follower: null,
      ready: Promise.withResolvers<RelayHandle>(),
      unwire: () => {},
      queue: Promise.resolve(),
    };
    this.replicas.set(docId, replica);
    const { random } = this.options.ports;
    if (this.options.leading()) this.lead(docId, replica, null, []);
    else
      this.follow(
        docId,
        replica,
        createDoc({ clientId: random.clientId() }),
        [],
      );
    return replica;
  }

  private show(docId: string, replica: Replica, backend: DocHandle): void {
    const { tabId } = this.options.ports.leader;
    if (replica.relay === null)
      replica.relay = createRelayHandle({
        backend,
        release: () => {
          replica.holders.delete(tabId);
          return this.release(docId, replica);
        },
      });
    else replica.relay.attach(backend);
    replica.ready.resolve(replica.relay);
  }

  /** The tab no longer leads: the session is left, and the document is followed with what it held when this tab's app holds it. */
  private leave(docId: string, replica: Replica, session: Session): void {
    const { tabId } = this.options.ports.leader;
    const { doc, unsaved } = session.detach();
    // the other tabs open what they hold again with the next leader
    const held = replica.holders.has(tabId);
    replica.holders.clear();
    if (!held) {
      this.forget(docId);
      return;
    }
    replica.holders.add(tabId);
    this.follow(docId, replica, doc, unsaved);
  }

  private forget(docId: string): void {
    this.replicas.delete(docId);
    this.sessions.delete(docId);
  }

  private follow(
    docId: string,
    replica: Replica,
    doc: CrdtDoc,
    unsaved: UnsavedEdit[],
  ): void {
    const follower = createFollower({
      docId,
      doc,
      create: replica.create,
      unsaved,
      ports: this.options.ports,
      writeSchema: this.options.link.writeSchema(),
      nextEdit: () => {
        const n = (this.lastEdit.get(docId) ?? 0) + 1;
        this.lastEdit.set(docId, n);
        return n;
      },
      post: (body) => this.post(body),
      closed: () => this.forget(docId),
    });
    replica.follower = follower;
    if (replica.relay !== null) replica.relay.attach(follower.handle);
    else
      void follower.loaded.then(() =>
        this.show(docId, replica, follower.handle),
      );
    if (!this.leaderKnown) this.post({ t: "who" });
    follower.announce();
  }

  /** A session over `doc`, the document a following tab had, or a new one; what it leads is posted to the other tabs. */
  private lead(
    docId: string,
    replica: Replica,
    doc: CrdtDoc | null,
    unsaved: UnsavedEdit[],
  ): void {
    const { link } = this.options;
    const { tabId } = this.options.ports.leader;
    const opening = openSession({
      docId,
      ports: this.options.ports,
      via: this.options.via,
      create: replica.create,
      doc,
      unsaved,
      stored: (update) => this.post({ t: "remote", docId, update }),
      view: () => this.options.view(docId),
      lostLead: () => this.options.lostLead(),
      followers: () => [...replica.holders].filter((id) => id !== tabId),
      link: link.sessionLink(),
      writeSchema: link.writeSchema(),
      uploadVersion: this.options.uploadVersion,
      replaceConnection: (reason) => link.replace(reason),
      metaChanged: () => {
        for (const [id, other] of this.sessions)
          if (id !== docId) other.metaChanged(docId);
      },
      closed: () => this.forget(docId),
    }).then((session) => {
      this.opening.delete(docId);
      // the lead went while the document was opening: the store refuses this tab's writes
      if (!this.options.leading()) {
        this.leave(docId, replica, session);
        return session;
      }
      this.sessions.set(docId, session);
      replica.unwire = this.wire(docId, replica, session);
      this.show(docId, replica, session.handle);
      session.link(link.sessionLink());
      if (link.sessionLink().state === "online")
        session.connected((m) => link.send(m), link.gate);
      return session;
    });
    this.opening.set(docId, opening);
    void opening.catch(() => this.opening.delete(docId));
  }

  private wire(docId: string, replica: Replica, session: Session): () => void {
    const h = session.handle;
    const offs = [
      h.status.subscribe((status) => this.post({ t: "status", docId, status })),
      h.on((event) => {
        const body = eventBody(docId, event, session);
        const recovery =
          event.type === "replaced" && event.reason === "rejected";
        if (recovery && body.t === "replace")
          for (const clientId of replica.clients.values())
            replica.replaced.set(clientId, body.generation);
        this.post(body);
      }),
      h.onAwareness((update) => this.post({ t: "aw", docId, update })),
    ];
    this.post({ t: "status", docId, status: h.status.get() });
    return () => {
      for (const off of offs) off();
    };
  }

  private post(body: TabBody): void {
    const { leader } = this.options.ports;
    leader.post(tabMessage(leader.tabId, body));
  }

  /** What a following tab asks of the leader, for one document at a time, in the order asked. */
  private host(m: TabMessage): void {
    if (m.t === "aw") {
      this.sessions.get(m.docId)?.handle.sendAwareness(m.update);
      return;
    }
    if (m.t === "close") {
      this.letGo(m.docId, m.from);
      return;
    }
    if (
      m.t !== "open" &&
      m.t !== "edit" &&
      m.t !== "opened" &&
      m.t !== "reserve"
    )
      return;
    const replica = this.replica(m.docId, m.t === "open" ? m.create : null);
    if (m.t === "open") replica.holders.add(m.from);
    if (m.t === "open" || m.t === "opened")
      replica.clients.set(m.from, m.clientId);
    replica.queue = replica.queue.then(async () => {
      await replica.ready.promise;
      // a session left because the lead went while it was opening is not in `sessions`
      await this.opening.get(m.docId);
      const session = this.sessions.get(m.docId);
      if (session === undefined) return;
      if (m.t === "reserve") {
        void session.addReservedClient(m.clientId);
        return;
      }
      if (m.t === "opened") {
        session.addClient(m.clientId);
        session.released(m.from);
        return;
      }
      if (m.t === "open") {
        session.addClient(m.clientId);
        this.post({
          t: "state",
          to: m.from,
          docId: m.docId,
          ...session.state(),
        });
        return;
      }
      // made in a document a recovery replaced, in the generation it kept: the tab filed it as Recovered text on loading the replacement
      if (replica.replaced.get(m.clientId) === m.generation) return;
      const saved = (refused: boolean): void =>
        this.post({ t: "saved", to: m.from, docId: m.docId, n: m.n, refused });
      const key = `${m.from}:${m.docId}`;
      // an edit sent again after a change of leader, already stored: it is saved
      if (m.n <= (this.storedEdits.get(key) ?? 0)) {
        saved(false);
        return;
      }
      this.storedEdits.set(key, m.n);
      // stored now, answered once the write settles, so that a slow write holds up no other request
      void session.edit(m, m.generation).then(saved);
    });
  }

  /**
   * A following tab closed the document. It stops holding it at once, so that
   * an `open` it posts next keeps the document open; the rest waits for the
   * requests before it.
   */
  private letGo(docId: string, tabId: string): void {
    const replica = this.replicas.get(docId);
    if (replica === undefined) return;
    replica.holders.delete(tabId);
    replica.clients.delete(tabId);
    replica.queue = replica.queue.then(async () => {
      await replica.ready.promise;
      this.sessions.get(docId)?.released(tabId);
      this.storedEdits.delete(`${tabId}:${docId}`);
      await this.release(docId, replica);
    });
  }
}

export function createReplicas(options: ReplicasOptions): Replicas {
  return new TabReplicas(options);
}
