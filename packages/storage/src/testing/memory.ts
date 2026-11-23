// The in-memory storage driver: plain maps, copied on write, with the faults a test can arm.
import { sha256 } from "../checksum.ts";
import { homeKey, parseHome, wellFormedKey } from "../home.ts";
import type { DocFile, Home, MeasureRow, Storage } from "../ports/index.ts";
import { CHECKPOINTS_KEPT, StorageError } from "../ports/index.ts";
import type { Write } from "./memory-log.ts";
import type { ControlTables, FileParts } from "./memory-stores.ts";
import {
  copyParts,
  createControlStores,
  createControlTables,
  createFileStores,
} from "./memory-stores.ts";
import {
  copied,
  corruptRow,
  createAdoptions,
  createGenerations,
  createHistory,
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
  /** The next transaction or lone write throws StorageError with `code`, by default "commit_failed", writing nothing. */
  failNextCommit(code?: "commit_failed" | "disk_full"): void;
  /** While full, every transaction and lone write throws StorageError("disk_full") and writes nothing. */
  fillDisk(full: boolean): void;
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
  /** By file. */
  files: Map<string, FileParts>;
  checkpoints: Map<string, StoredCheckpoint[]>;
  /** By version id. */
  pins: Map<string, { docId: string; generation: number; seq: number }>;
  measures: Map<string, MeasureRow>;
  places: Map<string, { home: Home; kind: string }>;
  roles: Map<
    string,
    { docId: string; userId: string; role: string; capabilities: string[] }
  >;
  tombstones: Map<string, { deletedByUserId: string; deletedAt: number }>;
  control: ControlTables;
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
  // for each pin of the generation, the newest checkpoint at or before its seq
  const pinned = (docId: string, generation: number) =>
    [...memory().pins.values()]
      .filter((p) => p.docId === docId && p.generation === generation)
      .flatMap((p) =>
        ofGeneration(docId, generation)
          .filter((c) => c.seq <= p.seq)
          .slice(0, 1),
      );
  const checkpoints: DocFile["checkpoints"] = {
    put(docId, generation, seq, state) {
      const sha = sha256(state).toHex();
      keep(docId, (c) => c.generation !== generation || c.seq !== seq);
      const copy = new Uint8Array(state);
      stored(docId).push({ generation, seq, sha, state: copy });
      const kept = pinned(docId, generation);
      const older = ofGeneration(docId, generation)
        .slice(CHECKPOINTS_KEPT)
        .filter((c) => !kept.includes(c));
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
    pin: (versionId, docId, generation, seq) =>
      void memory().pins.set(versionId, { docId, generation, seq }),
    unpin(versionIds) {
      for (const versionId of versionIds) memory().pins.delete(versionId);
    },
    purge(docId, generation) {
      keep(docId, (c) => c.generation !== generation);
      for (const [versionId, p] of memory().pins)
        if (p.docId === docId && p.generation === generation)
          memory().pins.delete(versionId);
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

// The file's contents as committed, made empty on first use.
function storedParts(ctx: Context, key: string): FileParts {
  const { files } = ctx.state();
  const parts = files.get(key) ?? copyParts();
  files.set(key, parts);
  return parts;
}

function openFile(ctx: Context, home: Home, key: string): DocFile {
  let work: FileParts | null = null;
  const parts = () => work ?? storedParts(ctx, key);
  const read = () => parts().log;
  // a lone write is a transaction of one
  const write: Write = (op) => transaction(() => op(read()));
  const partOf = <K extends keyof FileParts>(part: K) => ({
    read: () => parts()[part],
    write: <T>(op: (tables: FileParts[K]) => T): T =>
      transaction(() => op(parts()[part])),
  });
  function transaction<T>(fn: () => T): T {
    if (work !== null) return fn();
    const copy = copyParts(storedParts(ctx, key));
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
    ctx.commit(() => ctx.state().files.set(key, copy));
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
    history: createHistory(read, write),
    checkpoints: createCheckpoints(ctx.state),
    generations: createGenerations(ctx.now, read, write),
    replays: createReplays(read, write),
    measures: createMeasures(ctx.state),
    adoptions: createAdoptions(read, write),
    ...createFileStores({
      partOf,
      setLocked: (docId, locked) =>
        write((l) => {
          const doc = l.docs.get(docId);
          if (doc?.row) doc.row = { ...doc.row, locked: Number(locked) };
        }),
    }),
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
        const row = { docId, userId, role, capabilities: [...capabilities] };
        state().roles.set(pairKey(docId, userId), row);
      }),
    removeRole: (docId, userId) =>
      commit(() => state().roles.delete(pairKey(docId, userId))),
    roleOf(docId, userId) {
      const row = state().roles.get(pairKey(docId, userId));
      if (row === undefined) return null;
      return { role: row.role, capabilities: [...row.capabilities] };
    },
    rolesOf: (docId) =>
      [...state().roles.values()]
        .filter((row) => row.docId === docId)
        .map(({ userId, role, capabilities }) => ({
          userId,
          role,
          capabilities: [...capabilities],
        }))
        .toSorted((a, b) => (a.userId < b.userId ? -1 : 1)),
    hasRoleBesides: (docId, userId) =>
      [...state().roles.values()].some(
        (row) => row.docId === docId && row.userId !== userId,
      ),
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
    files: new Map(),
    checkpoints: new Map(),
    pins: new Map(),
    measures: new Map(),
    places: new Map(),
    roles: new Map(),
    tombstones: new Map(),
    control: createControlTables(),
  };
  let failNext: "commit_failed" | "disk_full" | null = null;
  let crash: "before" | "after" | null = null;
  let diskFull = false;
  let commits = 0;
  const ctx: Context = {
    now: options.now,
    state: () => state,
    commit(apply) {
      // a full disk leaves the armed faults for the first commit that gets through
      if (diskFull) throw new StorageError("disk_full");
      const [fail, armed] = [failNext, crash];
      [failNext, crash] = [null, null];
      if (fail !== null) throw new StorageError(fail);
      if (armed === "before") throw new SimulatedCrash("crash before commit");
      const result = apply();
      commits += 1;
      if (armed === "after") throw new SimulatedCrash("crash after commit");
      return result;
    },
  };
  const files = new Map<string, DocFile>();
  const snapshots = new WeakMap<object, MemoryState>();
  const directory = createDirectory(ctx);
  return {
    directory,
    ...createControlStores({
      now: ctx.now,
      read: () => state.control,
      commit: ctx.commit,
      directory,
    }),
    open(home) {
      const key = wellFormedKey(home);
      const opened = files.get(key) ?? openFile(ctx, home, key);
      files.set(key, opened);
      return opened;
    },
    close() {},
    failNextCommit(code = "commit_failed") {
      failNext = code;
    },
    fillDisk(full) {
      diskFull = full;
    },
    crashOnCommit(when) {
      crash = when;
    },
    corruptRow: (docId, seq) =>
      corruptRow(
        [...state.files.values()].map((parts) => parts.log),
        docId,
        seq,
      ),
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
