// The in-memory storage driver: plain maps, copied on write, with the faults a test can arm.
import { sha256 } from "../checksum.ts";
import { homeKey, parseHome, wellFormedKey } from "../home.ts";
import type { DocFile, Home, MeasureRow, Storage } from "../ports.ts";
import { CHECKPOINTS_KEPT, StorageError } from "../ports.ts";
import type { Logged, Write } from "./memory-log.ts";
import {
  copied,
  copyLogged,
  corruptRow,
  createGenerations,
  createLog,
  createReplays,
  flipFirstByte,
  pairKey,
} from "./memory-log.ts";

/** Thrown by an armed `crashOnCommit`, standing for the process dying at that point. */
export class SimulatedCrash extends Error {
  override name = "SimulatedCrash";
}

export interface MemoryStorage extends Storage {
  /** The next transaction or lone write throws StorageError("commit_failed"), writing nothing. */
  failNextCommit(): void;
  /** The next transaction or lone write throws SimulatedCrash before, or after, it has committed; null disarms. */
  crashOnCommit(when: "before" | "after" | null): void;
  /** Flips the first byte of a stored update, leaving its checksum. */
  corruptRow(docId: string, seq: number): void;
  /** Flips the first byte of the newest checkpoint whose hash still verifies. */
  corruptCheckpoint(docId: string): void;
  /** A deep copy of everything stored, which only `restore` of this storage reads. */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  /** Transactions and lone writes committed so far. */
  commits(): number;
}

type StoredCheckpoint = { generation: number; seq: number; sha: string } & {
  state: Uint8Array;
};

interface MemoryState {
  logs: Map<string, Logged>;
  checkpoints: Map<string, StoredCheckpoint[]>;
  measures: Map<string, MeasureRow>;
  places: Map<string, { home: Home; kind: string }>;
  roles: Map<string, { role: string; capabilities: string[] }>;
  tombstones: Map<string, { deletedByUserId: string; deletedAt: number }>;
}

interface Context {
  now: () => number;
  state: () => MemoryState;
  /** Runs `apply` as one commit, through whatever fault is armed. */
  commit<T>(apply: () => T): T;
}

const verifies = (c: StoredCheckpoint) => sha256(c.state).toHex() === c.sha;
const newestFirst = (a: StoredCheckpoint, b: StoredCheckpoint) =>
  b.generation - a.generation || b.seq - a.seq;

function createCheckpoints(memory: () => MemoryState): DocFile["checkpoints"] {
  const stored = (docId: string) => memory().checkpoints.get(docId) ?? [];
  const keep = (docId: string, kept: (c: StoredCheckpoint) => boolean) =>
    memory().checkpoints.set(docId, stored(docId).filter(kept));
  const ofGeneration = (docId: string, generation: number) =>
    stored(docId)
      .filter((c) => c.generation === generation)
      .toSorted(newestFirst);
  const checkpoints: DocFile["checkpoints"] = {
    put(docId, generation, seq, state) {
      const sha = sha256(state).toHex();
      keep(docId, (c) => c.generation !== generation || c.seq !== seq);
      const copy = new Uint8Array(state);
      stored(docId).push({ generation, seq, sha, state: copy });
      const older = ofGeneration(docId, generation).slice(CHECKPOINTS_KEPT);
      keep(docId, (c) => !older.includes(c));
    },
    newest: (docId, generation) =>
      checkpoints.atOrBefore(docId, generation, Number.MAX_SAFE_INTEGER),
    atOrBefore(docId, generation, seq) {
      const candidates = ofGeneration(docId, generation).filter(
        (c) => c.seq <= seq,
      );
      const index = candidates.findIndex(verifies);
      const failed = index < 0 ? candidates : candidates.slice(0, index);
      keep(docId, (c) => !failed.includes(c));
      const found = candidates[index];
      if (found === undefined) return null;
      return { seq: found.seq, state: new Uint8Array(found.state) };
    },
  };
  return checkpoints;
}

const measureKey = (docId: string, generation: number) =>
  pairKey(docId, String(generation));

function createMeasures(memory: () => MemoryState): DocFile["measures"] {
  return {
    put: (docId, generation, row) =>
      void memory().measures.set(measureKey(docId, generation), { ...row }),
    get: (docId, generation) =>
      copied(memory().measures.get(measureKey(docId, generation))),
  };
}

function openFile(ctx: Context, home: Home, key: string): DocFile {
  const logs = () => ctx.state().logs;
  const file = (): Logged => {
    const stored = logs().get(key) ?? copyLogged(undefined);
    logs().set(key, stored);
    return stored;
  };
  let work: Logged | null = null;
  const read = () => work ?? file();
  // a lone write is a transaction of one
  const write: Write = (op) => transaction(() => op(read()));
  function transaction<T>(fn: () => T): T {
    if (work !== null) return fn();
    const copy = copyLogged(file());
    work = copy;
    let result: T;
    try {
      result = fn();
    } catch (error) {
      if (error instanceof RangeError) throw error;
      throw new StorageError("commit_failed", { cause: error });
    } finally {
      work = null;
    }
    ctx.commit(() => logs().set(key, copy));
    return result;
  }
  const versions: DocFile["versions"] = {
    add: (version) => write((l) => l.versions.push({ ...version })),
    // newest first; of two made at the same moment, the one added later
    list: (docId) =>
      read()
        .versions.filter((v) => v.docId === docId)
        .toReversed()
        .toSorted((a, b) => b.createdAt - a.createdAt)
        .map((v) => ({ ...v })),
  };
  return {
    home: { ...home },
    log: createLog(ctx.now, read, write),
    versions,
    checkpoints: createCheckpoints(ctx.state),
    generations: createGenerations(ctx.now, read, write),
    replays: createReplays(read, write),
    measures: createMeasures(ctx.state),
    transaction,
  };
}

function createDirectory(ctx: Context): Storage["directory"] {
  const { now, state, commit } = ctx;
  const placed = (docId: string) => {
    const place = state().places.get(docId);
    return place === undefined ? null : { ...place, home: { ...place.home } };
  };
  return {
    place(docId, home, kind) {
      wellFormedKey(home);
      const existing = placed(docId);
      if (existing !== null) return { ...existing, created: false };
      commit(() => state().places.set(docId, { home: { ...home }, kind }));
      return { home: { ...home }, kind, created: true };
    },
    placeOf: placed,
    documentsIn: (home) =>
      [...state().places]
        .filter(([, place]) => homeKey(place.home) === homeKey(home))
        .map(([docId]) => docId)
        .toSorted(),
    homes: () =>
      [...new Set([...state().places.values()].map((p) => homeKey(p.home)))]
        .toSorted()
        .flatMap((key) => parseHome(key) ?? []),
    setRole: (docId, userId, role, capabilities) =>
      commit(() => {
        const row = { role, capabilities: [...capabilities] };
        state().roles.set(pairKey(docId, userId), row);
      }),
    removeRole: (docId, userId) =>
      commit(() => state().roles.delete(pairKey(docId, userId))),
    roleOf(docId, userId) {
      const row = state().roles.get(pairKey(docId, userId));
      if (row === undefined) return null;
      return { role: row.role, capabilities: [...row.capabilities] };
    },
    tombstone(docId, deletedByUserId) {
      const row = { deletedByUserId, deletedAt: now() };
      if (!state().tombstones.has(docId))
        commit(() => state().tombstones.set(docId, row));
    },
    tombstoneOf: (docId) => copied(state().tombstones.get(docId)),
  };
}

function corruptCheckpoint(state: MemoryState, docId: string): void {
  const stored = state.checkpoints.get(docId) ?? [];
  const newest = stored.filter(verifies).toSorted(newestFirst)[0];
  if (newest === undefined) return;
  const damaged = { ...newest, state: flipFirstByte(newest.state) };
  stored[stored.indexOf(newest)] = damaged;
}

/** A storage that keeps everything in memory; every `…At` value is `options.now()` at the moment of the write. */
export function createMemoryStorage(options: {
  now: () => number;
}): MemoryStorage {
  let state: MemoryState = {
    logs: new Map(),
    checkpoints: new Map(),
    measures: new Map(),
    places: new Map(),
    roles: new Map(),
    tombstones: new Map(),
  };
  let failNext = false;
  let crash: "before" | "after" | null = null;
  let commits = 0;
  const ctx: Context = {
    now: options.now,
    state: () => state,
    commit(apply) {
      const [fail, armed] = [failNext, crash];
      [failNext, crash] = [false, null];
      if (fail) throw new StorageError("commit_failed");
      if (armed === "before") throw new SimulatedCrash("crash before commit");
      const result = apply();
      commits += 1;
      if (armed === "after") throw new SimulatedCrash("crash after commit");
      return result;
    },
  };
  const files = new Map<string, DocFile>();
  const snapshots = new WeakMap<object, MemoryState>();
  return {
    directory: createDirectory(ctx),
    open(home) {
      const key = wellFormedKey(home);
      const opened = files.get(key) ?? openFile(ctx, home, key);
      files.set(key, opened);
      return opened;
    },
    close() {},
    failNextCommit() {
      failNext = true;
    },
    crashOnCommit(when) {
      crash = when;
    },
    corruptRow: (docId, seq) => corruptRow(state.logs.values(), docId, seq),
    corruptCheckpoint: (docId) => corruptCheckpoint(state, docId),
    snapshot() {
      const handle = Object.freeze({});
      snapshots.set(handle, structuredClone(state));
      return handle;
    },
    restore(snapshot) {
      const saved = snapshot instanceof Object && snapshots.get(snapshot);
      if (!saved) throw new TypeError("a snapshot must come from this storage");
      state = structuredClone(saved);
    },
    commits: () => commits,
  };
}
