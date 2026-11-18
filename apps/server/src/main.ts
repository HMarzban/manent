import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import { createServer, createSignedSessionStore } from "@manent/server-core";
import type { ManentServer, ServerConfig } from "@manent/server-core";
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
  };
}

/** The stored key; null when there is none yet. Any other failure to read it is thrown. */
function readSessionKey(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

/** The key that signs sessions: created once in the data directory, then reused so sessions survive a restart. */
function readOrCreateSessionKey(dataDir: string): Uint8Array {
  const path = join(dataDir, "session.key");
  const stored = readSessionKey(path);
  if (stored !== null && stored.length === SESSION_KEY_BYTES)
    return new Uint8Array(stored);
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(SESSION_KEY_BYTES);
  writeFileSync(path, key, { mode: 0o600 });
  return new Uint8Array(key);
}

export interface RunningServer {
  /** The port every listener is bound to. */
  port: number;
  urls: string[];
  stop(): Promise<void>;
}

type Fetch = (
  request: Request,
  bun: Bun.Server<undefined>,
) => Promise<Response>;

/** One listener; a listener that cannot start is one terminal sentence carrying its cause. */
function listen(
  hostname: string,
  port: number,
  handle: Fetch,
): Bun.Server<undefined> {
  try {
    return Bun.serve({ hostname, port, fetch: handle });
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
  const secret = readOrCreateSessionKey(env.dataDir);
  // the server needs the bound port, so a request waits until it exists
  const built = Promise.withResolvers<ManentServer>();
  const handle: Fetch = async (request, bun) =>
    (await built.promise).fetch(request, {
      remoteAddress: bun.requestIP(request)?.address ?? "",
    });
  const loopback = listen("127.0.0.1", env.port, handle);
  // a listener on a host and a port always reports the port it bound
  const port = loopback.port!;
  const listening = [loopback];
  const stop = async () => {
    await Promise.all(listening.map((s) => s.stop(true)));
  };
  if (env.lanHost !== null) {
    try {
      listening.push(listen(env.lanHost, port, handle));
    } catch (error) {
      await stop();
      throw error;
    }
  }
  built.resolve(createServer(buildServerConfig(env, secret, port)));
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
