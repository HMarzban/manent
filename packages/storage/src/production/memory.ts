// The production tables of one document file kept in memory, for the in-memory driver.
import type {
  AnchorRow,
  IssueRow,
  ProductionRow,
  ProductionStore,
  RequestRow,
  RevisionSetRow,
  SceneNumberRow,
  SetBlockRow,
} from "./ports.ts";

interface Position {
  generation: number;
  seq: number;
}

/** An anchor row and the range of positions it holds: from `from` up to, not including, `to`; `to` null while open. */
interface StoredAnchor {
  docId: string;
  row: AnchorRow;
  from: Position;
  to: Position | null;
}

/** One document file's production rows. Values are replaced, never changed in place, so copying the lists and maps copies the state. */
export interface ProductionTables {
  /** By docId. */
  rows: Map<string, ProductionRow>;
  anchors: StoredAnchor[];
  sets: RevisionSetRow[];
  /** By setId. */
  setBlocks: Map<string, SetBlockRow[]>;
  issues: IssueRow[];
  /** By docId, then blockId. */
  sceneNumbers: Map<string, ReadonlyMap<string, SceneNumberRow>>;
  requests: RequestRow[];
}

/** A copy that a transaction may change without touching `tables`. */
export function copyProductionTables(
  tables: ProductionTables | undefined,
): ProductionTables {
  return {
    rows: new Map(tables?.rows),
    anchors: [...(tables?.anchors ?? [])],
    sets: [...(tables?.sets ?? [])],
    setBlocks: new Map(tables?.setBlocks),
    issues: [...(tables?.issues ?? [])],
    sceneNumbers: new Map(tables?.sceneNumbers),
    requests: [...(tables?.requests ?? [])],
  };
}

const isBefore = (a: Position, b: Position) =>
  a.generation < b.generation ||
  (a.generation === b.generation && a.seq < b.seq);

const isInRange = (anchor: StoredAnchor, at: Position) =>
  !isBefore(at, anchor.from) && (anchor.to === null || isBefore(at, anchor.to));

const byPage = (a: StoredAnchor, b: StoredAnchor) =>
  a.row.level - b.row.level || a.row.order - b.row.order;
const byStart = (a: StoredAnchor, b: StoredAnchor) =>
  a.from.generation - b.from.generation ||
  a.from.seq - b.from.seq ||
  byPage(a, b);
const byBlock = (a: { blockId: string }, b: { blockId: string }) =>
  a.blockId < b.blockId ? -1 : a.blockId > b.blockId ? 1 : 0;

const withRange = ({ row, from, to }: StoredAnchor) => ({
  ...structuredClone(row),
  fromGeneration: from.generation,
  fromSeq: from.seq,
  toGeneration: to?.generation ?? null,
  toSeq: to?.seq ?? null,
});

// Closes the open table at `at` and opens `rows` from it; RangeError unless `at` is after every position the history already holds.
function replaceIn(
  tables: ProductionTables,
  docId: string,
  rows: readonly AnchorRow[],
  at: Position,
): void {
  const from = { ...at };
  const isOpen = (a: StoredAnchor) => a.docId === docId && a.to === null;
  // a closed row's end counts too: an empty table leaves no open row to mark where it starts
  const isHeldFrom = (a: StoredAnchor) =>
    a.docId === docId &&
    (!isBefore(a.from, from) || (a.to !== null && !isBefore(a.to, from)));
  if (tables.anchors.some(isHeldFrom))
    throw new RangeError(
      `the anchor table of ${docId} replaced at ${from.generation}:${from.seq} does not follow its history`,
    );
  const opened = rows.map((row) => ({
    docId,
    row: structuredClone(row),
    from,
    to: null,
  }));
  tables.anchors = [
    ...tables.anchors.map((a) => (isOpen(a) ? { ...a, to: from } : a)),
    ...opened,
  ];
}

/**
 * The production store over `read` and `write`, which give the file's tables as one transaction sees them;
 * `setLocked` writes the document row the driver keeps elsewhere.
 */
export function createMemoryProduction(options: {
  read: () => ProductionTables;
  write: <T>(op: (tables: ProductionTables) => T) => T;
  setLocked: (docId: string, locked: boolean) => void;
}): ProductionStore {
  const { read, write } = options;
  const anchorsOf = (docId: string, kept: (a: StoredAnchor) => boolean) =>
    read()
      .anchors.filter((a) => a.docId === docId && kept(a))
      .toSorted(byPage)
      .map((a) => structuredClone(a.row));
  const numbersOf = (docId: string) =>
    read().sceneNumbers.get(docId) ?? new Map<string, SceneNumberRow>();
  return {
    get: (docId) => structuredClone(read().rows.get(docId) ?? null),
    put: (row) =>
      write((t) => void t.rows.set(row.docId, structuredClone(row))),
    setLocked: options.setLocked,
    anchors: (docId) => anchorsOf(docId, (a) => a.to === null),
    anchorsAt: (docId, at) => anchorsOf(docId, (a) => isInRange(a, at)),
    replaceAnchors: (docId, rows, at) =>
      write((t) => replaceIn(t, docId, rows, at)),
    anchorHistory: (docId) =>
      read()
        .anchors.filter((a) => a.docId === docId)
        .toSorted(byStart)
        .map(withRange),
    sets: (docId) =>
      read()
        .sets.filter((s) => s.docId === docId)
        .toSorted((a, b) => a.ordinal - b.ordinal)
        .map((s) => structuredClone(s)),
    addSet: (row) => write((t) => void t.sets.push(structuredClone(row))),
    updateSet: (setId, patch) =>
      write((t) => {
        t.sets = t.sets.map((s) =>
          s.id === setId ? { ...s, ...structuredClone(patch) } : s,
        );
      }),
    setBlocks: (setId) => structuredClone(read().setBlocks.get(setId) ?? []),
    putSetBlocks: (setId, rows) =>
      write((t) => {
        const stored = rows.map((r) => ({ ...structuredClone(r), setId }));
        t.setBlocks.set(setId, stored.toSorted(byBlock));
      }),
    // newest first; of two issued at the same moment, the one added later
    issues: (docId) =>
      read()
        .issues.filter((i) => i.docId === docId)
        .toReversed()
        .toSorted((a, b) => b.issuedAt - a.issuedAt)
        .map((i) => structuredClone(i)),
    addIssue: (row) => write((t) => void t.issues.push(structuredClone(row))),
    sceneNumbers: (docId) =>
      [...numbersOf(docId).values()].toSorted(byBlock).map((n) => ({ ...n })),
    putSceneNumbers: (docId, rows) =>
      write((t) => {
        const numbers = new Map(numbersOf(docId));
        for (const r of rows) numbers.set(r.blockId, { ...r });
        t.sceneNumbers.set(docId, numbers);
      }),
    clearSceneNumbers: (docId) =>
      write((t) => void t.sceneNumbers.delete(docId)),
    request: (docId, key) =>
      structuredClone(
        read().requests.find((r) => r.docId === docId && r.key === key) ?? null,
      ),
    putRequest: (row) =>
      write((t) => {
        if (t.requests.some((r) => r.docId === row.docId && r.key === row.key))
          throw new RangeError(
            `production request key ${row.key} is already stored`,
          );
        t.requests.push({ ...row });
      }),
  };
}
