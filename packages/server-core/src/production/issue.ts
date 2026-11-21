// Issue: the active revision frozen once, with its marked blocks, its A-pages and its derived scene
// numbers, and the next revision started on what was issued.
import { revisedOverrides, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { ENGINE_VERSIONS } from "@manent/pagination";
import type { LockAnchorRecord, Pagination } from "@manent/pagination";
import {
  DEFAULT_MARK,
  baselineOf,
  captureAnchors,
  compareDocs,
  issueBlocks,
  liveMarks,
  mergeAnchors,
  parseOverride,
  revisedPages,
  revisionColour,
  revisionName,
} from "@manent/revisions";
import type { BlockMark, Override } from "@manent/revisions";
import { sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON, FlatBlock } from "@manent/schema";
import type { DocFile, IssueRow, RevisionSetRow } from "@manent/storage";
import { isProductionState } from "@manent/sync-protocol";
import type {
  IssueFile,
  IssueRequest,
  IssueResponse,
  VersionContent,
} from "@manent/sync-protocol";
import { contentOfDoc, materializeVersion } from "../history/content.ts";
import { refused } from "./outcome.ts";
import type { ProductionRefused } from "./outcome.ts";
import { isDay } from "./requests.ts";
import type { Mutation, ProductionOptions, Requests } from "./requests.ts";
import {
  colourOrderOf,
  documentOf,
  issueView,
  notLocked,
  productionState,
  rowsOf,
  scriptAt,
} from "./state.ts";

/** The most people an issue is sent to. */
const MAX_RECIPIENTS = 500;
/** The longest memo, in characters. */
const MEMO_MAX_CHARS = 4_000;

/** The revision being worked on: the last of the script's sets. RangeError for a script never locked. */
export function activeSet(file: DocFile, docId: string): RevisionSetRow {
  const active = file.production.sets(docId).at(-1);
  if (active === undefined)
    throw new RangeError(`${docId} has no revision: it was never locked`);
  return active;
}

/** A version's content. RangeError for a version the history no longer holds. */
export function versionContent(
  file: DocFile,
  versionId: string,
): VersionContent {
  const version = file.history.get(versionId);
  const content = version === null ? null : materializeVersion(file, version);
  if (content === null)
    throw new RangeError(`version ${versionId} has no content to read`);
  return content;
}

/** The overrides of one revision, by block id, as the script holds them now. */
export function overridesOf(
  doc: CrdtDoc,
  setId: string,
): (blockId: string) => Override | null {
  const prefix = `${setId}:`;
  const held = new Map(
    revisedOverrides(doc)
      .entries()
      .flatMap(([key, value]): [string, Override][] => {
        const override = parseOverride(value);
        return key.startsWith(prefix) && override !== null
          ? [[key.slice(prefix.length), override]]
          : [];
      }),
  );
  return (blockId) => held.get(blockId) ?? null;
}

/** The marks of `content` against the blocks of `baseline`, each moved block as `compareDocs` finds it. */
export function marksSince(
  baseline: readonly BlockJSON[],
  content: DocJSON,
  flat: readonly FlatBlock[],
  overrides: (blockId: string) => Override | null,
): Map<string, BlockMark> {
  const { entries } = compareDocs(sectionize(baseline), content);
  const moved = new Set(entries.flatMap((e) => (e.moved ? [e.id] : [])));
  return liveMarks(baselineOf(baseline), flat, moved, overrides);
}

/** What an issue and a correction send: a day, at least one file, a memo within MEMO_MAX_CHARS. */
export function isSending(request: {
  issuedOn: string;
  files: readonly IssueFile[];
  memo: string;
}): boolean {
  const { issuedOn, files, memo } = request;
  return (
    isDay(issuedOn) && files.length > 0 && [...memo].length <= MEMO_MAX_CHARS
  );
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((label, i) => label === b[i]);

/** The answer of an issue or a correction, and how a stored one reads back. */
export function issueAnswer(
  options: Pick<ProductionOptions, "names">,
  docId: string,
  issued: () => IssueRow,
): Pick<Mutation<IssueResponse>, "answer" | "isAnswer"> {
  return {
    answer: (file) => ({
      state: productionState(file, docId, options.names),
      issue: issueView(issued(), options.names),
    }),
    isAnswer: (value): value is IssueResponse =>
      typeof value === "object" &&
      value !== null &&
      "state" in value &&
      "issue" in value &&
      isProductionState(value.state) &&
      value.state.docId === docId &&
      typeof value.issue === "object" &&
      value.issue !== null,
  };
}

/** The expected revision was issued already: by whom, when, and the one after it; 400 for one never issued. */
function alreadyIssued(
  options: Pick<ProductionOptions, "names">,
  sets: readonly RevisionSetRow[],
  ordinal: number,
): ProductionRefused {
  const set = sets.find((s) => s.ordinal === ordinal);
  const next = sets.find((s) => s.ordinal === ordinal + 1);
  if (set === undefined || next === undefined) return refused("bad_request");
  if (set.issuedAt === null || set.issuedByUserId === null)
    return refused("bad_request");
  return refused("already_issued", {
    name: set.name,
    byName: options.names(set.issuedByUserId),
    issuedAt: set.issuedAt,
    nextName: next.name,
  });
}

interface Issued {
  active: RevisionSetRow;
  pages: string[];
  pagination: Pagination;
  numbers: ReadonlyMap<string, string>;
  records: readonly LockAnchorRecord[];
  baseline: DocJSON;
  content: VersionContent;
  overrides: (blockId: string) => Override | null;
  issue: IssueRow | null;
}

export function issueMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: IssueRequest,
): Mutation<IssueResponse> {
  const { docId, key } = request;
  const made: Issued[] = [];
  const done = (): Issued => {
    const [issued] = made;
    if (issued === undefined)
      throw new RangeError(`the issue of ${docId} was never edited`);
    return issued;
  };
  const isRecipient = (id: string) =>
    options.storage.directory.roleOf(docId, id) !== null;
  return {
    docId,
    key,
    need: "issue_revisions",
    tells: ["revision_issued", "lock_anchors_changed"],
    check(file) {
      const locked = notLocked(file, docId);
      if (locked !== null) return locked;
      const sets = file.production.sets(docId);
      const active = activeSet(file, docId);
      if (request.expectedOrdinal !== active.ordinal)
        return alreadyIssued(options, sets, request.expectedOrdinal);
      const { recipientUserIds } = request;
      const valid =
        isSending(request) &&
        recipientUserIds.length <= MAX_RECIPIENTS &&
        recipientUserIds.every(isRecipient);
      if (!valid) return refused("bad_request");
      return ENGINE_VERSIONS.includes(active.engineVersion)
        ? null
        : refused("engine_unavailable");
    },
    edit(doc, file) {
      const active = activeSet(file, docId);
      const read = scriptAt(doc, file, docId, active.engineVersion);
      if (!read.ok) return read;
      const { content, flat, layout, numbers, records } = read.script;
      const p = layout.pagination;
      const baseline = versionContent(file, active.baselineVersionId).blocks;
      const overrides = overridesOf(doc, active.id);
      const pages =
        request.what === "full"
          ? p.pages.map((page) => page.label)
          : revisedPages(p, marksSince(baseline, content, flat, overrides));
      if (!sameList(pages, request.pages))
        return { ok: false, reason: "changed" };
      scriptBody(doc).write((w) => {
        for (const [blockId, num] of numbers) w.setBlockAttrs(blockId, { num });
      });
      made.push({
        active,
        pages,
        pagination: p,
        numbers,
        records,
        baseline: sectionize(baseline),
        content: contentOfDoc(doc, documentOf(file, docId), {}),
        overrides,
        issue: null,
      });
      return { ok: true };
    },
    commit(file, _at, pos) {
      const issued = done();
      const { active, pagination: p, content } = issued;
      const { production } = file;
      const now = options.now();
      const blocks = issueBlocks(
        issued.baseline,
        sectionize(content.blocks),
        p,
        issued.overrides,
      );
      production.putSetBlocks(
        active.id,
        blocks.map((block) => ({ ...block, setId: active.id })),
      );
      production.putSceneNumbers(
        docId,
        [...issued.numbers].map(([blockId, num]) => ({
          blockId,
          num,
          reserved: false,
        })),
      );
      const derived = captureAnchors(p, "derived_pages", 1, "issue");
      const anchors = mergeAnchors(issued.records, derived, p);
      production.replaceAnchors(docId, rowsOf(anchors), pos);
      const version = requests.keep(
        file,
        { docId, userId, kind: "revision_issue", name: active.name, at: pos },
        { ...content, locks: anchors },
      );
      production.updateSet(active.id, {
        issuedVersionId: version.id,
        issuedAt: now,
        issuedOn: request.issuedOn,
        issuedByUserId: userId,
        fullDraft: request.what === "full",
      });
      const order = colourOrderOf(file, docId);
      const next = active.ordinal + 1;
      production.addSet({
        id: options.ids(),
        docId,
        ordinal: next,
        name: revisionName(order, next),
        colour: revisionColour(order, next),
        mark: DEFAULT_MARK,
        baselineVersionId: version.id,
        issuedVersionId: null,
        issuedAt: null,
        issuedOn: null,
        issuedByUserId: null,
        recalledAt: null,
        fullDraft: false,
        startedAt: now,
        engineVersion: active.engineVersion,
      });
      issued.issue = {
        id: options.ids(),
        docId,
        setId: active.id,
        kind: "issue",
        versionId: version.id,
        issuedByUserId: userId,
        issuedAt: now,
        issuedOn: request.issuedOn,
        recipientUserIds: [...request.recipientUserIds],
        pages: issued.pages,
        memo: request.memo,
        files: [...request.files],
        tint: request.tint,
        what: request.what,
      };
      production.addIssue(issued.issue);
      return [version];
    },
    ...issueAnswer(options, docId, () => {
      const { issue } = done();
      if (issue === null)
        throw new RangeError(`the issue of ${docId} was never committed`);
      return issue;
    }),
  };
}
