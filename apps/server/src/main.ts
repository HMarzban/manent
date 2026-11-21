import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createDemoDirectory,
  createDemoSignIn,
  createSeedTime,
} from "@manent/demo";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import {
  PRODUCT_SETTING_RULES,
  createHistoryService,
  createProductionService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  createWorkerCheckpointer,
  serveWithBun,
} from "@manent/server-core";
import type {
  Clock,
  HistoryExtras,
  Listener,
  ManentServer,
  ServerConfig,
  SyncSettings,
} from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { DemoControls } from "@manent/sync-protocol";
import { createDemoServices } from "./demo/services.ts";
import { readServerEnv } from "./env.ts";
import type { ServerEnv } from "./env.ts";
import { createServerRenderPdf, readScriptFonts } from "./production.ts";
import { startBackgroundSeed } from "./seed/background.ts";
import { runSeedCommand } from "./seed/command.ts";
import { onServeError } from "./serve-error.ts";

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
    engine: ENGINE_VERSION,
    table: TABLE_VERSION,
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
    demo: {
      seedId: () => readSeedId(env.dataDir),
      control: env.control,
      controls: null,
    },
    socket: {
      tickets: createTicketStore({ now: Date.now }),
      versions: { current: versions, min: versions },
      allowedOrigins: hosts.map((h) => `http://${h}`),
    },
    sync: null,
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
): Listener {
  try {
    return serveWithBun({ hostname, port }, server, onServeError);
  } catch (cause) {
    throw new Error(`Manent could not listen on ${hostname}:${port}.`, {
      cause,
    });
  }
}

/** The seed's clock at `seedAt`, in this machine's zone at that moment. */
const seedTimeAt = (seedAt: number) =>
  createSeedTime({
    seedAt,
    zoneOffsetMs: -new Date(seedAt).getTimezoneOffset() * 60_000,
  });

const clock: Clock = {
  now: Date.now,
  schedule(fn, delayMs) {
    const timer = setTimeout(fn, delayMs);
    return () => clearTimeout(timer);
  },
};

/** The documents under `<dataDir>/data`, checkpointed by one worker thread with its own connection. */
function openSync(dataDir: string): SyncSettings & { close(): void } {
  const dir = join(dataDir, "data");
  const storage = openSqliteStorage({ dir, now: Date.now });
  const checkpointer = createWorkerCheckpointer({
    entry: new URL("./checkpoint-worker.ts", import.meta.url),
    data: { dir },
  });
  return {
    storage,
    checkpointer,
    clock,
    defer: setImmediate,
    ids: () => crypto.randomUUID(),
    registry: PRODUCT_SETTING_RULES,
    close: () => storage.close(),
  };
}

/**
 * Listens on loopback, then on the LAN host on the port loopback bound, and
 * only then builds the server, so that its hosts name that port. `env.port`
 * 0 asks the system for a free port. Stopping finishes every write, closes
 * every connection, stops listening and closes the storage; a second stop
 * waits for the first.
 */
export async function startServer(env: ServerEnv): Promise<RunningServer> {
  const secret = await loadSessionSecret(env.dataDir);
  const renderPdf = createServerRenderPdf(await readScriptFonts());
  let built: ManentServer | null = null;
  // the listeners bind and the server is built in one synchronous run, so no event comes first
  const server = (): ManentServer => {
    if (built === null)
      throw new Error("the server is used before it is built");
    return built;
  };
  const loopback = listen("127.0.0.1", env.port, server);
  const { port } = loopback;
  const listening = [loopback];
  const stopListening = async () => {
    await Promise.all(listening.map((s) => s.stop()));
  };
  if (env.lanHost !== null) {
    try {
      listening.push(listen(env.lanHost, port, server));
    } catch (error) {
      await stopListening();
      throw error;
    }
  }
  const sync = openSync(env.dataDir);
  const { storage, ids } = sync;
  const config = buildServerConfig(env, secret, port);
  // the history service and the production service take each other through getters
  const extras: HistoryExtras = {
    locksAt: (...args) => production.extras.locksAt(...args),
    authority: (...args) => production.extras.authority(...args),
  };
  const history = createHistoryService({
    sync: () => serving.sync!,
    storage,
    clock,
    ids,
    extras,
  });
  const production = createProductionService({
    storage,
    sync: () => serving.sync!,
    history,
    now: clock.now,
    ids,
    names: (userId) => config.auth.directory.user(userId)?.name ?? userId,
    renderPdf,
    rules: PRODUCT_SETTING_RULES,
  });
  // the demo's services need the server these controls are given to, so the controls call them once they exist
  const controls: DemoControls = {
    writers: (...args) => services.writers(...args),
    prepare: (...args) => services.prepare(...args),
    rebuild: (...args) => services.rebuild(...args),
  };
  const serving = createServer({
    ...config,
    demo: config.demo === null ? null : { ...config.demo, controls },
    sync: { ...sync, hooks: [history, production.hooks] },
    history,
    production,
  });
  built = serving;
  const services = createDemoServices({
    live: {
      server: serving,
      sessions: config.auth.sessions,
      storage,
      sync: serving.sync!,
      clock,
    },
    time: () => seedTimeAt(Date.now()),
    random: Math.random,
  });
  const background = startBackgroundSeed({
    execPath: process.execPath,
    entry: import.meta.path,
    dataDir: env.dataDir,
    seedAt: Date.now(),
    onProgress: () => {},
    onDone: async () => {},
    onFailed: () => {},
  });
  let stopped: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopped ??= (async () => {
      await background.stop();
      await services.close();
      await serving.sync?.shutdown();
      await stopListening();
      sync.close();
    })();
    return stopped;
  };
  const hostnames = ["127.0.0.1", ...(env.lanHost ? [env.lanHost] : [])];
  return {
    port,
    urls: hostnames.map((h) => `http://${urlHost(h, port)}`),
    stop,
  };
}

if (import.meta.main) {
  // the seed command runs before the environment is read: its child process is given only its arguments
  if (process.argv[2] === "seed")
    process.exit(await runSeedCommand(process.argv.slice(2)));
  try {
    const running = await startServer(readServerEnv(process.env));
    process.on("SIGTERM", () => {
      void running.stop().then(() => process.exit(0));
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
