// A script in production as the authority reads it: its layout, its scene numbers, its pages under the
// stored anchors, and the state every production request answers with.
import { scriptBody, scriptSettings } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  LOCK_SOURCES,
  applyLayoutPatches,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import type {
  Engine,
  LayoutBlock,
  LockAnchorRecord,
  PageProfile,
} from "@manent/pagination";
import {
  COLOUR_ORDERS,
  REVISION_COLOURS,
  compareSceneNumbers,
  deriveNumbers,
  lockedPagination,
  productionLayout,
} from "@manent/revisions";
import type { LockedLayout, RevisionColour } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import type { DocJSON, FlatBlock } from "@manent/schema";
import type {
  AnchorRow,
  DocFile,
  DocumentRow,
  IssueRow,
  RevisionSetRow,
} from "@manent/storage";
import {
  BLOCK_CHANGES,
  ISSUE_FILES,
  NUMBERING_SCHEMES,
  isProductionState,
} from "@manent/sync-protocol";
import type {
  IssueView,
  NumberingScheme,
  ProductionState,
  RevisionSetView,
  SetBlockRecord,
} from "@manent/sync-protocol";
import { refused } from "./outcome.ts";
import type { ProductionRefused } from "./outcome.ts";
import type { Mutation, ProductionOptions } from "./requests.ts";

const ISSUE_WHATS = ["changed", "full"] as const;

/** `value` as a member of `list`; a RangeError for a stored value this service never writes. */
export function memberOf<T extends string>(
  list: readonly T[],
  value: string,
  what: string,
): T {
  const found = list.find((member) => member === value);
  if (found === undefined)
    throw new RangeError(
      `a stored ${what} must be one this build writes, not ${value}`,
    );
  return found;
}

/** The engine of `engineVersion` and the profile `settings` give under it; refused when either is missing. */
export function layoutUnder(
  settings: Readonly<Record<string, unknown>>,
  engineVersion: number | null,
):
  | { ok: true; engine: Engine; profile: PageProfile }
  | { ok: false; reason: "engine_unavailable" | "bad_request" } {
  const engine = engineVersion === null ? null : engineFor(engineVersion);
  if (engine === null) return { ok: false, reason: "engine_unavailable" };
  const profile = layoutOf(settings, engine);
  if (profile === null) return { ok: false, reason: "bad_request" };
  return { ok: true, engine, profile };
}

/** What the authority reads of a locked script at a write's turn. */
export interface ScriptAt {
  readonly content: DocJSON;
  readonly flat: readonly FlatBlock[];
  readonly engine: Engine;
  readonly profile: PageProfile;
  /** The open anchor table. */
  readonly records: readonly LockAnchorRecord[];
  readonly numbers: ReadonlyMap<string, string>;
  readonly layout: LockedLayout;
}

/** The locked script in `doc` laid out by the engine of `engineVersion`, under the stored anchors. */
export function scriptAt(
  doc: CrdtDoc,
  file: DocFile,
  docId: string,
  engineVersion: number | null,
):
  | { ok: true; script: ScriptAt }
  | { ok: false; reason: "engine_unavailable" | "bad_request" } {
  const under = layoutUnder(scriptSettings(doc).entries(), engineVersion);
  if (!under.ok) return under;
  const { engine, profile } = under;
  const content = scriptBody(doc).materialize();
  const flat = blocksOf(content);
  const numbers = derivedNumbers(file, docId, flat);
  const records = recordsOf(file.production.anchors(docId));
  const layout = scriptPages(flat, numbers, profile, records, engine);
  return {
    ok: true,
    script: { content, flat, engine, profile, records, numbers, layout },
  };
}

/**
 * The profile the script's settings give in production, scenes numbered: the five layout keys, each
 * missing or ill-typed one at its default. Null for a format without pages.
 */
function layoutOf(
  settings: Readonly<Record<string, unknown>>,
  engine: Engine,
): PageProfile | null {
  const read = readLayoutSettings((key) => settings[key]);
  return profileFromSettings(engine, { ...read, scenesNumbered: true });
}

/** The headings that carry a scene number (scene headings and slugs with an id), in document order. */
function numberedHeadings(
  flat: readonly FlatBlock[],
): { blockId: string; num: string | null }[] {
  return flat.flatMap(({ attrs }) =>
    (attrs.type === "scene_heading" || attrs.type === "slug") &&
    attrs.id !== null
      ? [{ blockId: attrs.id, num: attrs.num }]
      : [],
  );
}

/** The scheme the script was locked with; suffix for a script never locked. */
function numberingOf(file: DocFile, docId: string): NumberingScheme {
  const row = file.production.get(docId);
  return row === null
    ? "suffix"
    : memberOf(NUMBERING_SCHEMES, row.numbering, "numbering");
}

/** A number for every heading without one, never one issued or reserved. */
function derivedNumbers(
  file: DocFile,
  docId: string,
  flat: readonly FlatBlock[],
): Map<string, string> {
  const used = new Set(file.production.sceneNumbers(docId).map((n) => n.num));
  return deriveNumbers(numberedHeadings(flat), numberingOf(file, docId), used);
}

/** The pages production shows: derived numbers and omitted scenes patched in, the anchors held. */
export function scriptPages(
  flat: readonly FlatBlock[],
  numbers: ReadonlyMap<string, string>,
  profile: PageProfile,
  records: readonly LockAnchorRecord[],
  engine: Engine,
): LockedLayout {
  const blocks = layoutBlocks(flat, numbers, engine);
  return lockedPagination(blocks, profile, records, engine);
}

/** The blocks as the engine lays them out in production: derived numbers and omitted scenes patched in. */
export function layoutBlocks(
  flat: readonly FlatBlock[],
  numbers: ReadonlyMap<string, string>,
  engine: Engine,
): LayoutBlock[] {
  return applyLayoutPatches(
    engine.toLayoutBlocks(flat),
    productionLayout(flat, numbers),
  );
}

function recordsOf(rows: readonly AnchorRow[]): LockAnchorRecord[] {
  return rows.map((row) => ({
    level: row.level,
    order: row.order,
    label: row.label,
    blockId: row.blockId,
    offset: row.offset,
    quote: row.quote ?? "",
    fallbackIds: [...row.fallbackIds],
    source: memberOf(LOCK_SOURCES, row.source, "anchor source"),
  }));
}

export function rowsOf(records: readonly LockAnchorRecord[]): AnchorRow[] {
  return records.map((record) => ({
    ...record,
    fallbackIds: [...record.fallbackIds],
  }));
}

/** The blocks an issued revision marked, as the store holds them. */
export function setBlocksOf(file: DocFile, setId: string): SetBlockRecord[] {
  return file.production.setBlocks(setId).map((block) => ({
    blockId: block.blockId,
    pageLabel: block.pageLabel,
    change: memberOf(BLOCK_CHANGES, block.change, "block change"),
    hash: block.hash,
    inserted: block.inserted,
    deletedAt: block.deletedAt,
  }));
}

function setView(
  file: DocFile,
  row: RevisionSetRow,
  names: (userId: string) => string,
): RevisionSetView {
  const blocks = row.issuedAt === null ? [] : setBlocksOf(file, row.id);
  return {
    setId: row.id,
    ordinal: row.ordinal,
    name: row.name,
    colour: row.colour,
    mark: row.mark,
    fullDraft: row.fullDraft,
    startedAt: row.startedAt,
    issuedAt: row.issuedAt,
    issuedOn: row.issuedOn,
    issuedByName:
      row.issuedByUserId === null ? null : names(row.issuedByUserId),
    recalledAt: row.recalledAt,
    baselineVersionId: row.baselineVersionId,
    issuedVersionId: row.issuedVersionId,
    engineVersion: row.engineVersion,
    blocks,
  };
}

export function issueView(
  row: IssueRow,
  names: (userId: string) => string,
): IssueView {
  return {
    issueId: row.id,
    setId: row.setId,
    kind: row.kind,
    versionId: row.versionId,
    issuedAt: row.issuedAt,
    issuedOn: row.issuedOn,
    issuedByName: names(row.issuedByUserId),
    recipientUserIds: [...row.recipientUserIds],
    pages: [...row.pages],
    memo: row.memo,
    files: row.files.map((f) => memberOf(ISSUE_FILES, f, "issue file")),
    tint: row.tint,
    what: memberOf(ISSUE_WHATS, row.what, "issue extent"),
  };
}

/** The script's colour order as it was locked; the standard order for a script never locked. */
export function colourOrderOf(file: DocFile, docId: string): RevisionColour[] {
  const stored =
    file.production.get(docId)?.colourOrder ?? COLOUR_ORDERS.standard;
  return stored.map((colour) => memberOf(REVISION_COLOURS, colour, "colour"));
}

/** True from Lock for production until End production. */
export function isLocked(file: DocFile, docId: string): boolean {
  const row = file.production.get(docId);
  return row !== null && row.endedAt === null;
}

/** What the store holds for the document; a script not in production has no anchors, numbers, sets or issues. */
export function productionState(
  file: DocFile,
  docId: string,
  names: (userId: string) => string,
): ProductionState {
  const { production } = file;
  const row = production.get(docId);
  const locked = isLocked(file, docId);
  const anchors = locked ? recordsOf(production.anchors(docId)) : [];
  return {
    v: 1,
    docId,
    headSeq: file.log.get(docId)?.headSeq ?? 0,
    locked,
    lockLevel: anchors.reduce((level, a) => Math.max(level, a.level), 0),
    lockedOn: locked && row !== null ? row.lockedOn : null,
    numbering: numberingOf(file, docId),
    colourOrder: [...(row?.colourOrder ?? COLOUR_ORDERS.standard)],
    anchors,
    sceneNumbers: locked
      ? production
          .sceneNumbers(docId)
          .toSorted((a, b) => compareSceneNumbers(a.num, b.num))
      : [],
    sets: locked
      ? production.sets(docId).map((set) => setView(file, set, names))
      : [],
    issues: locked
      ? production.issues(docId).map((issue) => issueView(issue, names))
      : [],
  };
}

/** The document's row; a RangeError for one this file does not hold. */
export function documentOf(file: DocFile, docId: string): DocumentRow {
  const row = file.log.get(docId);
  if (row === null) throw new RangeError(`no document ${docId} here`);
  return row;
}

export function notLocked(
  file: DocFile,
  docId: string,
): ProductionRefused | null {
  return isLocked(file, docId) ? null : refused("not_locked");
}

/** The answer of a request that changes the production state, and how a stored one reads back. */
export function stateAnswer(
  options: Pick<ProductionOptions, "names">,
  docId: string,
): Pick<Mutation<ProductionState>, "answer" | "isAnswer"> {
  return {
    answer: (file) => productionState(file, docId, options.names),
    isAnswer: (value): value is ProductionState =>
      isProductionState(value) && value.docId === docId,
  };
}
