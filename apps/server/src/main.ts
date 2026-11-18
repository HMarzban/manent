import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import { createServer, createSignedSessionStore } from "@manent/server-core";
import type { ServerConfig } from "@manent/server-core";
import { readServerEnv } from "./env.ts";
import type { ServerEnv } from "./env.ts";

const SESSION_KEY_BYTES = 32;

/** `host:port` as it appears in a URL, with IPv6 in its bracketed, canonical form. */
function urlHost(host: string, port: number): string {
  const bracketed = host.includes(":") ? `[${host}]` : host;
  return `${new URL(`http://${bracketed}`).hostname}:${port}`;
}

function readSeedId(dataDir: string): string | null {
  try {
    const seed = JSON.parse(
      readFileSync(join(dataDir, "data", "seed.json"), "utf8"),
    ) as {
      seedId?: unknown;
    } | null;
    return typeof seed?.seedId === "string" ? seed.seedId : null;
  } catch {
    return null;
  }
}

export function buildServerConfig(
  env: ServerEnv,
  secret: Uint8Array,
): ServerConfig {
  const hosts = [
    "localhost",
    "127.0.0.1",
    ...(env.lanHost ? [env.lanHost] : []),
  ].map((h) => urlHost(h, env.port));
  return {
    http: {
      allowedHosts: hosts,
      openUrl: `http://${urlHost(env.lanHost ?? "localhost", env.port)}`,
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

/** The key that signs sessions: created once in the data directory, then reused so sessions survive a restart. */
function readOrCreateSessionKey(dataDir: string): Uint8Array {
  const path = join(dataDir, "session.key");
  try {
    const key = readFileSync(path);
    if (key.length === SESSION_KEY_BYTES) return new Uint8Array(key);
  } catch {
    // no key yet
  }
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(SESSION_KEY_BYTES);
  writeFileSync(path, key, { mode: 0o600 });
  return new Uint8Array(key);
}

export async function startServer(
  env: ServerEnv,
): Promise<{ urls: string[]; stop(): Promise<void> }> {
  const server = createServer(
    buildServerConfig(env, readOrCreateSessionKey(env.dataDir)),
  );
  const hostnames = ["127.0.0.1", ...(env.lanHost ? [env.lanHost] : [])];
  const listening: Bun.Server<undefined>[] = [];
  const stop = async () => {
    await Promise.all(listening.map((s) => s.stop(true)));
  };
  try {
    for (const hostname of hostnames) {
      listening.push(
        Bun.serve({
          hostname,
          port: env.port,
          fetch: (request, bun) =>
            server.fetch(request, {
              remoteAddress: bun.requestIP(request)?.address ?? "",
            }),
        }),
      );
    }
  } catch {
    await stop();
    throw new Error(`Manent could not listen on port ${env.port}.`);
  }
  return {
    urls: hostnames.map((h) => `http://${urlHost(h, env.port)}`),
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
