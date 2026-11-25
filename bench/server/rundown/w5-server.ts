// Real HTTP+WebSocket Manent server and rundown setup shared by the W5 news-hour and staleness scenarios.
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserClock } from "@manent/client-web";
import {
  STORED_COLUMNS,
  createDoc,
  initRundown,
  insertRows,
  updateMeta,
} from "@manent/crdt";
import {
  ENGINE_VERSION,
  ENGINE_VERSIONS,
  TABLE_VERSION,
} from "@manent/pagination";
import { SCHEMA_VERSION, randomBlockId } from "@manent/schema";
import {
  DEFAULT_LIMITS,
  createAirWindows,
  createHistoryService,
  createPrompterService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  serveWithBun,
} from "@manent/server-core";
import type { SyncService } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { Storage } from "@manent/storage";
import { CAPABILITIES, PROTOCOL_VERSION } from "@manent/sync-protocol";
import { storyRundown } from "../../corpus/rundown.ts";
import type { RUNDOWN_ROWS } from "../../corpus/rundown.ts";
import { NotMeasured, benchTier } from "../../env.ts";
import { sampleMs } from "../../measure.ts";
import { HOME, OWNER, delay, docIdOf, stateOf } from "../support.ts";

/** Verbatim NotMeasured reason when W5's full load cannot finish on D-small. */
export const W5_D_SMALL_REASON =
  "W5's full load (6 rundowns of 80 stories, 200 viewers each) could not finish on D-small, and it is not reduced to fit";

const TIMER_MS = 10;
const nextId = (): string => crypto.randomUUID();

/** A deterministic 32-character lower-case hexadecimal idempotency key (`isReplayKey`). */
export function replayKey(tag: number, a: number, b: number): string {
  return `${tag.toString(16).padStart(8, "0")}${a.toString(16).padStart(12, "0")}${b.toString(16).padStart(12, "0")}`;
}

export interface W5Server {
  readonly url: string;
  readonly storage: Storage;
  token(userId: string): string;
  loadedRooms(): number;
  stop(): Promise<void>;
}

export interface PlacedRundown {
  readonly rundownId: string;
  readonly rowIds: readonly string[];
  readonly storyRowIds: readonly string[];
  readonly storyDocIds: readonly string[];
}

export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms} ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function watchEventLoop(): {
  lateness: number[];
  stop(): Promise<void>;
} {
  const lateness: number[] = [];
  const stopping = new AbortController();
  const watched = (async () => {
    while (!stopping.signal.aborted) {
      const ms = await sampleMs(() => delay(TIMER_MS));
      lateness.push(Math.max(0, ms - TIMER_MS));
    }
  })();
  return {
    lateness,
    async stop() {
      stopping.abort();
      await watched;
    },
  };
}

/** Re-throws as NotMeasured on D-small when W5's full load cannot finish. */
export function wrapDsmallFailure(error: unknown): never {
  if (error instanceof NotMeasured) throw error;
  if (benchTier() === "D-small") throw new NotMeasured(W5_D_SMALL_REASON);
  throw error;
}

/** Starts a real SQLite-backed HTTP+WebSocket Manent server wired with history, air windows, and prompter services. */
export async function startW5Server(options: {
  roomIdleMs: number;
  maxConnections: number;
}): Promise<W5Server> {
  const dataDir = await mkdtemp(join(tmpdir(), "manent-w5-"));
  const storage = openSqliteStorage({
    dir: join(dataDir, "data"),
    now: Date.now,
  });
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(randomBytes(32)),
    now: Date.now,
  });
  const tickets = createTicketStore({ now: Date.now });
  const current = {
    protocol: PROTOCOL_VERSION,
    schema: SCHEMA_VERSION,
    engine: ENGINE_VERSIONS.at(-1)!,
    table: TABLE_VERSION,
  };
  const versions = { current, min: { ...current, engine: ENGINE_VERSION } };
  let syncRef: SyncService | null = null;
  const sync = (): SyncService => {
    if (syncRef === null) throw new Error("sync service not started");
    return syncRef;
  };
  const airWindows = createAirWindows({ clock: browserClock, storage });
  const history = createHistoryService({
    sync,
    storage,
    clock: browserClock,
    ids: nextId,
  });
  const prompter = createPrompterService({
    storage,
    sync,
    history,
    clock: browserClock,
    ids: nextId,
    airWindows,
  });
  let serverRef: ReturnType<typeof createServer> | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    () => {
      if (serverRef === null) throw new Error("server not ready");
      return serverRef;
    },
    () => new Response("internal error", { status: 500 }),
  );
  const host = `127.0.0.1:${listener.port}`;
  const url = `http://${host}`;
  const server = createServer({
    http: { allowedHosts: [host], openUrl: url, webDir: null },
    auth: {
      signIn: {
        describe: () => ({ choices: [] }),
        authenticate: async () => ({ ok: false, reason: "bad_request" }),
      },
      directory: {
        user: (userId) => ({ userId, name: userId }),
        workspacesOf: () => [],
      },
      sessions,
    },
    demo: null,
    socket: { tickets, versions, allowedOrigins: [url] },
    sync: {
      storage,
      clock: browserClock,
      defer: setImmediate,
      ids: nextId,
      hooks: [history, airWindows.hooks, prompter.hooks],
      airWindow: airWindows.isInside,
      airWindowOf: airWindows.windowOf,
      prompterSubscribe: prompter.subscribePrompter,
      limits: {
        ...DEFAULT_LIMITS,
        roomIdleMs: options.roomIdleMs,
        maxLoadedRooms: 512,
        roomLoadsPerSecond: 1_000,
        connectionsPerUser: 64,
        connectionsPerAddress: options.maxConnections,
        subscribersPerDocument: 1_000,
      },
    },
    history,
    prompter,
  });
  serverRef = server;
  syncRef = server.sync;
  return {
    url,
    storage,
    token: (userId) => sessions.issue(userId),
    loadedRooms: () => server.sync?.stats().loadedRooms ?? 0,
    async stop() {
      await listener.stop();
      prompter.stop();
      await server.sync?.shutdown();
      storage.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function appendImport(
  storage: Storage,
  docId: string,
  state: Uint8Array,
): void {
  const clocks = updateMeta(state).map(({ clientId, toClock }) => ({
    clientId,
    clock: toClock,
  }));
  storage.open(HOME).log.append({
    docId,
    generation: 1,
    update: state,
    userId: OWNER,
    origin: "import",
    clocks,
  });
}

/** Places `rundownCount` news rundowns of `rows` rows into `storage`, granting edit/view roles to the supplied users. */
export function seedNewsRundowns(
  storage: Storage,
  options: {
    rundownCount: number;
    rows: (typeof RUNDOWN_ROWS)[number];
    editorUsers: readonly string[];
    viewerUsers: readonly string[];
    insideAirWindow: boolean;
  },
): PlacedRundown[] {
  const placed: PlacedRundown[] = [];
  let nextDoc = 0;
  const now = Date.now();
  const airAt = options.insideAirWindow ? now + 60_000 : now + 7_200_000;
  const windowLeadMs = 3_600_000;
  const targetMs = 3_600_000;

  const built = Array.from({ length: options.rundownCount }, (_, idx) => {
    const corpus = storyRundown({ rows: options.rows, seed: idx + 1 });
    const rundownId = docIdOf(nextDoc++);
    const storyDocIds = corpus.stories.map(() => docIdOf(nextDoc++));
    const storyStates = corpus.stories.map((s) => stateOf(s.doc));
    const doc = createDoc({ clientId: idx + 1 });
    initRundown(
      doc,
      { airDate: "2026-11-25", airAt, windowLeadMs, targetMs },
      STORED_COLUMNS,
    );
    const rowIds: string[] = [];
    const storyRowIds: string[] = [];
    insertRows(
      doc,
      corpus.rows.map((r) => {
        const id = randomBlockId();
        rowIds.push(id);
        if (r.story !== null) storyRowIds.push(id);
        return {
          id,
          kind: r.kind === "header" ? "header" : "script",
          docId: r.story === null ? null : storyDocIds[r.story]!,
          blockId: null,
        };
      }),
      null,
    );
    const rundownState = doc.encodeState();
    doc.destroy();
    return {
      rundownId,
      rowIds,
      storyRowIds,
      storyDocIds,
      storyStates,
      rundownState,
    };
  });

  storage.transaction(() => {
    for (const item of built) {
      const placeDoc = (docId: string, kind: "rundown" | "script"): void => {
        storage.directory.place(docId, HOME, kind, OWNER);
        storage.directory.setRole(docId, OWNER, "owner", CAPABILITIES);
        for (const u of options.editorUsers)
          storage.directory.setRole(docId, u, "edit", []);
        for (const u of options.viewerUsers)
          storage.directory.setRole(docId, u, "view", []);
      };
      placeDoc(item.rundownId, "rundown");
      for (const storyId of item.storyDocIds) placeDoc(storyId, "script");
    }
  });
  const file = storage.open(HOME);
  file.transaction(() => {
    for (const item of built) {
      file.log.create({
        id: item.rundownId,
        kind: "rundown",
        ownerUserId: null,
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
      });
      appendImport(storage, item.rundownId, item.rundownState);
      for (let i = 0; i < item.storyDocIds.length; i++) {
        const storyId = item.storyDocIds[i]!;
        file.log.create({
          id: storyId,
          kind: "script",
          ownerUserId: null,
          schemaVersion: SCHEMA_VERSION,
          engineVersion: ENGINE_VERSION,
        });
        appendImport(storage, storyId, item.storyStates[i]!);
      }
    }
  });

  for (const item of built)
    placed.push({
      rundownId: item.rundownId,
      rowIds: item.rowIds,
      storyRowIds: item.storyRowIds,
      storyDocIds: item.storyDocIds,
    });
  return placed;
}
