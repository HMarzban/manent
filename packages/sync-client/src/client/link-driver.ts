// The driver of the link's state machine: each effect carried out on the transport and the
// clock, HELLO and WELCOME, the heartbeat, and the server's frames read into messages.
import {
  ProtocolError,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type {
  DocumentMessage,
  FrameDecoder,
  Message,
  PushResult,
  ServerVersions,
  VersionSet,
} from "@manent/sync-protocol";
import { gateServer } from "../link/gate.ts";
import type { ServerGate } from "../link/gate.ts";
import { INITIAL_LINK, linkStep } from "../link/machine.ts";
import type { LinkEffect, LinkInput, LinkModel } from "../link/machine.ts";
import {
  HEARTBEAT_MS,
  PONG_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  STABLE_AFTER_MS,
  WELCOME_TIMEOUT_MS,
} from "../ports/defaults.ts";
import { ConnectError } from "../ports/ports.ts";
import type { Connection, SyncClientPorts } from "../ports/ports.ts";
import type { SessionLink } from "../session/session.ts";

/** What the driver tells its client. */
export interface LinkDriverHost {
  /** The documents being opened: the socket opens once each has settled. */
  opening(): Promise<unknown>[];
  /** The link is online: every document subscribes. */
  online(): void;
  /** The connection was lost or closed. */
  dropped(): void;
  /** WELCOME named the server's versions, so the newest schema to write may differ. */
  welcomed(): void;
  receive(message: DocumentMessage): void;
  error(docId: string, message: Extract<Message, { type: "ERROR" }>): void;
  /** The decoder skipped a frame of this document. */
  skipped(docId: string): void;
  /** The link's facts may have changed: they are published. */
  publish(): void;
}

/**
 * `gate` is what the last WELCOME's versions allow; `server` holds those
 * versions, kept while offline, and is null before any.
 */
export interface LinkDriver {
  readonly gate: ServerGate;
  readonly server: ServerVersions | null;
  /** The link as a session hears it. */
  sessionLink(): SessionLink;
  /** The newest schema the server may be written in: this build's, or the server's when older. */
  writeSchema(): number;
  input(input: LinkInput): void;
  /** Whether the link is wanted online, kept for when this tab leads; the machine is not told. */
  remember(wanted: boolean): void;
  /** This tab now leads: the link goes online when that is wanted. */
  lead(): void;
  /** This tab no longer leads: the connection is closed, and the link is offline until it leads again. */
  detach(): void;
  send(message: Message): void;
  /** Closes the connection because it stopped answering; the link reconnects with backoff. */
  replace(reason: string): void;
  close(): void;
}

interface LinkDriverOptions {
  versions: VersionSet;
  minServer: VersionSet;
  build: string;
  deviceId: string;
  ports: SyncClientPorts;
  host: LinkDriverHost;
}

/** One connection attempt; `connection` is null until it opens. */
interface Attempt {
  connection: Connection | null;
  decoder: FrameDecoder;
}

type Timer = "retry" | "welcome" | "stable" | "heartbeat" | "pong";

class Driver implements LinkDriver {
  gate: ServerGate = "ok";
  server: ServerVersions | null = null;
  private model: LinkModel = INITIAL_LINK;
  private current: Attempt | null = null;
  // message IDs need only be unique per connection; one allocator for every connection gives that
  private readonly encoder = createFrameEncoder({ ids: createMessageIds() });
  private readonly timers = new Map<Timer, () => void>();
  private wentOfflineAt: number | null = null;
  private pongDueAt = 0;
  private nonce = 0;
  private readonly options: LinkDriverOptions;

  constructor(options: LinkDriverOptions) {
    this.options = options;
  }

  sessionLink(): SessionLink {
    const { state, issue } = this.model;
    return {
      state,
      issue,
      wentOfflineAt: state === "online" ? null : this.wentOfflineAt,
    };
  }

  writeSchema(): number {
    const { schema } = this.options.versions;
    return this.server === null
      ? schema
      : Math.min(schema, this.server.current.schema);
  }

  input(input: LinkInput): void {
    const { model, effects } = linkStep(this.model, input);
    this.model = model;
    for (const effect of effects) this.perform(effect);
    if (this.model.state === "online") this.wentOfflineAt = null;
    this.options.host.publish();
  }

  remember(wanted: boolean): void {
    this.model = { ...this.model, wanted };
  }

  lead(): void {
    if (this.model.wanted) this.input({ type: "want", online: true });
  }

  detach(): void {
    this.current?.connection?.close(1000, "deposed");
    this.disarm("retry");
    this.model = { ...this.model, state: "offline", attempt: 0 };
    this.dropped(this.options.ports.clock.now());
  }

  send(message: Message): void {
    const connection = this.current?.connection;
    if (connection === null || connection === undefined) return;
    for (const frame of this.encoder.encode(message)) connection.send(frame);
  }

  replace(reason: string): void {
    const connection = this.current?.connection;
    if (connection === null || connection === undefined) return;
    connection.close(1000, reason);
    this.closed(1000);
  }

  close(): void {
    this.input({ type: "want", online: false });
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
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
    const opening = this.options.host.opening();
    if (opening.length === 0) go();
    else void Promise.allSettled(opening).then(go);
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

  private online(): void {
    this.arm("stable", STABLE_AFTER_MS, () => this.input({ type: "stable" }));
    this.beat();
    this.options.host.online();
  }

  private dropped(at: number): void {
    for (const timer of ["welcome", "stable", "heartbeat", "pong"] as const)
      this.disarm(timer);
    this.current = null;
    this.wentOfflineAt ??= at;
    this.options.host.dropped();
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
      this.options.host.skipped(result.doc.docId);
  }

  private route(message: Message): void {
    const { host } = this.options;
    if ("docId" in message) {
      host.receive(message);
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
        host.welcomed();
        this.input({ type: "welcome", gate: this.gate });
        return;
      case "PONG":
        this.disarm("pong");
        return;
      case "ERROR":
        if (message.doc !== null) host.error(message.doc.docId, message);
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

export function createLinkDriver(options: LinkDriverOptions): LinkDriver {
  return new Driver(options);
}
