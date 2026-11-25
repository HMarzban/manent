// Lock an imported script where its file locked it: its page starts as import anchors, its scene numbers
// issued, and each revision it marked an issued set with its marks.
import { scriptBody, scriptSettings } from "@manent/crdt";
import type { Engine, LockAnchorRecord, Pagination } from "@manent/pagination";
import {
  COLOUR_NAMES,
  COLOUR_ORDERS,
  REVISION_COLOURS,
  canonicalBlocksOf,
  captureAnchors,
  contentHash,
  deriveNumbers,
  idOf,
  importAnchors,
} from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON, FlatBlock } from "@manent/schema";
import type { SetBlockRow } from "@manent/storage";
import {
  NUMBERING_SCHEMES,
  isDocId,
  isRequestKey,
} from "@manent/sync-protocol";
import type {
  ImportLockRequest,
  ImportedSetRequest,
  ProductionState,
} from "@manent/sync-protocol";
import { isObject } from "../http/routes/docs.ts";
import {
  commitLock,
  freezeSettings,
  lockRefusal,
  writeNumbers,
} from "./freeze.ts";
import type { LockCommit } from "./freeze.ts";
import type { Mutation, ProductionOptions, Requests } from "./requests.ts";
import {
  engineVersionOf,
  layoutUnder,
  scriptPages,
  stateAnswer,
} from "./state.ts";

/** An imported set as its commit writes it: its colour checked, its blocks placed on their pages. */
interface ImportedSet {
  readonly colour: RevisionColour;
  readonly mark: string;
  readonly fullDraft: boolean;
  readonly blocks: readonly Omit<SetBlockRow, "setId">[];
}

const isListOf = (value: unknown, item: (v: unknown) => boolean): boolean =>
  Array.isArray(value) && value.every(item);

const isOffset = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isLabel = (value: unknown): boolean =>
  typeof value === "string" && value !== "";

const isRange = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  isOffset(value[0]) &&
  isOffset(value[1]) &&
  value[0] < value[1];

const isStart = (value: unknown): boolean =>
  isObject(value) &&
  isLabel(value.label) &&
  typeof value.blockId === "string" &&
  isOffset(value.offset);

const isNumber = (value: unknown): boolean =>
  isObject(value) && typeof value.blockId === "string" && isLabel(value.num);

const isSetBlock = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.blockId === "string" &&
  isListOf(value.inserted, isRange) &&
  isListOf(value.deletedAt, isOffset);

const isSet = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.sourceName === "string" &&
  typeof value.colour === "string" &&
  typeof value.mark === "string" &&
  typeof value.fullDraft === "boolean" &&
  isListOf(value.blocks, isSetBlock);

/** A body holding every field of an import lock, each of its type and in its range; the script's own checks come at the write. */
export function isImportLockRequest(
  value: unknown,
): value is ImportLockRequest {
  if (!isObject(value)) return false;
  const { numbering } = value;
  return (
    isDocId(value.docId) &&
    isRequestKey(value.key) &&
    typeof value.lockedOn === "string" &&
    NUMBERING_SCHEMES.some((scheme) => scheme === numbering) &&
    isListOf(value.anchors, isStart) &&
    isListOf(value.sceneNumbers, isNumber) &&
    isListOf(value.sets, isSet)
  );
}

const isNumberedHeading = (block: FlatBlock): boolean =>
  block.attrs.type === "scene_heading" || block.attrs.type === "slug";

const isColour = (value: string): value is RevisionColour =>
  REVISION_COLOURS.some((colour) => colour === value);

const isDistinct = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

/** The page starts begin at the script's first block, at 0, and follow one another on blocks it holds. */
function startsFit(
  anchors: ImportLockRequest["anchors"],
  flat: readonly FlatBlock[],
): boolean {
  const at = new Map(flat.map((block, i) => [block.attrs.id, i]));
  const [first] = anchors;
  if (first === undefined) return true;
  if (first.blockId !== flat[0]?.attrs.id || first.offset !== 0) return false;
  let previous = { i: -1, offset: 0 };
  for (const { blockId, offset } of anchors) {
    const i = at.get(blockId);
    if (i === undefined || offset > blockText(flat[i]!).length) return false;
    const follows =
      i > previous.i || (i === previous.i && offset > previous.offset);
    if (!follows) return false;
    previous = { i, offset };
  }
  return isDistinct(anchors.map((a) => a.label));
}

/** Each number is on a heading the script holds, once, and no number is given twice. */
function numbersFit(
  sceneNumbers: ImportLockRequest["sceneNumbers"],
  flat: readonly FlatBlock[],
): boolean {
  const headings = new Set(
    flat.filter(isNumberedHeading).map((block) => block.attrs.id),
  );
  return (
    sceneNumbers.every((n) => headings.has(n.blockId)) &&
    isDistinct(sceneNumbers.map((n) => n.blockId)) &&
    isDistinct(sceneNumbers.map((n) => n.num))
  );
}

/** Every heading's number: the file's, else derived from its neighbours, never one the file gave. */
function importedNumbers(
  flat: readonly FlatBlock[],
  request: ImportLockRequest,
): { blockId: string; num: string }[] {
  const given = new Map(request.sceneNumbers.map((n) => [n.blockId, n.num]));
  const headings = flat
    .filter(isNumberedHeading)
    .flatMap(({ attrs }) =>
      attrs.id === null
        ? []
        : [{ blockId: attrs.id, num: given.get(attrs.id) ?? null }],
    );
  const used = new Set(given.values());
  const derived = deriveNumbers(headings, request.numbering, used);
  return headings.flatMap(({ blockId, num }) => {
    const shown = num ?? derived.get(blockId);
    return shown === undefined ? [] : [{ blockId, num: shown }];
  });
}

/** By block id, the label of the page its first line is on; the last page's for a block not laid out. */
function firstPageLabels(
  p: Pagination,
  engine: Engine,
): (blockId: string) => string {
  const labels = new Map<string, string>();
  p.blocks.forEach((block, i) => {
    if (!labels.has(block.id))
      labels.set(block.id, p.pages[engine.pageOf(p, i, 0)]!.label);
  });
  const last = p.pages.at(-1)!.label;
  return (blockId) => labels.get(blockId) ?? last;
}

/**
 * The request's sets as their commit writes them, each block hashed as written and placed on its page;
 * null when a set is not one of Manent's colours, or marks a block the script does not hold, twice, or
 * outside its text.
 */
function importedSets(
  sets: readonly ImportedSetRequest[],
  flat: readonly FlatBlock[],
  blocks: readonly BlockJSON[],
  pageLabelOf: (blockId: string) => string,
): ImportedSet[] | null {
  const lengths = new Map(flat.map((b) => [b.attrs.id, blockText(b).length]));
  const byId = new Map(blocks.map((block) => [idOf(block), block]));
  const made: ImportedSet[] = [];
  for (const { colour, mark, fullDraft, blocks: marked } of sets) {
    if (!isColour(colour)) return null;
    if (!isDistinct(marked.map((b) => b.blockId))) return null;
    const rows: ImportedSet["blocks"][number][] = [];
    for (const { blockId, inserted, deletedAt } of marked) {
      const length = lengths.get(blockId);
      const block = byId.get(blockId);
      if (length === undefined || block === undefined) return null;
      const inside =
        inserted.every(([, end]) => end <= length) &&
        deletedAt.every((offset) => offset <= length);
      if (!inside) return null;
      const pageLabel = pageLabelOf(blockId);
      const hash = contentHash(block);
      rows.push({
        blockId,
        pageLabel,
        change: "changed",
        hash,
        inserted,
        deletedAt,
      });
    }
    made.push({ colour, mark, fullDraft, blocks: rows });
  }
  return made;
}

export function importLockMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: ImportLockRequest,
): Mutation<ProductionState> {
  const { docId, key } = request;
  let made: Pick<LockCommit, "records" | "numbers" | "engineVersion"> & {
    sets: readonly ImportedSet[];
  } = { records: [], numbers: [], engineVersion: 0, sets: [] };
  return {
    docId,
    key,
    need: "lock_page_numbers",
    tells: ["lock_anchors_changed", "layout_changed"],
    check: (file) => lockRefusal(file, request),
    edit(doc) {
      const stored = scriptSettings(doc).entries();
      const under = layoutUnder(stored, engineVersionOf(stored));
      if (!under.ok) return under;
      const { engine, profile } = under;
      const content = scriptBody(doc).materialize();
      const flat = blocksOf(content);
      const fits =
        startsFit(request.anchors, flat) &&
        numbersFit(request.sceneNumbers, flat);
      if (!fits) return { ok: false, reason: "bad_request" };
      const numbers = importedNumbers(flat, request);
      const byId = new Map(numbers.map((n) => [n.blockId, n.num]));
      const records: LockAnchorRecord[] =
        request.anchors.length === 0
          ? captureAnchors(
              scriptPages(flat, byId, profile, [], engine).pagination,
              "every_page",
              1,
              "lock",
            )
          : importAnchors(
              flat.flatMap((block) =>
                block.attrs.id === null
                  ? []
                  : [{ id: block.attrs.id, text: blockText(block) }],
              ),
              request.anchors,
            );
      const { pagination } = scriptPages(flat, byId, profile, records, engine);
      const pageLabelOf = firstPageLabels(pagination, engine);
      const blocks = canonicalBlocksOf(content);
      const sets = importedSets(request.sets, flat, blocks, pageLabelOf);
      if (sets === null) return { ok: false, reason: "bad_request" };
      made = { records, numbers, engineVersion: engine.version, sets };
      writeNumbers(doc, flat, numbers);
      const frozen = {
        numbering: request.numbering,
        colourOrder: "standard",
      } as const;
      freezeSettings(doc, frozen, { userId, setAt: options.now() });
      return { ok: true };
    },
    commit(file, _at, pos) {
      const { production } = file;
      const { numbering, lockedOn } = request;
      const order = COLOUR_ORDERS.standard;
      const active = made.sets.length + 1;
      const lock = { docId, userId, lockedOn, numbering, order, active };
      const { white, issued } = commitLock(
        file,
        pos,
        { ...lock, ...made },
        { ...options, keep: requests.keep },
      );
      made.sets.forEach(({ colour, mark, fullDraft, blocks }, i) => {
        const id = options.ids();
        const name = COLOUR_NAMES[colour];
        const set = {
          ...issued,
          id,
          ordinal: i + 1,
          name,
          colour,
          mark,
          fullDraft,
        };
        production.addSet(set);
        production.putSetBlocks(
          id,
          blocks.map((b) => ({ ...b, setId: id })),
        );
      });
      return [white];
    },
    ...stateAnswer(options, docId),
  };
}
