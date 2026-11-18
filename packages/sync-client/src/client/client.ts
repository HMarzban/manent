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
import { ConnectError } from "../ports/ports.ts";
import type {
  Connection,
  DeviceVersion,
  LinkState,
  Subscribable,
  SyncClientPorts,
} from "../ports/ports.ts";
import { openSession } from "../session/session.ts";
import type { DocHandle, Session } from "../session/session.ts";

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
  close(): Promise<void>;
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
    leader: true,
  });
  private model: LinkModel = INITIAL_LINK;
  private gate: ServerGate = "ok";
  private current: Attempt | null = null;
  // message IDs need only be unique per connection; one allocator for every connection gives that
  private readonly encoder = createFrameEncoder({ ids: createMessageIds() });
  private readonly sessions = new Map<string, Session>();
  private readonly opening = new Map<string, Promise<Session>>();
  private readonly timers = new Map<Timer, () => void>();
  private server: ServerVersions | null = null;
  private wentOfflineAt: number | null = null;
  private pongDueAt = 0;
  private nonce = 0;
  private readonly options: SyncClientOptions;

  constructor(options: SyncClientOptions) {
    this.options = options;
    // a later turn, so that a document opened at once is loaded before the socket opens
    void Promise.resolve().then(() => {
      if (this.model.wanted) this.input({ type: "want", online: true });
    });
  }

  async open(docId: string): Promise<DocHandle> {
    return (await this.session(docId, null)).handle;
  }

  async create(request: { kind: string; home: string }): Promise<DocHandle> {
    const { clock, random } = this.options.ports;
    const docId = docIdV7(clock.now(), random.bytes(10));
    return (await this.session(docId, request)).handle;
  }

  setOnline(wanted: boolean): void {
    this.input({ type: "want", online: wanted });
  }

  retryNow(): void {
    this.input({ type: "retry_now", random: this.options.ports.random.next() });
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.handle.close()));
    this.input({ type: "want", online: false });
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }

  /** The session of an open document, or the one being opened; set at once, so that a connect waits for it. */
  private session(
    docId: string,
    create: { kind: string; home: string } | null,
  ): Promise<Session> {
    const open = this.sessions.get(docId);
    if (open !== undefined) return Promise.resolve(open);
    const already = this.opening.get(docId);
    if (already !== undefined) return already;
    const opening = openSession({
      docId,
      ports: this.options.ports,
      create,
      link: this.sessionLink(),
      writeSchema: this.writeSchema(),
      uploadVersion: this.options.uploadVersion ?? null,
      replaceConnection: (reason) => this.replace(reason),
      closed: () => this.sessions.delete(docId),
    }).then((session) => {
      this.opening.delete(docId);
      this.sessions.set(docId, session);
      session.link(this.sessionLink());
      if (this.model.state === "online")
        session.connected((m) => this.send(m), this.gate);
      return session;
    });
    this.opening.set(docId, opening);
    void opening.catch(() => this.opening.delete(docId));
    return opening;
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
  }

  private dropped(at: number): void {
    for (const timer of ["welcome", "stable", "heartbeat", "pong"] as const)
      this.disarm(timer);
    this.current = null;
    this.wentOfflineAt ??= at;
    for (const session of this.sessions.values()) session.disconnected();
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
      this.sessions.get(message.docId)?.receive(message);
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
      case "ERROR":
        if (message.doc !== null)
          this.sessions.get(message.doc.docId)?.error(message);
        return;
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
    this.link.set({ ...facts, server: this.server, leader: true });
    for (const session of this.sessions.values()) session.link(facts);
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
