// The in-memory storage driver: plain maps, copied on write, with the faults a test can arm.
import { crc32, sha256 } from "../checksum.ts";
import { homeKey, parseHome } from "../home.ts";
import type {
  AppendItem,
  DocFile,
  DocumentRow,
  HealingRow,
  Home,
  Storage,
  UpdateRow,
  VersionRow,
} from "../ports.ts";
import { CHECKPOINTS_KEPT, COLOR_COUNT, StorageError } from "../ports.ts";

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

// Only a document's current generation has rows: `append` refuses any other.
type StoredUpdate = UpdateRow & { crc: number };
type StoredCheckpoint = { generation: number; seq: number; sha: string } & {
  state: Uint8Array;
};

// Values are replaced, never changed in place, so copying a document's maps and lists copies its state.
interface MemoryDoc {
  row: DocumentRow | null;
  updates: StoredUpdate[];
  clients: Map<number, { userId: string; ackedClock: number }>;
  setRequests: Map<string, number>;
  healing: HealingRow | null;
}

interface Logged {
  docs: Map<string, MemoryDoc>;
  versions: VersionRow[];
}

interface MemoryState {
  logs: Map<string, Logged>;
  checkpoints: Map<string, StoredCheckpoint[]>;
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

type Write = <T>(op: (log: Logged) => T) => T;

const copied = <T extends object>(value: T | null | undefined): T | null =>
  value === null || value === undefined ? null : { ...value };
const verifies = (c: StoredCheckpoint) => sha256(c.state).toHex() === c.sha;
const newestFirst = (a: StoredCheckpoint, b: StoredCheckpoint) =>
  b.generation - a.generation || b.seq - a.seq;
const pairKey = (a: string, b: string) => JSON.stringify([a, b]);

const flipFirstByte = (bytes: Uint8Array) =>
  bytes.map((byte, index) => (index === 0 ? byte ^ 0xff : byte));

function checkedKey(home: Home): string {
  const key = homeKey(home);
  if (parseHome(key) !== null) return key;
  throw new RangeError(`a home must be project:<uuid> or user:<id>: ${key}`);
}

const copyDoc = (doc: MemoryDoc | undefined): MemoryDoc => ({
  row: doc?.row ?? null,
  updates: [...(doc?.updates ?? [])],
  clients: new Map(doc?.clients),
  setRequests: new Map(doc?.setRequests),
  healing: doc?.healing ?? null,
});

function docOf(log: Logged, docId: string): MemoryDoc {
  const doc = log.docs.get(docId) ?? copyDoc(undefined);
  log.docs.set(docId, doc);
  return doc;
}

function appendTo(log: Logged, item: AppendItem, createdAt: number): number {
  const { docId, generation, userId, origin, setRequest } = item;
  const doc = log.docs.get(docId);
  if (doc?.row?.generation !== generation)
    throw new RangeError(`no document ${docId} at generation ${generation}`);
  const seq = doc.row.headSeq + 1;
  const update = new Uint8Array(item.update);
  const crc = crc32(update);
  doc.updates.push({ seq, update, userId, origin, createdAt, crc });
  doc.row = { ...doc.row, headSeq: seq };
  for (const { clientId, clock } of item.clocks) {
    const owner = doc.clients.get(clientId) ?? { userId, ackedClock: 0 };
    const ackedClock = Math.max(owner.ackedClock, clock);
    doc.clients.set(clientId, { userId: owner.userId, ackedClock });
  }
  if (setRequest !== undefined) {
    const key = pairKey(userId, setRequest.deviceId);
    const last = doc.setRequests.get(key) ?? 0;
    doc.setRequests.set(key, Math.max(last, setRequest.clientSeq));
  }
  return seq;
}

function readTail(doc: MemoryDoc | undefined, after: number) {
  const rows: UpdateRow[] = [];
  const corrupt: number[] = [];
  for (const { crc, ...row } of doc?.updates ?? []) {
    if (row.seq <= after) continue;
    if (crc32(row.update) !== crc) corrupt.push(row.seq);
    else rows.push({ ...row, update: new Uint8Array(row.update) });
  }
  return { rows, corrupt };
}

// A colour goes to each person in the order of their first client id, which is never removed.
function colorsOf(doc: MemoryDoc | undefined): Map<string, number> {
  const colors = new Map<string, number>();
  for (const { userId } of doc?.clients.values() ?? [])
    if (!colors.has(userId)) colors.set(userId, colors.size % COLOR_COUNT);
  return colors;
}

function createLog(now: () => number, read: () => Logged, write: Write) {
  const doc = (docId: string) => read().docs.get(docId);
  const docLog: DocFile["log"] = {
    create: (input) =>
      copied(doc(input.id)?.row) ??
      write((log) => {
        const row = { ...input, generation: 1, headSeq: 0, locked: 0 };
        const target = docOf(log, input.id);
        target.row = { ...row, createdAt: now(), deletedAt: null };
        return { ...target.row };
      }),
    get: (docId) => copied(doc(docId)?.row),
    append: (item) => write((log) => appendTo(log, item, now())),
    raiseSchema: (docId, toVersion) =>
      write((log) => {
        const target = docOf(log, docId);
        if (target.row !== null && target.row.schemaVersion < toVersion)
          target.row = { ...target.row, schemaVersion: toVersion };
      }),
    tail(docId, generation, afterSeq, options) {
      const current = doc(docId)?.row?.generation === generation;
      const tail = readTail(current ? doc(docId) : undefined, afterSeq);
      const { corrupt } = tail;
      if (corrupt.length === 0 || options?.quarantine === false) return tail;
      write((log) => {
        const target = docOf(log, docId);
        target.updates = target.updates.filter((u) => !corrupt.includes(u.seq));
        for (const seq of corrupt)
          docLog.flagHealing(docId, "quarantine", seq - 1);
      });
      return tail;
    },
    registerClients: (docId, userId, clientIds) =>
      write((log) => {
        const { clients } = docOf(log, docId);
        for (const id of clientIds)
          if (!clients.has(id)) clients.set(id, { userId, ackedClock: 0 });
        return clientIds.filter((id) => clients.get(id)?.userId !== userId);
      }),
    ledger: (docId) => new Map(doc(docId)?.clients),
    colors: (docId) => colorsOf(doc(docId)),
    lastSetRequest: (docId, userId, deviceId) =>
      doc(docId)?.setRequests.get(pairKey(userId, deviceId)) ?? 0,
    healing: (docId) => copied(doc(docId)?.healing),
    flagHealing: (docId, reason, verifiedSeq) =>
      write((log) => {
        const target = docOf(log, docId);
        const fresh = { reason, flaggedAt: now(), preHealVersionId: null };
        const old = target.healing ?? { ...fresh, verifiedSeq };
        const lower = Math.min(old.verifiedSeq, verifiedSeq);
        target.healing = { ...old, verifiedSeq: lower };
      }),
    notePreHeal: (docId, preHealVersionId) =>
      write((log) => {
        const target = docOf(log, docId);
        if (target.healing !== null)
          target.healing = { ...target.healing, preHealVersionId };
      }),
  };
  return docLog;
}

function createCheckpoints(memory: () => MemoryState): DocFile["checkpoints"] {
  const stored = (docId: string) => memory().checkpoints.get(docId) ?? [];
  const keep = (docId: string, kept: (c: StoredCheckpoint) => boolean) =>
    memory().checkpoints.set(docId, stored(docId).filter(kept));
  const ofGeneration = (docId: string, generation: number) =>
    stored(docId)
      .filter((c) => c.generation === generation)
      .toSorted(newestFirst);
  return {
    put(docId, generation, seq, state) {
      const sha = sha256(state).toHex();
      keep(docId, (c) => c.generation !== generation || c.seq !== seq);
      const copy = new Uint8Array(state);
      stored(docId).push({ generation, seq, sha, state: copy });
      const older = ofGeneration(docId, generation).slice(CHECKPOINTS_KEPT);
      keep(docId, (c) => !older.includes(c));
    },
    newest(docId, generation) {
      const candidates = ofGeneration(docId, generation);
      const index = candidates.findIndex(verifies);
      const failed = index < 0 ? candidates : candidates.slice(0, index);
      keep(docId, (c) => !failed.includes(c));
      const found = candidates[index];
      if (found === undefined) return null;
      return { seq: found.seq, state: new Uint8Array(found.state) };
    },
  };
}

function openFile(ctx: Context, home: Home, key: string): DocFile {
  const logs = () => ctx.state().logs;
  const file = (): Logged => {
    const stored = logs().get(key) ?? { docs: new Map(), versions: [] };
    logs().set(key, stored);
    return stored;
  };
  let work: Logged | null = null;
  const read = () => work ?? file();
  // a lone write is a transaction of one
  const write: Write = (op) => transaction(() => op(read()));
  function transaction<T>(fn: () => T): T {
    if (work !== null) return fn();
    const { docs, versions } = file();
    const copy = { docs: new Map(docs), versions: [...versions] };
    for (const [docId, doc] of docs) copy.docs.set(docId, copyDoc(doc));
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
  const versions = {
    add: (version: VersionRow) => write((l) => l.versions.push({ ...version })),
    // newest first; of two made at the same moment, the one added later
    list: (docId: string) =>
      read()
        .versions.filter((v) => v.docId === docId)
        .toReversed()
        .toSorted((a, b) => b.createdAt - a.createdAt)
        .map((v) => ({ ...v })),
  };
  const log = createLog(ctx.now, read, write);
  const checkpoints = createCheckpoints(ctx.state);
  return { home: { ...home }, log, versions, checkpoints, transaction };
}

function createDirectory(ctx: Context): Storage["directory"] {
  const { now, state, commit } = ctx;
  const placed = (docId: string) => {
    const place = state().places.get(docId);
    return place === undefined ? null : { ...place, home: { ...place.home } };
  };
  return {
    place(docId, home, kind) {
      checkedKey(home);
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

function corruptRow(state: MemoryState, docId: string, seq: number): void {
  for (const log of state.logs.values()) {
    const updates = log.docs.get(docId)?.updates ?? [];
    const index = updates.findIndex((u) => u.seq === seq);
    const row = updates[index];
    if (row !== undefined)
      updates[index] = { ...row, update: flipFirstByte(row.update) };
  }
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
      const key = checkedKey(home);
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
    corruptRow: (docId, seq) => corruptRow(state, docId, seq),
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
