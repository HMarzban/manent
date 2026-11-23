// The end of an imported page's elasticity: the first commit that edits a page whose start the file locked
// turns its import anchor into a lock anchor, and nothing turns it back.
import { scriptBody, scriptSettings } from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { LockAnchorRecord } from "@manent/pagination";
import { idOf, touchedImportPages } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import type { AnchorRow, DocFile } from "@manent/storage";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { Room } from "../sync/rooms.ts";
import type { Committed } from "../sync/write-path-ports.ts";
import type { ProductionOptions } from "./requests.ts";
import { recordsOf } from "./state.ts";

/** The sync hooks that end an imported page's elasticity, and what the production service tells them. */
export interface ImportPageHooks {
  committed(committed: Committed): void;
  forgotten(room: Room): void;
  /** After the service's own commits: whether the document's open table holds an import anchor is read again. */
  refresh(docId: string): void;
}

// The setting every locked script holds, rewritten as it is so that the new table starts at a position of its own.
const NUMBERING_KEY = "script.numbering";

function advanceHead(doc: CrdtDoc): void {
  const settings = scriptSettings(doc);
  const meta = settings.meta(NUMBERING_KEY);
  if (meta !== null)
    settings.set(NUMBERING_KEY, settings.entries()[NUMBERING_KEY], meta);
}

const orderOf = (doc: CrdtDoc): string[] =>
  blocksOf(scriptBody(doc).materialize()).flatMap(({ attrs }) =>
    attrs.id === null ? [] : [attrs.id],
  );

const isImportAnchored = (rows: readonly AnchorRow[]): boolean =>
  rows.some((row) => row.source === "import");

/**
 * The labels of the import pages a change touched. Over the order before it when one is kept; else over the
 * order after it, where a removed block counts on the page of each anchor that names it and on no other.
 */
function touchedPages(
  orders: { before: readonly string[] | null; after: readonly string[] },
  records: readonly LockAnchorRecord[],
  report: TransactionReport,
): string[] {
  const change = {
    inserted: report.inserted.flatMap(({ block, after }) => {
      const id = idOf(block);
      return id === null ? [] : [{ id, after }];
    }),
    changed: report.changed.flatMap((block) => idOf(block) ?? []),
    removed: report.removed,
  };
  if (orders.before !== null)
    return touchedImportPages(orders.before, records, change);
  const removed = new Set(report.removed);
  const named = records.filter(
    (record) =>
      record.source === "import" &&
      [record.blockId, ...record.fallbackIds].some((id) => removed.has(id)),
  );
  const touched = touchedImportPages(orders.after, records, {
    ...change,
    removed: [],
  });
  return [...new Set([...touched, ...named.map((record) => record.label)])];
}

export function createImportPageHooks(
  options: Pick<ProductionOptions, "sync">,
): ImportPageHooks {
  /** By document in production: whether its open anchor table holds an import anchor. */
  const anchored = new Map<string, boolean>();
  /** By import-anchored document: its block order after the last commit the hook read. */
  const orders = new Map<string, readonly string[]>();
  /** By document: the labels whose anchors the write on its way turns into lock anchors. */
  const ending = new Map<string, Set<string>>();

  function isAnchored(room: Room): boolean {
    if (room.row.locked === 0) return false;
    const held = anchored.get(room.docId);
    if (held !== undefined) return held;
    const read = isImportAnchored(room.file.production.anchors(room.docId));
    anchored.set(room.docId, read);
    return read;
  }

  /** Inside the write's commit: the open table again, the waiting labels' import anchors made lock anchors. */
  function replace(
    file: DocFile,
    docId: string,
    pos: { generation: number; seq: number },
  ): void {
    const labels = ending.get(docId);
    ending.delete(docId);
    const rows = file.production.anchors(docId);
    const ends = (row: AnchorRow) =>
      row.source === "import" && labels !== undefined && labels.has(row.label);
    if (!rows.some(ends)) return;
    const next = rows.map((row) =>
      ends(row) ? { ...row, source: "lock" } : row,
    );
    file.production.replaceAnchors(docId, next, pos);
  }

  async function end(room: Room, labels: Set<string>): Promise<void> {
    const { docId, file } = room;
    ending.set(docId, labels);
    const sync = options.sync();
    const result = await sync.authorityWrite(docId, {
      userId: SYSTEM_USER_ID,
      origin: "system",
      edit(doc) {
        advanceHead(doc);
        return { ok: true };
      },
      inTransaction(inFile, at) {
        replace(inFile, docId, {
          generation: at.generation,
          seq: at.seq ?? at.before,
        });
      },
    });
    if (ending.get(docId) === labels) ending.delete(docId);
    anchored.delete(docId);
    if (!result.ok) return;
    const headSeq = file.log.get(docId)?.headSeq ?? 0;
    const data = new TextEncoder().encode(JSON.stringify({ v: 1, headSeq }));
    sync.broadcast(docId, "lock_anchors_changed", data);
  }

  return {
    committed({ room, report }) {
      const { docId, doc } = room;
      if (doc === null) return;
      if (!isAnchored(room)) {
        orders.delete(docId);
        return;
      }
      const after = orderOf(doc);
      const before = orders.get(docId) ?? null;
      orders.set(docId, after);
      // a replay's commit (no report) and the authority's own writes (numbers, settings, this hook's) edit no page
      if (report === null || report.origin === "system") return;
      const records = recordsOf(room.file.production.anchors(docId));
      const labels = touchedPages({ before, after }, records, report);
      if (labels.length === 0) return;
      const waiting = ending.get(docId);
      if (waiting === undefined) void end(room, new Set(labels));
      else for (const label of labels) waiting.add(label);
    },
    forgotten(room) {
      anchored.delete(room.docId);
      orders.delete(room.docId);
    },
    refresh: (docId) => void anchored.delete(docId),
  };
}
