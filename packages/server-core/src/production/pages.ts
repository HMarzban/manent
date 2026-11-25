// The Pages tab's operations on the anchor table, each computed on the pages as they are at the write's turn.
import { scriptSettings } from "@manent/crdt";
import type { LockAnchorRecord, Pagination } from "@manent/pagination";
import { captureAnchors, mergeAnchors } from "@manent/revisions";
import type { PagesRequest, ProductionState } from "@manent/sync-protocol";
import { refused } from "./outcome.ts";
import type { ProductionRefused } from "./outcome.ts";
import type { Mutation, ProductionOptions } from "./requests.ts";
import {
  engineVersionOf,
  notLocked,
  rowsOf,
  scriptAt,
  stateAnswer,
} from "./state.ts";

/** The longest label a page may be renumbered to, in characters. */
const RENUMBER_MAX_CHARS = 12;

type Table = { ok: true; records: LockAnchorRecord[] } | { ok: false };

const labelsOf = (records: readonly LockAnchorRecord[]): Set<string> =>
  new Set(records.map((record) => record.label));

const holdsAll = (labels: readonly string[], held: ReadonlySet<string>) =>
  labels.every((label) => held.has(label));

/** The request's own shape: renumber names one label and its new one, every other operation no new label. */
function shapeRefusal(request: PagesRequest): ProductionRefused | null {
  const { op, labels, label } = request;
  if (op === "renumber")
    return labels.length === 1 && label !== null
      ? null
      : refused("bad_request");
  const empty = labels.length === 0 && op !== "lock_a_pages";
  return label !== null || empty ? refused("bad_request") : null;
}

/** The table the operation leaves; not ok when a label it names is not among the pages or anchors it acts on. */
function nextTable(
  p: Pagination,
  records: readonly LockAnchorRecord[],
  request: PagesRequest,
): Table {
  const { labels } = request;
  const named = new Set(labels);
  const anchored = labelsOf(records);
  switch (request.op) {
    case "lock": {
      const pages = captureAnchors(p, "every_page", 1, "lock");
      const added = pages.filter((record) => named.has(record.label));
      if (added.length !== named.size) return { ok: false };
      return { ok: true, records: mergeAnchors(records, added, p) };
    }
    case "unlock": {
      if (!holdsAll(labels, anchored)) return { ok: false };
      const kept = records.filter((record) => !named.has(record.label));
      return { ok: true, records: mergeAnchors(kept, [], p) };
    }
    case "lock_a_pages": {
      const derived = captureAnchors(p, "derived_pages", 2, "lock");
      if (!holdsAll(labels, labelsOf(derived))) return { ok: false };
      const added =
        labels.length === 0
          ? derived
          : derived.filter((record) => named.has(record.label));
      return { ok: true, records: mergeAnchors(records, added, p) };
    }
    case "renumber": {
      const [from] = labels;
      const to = request.label ?? "";
      const fits = to !== "" && [...to].length <= RENUMBER_MAX_CHARS;
      if (from === undefined || !anchored.has(from) || !fits)
        return { ok: false };
      if (to !== from && anchored.has(to)) return { ok: false };
      const renamed = records.map((record) =>
        record.label === from ? { ...record, label: to } : record,
      );
      return { ok: true, records: mergeAnchors(renamed, [], p) };
    }
    case "consolidate": {
      if (!holdsAll(labels, anchored)) return { ok: false };
      const later = new Set(labels.slice(1));
      const kept = records.filter(
        (record) => !(record.source === "issue" && later.has(record.label)),
      );
      return { ok: true, records: mergeAnchors(kept, [], p) };
    }
  }
}

export function pagesMutation(
  options: Pick<ProductionOptions, "names">,
  request: PagesRequest,
): Mutation<ProductionState> {
  const { docId, key } = request;
  const made: { records: LockAnchorRecord[] } = { records: [] };
  return {
    docId,
    key,
    need: "lock_page_numbers",
    tells: ["lock_anchors_changed"],
    check: (file) => shapeRefusal(request) ?? notLocked(file, docId),
    edit(doc, file) {
      const engineVersion = engineVersionOf(scriptSettings(doc).entries());
      const read = scriptAt(doc, file, docId, engineVersion);
      if (!read.ok) return read;
      const { layout, records } = read.script;
      const next = nextTable(layout.pagination, records, request);
      if (!next.ok) return { ok: false, reason: "unknown_label" };
      made.records = next.records;
      return { ok: true };
    },
    commit(file, _at, pos) {
      file.production.replaceAnchors(docId, rowsOf(made.records), pos);
      return [];
    },
    ...stateAnswer(options, docId),
  };
}
