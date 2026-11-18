// The real server program in a child process, on a free port of loopback, for tests that need
// the whole stack: killing it, restarting it and signing people in.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";

/** The repository root, from this module's place, so the working directory never matters. */
const ROOT = join(import.meta.dir, "../../../..");
/** How long a start may take before the child is killed and the start rejected. */
const START_TIMEOUT_MS = 15_000;
const POLL_MS = 10;

export interface TestServer {
  readonly url: string;
  readonly port: number;
  readonly dataDir: string;
  /** A session token from `POST /api/sign-in`. */
  token(userId: string): Promise<string>;
  createDocument(
    userId: string,
    request: { docId: string; kind: string; home: string },
  ): Promise<void>;
  /** SIGKILL, resolving once the process is gone; at once when it is not running. */
  kill(): Promise<void>;
  /** The same port and data directory again; resolves when /health answers, at once when it is running. */
  start(): Promise<void>;
  /** SIGTERM, resolving once it has exited; at once when it is not running. */
  stop(): Promise<void>;
}

/** A port nothing listens on now: listened on and closed again. */
function freePort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

function hasExited(child: Subprocess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function answersHealth(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/health`)).ok;
  } catch {
    // not listening yet: the caller asks again
    return false;
  }
}

/** Resolves once /health answers; rejects when the child exits first or the start takes too long. */
async function awaitHealth(child: Subprocess, url: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!(await answersHealth(url))) {
    if (hasExited(child))
      throw new Error(
        `the test server exited with ${child.exitCode ?? child.signalCode} before /health answered`,
      );
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      await child.exited;
      throw new Error(
        `the test server did not answer /health within ${START_TIMEOUT_MS} ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function readJson(response: Response, what: string): Promise<unknown> {
  if (response.status !== 200)
    throw new Error(
      `${what} was answered ${response.status}: ${await response.text()}`,
    );
  return response.json();
}

/** The real program on a free port of 127.0.0.1; a fresh data directory, which the caller removes, unless one is given. */
export async function startTestServer(options?: {
  dataDir?: string;
}): Promise<TestServer> {
  const dataDir =
    options?.dataDir ?? (await mkdtemp(join(tmpdir(), "manent-server-")));
  const port = freePort();
  const url = `http://127.0.0.1:${port}`;
  let child: Subprocess | null = null;

  async function end(signal: "SIGKILL" | "SIGTERM"): Promise<void> {
    if (child === null || hasExited(child)) return;
    child.kill(signal);
    await child.exited;
  }

  async function token(userId: string): Promise<string> {
    const response = await fetch(`${url}/api/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const body = await readJson(response, `the sign-in of ${userId}`);
    const value =
      typeof body === "object" && body !== null && "token" in body
        ? body.token
        : null;
    if (typeof value !== "string")
      throw new Error(`the sign-in of ${userId} gave no token`);
    return value;
  }

  const server: TestServer = {
    url,
    port,
    dataDir,
    token,
    async createDocument(userId, request) {
      const response = await fetch(`${url}/api/docs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await token(userId)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      await readJson(response, `creating ${request.docId}`);
    },
    kill: () => end("SIGKILL"),
    stop: () => end("SIGTERM"),
    async start() {
      if (child !== null && !hasExited(child)) return;
      const spawned = Bun.spawn(
        [process.execPath, "--no-orphans", "apps/server/src/main.ts"],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            MANENT_DEMO: "1",
            MANENT_PORT: String(port),
            MANENT_DATA_DIR: dataDir,
          },
          stdin: "ignore",
          stdout: "inherit",
          stderr: "inherit",
        },
      );
      child = spawned;
      await awaitHealth(spawned, url);
    },
  };
  await server.start();
  return server;
}
