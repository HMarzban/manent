// What a device's authority hands over with a script besides its state: every version as its content,
// and its production record. Read from the device's file, read from the hand-off's body, and kept.
import { REVISION_COLOURS } from "@manent/revisions";
import type { DocFile, VersionRow } from "@manent/storage";
import {
  BLOCK_CHANGES,
  ISSUE_FILES,
  NUMBERING_SCHEMES,
  VERSION_KINDS,
} from "@manent/sync-protocol";
import type {
  AdoptRequest,
  AdoptedIssue,
  AdoptedProduction,
  AdoptedRevisionSet,
  AdoptedVersion,
  SceneNumberRecord,
  SetBlockRecord,
} from "@manent/sync-protocol";
import { openVersion } from "../history/content.ts";
import { VERSION_ID } from "../history/service.ts";
import {
  readContent,
  readEach,
  readLock,
  writeSnapshot,
} from "../history/snapshot.ts";
import { isObject } from "../http/routes/docs.ts";
import { isStorageError } from "../sync/storage-error.ts";
import { PRODUCTION_EXTRAS } from "./extras.ts";
import type { Position } from "./requests.ts";
import { isDay } from "./requests.ts";
import {
  ISSUE_WHATS,
  memberOf,
  recordsOf,
  rowsOf,
  setBlocksOf,
} from "./state.ts";

/** The parts of a hand-off this module reads and keeps. */
export type AdoptedWorkflow = Pick<AdoptRequest, "versions" | "production">;

const ISSUE_KINDS = ["issue", "correction"] as const;

/** The version's content as it is opened, its locks filled in; null when it has none or it does not read. */
function contentOf(file: DocFile, version: VersionRow): AdoptedVersion | null {
  let content;
  try {
    content = openVersion(file, version, PRODUCTION_EXTRAS.locksAt);
  } catch (error) {
    // a damaged version is not handed over: the others are
    if (!isStorageError(error) || error.code !== "corrupt") throw error;
    return null;
  }
  if (content === null) return null;
  const { id, kind, name, createdByUserId, createdAt, deviceId } = version;
  const summary = file.history.summary(id);
  return {
    id,
    kind,
    name,
    createdByUserId,
    createdAt,
    deviceId,
    content,
    summary:
      summary === null
        ? null
        : {
            authorUserIds: summary.authorIds,
            blockIds: summary.blockIds,
            sceneIds: summary.sceneIds,
          },
  };
}

function productionOf(file: DocFile, docId: string): AdoptedProduction | null {
  const { production } = file;
  const row = production.get(docId);
  if (row === null) return null;
  return {
    numbering: memberOf(NUMBERING_SCHEMES, row.numbering, "numbering"),
    colourOrder: [...row.colourOrder],
    lockedAt: row.lockedAt,
    lockedOn: row.lockedOn,
    lockedByUserId: row.lockedByUserId,
    endedAt: row.endedAt,
    anchors: recordsOf(production.anchors(docId)),
    sceneNumbers: production.sceneNumbers(docId),
    sets: production.sets(docId).map(({ id, docId: _docId, ...set }) => ({
      setId: id,
      ...set,
      blocks: setBlocksOf(file, id),
    })),
    issues: production.issues(docId).map(({ id, docId: _docId, ...issue }) => ({
      issueId: id,
      ...issue,
      kind: memberOf(ISSUE_KINDS, issue.kind, "issue kind"),
      files: issue.files.map((f) => memberOf(ISSUE_FILES, f, "issue file")),
      what: memberOf(ISSUE_WHATS, issue.what, "issue extent"),
    })),
  };
}

/** What the file holds of the document for its hand-off: each version that reads, and its production. */
export function adoptedWorkflowOf(
  file: DocFile,
  docId: string,
): AdoptedWorkflow {
  return {
    versions: file.versions
      .list(docId)
      .flatMap((version) => contentOf(file, version) ?? []),
    production: productionOf(file, docId),
  };
}

const isText = (value: unknown): value is string => typeof value === "string";
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const isTexts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText);
const isDayText = (value: unknown): value is string =>
  isText(value) && isDay(value);

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return list.find((member) => member === value) ?? null;
}

const nullOr =
  <T>(is: (value: unknown) => value is T) =>
  (value: unknown): value is T | null =>
    value === null || is(value);
const isTextOrNull = nullOr(isText);
const isCountOrNull = nullOr(isCount);

type Summary = NonNullable<AdoptedVersion["summary"]>;

const isSummary = (value: unknown): value is Summary =>
  isObject(value) &&
  isTexts(value.authorUserIds) &&
  isTexts(value.blockIds) &&
  isTexts(value.sceneIds);

function readVersion(value: unknown): AdoptedVersion | null {
  if (!isObject(value)) return null;
  const { id, name, createdByUserId, createdAt, deviceId, summary } = value;
  const kind = oneOf(VERSION_KINDS, value.kind);
  const content = readContent(value.content);
  if (!isText(id) || !VERSION_ID.test(id) || kind === null) return null;
  if (!isText(createdByUserId) || !isCount(createdAt) || content === null)
    return null;
  if (!isTextOrNull(name) || !isTextOrNull(deviceId)) return null;
  if (!nullOr(isSummary)(summary)) return null;
  return {
    id,
    kind,
    name,
    createdByUserId,
    createdAt,
    deviceId,
    content,
    summary:
      summary === null
        ? null
        : {
            authorUserIds: [...summary.authorUserIds],
            blockIds: [...summary.blockIds],
            sceneIds: [...summary.sceneIds],
          },
  };
}

function readSceneNumber(value: unknown): SceneNumberRecord | null {
  if (!isObject(value)) return null;
  const { blockId, num, reserved } = value;
  if (!isText(blockId) || !isText(num) || typeof reserved !== "boolean")
    return null;
  return { blockId, num, reserved };
}

const isRange = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(isCount);

function readSetBlock(value: unknown): SetBlockRecord | null {
  if (!isObject(value)) return null;
  const { blockId, pageLabel, hash, inserted, deletedAt } = value;
  const change = oneOf(BLOCK_CHANGES, value.change);
  if (!isText(blockId) || !isText(pageLabel) || !isText(hash)) return null;
  if (change === null || !Array.isArray(inserted) || !Array.isArray(deletedAt))
    return null;
  if (!inserted.every(isRange) || !deletedAt.every(isCount)) return null;
  return {
    blockId,
    pageLabel,
    change,
    hash,
    inserted: inserted.map(([from, to]) => [from, to]),
    deletedAt: [...deletedAt],
  };
}

function readSet(value: unknown): AdoptedRevisionSet | null {
  if (!isObject(value)) return null;
  const { setId, ordinal, name, mark, baselineVersionId, fullDraft } = value;
  const { issuedVersionId, issuedAt, issuedOn, issuedByUserId } = value;
  const { recalledAt, startedAt, engineVersion } = value;
  const colour = oneOf(REVISION_COLOURS, value.colour);
  const blocks = readEach(value.blocks, readSetBlock);
  if (!isText(setId) || !isText(name) || !isText(mark) || colour === null)
    return null;
  if (!isCount(ordinal) || !isCount(startedAt) || !isCount(engineVersion))
    return null;
  if (!isText(baselineVersionId) || typeof fullDraft !== "boolean") return null;
  if (!isTextOrNull(issuedVersionId) || !isTextOrNull(issuedByUserId))
    return null;
  if (!isCountOrNull(issuedAt) || !nullOr(isDayText)(issuedOn)) return null;
  if (!isCountOrNull(recalledAt) || blocks === null) return null;
  return {
    setId,
    ordinal,
    name,
    colour,
    mark,
    baselineVersionId,
    issuedVersionId,
    issuedAt,
    issuedOn,
    issuedByUserId,
    recalledAt,
    fullDraft,
    startedAt,
    engineVersion,
    blocks,
  };
}

function readIssue(value: unknown): AdoptedIssue | null {
  if (!isObject(value)) return null;
  const { issueId, setId, versionId, issuedByUserId, issuedAt } = value;
  const { issuedOn, recipientUserIds, pages, memo, tint } = value;
  const kind = oneOf(ISSUE_KINDS, value.kind);
  const what = oneOf(ISSUE_WHATS, value.what);
  const files = readEach(value.files, (f) => oneOf(ISSUE_FILES, f));
  if (!isText(issueId) || !isText(setId) || !isText(versionId)) return null;
  if (!isText(issuedByUserId) || !isCount(issuedAt) || !isDayText(issuedOn))
    return null;
  if (!isTexts(recipientUserIds) || !isTexts(pages) || !isText(memo))
    return null;
  if (kind === null || what === null || files === null) return null;
  if (typeof tint !== "boolean") return null;
  return {
    issueId,
    setId,
    kind,
    versionId,
    issuedByUserId,
    issuedAt,
    issuedOn,
    recipientUserIds: [...recipientUserIds],
    pages: [...pages],
    memo,
    files,
    tint,
    what,
  };
}

function readProduction(value: unknown): AdoptedProduction | null {
  if (!isObject(value)) return null;
  const { colourOrder, lockedAt, lockedOn, lockedByUserId } = value;
  const { endedAt } = value;
  const numbering = oneOf(NUMBERING_SCHEMES, value.numbering);
  const anchors = readEach(value.anchors, readLock);
  const sceneNumbers = readEach(value.sceneNumbers, readSceneNumber);
  const sets = readEach(value.sets, readSet);
  const issues = readEach(value.issues, readIssue);
  const colours = readEach(colourOrder, (c) => oneOf(REVISION_COLOURS, c));
  if (numbering === null || colours === null || !isCountOrNull(endedAt))
    return null;
  if (!isCount(lockedAt) || !isDayText(lockedOn) || !isText(lockedByUserId))
    return null;
  if (anchors === null || sceneNumbers === null) return null;
  if (sets === null || issues === null) return null;
  return {
    numbering,
    colourOrder: colours,
    lockedAt,
    lockedOn,
    lockedByUserId,
    endedAt,
    anchors,
    sceneNumbers,
    sets,
    issues,
  };
}

/**
 * The body's versions and production, each field of the kind the authority keeps; null when one is
 * not. A device of an earlier build sends neither, and hands over no versions and no production.
 */
export function readAdoptedWorkflow(
  body: Record<string, unknown>,
): AdoptedWorkflow | null {
  const { versions = [], production = null } = body;
  const read = readEach(versions, readVersion);
  const produced = production === null ? null : readProduction(production);
  if (read === null || (produced === null && production !== null)) return null;
  return { versions: read, production: produced };
}

/**
 * Keeps the versions as snapshots under their own ids and the production record as it was, its
 * anchors opened at `at`, where the adopted state was written. Writes inside the caller's transaction.
 */
export function keepAdoptedWorkflow(
  file: DocFile,
  docId: string,
  workflow: AdoptedWorkflow,
  at: Position,
): void {
  // oldest first, so versions made at one instant keep their order
  for (const version of workflow.versions.toReversed()) {
    const { id, content, summary, ...row } = version;
    file.versions.add({ ...row, id, docId, generation: null, seq: null });
    file.history.setSnapshot(
      id,
      writeSnapshot(file, content),
      content.engineVersion,
    );
    if (summary !== null)
      file.history.setSummary(id, {
        authorIds: summary.authorUserIds,
        blockIds: summary.blockIds,
        sceneIds: summary.sceneIds,
      });
  }
  const { production } = workflow;
  if (production === null) return;
  const { anchors, sceneNumbers, sets, issues, ...row } = production;
  const store = file.production;
  store.put({ ...row, docId });
  store.replaceAnchors(docId, rowsOf(anchors), at);
  store.putSceneNumbers(docId, sceneNumbers);
  for (const { setId, blocks, ...set } of sets) {
    store.addSet({ ...set, id: setId, docId });
    store.putSetBlocks(
      setId,
      blocks.map((block) => ({ ...block, setId })),
    );
  }
  for (const { issueId, ...issue } of issues)
    store.addIssue({ ...issue, id: issueId, docId });
  store.setLocked(docId, row.endedAt === null);
}
