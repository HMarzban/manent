import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SEED_PROJECTS,
  createDemoDirectory,
  createDemoSignIn,
  createSeedTime,
  heavyHomes,
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
import type { Storage } from "@manent/storage";
import { PROTOCOL_VERSION, indexDocId } from "@manent/sync-protocol";
import type { DemoControls, WorkspaceRef } from "@manent/sync-protocol";
import { createDemoServices } from "./demo/services.ts";
import { readServerEnv } from "./env.ts";
import type { ServerEnv } from "./env.ts";
import { readServerRenderPdf } from "./production.ts";
import { adoptStaging, resumeStaging } from "./seed/adopt.ts";
import { stagingDirOf, startBackgroundSeed } from "./seed/background.ts";
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

/** The projects Lanternfield Studios' background seed writes, as its progress counts them. */
const HEAVY_TOTAL = SEED_PROJECTS.filter(
  (p) => p.workspaceId === "heavy",
).length;

/** Where the background seed adopts into: the live data and Lanternfield Studios' homes. */
const adoptionOf = (dataDir: string, live: Storage) => ({
  live,
  stagingDir: stagingDirOf(dataDir),
  dataDir: join(dataDir, "data"),
  homes: heavyHomes(),
});

/**
 * Lanternfield Studios before the server listens: an adoption under way is finished, a stopped
 * seed cleared, through storage opened and closed here. True when its seed has yet to run.
 */
async function isHeavyWaiting(dataDir: string): Promise<boolean> {
  const live = openSqliteStorage({ dir: join(dataDir, "data"), now: Date.now });
  try {
    if (live.directory.placeOf(indexDocId("workspace", "heavy")) !== null)
      return false;
    return (await resumeStaging(adoptionOf(dataDir, live))) === "cleared";
  } finally {
    live.close();
  }
}

/**
 * While `waiting`, `seeding` tells /api/me how far Lanternfield Studios' seed has come, and none of
 * its homes is ready until `adopted` is called.
 */
function createHeavyState(waiting: boolean, dataDir: string, live: Storage) {
  const adoption = adoptionOf(dataDir, live);
  let seeding: WorkspaceRef["seeding"] = waiting
    ? { done: 0, total: HEAVY_TOTAL, failed: false }
    : null;
  return {
    seeding: (workspaceId: string) =>
      workspaceId === "heavy" ? seeding : null,
    isHomeReady: (home: string) =>
      seeding === null || !adoption.homes.has(home),
    progress(done: number, total: number) {
      seeding = { done, total, failed: false };
    },
    failed() {
      if (seeding !== null) seeding = { ...seeding, failed: true };
    },
    async adopted() {
      await adoptStaging(adoption);
      seeding = null;
    },
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
  const renderPdf = await readServerRenderPdf();
  const waiting = await isHeavyWaiting(env.dataDir);
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
  const heavy = createHeavyState(waiting, env.dataDir, storage);
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
    auth: {
      ...config.auth,
      directory: createDemoDirectory({ seeding: heavy.seeding }),
    },
    demo:
      config.demo === null
        ? null
        : { ...config.demo, controls, isHomeReady: heavy.isHomeReady },
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
  const background = waiting
    ? startBackgroundSeed({
        command: Bun.isStandaloneExecutable
          ? [process.execPath]
          : [process.execPath, "--no-orphans", import.meta.path],
        dataDir: env.dataDir,
        seedAt: Date.now(),
        onProgress: heavy.progress,
        onDone: heavy.adopted,
        onFailed(reason) {
          console.error(reason);
          heavy.failed();
        },
      })
    : { stop: async () => {} };
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
