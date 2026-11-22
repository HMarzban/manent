// Runs the demo server as a child process and answers the demo's server control requests.
import { timingSafeEqual } from "node:crypto";
import type {
  ControlStatusResponse,
  ErrorResponse,
  ServerState,
} from "@manent/sync-protocol";

const HEALTH_POLL_MS = 100;
const HEALTH_TIMEOUT_MS = 1000;
const RESTART_DELAY_MS = 250;
const RESTART_WINDOW_MS = 10_000;
const RESTARTS_PER_WINDOW = 3;
const COULD_NOT_START = "The server could not start.";

export interface SupervisorOptions {
  /** An argument array, never a shell string. */
  command: string[];
  /** The child's whole environment; the caller merges `process.env` into it. */
  env: Record<string, string | undefined>;
  /** The repository root. */
  cwd: string;
  healthUrl: string;
  /** Always bound to 127.0.0.1. */
  controlPort: number;
  /** Random per launch. */
  token: string;
  /** The app's origins, for CORS. */
  allowedOrigins: readonly string[];
  onReset(): Promise<void>;
  /** Called once, after POST /shutdown has answered and the supervisor has shut down; not called when the owner calls `shutdown()` itself. */
  onShutdown(): void;
}

export interface Supervisor {
  readonly controlUrl: string;
  serverPid(): number | null;
  serverState(): ServerState;
  /** Resolves when the health URL answers; rejects when the server exits first. */
  startServer(): Promise<void>;
  /** Kills the server without warning and resolves once it is gone. */
  stopServer(): Promise<void>;
  /** Stops the server and the control listener; nothing restarts after this. */
  shutdown(): Promise<void>;
}

interface Child {
  process: Bun.Subprocess;
  /** Set when the supervisor kills it, so that its exit is never taken as one by itself. */
  stopping: boolean;
}

async function answers(url: string): Promise<boolean> {
  try {
    return (
      await fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    ).ok;
  } catch {
    // nothing listens there yet, or it did not answer in time: poll again
    return false;
  }
}

/** True once `url` answers; false when the server exits first. */
async function becomesHealthy(
  server: Bun.Subprocess,
  url: string,
): Promise<boolean> {
  let exited = false;
  void server.exited.then(() => {
    exited = true;
  });
  for (;;) {
    if (exited) return false;
    if (await answers(url)) return !exited;
    await Bun.sleep(HEALTH_POLL_MS);
  }
}

function hasToken(request: Request, token: string): boolean {
  const given = Buffer.from(request.headers.get("Authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function corsHeaders(
  origin: string | null,
  allowed: readonly string[],
): Record<string, string> {
  if (origin === null || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST",
    "Access-Control-Allow-Headers": "Authorization",
    Vary: "Origin",
  };
}

/** The server's child process: started, watched, restarted after an exit by itself, and stopped. */
class ServerProcess {
  state: ServerState = "stopped";
  child: Child | null = null;
  private starting: Promise<void> | null = null;
  private restart: Timer | null = null;
  private restartedAt: number[] = [];
  private closed = false;
  private readonly options: SupervisorOptions;

  constructor(options: SupervisorOptions) {
    this.options = options;
  }

  start(): Promise<void> {
    if (this.closed)
      return Promise.reject(new Error("the supervisor has shut down"));
    if (this.state === "running") return Promise.resolve();
    this.starting ??= this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async stop(): Promise<void> {
    if (this.restart !== null) {
      clearTimeout(this.restart);
      this.restart = null;
    }
    const running = this.child;
    if (running !== null) {
      running.stopping = true;
      running.process.kill("SIGKILL");
    }
    await Promise.allSettled([running?.process.exited, this.starting]);
    this.state = "stopped";
  }

  /** Stops the server, re-seeds and starts it. A re-seed that rejects leaves it `failed` and unstarted, since its data may be half written. */
  async reset(): Promise<void> {
    await this.stop();
    try {
      await this.options.onReset();
    } catch {
      // the state carries the outcome, which is what /reset answers
      this.state = "failed";
      return;
    }
    await this.start();
  }

  /** Stops the server; nothing starts it again. False when it was already closed. */
  async close(): Promise<boolean> {
    const first = !this.closed;
    this.closed = true;
    await this.stop();
    return first;
  }

  private async launch(): Promise<void> {
    this.state = "starting";
    let spawned: Child;
    try {
      spawned = {
        process: Bun.spawn(this.options.command, {
          env: this.options.env,
          cwd: this.options.cwd,
          stdout: "inherit",
          stderr: "inherit",
        }),
        stopping: false,
      };
    } catch (cause) {
      this.state = "failed";
      throw new Error(COULD_NOT_START, { cause });
    }
    this.child = spawned;
    this.watch(spawned);
    const healthy = await becomesHealthy(
      spawned.process,
      this.options.healthUrl,
    );
    // a stop during the start has already set the state
    if (spawned.stopping) throw new Error(COULD_NOT_START);
    if (!healthy) {
      this.state = "failed";
      throw new Error(COULD_NOT_START);
    }
    this.state = "running";
  }

  private watch(exited: Child): void {
    void exited.process.exited.then(() => {
      if (this.child === exited) this.child = null;
      if (!exited.stopping && this.state === "running") this.exitedByItself();
    });
  }

  private exitedByItself(): void {
    const now = Date.now();
    this.restartedAt = this.restartedAt.filter(
      (at) => now - at < RESTART_WINDOW_MS,
    );
    if (this.restartedAt.length >= RESTARTS_PER_WINDOW) {
      this.state = "failed";
      return;
    }
    this.restartedAt.push(now);
    this.state = "stopped";
    console.error("The server stopped by itself. Starting it again.");
    this.restart = setTimeout(() => {
      this.restart = null;
      this.start().catch(() => {
        // the state now reads failed, which is what /status reports
      });
    }, RESTART_DELAY_MS);
  }
}

type Actions = ReadonlyMap<string, () => Promise<void>>;

function settle(action: Promise<void>): Promise<void> {
  return action.catch(() => {
    // the answer carries the outcome as the state, never the rejection
  });
}

/** One control request: CORS for the app's origins, the launch token, then the action and the state it leaves. */
async function answer(
  request: Request,
  options: SupervisorOptions,
  server: ServerProcess,
  actions: Actions,
): Promise<Response> {
  const headers = corsHeaders(
    request.headers.get("Origin"),
    options.allowedOrigins,
  );
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (!hasToken(request, options.token)) {
    const body: ErrorResponse = { error: "unauthenticated" };
    return Response.json(body, { status: 401, headers });
  }
  const action = actions.get(
    `${request.method} ${new URL(request.url).pathname}`,
  );
  if (action === undefined) {
    const body: ErrorResponse = { error: "not_found" };
    return Response.json(body, { status: 404, headers });
  }
  await action();
  const body: ControlStatusResponse = { server: server.state };
  return Response.json(body, { headers });
}

/** Listens on 127.0.0.1 at `controlPort`; the server is not started until `startServer()` or POST /start-server. */
export async function startSupervisor(
  options: SupervisorOptions,
): Promise<Supervisor> {
  const server = new ServerProcess(options);
  const actions: Actions = new Map([
    ["GET /status", async () => {}],
    ["POST /start-server", () => settle(server.start())],
    ["POST /stop-server", () => server.stop()],
    ["POST /reset", () => settle(server.reset())],
    [
      "POST /shutdown",
      async () => {
        // a graceful stop lets this answer go out first
        if (await server.close())
          void listener.stop().then(() => options.onShutdown());
      },
    ],
  ]);

  const listener = Bun.serve({
    hostname: "127.0.0.1",
    port: options.controlPort,
    // POST /reset answers only after a whole re-seed, which outlasts Bun's ten-second default
    idleTimeout: 0,
    fetch: (request) => answer(request, options, server, actions),
  });

  return {
    controlUrl: `http://127.0.0.1:${listener.port}`,
    serverPid: () => server.child?.process.pid ?? null,
    serverState: () => server.state,
    startServer: () => server.start(),
    stopServer: () => server.stop(),
    async shutdown() {
      await server.close();
      await listener.stop(true);
    },
  };
}
