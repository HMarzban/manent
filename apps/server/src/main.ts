import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import { SCHEMA_VERSION } from "@manent/schema";
import {
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type {
  ConnectionData,
  ManentServer,
  ServerConfig,
} from "@manent/server-core";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import { serveWithBun } from "./bun-adapter.ts";
import { readServerEnv } from "./env.ts";
import type { ServerEnv } from "./env.ts";

const SESSION_KEY_BYTES = 32;

/** `host:port` as it appears in a URL, with IPv6 in its bracketed, canonical form. */
function urlHost(host: string, port: number): string {
  const bracketed = host.includes(":") ? `[${host}]` : host;
  return `${new URL(`http://${bracketed}`).hostname}:${port}`;
}

/** The seed's id from `data/seed.json`; null while there is none to read. */
function readSeedId(dataDir: string): string | null {
  let seed: unknown;
  try {
    seed = JSON.parse(readFileSync(join(dataDir, "data", "seed.json"), "utf8"));
  } catch {
    // no seed yet, or one still being written: the next call reads it again
    return null;
  }
  if (typeof seed !== "object" || seed === null || !("seedId" in seed))
    return null;
  return typeof seed.seedId === "string" ? seed.seedId : null;
}

/** The server's configuration; `port` is the one actually bound, not the one asked for. */
export function buildServerConfig(
  env: ServerEnv,
  secret: Uint8Array,
  port: number,
): ServerConfig {
  const hosts = [
    "localhost",
    "127.0.0.1",
    ...(env.lanHost ? [env.lanHost] : []),
  ].map((h) => urlHost(h, port));
  const versions = {
    protocol: PROTOCOL_VERSION,
    schema: SCHEMA_VERSION,
    engine: 0,
    table: 0,
  };
  return {
    http: {
      allowedHosts: hosts,
      openUrl: `http://${urlHost(env.lanHost ?? "localhost", port)}`,
      webDir: env.webDir,
    },
    auth: {
      signIn: createDemoSignIn(),
      directory: createDemoDirectory(),
      sessions: createSignedSessionStore({ secret, now: Date.now }),
    },
    demo: { seedId: () => readSeedId(env.dataDir), control: env.control },
    socket: {
      tickets: createTicketStore({ now: Date.now }),
      versions: { current: versions, min: versions },
      allowedOrigins: hosts.map((h) => `http://${h}`),
    },
  };
}

/** The stored key; null when there is none yet. Any other failure to read it is thrown. */
async function readSessionKey(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

/** Writes `bytes` beside `path` with mode 0600, then renames it over `path`, so no reader sees half a file. */
async function replaceFile(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * The key that signs sessions: created once in the data directory, then reused so sessions
 * survive a restart. A key that is not 32 bytes is replaced whole.
 */
export async function loadSessionSecret(dataDir: string): Promise<Uint8Array> {
  const path = join(dataDir, "session.key");
  const stored = await readSessionKey(path);
  if (stored !== null && stored.length === SESSION_KEY_BYTES)
    return new Uint8Array(stored);
  await mkdir(dataDir, { recursive: true });
  const key = new Uint8Array(randomBytes(SESSION_KEY_BYTES));
  await replaceFile(path, key);
  return key;
}

export interface RunningServer {
  /** The port every listener is bound to. */
  port: number;
  urls: string[];
  stop(): Promise<void>;
}

/** One listener; a listener that cannot start is one terminal sentence carrying its cause. */
function listen(
  hostname: string,
  port: number,
  server: () => ManentServer,
): Bun.Server<ConnectionData> {
  try {
    return serveWithBun({ hostname, port }, server);
  } catch (cause) {
    throw new Error(`Manent could not listen on ${hostname}:${port}.`, {
      cause,
    });
  }
}

/**
 * Listens on loopback, then on the LAN host on the port loopback bound, and
 * only then builds the server, so that its hosts name that port. `env.port`
 * 0 asks the system for a free port.
 */
export async function startServer(env: ServerEnv): Promise<RunningServer> {
  const secret = await loadSessionSecret(env.dataDir);
  let built: ManentServer | null = null;
  // the listeners bind and the server is built in one synchronous run, so no event comes first
  const server = (): ManentServer => {
    if (built === null)
      throw new Error("the server is used before it is built");
    return built;
  };
  const loopback = listen("127.0.0.1", env.port, server);
  // a listener on a host and a port always reports the port it bound
  const port = loopback.port!;
  const listening = [loopback];
  const stop = async () => {
    await Promise.all(listening.map((s) => s.stop(true)));
  };
  if (env.lanHost !== null) {
    try {
      listening.push(listen(env.lanHost, port, server));
    } catch (error) {
      await stop();
      throw error;
    }
  }
  built = createServer(buildServerConfig(env, secret, port));
  const hostnames = ["127.0.0.1", ...(env.lanHost ? [env.lanHost] : [])];
  return {
    port,
    urls: hostnames.map((h) => `http://${urlHost(h, port)}`),
    stop,
  };
}

if (import.meta.main) {
  try {
    await startServer(readServerEnv(process.env));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
