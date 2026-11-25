// Dedicated connection for one prompter handle: HELLO/WELCOME, framing, reconnect backoff and probes.
import { SCHEMA_VERSION } from "@manent/schema";
import {
  CODE,
  PROTOCOL_VERSION,
  ProtocolError,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type {
  FrameDecoder,
  Message,
  PushResult,
  VersionSet,
} from "@manent/sync-protocol";
import { backoffDelayMs } from "../link/backoff.ts";
import {
  PROBE_TIMEOUT_MS,
  RESTART_SPREAD_MS,
  STABLE_AFTER_MS,
  WELCOME_TIMEOUT_MS,
} from "../ports/defaults.ts";
import { ConnectError } from "../ports/ports.ts";
import type { Connection, SyncClientPorts } from "../ports/ports.ts";

const DEFAULT_VERSIONS: VersionSet = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: 1,
  table: 1,
});

export interface PrompterSocketHost {
  versions(): VersionSet | null;
  welcomed(): void;
  message(message: Message): void;
  dropped(): void;
  refused(): void;
  ponged(): void;
}

export interface PrompterSocket {
  send(message: Message): void;
  probe(): void;
  cancelProbe(): void;
  close(beforeClose?: (send: (message: Message) => void) => void): void;
}

interface Attempt {
  connection: Connection | null;
  decoder: FrameDecoder;
}

type SocketTimer = "retry" | "welcome" | "probe" | "stable";

class DedicatedSocket implements PrompterSocket {
  private readonly encoder = createFrameEncoder({ ids: createMessageIds() });
  private readonly timers = new Map<SocketTimer, () => void>();
  private current: Attempt | null = null;
  private attempt = 0;
  private nonce = 0;
  private stopped = false;
  private readonly ports: SyncClientPorts;
  private readonly host: PrompterSocketHost;

  constructor(ports: SyncClientPorts, host: PrompterSocketHost) {
    this.ports = ports;
    this.host = host;
    this.connect();
  }

  send(message: Message): void {
    const connection = this.current?.connection;
    if (connection !== null && connection !== undefined)
      this.sendOn(connection, message);
  }

  probe(): void {
    const connection = this.current?.connection;
    if (connection === null || connection === undefined) return;
    this.nonce += 1;
    this.sendOn(connection, { type: "PING", nonce: this.nonce });
    this.arm("probe", PROBE_TIMEOUT_MS, () => this.replace("feed_timeout"));
  }

  cancelProbe(): void {
    this.disarm("probe");
  }

  close(beforeClose?: (send: (message: Message) => void) => void): void {
    if (this.stopped) return;
    this.stopped = true;
    const connection = this.current?.connection ?? null;
    this.current = null;
    this.disarmAll();
    if (connection !== null) {
      beforeClose?.((message) => this.sendOn(connection, message));
      connection.close(1000, "closed");
    }
  }

  private connect(): void {
    if (this.stopped) return;
    const attempt: Attempt = {
      connection: null,
      decoder: createFrameDecoder({ from: "server" }),
    };
    this.current = attempt;
    this.ports.transport
      .connect({
        onFrame: (frame) => {
          if (this.current === attempt) this.frame(attempt, frame);
        },
        onClose: (code) => {
          if (this.current !== attempt) return;
          if (attempt.connection === null)
            this.connectFailed(attempt, new ConnectError("unreachable"));
          else this.connectionDropped(code);
        },
      })
      .then(
        (connection) => this.opened(attempt, connection),
        (error: unknown) => this.connectFailed(attempt, error),
      );
  }

  private opened(attempt: Attempt, connection: Connection): void {
    if (this.stopped || this.current !== attempt) {
      connection.close(1000, "closed");
      return;
    }
    attempt.connection = connection;
    this.sendOn(connection, {
      type: "HELLO",
      versions: this.host.versions() ?? DEFAULT_VERSIONS,
      build: "prompter",
      deviceId: this.ports.leader.tabId,
    });
    this.arm("welcome", WELCOME_TIMEOUT_MS, () =>
      this.replace("welcome_timeout"),
    );
  }

  private connectFailed(attempt: Attempt, error: unknown): void {
    if (this.stopped || this.current !== attempt) return;
    this.current = null;
    if (error instanceof ConnectError && error.code === "sign_in") {
      this.stopRefused();
      return;
    }
    this.host.dropped();
    this.scheduleRetry(null);
    // a transport that fails in any other way is unreachable all the same, and its error is not hidden
    if (!(error instanceof ConnectError)) throw error;
  }

  private connectionDropped(code: number): void {
    if (this.stopped) return;
    this.current = null;
    for (const timer of ["welcome", "probe", "stable"] as const)
      this.disarm(timer);
    if (code === CODE.UNAUTHENTICATED || code === CODE.TOO_OLD) {
      this.stopRefused();
      return;
    }
    this.host.dropped();
    const delayMs =
      code === CODE.RESTARTING
        ? Math.floor(this.ports.random.next() * RESTART_SPREAD_MS)
        : null;
    this.scheduleRetry(delayMs);
  }

  private stopRefused(): void {
    this.stopped = true;
    this.disarmAll();
    this.host.refused();
  }

  private scheduleRetry(fixedDelayMs: number | null): void {
    const delayMs =
      fixedDelayMs ?? backoffDelayMs(this.attempt++, this.ports.random.next());
    this.arm("retry", delayMs, () => this.connect());
  }

  private replace(reason: string): void {
    const connection = this.current?.connection;
    if (connection === null || connection === undefined) return;
    this.current = null;
    connection.close(1000, reason);
    this.connectionDropped(1000);
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
    if (result.kind !== "message") return;
    this.route(result.message);
  }

  private route(message: Message): void {
    if (message.type === "WELCOME") {
      this.disarm("welcome");
      this.arm("stable", STABLE_AFTER_MS, () => {
        this.attempt = 0;
      });
      this.host.welcomed();
      return;
    }
    if (message.type === "PING") {
      this.send({ type: "PONG", nonce: message.nonce });
      return;
    }
    if (message.type === "PONG") {
      this.disarm("probe");
      this.host.ponged();
      return;
    }
    this.host.message(message);
  }

  private sendOn(connection: Connection, message: Message): void {
    for (const frame of this.encoder.encode(message)) connection.send(frame);
  }

  private arm(timer: SocketTimer, delayMs: number, fn: () => void): void {
    this.disarm(timer);
    this.timers.set(
      timer,
      this.ports.clock.schedule(() => {
        this.timers.delete(timer);
        fn();
      }, delayMs),
    );
  }

  private disarm(timer: SocketTimer): void {
    this.timers.get(timer)?.();
    this.timers.delete(timer);
  }

  private disarmAll(): void {
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }
}

export function createPrompterSocket(options: {
  ports: SyncClientPorts;
  host: PrompterSocketHost;
}): PrompterSocket {
  return new DedicatedSocket(options.ports, options.host);
}
