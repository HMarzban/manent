// The in-memory driver's version history: pages, snapshots, chunks, summaries, requests and frozen-log purge.
import type {
  DocFile,
  VersionCursor,
  VersionRow,
  VersionSummary,
} from "../ports/index.ts";
import { copied, pairKey } from "./memory-log.ts";
import type { Logged, Write } from "./memory-log.ts";

// Newest first, by createdAt then id, as the SQLite driver's page index orders them.
const byPage = (a: VersionRow, b: VersionRow) =>
  b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const isBefore = (v: VersionRow, cursor: VersionCursor) =>
  v.createdAt < cursor.createdAt ||
  (v.createdAt === cursor.createdAt && v.id < cursor.id);

const copySummary = (summary: VersionSummary): VersionSummary => ({
  authorIds: [...summary.authorIds],
  blockIds: [...summary.blockIds],
  sceneIds: [...summary.sceneIds],
});

function purgeIn(log: Logged, docId: string, generation: number): number {
  const doc = log.docs.get(docId);
  if (doc === undefined || doc.row === null || generation >= doc.row.generation)
    throw new RangeError(`generation ${generation} of ${docId} is not frozen`);
  const before = doc.updates.length;
  doc.updates = doc.updates.filter((u) => u.generation !== generation);
  doc.generations = doc.generations.map((g) =>
    g.generation === generation ? { ...g, finalState: null } : g,
  );
  return before - doc.updates.length;
}

function comparePos(
  a: { generation: number; seq: number },
  b: { generation: number; seq: number },
): number {
  return a.generation - b.generation || a.seq - b.seq;
}

export function createHistory(
  read: () => Logged,
  write: Write,
): DocFile["history"] {
  const pageRows = (
    docId: string,
    before: VersionCursor | null,
    limit: number,
  ): VersionRow[] =>
    read()
      .versions.filter(
        (v) => v.docId === docId && (before === null || isBefore(v, before)),
      )
      .toSorted(byPage)
      .slice(0, limit);

  return {
    page: (docId, before, limit) =>
      pageRows(docId, before, limit).map((v) => ({ ...v })),
    pageDetails(docId, before, limit) {
      const log = read();
      return pageRows(docId, before, limit).map((v) => {
        const snapshot = log.snapshots.get(v.id);
        const summary = log.summaries.get(v.id);
        return {
          ...v,
          snapshotRef: snapshot?.ref ?? null,
          engineVersion: snapshot?.engineVersion ?? null,
          summary: summary === undefined ? null : copySummary(summary),
        };
      });
    },
    get: (versionId) => copied(read().versions.find((v) => v.id === versionId)),
    snapshotOf: (versionId) => copied(read().snapshots.get(versionId)),
    latestSnapshotAtOrBefore(docId, at) {
      const log = read();
      const ordered = log.versions
        .filter((v) => v.docId === docId)
        .toReversed()
        .toSorted((a, b) => b.createdAt - a.createdAt);
      let newest: {
        ref: string;
        engineVersion: number | null;
        pos: { generation: number; seq: number };
      } | null = null;
      for (const v of ordered) {
        if (v.generation === null || v.seq === null) continue;
        const pos = { generation: v.generation, seq: v.seq };
        if (comparePos(pos, at) > 0) continue;
        if (newest !== null && comparePos(pos, newest.pos) <= 0) continue;
        const snap = log.snapshots.get(v.id);
        if (snap !== undefined) newest = { ...snap, pos };
      }
      return newest === null
        ? null
        : { ref: newest.ref, engineVersion: newest.engineVersion };
    },
    setSnapshot: (versionId, ref, engineVersion) =>
      write((log) => {
        // an unknown version is left alone, as an UPDATE that matches no row
        if (log.versions.some((v) => v.id === versionId))
          log.snapshots.set(versionId, { ref, engineVersion });
      }),
    remove: (versionIds) =>
      write((log) => {
        log.versions = log.versions.filter((v) => !versionIds.includes(v.id));
        for (const id of versionIds) {
          log.snapshots.delete(id);
          log.summaries.delete(id);
        }
      }),
    putChunk: (hash, body) =>
      write((log) => {
        if (!log.chunks.has(hash.toHex()))
          log.chunks.set(hash.toHex(), new Uint8Array(body));
      }),
    chunk(hash) {
      const body = read().chunks.get(hash.toHex());
      return body === undefined ? null : new Uint8Array(body);
    },
    chunkHashes: () =>
      [...read().chunks.keys()]
        .toSorted()
        .map((hex) => Uint8Array.fromHex(hex)),
    removeChunks: (hashes) =>
      write((log) => {
        for (const hash of hashes) log.chunks.delete(hash.toHex());
      }),
    summary(versionId) {
      const summary = read().summaries.get(versionId);
      return summary === undefined ? null : copySummary(summary);
    },
    setSummary: (versionId, summary) =>
      write((log) => void log.summaries.set(versionId, copySummary(summary))),
    request: (docId, key) => copied(read().requests.get(pairKey(docId, key))),
    putRequest: (row) =>
      write((log) => {
        const at = pairKey(row.docId, row.key);
        if (log.requests.has(at))
          throw new RangeError(
            `history request key ${row.key} is already stored`,
          );
        log.requests.set(at, { ...row });
      }),
    purgeLog: (docId, generation) =>
      write((log) => purgeIn(log, docId, generation)),
  };
}
