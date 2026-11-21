// Recall, within a day of the original issue: the chosen pages issued again as a correction, against the
// revision's latest issue or correction, and the rest left in the active revision.
import type { Engine, Pagination } from "@manent/pagination";
import {
  RECALL_WINDOW_MS,
  canonicalBlocksOf,
  correctedBaseline,
  issueBlocks,
  revisedPages,
} from "@manent/revisions";
import { blocksOf, sectionize } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import type { DocFile, IssueRow, RevisionSetRow } from "@manent/storage";
import type {
  IssueResponse,
  RecallRequest,
  SetBlockRecord,
  VersionContent,
} from "@manent/sync-protocol";
import {
  activeSet,
  isSending,
  issueAnswer,
  marksSince,
  overridesOf,
  versionContent,
} from "./issue.ts";
import { refused } from "./outcome.ts";
import type { Mutation, ProductionOptions, Requests } from "./requests.ts";
import { layoutUnder, notLocked, scriptAt, scriptPages } from "./state.ts";
import type { ScriptAt } from "./state.ts";

/** The name a correction is issued and headed under: "Blue (corrected)". */
export function correctedName(name: string): string {
  return `${name} (corrected)`;
}

/** The set the request recalls and its latest issue or correction; null when recall is closed for it. */
function recallable(
  file: DocFile,
  request: RecallRequest,
  now: number,
): { set: RevisionSetRow; latest: IssueRow } | null {
  const { docId, setId } = request;
  const set = file.production.sets(docId).find((s) => s.id === setId);
  const latest = file.production
    .issues(docId)
    .find((issue) => issue.setId === setId);
  if (set === undefined || latest === undefined || set.issuedAt === null)
    return null;
  const next = activeSet(file, docId).ordinal === set.ordinal + 1;
  return next && now - set.issuedAt <= RECALL_WINDOW_MS
    ? { set, latest }
    : null;
}

/** By block id, the label of the page its first line is on. */
function pageLabels(p: Pagination, engine: Engine): Map<string, string> {
  const labels = new Map<string, string>();
  p.blocks.forEach((block, i) => {
    if (!labels.has(block.id))
      labels.set(block.id, p.pages[engine.pageOf(p, i, 0)]!.label);
  });
  return labels;
}

/**
 * The latest issue or correction `since` with the chosen pages as the script holds them now, and its pages.
 * A block is on the page the current pagination places it, or, once removed, the page it was issued on.
 */
function correctionOf(
  script: ScriptAt,
  since: VersionContent,
  set: RevisionSetRow,
  chosen: ReadonlySet<string>,
):
  | { ok: true; doc: DocJSON; pagination: Pagination }
  | { ok: false; reason: "engine_unavailable" | "bad_request" } {
  const { content, engine, profile, records, layout } = script;
  const issuedUnder = layoutUnder(since.settings, set.engineVersion);
  if (!issuedUnder.ok) return issuedUnder;
  const issued = sectionize(since.blocks);
  const issuedPages = scriptPages(
    blocksOf(issued),
    new Map(),
    issuedUnder.profile,
    since.locks ?? [],
    engine,
  ).pagination;
  const now = pageLabels(layout.pagination, engine);
  const then = pageLabels(issuedPages, engine);
  const doc = correctedBaseline(
    issued,
    content,
    (blockId) => now.get(blockId) ?? then.get(blockId) ?? null,
    chosen,
  );
  const { pagination } = scriptPages(
    blocksOf(doc),
    new Map(),
    profile,
    records,
    engine,
  );
  return { ok: true, doc, pagination };
}

interface Corrected {
  set: RevisionSetRow;
  latest: IssueRow;
  content: VersionContent;
  /** The set's records of the corrected pages. */
  blocks: SetBlockRecord[];
  issue: IssueRow | null;
}

export function recallMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: RecallRequest,
): Mutation<IssueResponse> {
  const { docId, key } = request;
  const chosen = new Set(request.pages);
  const made: Corrected[] = [];
  const done = (): Corrected => {
    const [corrected] = made;
    if (corrected === undefined)
      throw new RangeError(`the recall of ${docId} was never edited`);
    return corrected;
  };
  return {
    docId,
    key,
    need: "issue_revisions",
    tells: ["revision_recalled"],
    check(file) {
      const locked = notLocked(file, docId);
      if (locked !== null) return locked;
      if (recallable(file, request, options.now()) === null)
        return refused("recall_closed");
      return isSending(request) && chosen.size > 0
        ? null
        : refused("bad_request");
    },
    edit(doc, file) {
      const found = recallable(file, request, options.now());
      if (found === null) return { ok: false, reason: "recall_closed" };
      const { set, latest } = found;
      const read = scriptAt(doc, file, docId, set.engineVersion);
      if (!read.ok) return read;
      const { content, flat, layout, records } = read.script;
      const since = versionContent(file, latest.versionId);
      const changed = revisedPages(
        layout.pagination,
        marksSince(since.blocks, content, flat, () => null),
      );
      if (request.pages.some((label) => !changed.includes(label)))
        return { ok: false, reason: "unknown_label" };
      const corrected = correctionOf(read.script, since, set, chosen);
      if (!corrected.ok) return corrected;
      const setBaseline = versionContent(file, set.baselineVersionId).blocks;
      const blocks = issueBlocks(
        sectionize(setBaseline),
        corrected.doc,
        corrected.pagination,
        overridesOf(doc, set.id),
      ).filter((record) => chosen.has(record.pageLabel));
      made.push({
        set,
        latest,
        content: {
          ...since,
          blocks: canonicalBlocksOf(corrected.doc),
          locks: [...records],
        },
        blocks,
        issue: null,
      });
      return { ok: true };
    },
    commit(file, _at, pos) {
      const corrected = done();
      const { set, latest } = corrected;
      const { production } = file;
      const now = options.now();
      const version = requests.keep(
        file,
        {
          docId,
          userId,
          kind: "revision_issue",
          name: correctedName(set.name),
          at: pos,
        },
        corrected.content,
      );
      const kept = production
        .setBlocks(set.id)
        .filter((record) => !chosen.has(record.pageLabel));
      production.putSetBlocks(set.id, [
        ...kept,
        ...corrected.blocks.map((record) => ({ ...record, setId: set.id })),
      ]);
      production.updateSet(set.id, { recalledAt: now });
      production.updateSet(activeSet(file, docId).id, {
        baselineVersionId: version.id,
      });
      corrected.issue = {
        id: options.ids(),
        docId,
        setId: set.id,
        kind: "correction",
        versionId: version.id,
        issuedByUserId: userId,
        issuedAt: now,
        issuedOn: request.issuedOn,
        recipientUserIds: [...latest.recipientUserIds],
        pages: [...request.pages],
        memo: request.memo,
        files: [...request.files],
        tint: request.tint,
        what: "changed",
      };
      production.addIssue(corrected.issue);
      return [version];
    },
    ...issueAnswer(options, docId, () => {
      const { issue } = done();
      if (issue === null)
        throw new RangeError(`the recall of ${docId} was never committed`);
      return issue;
    }),
  };
}
