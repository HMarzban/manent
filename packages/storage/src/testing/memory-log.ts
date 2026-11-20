// The in-memory driver's document files: each document's row, updates, ledger and generations, the replays and the adoptions.
import { crc32 } from "../checksum.ts";
import type {
  Adoption,
  AppendItem,
  DocFile,
  DocumentRow,
  FreezeItem,
  GenerationRow,
  HealingRow,
  ReplayRow,
  UpdateRow,
  VersionRow,
} from "../ports.ts";
import { COLOR_COUNT } from "../ports.ts";

type StoredUpdate = UpdateRow & { generation: number; crc: number };

// Values are replaced, never changed in place, so copying a document's maps and lists copies its state.
interface MemoryDoc {
  row: DocumentRow | null;
  updates: StoredUpdate[];
  clients: Map<number, { userId: string; ackedClock: number }>;
  colors: Map<string, number>;
  setRequests: Map<string, number>;
  healing: HealingRow | null;
  generations: GenerationRow[];
}

/** One document file's contents. */
export interface Logged {
  docs: Map<string, MemoryDoc>;
  versions: VersionRow[];
  replays: Map<string, ReplayRow>;
  adoptions: Map<string, Adoption>;
}

/** Runs `op` on the file's contents as one commit, or inside the transaction already open. */
export type Write = <T>(op: (log: Logged) => T) => T;

export const copied = <T extends object>(
  value: T | null | undefined,
): T | null => (value === null || value === undefined ? null : { ...value });
export const pairKey = (a: string, b: string): string => JSON.stringify([a, b]);

export const flipFirstByte = (bytes: Uint8Array): Uint8Array =>
  bytes.map((byte, index) => (index === 0 ? byte ^ 0xff : byte));

const copyDoc = (doc: MemoryDoc | undefined): MemoryDoc => ({
  row: doc?.row ?? null,
  updates: [...(doc?.updates ?? [])],
  clients: new Map(doc?.clients),
  colors: new Map(doc?.colors),
  setRequests: new Map(doc?.setRequests),
  healing: doc?.healing ?? null,
  generations: [...(doc?.generations ?? [])],
});

const copyGeneration = (row: GenerationRow): GenerationRow => ({
  ...row,
  finalState: row.finalState === null ? null : new Uint8Array(row.finalState),
});

function docOf(log: Logged, docId: string): MemoryDoc {
  const doc = log.docs.get(docId) ?? copyDoc(undefined);
  log.docs.set(docId, doc);
  return doc;
}

// A client id nobody holds is registered to `userId`, who gets a colour with their first one, which never changes.
function register(doc: MemoryDoc, clientId: number, userId: string): void {
  if (doc.clients.has(clientId)) return;
  doc.clients.set(clientId, { userId, ackedClock: 0 });
  if (!doc.colors.has(userId))
    doc.colors.set(userId, doc.colors.size % COLOR_COUNT);
}

function appendTo(log: Logged, item: AppendItem, createdAt: number): number {
  const { docId, generation, userId, origin, setRequest } = item;
  const doc = log.docs.get(docId);
  if (doc?.row?.generation !== generation)
    throw new RangeError(`no document ${docId} at generation ${generation}`);
  const seq = doc.row.headSeq + 1;
  const update = new Uint8Array(item.update);
  const crc = crc32(update);
  doc.updates.push({ generation, seq, update, userId, origin, createdAt, crc });
  doc.row = { ...doc.row, headSeq: seq };
  for (const { clientId, clock } of item.clocks) {
    register(doc, clientId, userId);
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

// Closes the document's generation as `Generations.freeze` says, inside the caller's write.
function freezeIn(log: Logged, item: FreezeItem, at: number): number {
  const { docId, finalSeq, initialUpdate, userId, rebuiltByClientId } = item;
  const doc = log.docs.get(docId);
  if (doc === undefined || doc.row === null)
    throw new RangeError(`no document ${docId}`);
  const { row } = doc;
  if (row.headSeq !== finalSeq)
    throw new RangeError(
      `a generation closes at its head ${row.headSeq}, not at ${finalSeq}`,
    );
  const closed: GenerationRow = {
    docId,
    generation: row.generation,
    finalSeq,
    finalState: new Uint8Array(item.finalState),
    frozenAt: item.frozenAt,
    purgeAfter: item.purgeAfter,
    reason: item.reason,
    nextInitialBytes: initialUpdate.length,
    rebuiltByClientId,
  };
  doc.generations = [...doc.generations, closed];
  const generation = row.generation + 1;
  doc.row = { ...row, generation, headSeq: 0 };
  for (const [clientId, owner] of doc.clients)
    doc.clients.set(clientId, { ...owner, ackedClock: 0 });
  // the system takes no colour
  if (!doc.clients.has(rebuiltByClientId))
    doc.clients.set(rebuiltByClientId, { userId, ackedClock: 0 });
  const first = { docId, generation, update: initialUpdate, userId };
  appendTo(log, { ...first, origin: "system", clocks: [] }, at);
  return generation;
}

function readTail(
  doc: MemoryDoc | undefined,
  generation: number,
  after: number,
) {
  const rows: UpdateRow[] = [];
  const corrupt: number[] = [];
  for (const { crc, generation: of, ...row } of doc?.updates ?? []) {
    if (of !== generation || row.seq <= after) continue;
    if (crc32(row.update) !== crc) corrupt.push(row.seq);
    else rows.push({ ...row, update: new Uint8Array(row.update) });
  }
  return { rows, corrupt };
}

export function createLog(
  now: () => number,
  read: () => Logged,
  write: Write,
): DocFile["log"] {
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
      const tail = readTail(doc(docId), generation, afterSeq);
      const { corrupt } = tail;
      if (corrupt.length === 0 || options?.quarantine === false) return tail;
      const isCorrupt = (u: StoredUpdate) =>
        u.generation === generation && corrupt.includes(u.seq);
      write((log) => {
        const target = docOf(log, docId);
        target.updates = target.updates.filter((u) => !isCorrupt(u));
        for (const seq of corrupt)
          docLog.flagHealing(docId, "quarantine", seq - 1);
      });
      return tail;
    },
    registerClients: (docId, userId, clientIds) =>
      write((log) => {
        const target = docOf(log, docId);
        for (const id of clientIds) register(target, id, userId);
        return clientIds.filter(
          (id) => target.clients.get(id)?.userId !== userId,
        );
      }),
    ledger: (docId) =>
      new Map([...(doc(docId)?.clients ?? [])].toSorted(([a], [b]) => a - b)),
    colors: (docId) => new Map(doc(docId)?.colors),
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

export function createGenerations(
  now: () => number,
  read: () => Logged,
  write: Write,
): DocFile["generations"] {
  const generationsOf = (docId: string) =>
    read().docs.get(docId)?.generations ?? [];
  return {
    freeze: (item) => write((log) => freezeIn(log, item, now())),
    get(docId, generation) {
      const found = generationsOf(docId).find(
        (g) => g.generation === generation,
      );
      return found === undefined ? null : copyGeneration(found);
    },
    list: (docId) => generationsOf(docId).map(copyGeneration),
  };
}

export function createReplays(
  read: () => Logged,
  write: Write,
): DocFile["replays"] {
  return {
    get: (docId, key) => copied(read().replays.get(pairKey(docId, key))),
    put: (row) =>
      write((log) => {
        const at = pairKey(row.docId, row.key);
        if (log.replays.has(at))
          throw new RangeError(`replay key ${row.key} is already stored`);
        log.replays.set(at, { ...row });
      }),
  };
}

export function createAdoptions(
  read: () => Logged,
  write: Write,
): DocFile["adoptions"] {
  return {
    get: (docId) => copied(read().adoptions.get(docId)),
    put: (adoption) =>
      write((log) => {
        if (!log.adoptions.has(adoption.docId))
          log.adoptions.set(adoption.docId, { ...adoption });
      }),
  };
}

/** A copy that a transaction may change without touching `log`. */
export function copyLogged(log: Logged | undefined): Logged {
  const docs = new Map<string, MemoryDoc>();
  for (const [docId, doc] of log?.docs ?? []) docs.set(docId, copyDoc(doc));
  const versions = [...(log?.versions ?? [])];
  const replays = new Map(log?.replays);
  return { docs, versions, replays, adoptions: new Map(log?.adoptions) };
}

export function corruptRow(
  logs: Iterable<Logged>,
  docId: string,
  seq: number,
): void {
  for (const log of logs) {
    const doc = log.docs.get(docId);
    if (doc === undefined) continue;
    // every generation's row, as the SQLite driver's hook damages them
    doc.updates = doc.updates.map((u) =>
      u.seq === seq ? { ...u, update: flipFirstByte(u.update) } : u,
    );
  }
}
