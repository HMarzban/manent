// The client: one link to the server for every open document, driven by the link's state machine.
import {
  ProtocolError,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  docIdV7,
} from "@manent/sync-protocol";
import type {
  FrameDecoder,
  Message,
  PushResult,
  ServerVersions,
  VersionSet,
} from "@manent/sync-protocol";
import { gateServer } from "../link/gate.ts";
import type { ServerGate } from "../link/gate.ts";
import { INITIAL_LINK, linkStep } from "../link/machine.ts";
import type {
  LinkEffect,
  LinkInput,
  LinkIssue,
  LinkModel,
} from "../link/machine.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import {
  HEARTBEAT_MS,
  PONG_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  STABLE_AFTER_MS,
  WELCOME_TIMEOUT_MS,
} from "../ports/defaults.ts";
import { createDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { ConnectError } from "../ports/ports.ts";
import type {
  Connection,
  DeviceVersion,
  DocMeta,
  LinkState,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import { openSession } from "../session/session.ts";
import type {
  DocEvent,
  DocHandle,
  Session,
  UnsavedEdit,
} from "../session/session.ts";
import { readTabMessage, tabMessage } from "../tabs/messages.ts";
import type { TabBody, TabMessage } from "../tabs/messages.ts";
import { createViewer } from "../view/view.ts";
import type { ViewHandle, Viewer } from "../view/view.ts";
import { createFollower, createRelayHandle } from "./follower.ts";
import type { Follower, RelayHandle } from "./follower.ts";

/** `server`: the versions the last WELCOME named, kept while offline; null before any. */
export interface LinkFacts {
  state: LinkState;
  issue: LinkIssue;
  server: ServerVersions | null;
  wentOfflineAt: number | null;
  leader: boolean;
}

/** Without `uploadVersion`, device versions stay on the device. */
export interface SyncClientOptions {
  userId: string;
  deviceId: string;
  build: string;
  versions: VersionSet;
  minServer: VersionSet;
  ports: SyncClientPorts;
  uploadVersion?: (version: DeviceVersion) => Promise<boolean>;
}

export interface SyncClient {
  readonly link: Subscribable<LinkFacts>;
  /** The local copy is loaded before anything is sent. */
  open(docId: string): Promise<DocHandle>;
  /** A new document under a version 7 ID, usable at once with no connection. */
  create(request: { kind: string; home: string }): Promise<DocHandle>;
  /** True at the start. */
  setOnline(wanted: boolean): void;
  /** The app calls it on online, visibility and focus events. */
  retryNow(): void;
  /** SUBSCRIBE with mode `view`: no document, no outbox, nothing stored. */
  view(docId: string): ViewHandle;
  close(): Promise<void>;
}

/**
 * One open document of this tab: the handle the app holds, and what is behind
 * it, a session while this tab leads and a follower while another does.
 * `holders`: the tabs that hold it open, this tab's app under its own tab ID;
 * it is closed once none does. `queue` runs a following tab's requests for it
 * one after the other.
 */
interface Replica {
  create: DocMeta["create"];
  readonly holders: Set<string>;
  relay: RelayHandle | null;
  follower: Follower | null;
  ready: { promise: Promise<RelayHandle>; resolve(relay: RelayHandle): void };
  unwire: () => void;
  queue: Promise<void>;
}

/** What a leader posts for a session's event: a replacement carries the new state, Recovered text its items. */
function eventBody(docId: string, event: DocEvent, h: DocHandle): TabBody {
  if (event.type === "replaced")
    return { t: "replace", docId, state: h.doc().encodeState() };
  if (event.type === "recovered")
    return { t: "recovered", docId, items: event.items };
  return { t: "event", docId, event };
}

/** One connection attempt; `connection` is null until it opens. */
interface Attempt {
  connection: Connection | null;
  decoder: FrameDecoder;
}

type Timer = "retry" | "welcome" | "stable" | "heartbeat" | "pong";

class Client implements SyncClient {
  readonly link = createSubscribable<LinkFacts>({
    state: "offline",
    issue: "none",
    server: null,
    wentOfflineAt: null,
    leader: false,
  });
  private model: LinkModel = INITIAL_LINK;
  private gate: ServerGate = "ok";
  private current: Attempt | null = null;
  // message IDs need only be unique per connection; one allocator for every connection gives that
  private readonly encoder = createFrameEncoder({ ids: createMessageIds() });
  private readonly sessions = new Map<string, Session>();
  private readonly replicas = new Map<string, Replica>();
  private readonly viewers = new Map<string, Viewer>();
  private leading = false;
  private leaderKnown = false;
  /** Per following tab and document, the highest `n` of an edit stored; dropped when that tab closes the document. */
  private readonly storedEdits = new Map<string, number>();
  /**
   * Per document, the last `n` this tab gave an edit. `n` is unique per tab and
   * document for the client's whole life, so a document opened again, or
   * followed again after a change of leader, never repeats one.
   */
  private readonly lastEdit = new Map<string, number>();
  private resign: () => void;
  private readonly unlisten: () => void;
  private readonly opening = new Map<string, Promise<Session>>();
  private readonly timers = new Map<Timer, () => void>();
  private server: ServerVersions | null = null;
  private wentOfflineAt: number | null = null;
  private pongDueAt = 0;
  private nonce = 0;
  private readonly options: SyncClientOptions;

  constructor(options: SyncClientOptions) {
    this.options = options;
    const { leader } = options.ports;
    this.resign = this.campaign();
    this.unlisten = leader.listen((value) => this.heard(value));
  }

  open(docId: string): Promise<DocHandle> {
    return this.hold(docId, null);
  }

  create(request: { kind: string; home: string }): Promise<DocHandle> {
    const { clock, random } = this.options.ports;
    const docId = docIdV7(clock.now(), random.bytes(10));
    return this.hold(docId, request);
  }

  /** A tab that does not lead only remembers what is wanted, for when it leads. */
  setOnline(wanted: boolean): void {
    if (this.leading) this.input({ type: "want", online: wanted });
    else this.model = { ...this.model, wanted };
  }

  retryNow(): void {
    if (this.leading)
      this.input({
        type: "retry_now",
        random: this.options.ports.random.next(),
      });
  }

  view(docId: string): ViewHandle {
    const known = this.viewers.get(docId);
    if (known !== undefined) return known.handle;
    const viewer = createViewer({
      docId,
      clock: this.options.ports.clock,
      closed: () => this.viewers.delete(docId),
    });
    this.viewers.set(docId, viewer);
    viewer.link(this.model.state);
    if (this.model.state === "online") viewer.connected((m) => this.send(m));
    return viewer.handle;
  }

  async close(): Promise<void> {
    const replicas = [...this.replicas.values()];
    for (const replica of replicas) replica.holders.clear();
    await Promise.all(replicas.map((replica) => replica.relay?.close()));
    for (const viewer of this.viewers.values()) viewer.handle.close();
    this.resign();
    this.unlisten();
    this.input({ type: "want", online: false });
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }

  private campaign(): () => void {
    return this.options.ports.leader.campaign({
      onElected: () => this.elected(),
      onDeposed: () => this.deposed(),
    });
  }

  /** The documents this tab followed are opened from the store, and the link connects once they are loaded. */
  private elected(): void {
    this.leading = true;
    this.post({ t: "leader" });
    for (const [docId, replica] of this.replicas) {
      const follower = replica.follower;
      if (follower === null) continue;
      replica.follower = null;
      const { doc, unsaved } = follower.detach();
      this.lead(docId, replica, doc, unsaved);
    }
    if (this.model.wanted) this.input({ type: "want", online: true });
    this.publish();
  }

  /** A store write was refused because another tab leads: this one gives the lead up as if deposed. */
  private stepDown(): void {
    if (!this.leading) return;
    this.resign();
    this.deposed();
  }

  /** The lead was taken: the connection closes, the store is left, and each document this tab's app holds is followed. */
  private deposed(): void {
    this.leading = false;
    this.leaderKnown = false;
    this.current?.connection?.close(1000, "deposed");
    this.disarm("retry");
    this.model = { ...this.model, state: "offline", attempt: 0 };
    this.dropped(this.options.ports.clock.now());
    const { tabId } = this.options.ports.leader;
    for (const [docId, replica] of this.replicas) {
      const session = this.sessions.get(docId);
      if (session === undefined) continue;
      replica.unwire();
      this.sessions.delete(docId);
      const { doc, unsaved } = session.detach();
      // the other tabs open what they hold again with the next leader
      const held = replica.holders.has(tabId);
      replica.holders.clear();
      if (!held) {
        this.forget(docId);
        continue;
      }
      replica.holders.add(tabId);
      this.follow(docId, replica, doc, unsaved);
    }
    this.resign = this.campaign();
    this.publish();
  }

  /** This tab's app holds the document: its handle, linked again when the app had closed it. */
  private hold(docId: string, create: DocMeta["create"]): Promise<DocHandle> {
    const replica = this.replica(docId, create);
    const { tabId } = this.options.ports.leader;
    if (!replica.holders.has(tabId)) {
      replica.holders.add(tabId);
      const backend = this.backend(docId, replica);
      if (backend !== null) replica.relay?.attach(backend);
    }
    return replica.ready.promise;
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
      relay: null,
      follower: null,
      ready: Promise.withResolvers<RelayHandle>(),
      unwire: () => {},
      queue: Promise.resolve(),
    };
    this.replicas.set(docId, replica);
    const { random } = this.options.ports;
    if (this.leading) this.lead(docId, replica, null, []);
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
      writeSchema: this.writeSchema(),
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
    const opening = openSession({
      docId,
      ports: this.options.ports,
      create: replica.create,
      doc,
      unsaved,
      stored: (update) => this.post({ t: "remote", docId, update }),
      view: () => this.view(docId),
      lostLead: () => this.stepDown(),
      link: this.sessionLink(),
      writeSchema: this.writeSchema(),
      uploadVersion: this.options.uploadVersion ?? null,
      replaceConnection: (reason) => this.replace(reason),
      closed: () => this.forget(docId),
    }).then((session) => {
      this.opening.delete(docId);
      this.sessions.set(docId, session);
      replica.unwire = this.wire(docId, session.handle);
      this.show(docId, replica, session.handle);
      session.link(this.sessionLink());
      if (this.model.state === "online")
        session.connected((m) => this.send(m), this.gate);
      return session;
    });
    this.opening.set(docId, opening);
    void opening.catch(() => this.opening.delete(docId));
  }

  private wire(docId: string, h: DocHandle): () => void {
    const offs = [
      h.status.subscribe((status) => this.post({ t: "status", docId, status })),
      h.on((event) => this.post(eventBody(docId, event, h))),
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

  private heard(value: unknown): void {
    const m = readTabMessage(value);
    const { tabId } = this.options.ports.leader;
    if (m === null || m.from === tabId) return;
    if (m.t === "who") {
      if (this.leading) this.post({ t: "leader" });
    } else if (m.t === "leader") {
      if (this.leading) return;
      this.leaderKnown = true;
      for (const replica of this.replicas.values())
        replica.follower?.announce();
    } else if (this.leading) this.host(m);
    else if ("docId" in m && (!("to" in m) || m.to === tabId))
      this.replicas.get(m.docId)?.follower?.receive(m);
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
    if (m.t !== "open" && m.t !== "edit") return;
    const replica = this.replica(m.docId, m.t === "open" ? m.create : null);
    if (m.t === "open") replica.holders.add(m.from);
    replica.queue = replica.queue.then(async () => {
      await replica.ready.promise;
      const session =
        this.sessions.get(m.docId) ?? (await this.opening.get(m.docId));
      if (session === undefined) return;
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
      void session.edit(m).then(saved);
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
    replica.queue = replica.queue.then(async () => {
      await replica.ready.promise;
      this.storedEdits.delete(`${tabId}:${docId}`);
      await this.release(docId, replica);
    });
  }

  private input(input: LinkInput): void {
    const { model, effects } = linkStep(this.model, input);
    this.model = model;
    for (const effect of effects) this.perform(effect);
    this.publish();
  }

  private perform(effect: LinkEffect): void {
    const { clock, random } = this.options.ports;
    switch (effect.type) {
      case "connect":
        this.connect();
        return;
      case "hello":
        this.send({
          type: "HELLO",
          versions: this.options.versions,
          build: this.options.build,
          deviceId: this.options.deviceId,
        });
        this.arm("welcome", WELCOME_TIMEOUT_MS, () =>
          this.input({ type: "welcome_timeout", random: random.next() }),
        );
        return;
      case "close":
        this.current?.connection?.close(effect.code, effect.reason);
        this.current = null;
        return;
      case "retry_in":
        this.arm("retry", effect.delayMs, () => this.input({ type: "timer" }));
        return;
      case "cancel_retry":
        this.disarm("retry");
        return;
      case "online":
        this.online();
        return;
      case "dropped":
        this.dropped(clock.now());
        return;
      case "probe":
        this.ping(PROBE_TIMEOUT_MS);
        return;
      default:
        effect satisfies never;
    }
  }

  /** Waits for the documents being opened, so that each is loaded before the socket opens. */
  private connect(): void {
    const attempt: Attempt = {
      connection: null,
      decoder: createFrameDecoder({ from: "server" }),
    };
    this.current = attempt;
    const go = (): void => {
      if (this.current !== attempt) return;
      this.options.ports.transport
        .connect({
          onFrame: (frame) => {
            if (this.current === attempt) this.frame(attempt, frame);
          },
          onClose: (code) => {
            if (this.current === attempt) this.closed(code);
          },
        })
        .then(
          (connection) => this.opened(attempt, connection),
          (error: unknown) => this.failed(attempt, error),
        );
    };
    if (this.opening.size === 0) go();
    else void Promise.allSettled(this.opening.values()).then(go);
  }

  private opened(attempt: Attempt, connection: Connection): void {
    if (this.current !== attempt) {
      connection.close(1000, "replaced");
      return;
    }
    attempt.connection = connection;
    this.input({ type: "opened" });
  }

  private failed(attempt: Attempt, error: unknown): void {
    if (this.current !== attempt) return;
    this.current = null;
    const code = error instanceof ConnectError ? error.code : "unreachable";
    this.input({
      type: "connect_failed",
      code,
      random: this.options.ports.random.next(),
    });
    // a transport that fails in any other way is unreachable all the same, and its error is not hidden
    if (!(error instanceof ConnectError)) throw error;
  }

  private closed(code: number): void {
    this.current = null;
    this.input({
      type: "closed",
      code,
      random: this.options.ports.random.next(),
    });
  }

  /** Closes the connection because it stopped answering; the link reconnects with backoff. */
  private replace(reason: string): void {
    const connection = this.current?.connection;
    if (connection === null || connection === undefined) return;
    connection.close(1000, reason);
    this.closed(1000);
  }

  private online(): void {
    this.arm("stable", STABLE_AFTER_MS, () => this.input({ type: "stable" }));
    this.beat();
    for (const session of this.sessions.values())
      session.connected((m) => this.send(m), this.gate);
    for (const viewer of this.viewers.values())
      viewer.connected((m) => this.send(m));
  }

  private dropped(at: number): void {
    for (const timer of ["welcome", "stable", "heartbeat", "pong"] as const)
      this.disarm(timer);
    this.current = null;
    this.wentOfflineAt ??= at;
    for (const session of this.sessions.values()) session.disconnected();
    for (const viewer of this.viewers.values()) viewer.disconnected();
  }

  private beat(): void {
    this.arm("heartbeat", HEARTBEAT_MS, () => {
      this.ping(PONG_TIMEOUT_MS);
      this.beat();
    });
  }

  /** A pong due earlier is not put off by a later ping. */
  private ping(timeoutMs: number): void {
    const dueAt = this.options.ports.clock.now() + timeoutMs;
    this.nonce += 1;
    this.send({ type: "PING", nonce: this.nonce });
    if (this.timers.has("pong") && this.pongDueAt <= dueAt) return;
    this.pongDueAt = dueAt;
    this.arm("pong", timeoutMs, () => this.replace("pong_timeout"));
  }

  private send(message: Message): void {
    const connection = this.current?.connection;
    if (connection === null || connection === undefined) return;
    for (const frame of this.encoder.encode(message)) connection.send(frame);
  }

  private frame(attempt: Attempt, bytes: Uint8Array): void {
    let result: PushResult;
    try {
      result = attempt.decoder.push(bytes);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      this.replace("bad_frame");
      return;
    }
    if (result.kind === "message") this.route(result.message);
    else if (result.kind === "skipped" && result.doc !== null)
      this.sessions.get(result.doc.docId)?.skipped();
  }

  private route(message: Message): void {
    if ("docId" in message) {
      const viewer = this.viewers.get(message.docId);
      if (viewer === undefined)
        this.sessions.get(message.docId)?.receive(message);
      else viewer.receive(message);
      return;
    }
    switch (message.type) {
      case "WELCOME":
        this.disarm("welcome");
        this.gate = gateServer(
          this.options.versions,
          this.options.minServer,
          message.server,
        );
        this.server = message.server;
        for (const session of this.sessions.values())
          session.writeSchema(this.writeSchema());
        this.input({ type: "welcome", gate: this.gate });
        return;
      case "PONG":
        this.disarm("pong");
        return;
      case "ERROR": {
        if (message.doc === null) return;
        const { docId } = message.doc;
        (this.viewers.get(docId) ?? this.sessions.get(docId))?.error(message);
        return;
      }
      case "HELLO":
      case "AUTH_EXPIRING":
      case "AUTH_REFRESH":
      case "PING":
        return;
      default:
        message satisfies never;
    }
  }

  private writeSchema(): number {
    const { schema } = this.options.versions;
    return this.server === null
      ? schema
      : Math.min(schema, this.server.current.schema);
  }

  private sessionLink(): {
    state: LinkState;
    issue: LinkIssue;
    wentOfflineAt: number | null;
  } {
    const { state, issue } = this.model;
    return {
      state,
      issue,
      wentOfflineAt: state === "online" ? null : this.wentOfflineAt,
    };
  }

  private publish(): void {
    const facts = this.sessionLink();
    if (facts.state === "online") this.wentOfflineAt = null;
    this.link.set({ ...facts, server: this.server, leader: this.leading });
    for (const session of this.sessions.values()) session.link(facts);
    for (const viewer of this.viewers.values()) viewer.link(facts.state);
  }

  private arm(timer: Timer, delayMs: number, fn: () => void): void {
    this.disarm(timer);
    this.timers.set(
      timer,
      this.options.ports.clock.schedule(() => {
        this.timers.delete(timer);
        fn();
      }, delayMs),
    );
  }

  private disarm(timer: Timer): void {
    this.timers.get(timer)?.();
    this.timers.delete(timer);
  }
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  return new Client(options);
}
