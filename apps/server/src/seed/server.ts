// A server-core instance for seeding: the same server and sync service as the live one, with a seed clock and seeded ids.
import type { Rng } from "@manent/demo";
import {
  SeedDriverError,
  createDemoDirectory,
  createDemoSignIn,
} from "@manent/demo";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import {
  PRODUCT_SETTING_RULES,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type {
  Clock,
  ManentServer,
  SessionStore,
  SyncService,
} from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { Storage } from "@manent/storage";
import { PROTOCOL_VERSION, docIdV7 } from "@manent/sync-protocol";
import { readServerRenderPdf } from "../production.ts";
import { composeServices } from "../services.ts";
import { probeSeedCapabilities } from "./capabilities.ts";

/** The host every request to a seed server names. */
export const SEED_HOST = "seed.local";
export const SEED_ORIGIN = `http://${SEED_HOST}`;

/** The versions this build speaks, as the live server announces them. */
export const BUILD_VERSIONS = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
});

/** What a request from the seed itself comes with: loopback, and no upgrade. */
export const SEED_CALLER = Object.freeze({
  remoteAddress: "127.0.0.1",
  upgrade: () => false,
});

/** A request to `path` as the person `token` signs in, through the server's own fetch. */
export async function callRoute(
  server: ManentServer,
  token: string,
  request: { method: "GET" | "POST"; path: string; body?: unknown },
): Promise<Response> {
  const { method, path } = request;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const body = request.body === undefined ? null : JSON.stringify(request.body);
  const url = `http://${SEED_HOST}${path}`;
  const response = await server.fetch(
    new Request(url, { method, headers, body }),
    SEED_CALLER,
  );
  if (response === null)
    throw new SeedDriverError("unavailable", `${path} was upgraded`);
  return response;
}

const SESSION_KEY_BYTES = 32;
const V7_RANDOM_BYTES = 10;
// the seed's clock stands still while many edits arrive at one moment, so no bucket refills between them
const UNLIMITED = Number.MAX_SAFE_INTEGER;
const SEED_LIMITS = Object.freeze({
  frameBurst: UNLIMITED,
  byteBurst: UNLIMITED,
  roomLoadsPerSecond: UNLIMITED,
});

/** A clock that moves only when it is set; what it schedules runs when `runDue` is asked, in time order. */
export interface SeedClock extends Clock {
  /** Moves the clock to `at`, back as well as forward: each seed step tells its story from its own start. A function still scheduled keeps the delay it had left. */
  set(at: number): void;
  /** Runs every scheduled function whose time has come, those they schedule for now included. */
  runDue(): Promise<void>;
}

interface Scheduled {
  at: number;
  order: number;
  fn: () => void;
}

/** The clock reads `startAt` until it is first set. */
export function createSeedClock(startAt: number): SeedClock {
  let now = startAt;
  let order = 0;
  const scheduled = new Set<Scheduled>();
  const firstDue = (): Scheduled | null => {
    let first: Scheduled | null = null;
    for (const item of scheduled)
      if (
        item.at <= now &&
        (first === null ||
          item.at < first.at ||
          (item.at === first.at && item.order < first.order))
      )
        first = item;
    return first;
  };
  return {
    now: () => now,
    schedule(fn, delayMs) {
      const item = { at: now + delayMs, order: order++, fn };
      scheduled.add(item);
      return () => scheduled.delete(item);
    },
    set(at) {
      const shift = at - now;
      if (shift < 0) for (const item of scheduled) item.at += shift;
      now = at;
    },
    async runDue() {
      for (let due = firstDue(); due !== null; due = firstDue()) {
        scheduled.delete(due);
        due.fn();
        // what the function queued (a deferred commit) runs before the next one is due
        await Promise.resolve();
      }
    },
  };
}

export interface SeedServer {
  server: ManentServer;
  storage: Storage;
  sessions: SessionStore;
  sync: SyncService;
  clock: SeedClock;
  close(): Promise<void>;
}

/** `count` bytes drawn from `rng`. */
const rngBytes = (rng: Rng, count: number): Uint8Array =>
  Uint8Array.from({ length: count }, () => rng.int(0, 255));

/**
 * A server over the SQLite storage in `dataDir`, as the live server builds it, with its history and
 * production; its clock starts at `seedAt` and its ids and session key come from `rng`. It listens
 * nowhere: requests reach it through `server.fetch` and sockets through `server.connections`.
 */
export async function createSeedServer(options: {
  dataDir: string;
  seedAt: number;
  rng: Rng;
}): Promise<SeedServer> {
  const { rng } = options;
  const clock = createSeedClock(options.seedAt);
  const storage = openSqliteStorage({ dir: options.dataDir, now: clock.now });
  const ids = () => docIdV7(clock.now(), rngBytes(rng, V7_RANDOM_BYTES));
  const sessions = createSignedSessionStore({
    secret: rngBytes(rng, SESSION_KEY_BYTES),
    now: clock.now,
  });
  const renderPdf = await readServerRenderPdf();
  const directory = createDemoDirectory();
  const sync = (): SyncService => server.sync!;
  const composed = composeServices({
    storage,
    sync,
    clock,
    ids,
    names: (userId) => directory.user(userId)?.name ?? userId,
    renderPdf,
    rules: PRODUCT_SETTING_RULES,
  });
  const server = createServer({
    http: { allowedHosts: [SEED_HOST], openUrl: SEED_ORIGIN, webDir: null },
    auth: { signIn: createDemoSignIn(), directory, sessions },
    demo: null,
    socket: {
      tickets: createTicketStore({ now: clock.now }),
      versions: { current: BUILD_VERSIONS, min: BUILD_VERSIONS },
      allowedOrigins: [SEED_ORIGIN],
    },
    sync: {
      storage,
      clock,
      defer: queueMicrotask,
      ids,
      registry: PRODUCT_SETTING_RULES,
      limits: SEED_LIMITS,
      hooks: composed.hooks,
      ...(composed.airWindow === null ? {} : { airWindow: composed.airWindow }),
      ...(composed.airWindowOf === null
        ? {}
        : { airWindowOf: composed.airWindowOf }),
    },
    ...composed.config,
  });
  await probeSeedCapabilities({ server }, SEED_ORIGIN);
  return {
    server,
    storage,
    sessions,
    sync: sync(),
    clock,
    async close() {
      await server.sync?.shutdown();
      storage.close();
    },
  };
}
