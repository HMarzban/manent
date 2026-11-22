// The cost of revision marks per keystroke in a locked 120-page script with twelve issued revisions and
// 400 blocks changed in the active one: the typed block's mark worked out again against the baseline, then
// the three pages in view drawn with their revision.
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  engineFor,
  profileFromSettings,
} from "@manent/pagination";
import {
  COLOUR_ORDERS,
  DEFAULT_MARK,
  baselineOf,
  canonicalBlocksOf,
  captureAnchors,
  liveMarks,
  lockedPagination,
  markBlock,
  pageRevision,
  revisionColour,
  revisionName,
} from "@manent/revisions";
import type { BlockMark, RevisionSource } from "@manent/revisions";
import { blocksOf, sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { spread } from "../../server/history/restore-120.bench.ts";
import { scriptOfPages } from "../../server/support.ts";
import { DAY } from "./lock.bench.ts";

const ITERATIONS = 20;
const ISSUED = 12;
const CHANGED = 400;
const IN_VIEW = 3;
const WORD = "Again ";
const ORDER = COLOUR_ORDERS.standard;

/** `block` with `text` typed at its start; RangeError for a block that does not open with text. */
function typed(block: BlockJSON, text: string): BlockJSON {
  const [first, ...rest] = block.content ?? [];
  if (first?.text === undefined)
    throw new RangeError(`block ${String(block.attrs?.id)} opens with no text`);
  return {
    ...block,
    content: [{ ...first, text: text + first.text }, ...rest],
  };
}

const idOf = (block: BlockJSON): string => String(block.attrs?.id);

/** Revision `ordinal` of the standard order, marking `marks`. */
const source = (
  ordinal: number,
  marks: ReadonlyMap<string, BlockMark>,
): RevisionSource => ({
  ordinal,
  name: revisionName(ORDER, ordinal),
  colour: revisionColour(ORDER, ordinal),
  mark: DEFAULT_MARK,
  day: DAY,
  fullDraft: false,
  marks,
});

/** The script as locked, the same script with a word typed into 400 of its blocks, and its pages under the lock. */
function lockedScript() {
  const engine = engineFor(ENGINE_VERSION);
  if (engine === null) throw new Error(`no layout engine ${ENGINE_VERSION}`);
  const settings = { ...DEFAULT_LAYOUT_SETTINGS, scenesNumbered: true };
  const profile = profileFromSettings(engine, settings);
  if (profile === null) throw new Error("no screenplay profile");
  const base = canonicalBlocksOf(scriptOfPages(120));
  const changed = new Set(spread(base.map(idOf), CHANGED));
  const current = base.map((b) => (changed.has(idOf(b)) ? typed(b, WORD) : b));
  const layoutOf = (blocks: readonly BlockJSON[]) =>
    engine.toLayoutBlocks(blocksOf(sectionize(blocks)));
  const records = captureAnchors(
    engine.paginate(layoutOf(base), profile),
    "every_page",
    1,
    "lock",
  );
  const { pagination } = lockedPagination(
    layoutOf(current),
    profile,
    records,
    engine,
  );
  return { engine, base, changed: [...changed], current, pagination };
}

/** Each issued revision marks a word in 400 blocks, the k-th revision's spread from the script's k-th block on. */
function issuedSources(ids: readonly string[]): RevisionSource[] {
  return Array.from({ length: ISSUED }, (_, i) => {
    const mark: BlockMark = {
      kind: "ranges",
      inserted: [[0, WORD.length]],
      deletedAt: [],
    };
    const marked = spread(ids.slice(i + 1), CHANGED);
    return source(i + 1, new Map(marked.map((id) => [id, mark])));
  });
}

async function marksTimes(): Promise<number[]> {
  const { engine, base, changed, current, pagination: p } = lockedScript();
  const baseline = baselineOf(base);
  const earlier = issuedSources(base.map(idOf));
  let marks: ReadonlyMap<string, BlockMark> = liveMarks(
    baseline,
    blocksOf(sectionize(current)),
    new Set(),
    () => null,
  );
  const at = new Map(p.blocks.map((b, i) => [b.id, i]));
  const byId = new Map(current.map((b) => [idOf(b), b]));
  const times: number[] = [];
  for (const id of spread(changed, ITERATIONS)) {
    const before = byId.get(id);
    const index = at.get(id);
    if (before === undefined || index === undefined)
      throw new RangeError(`block ${id} is not on the pages`);
    const block = typed(before, "x");
    const page = engine.pageOf(p, index, 0);
    const first = Math.min(page, p.pages.length - IN_VIEW);
    // no scene is omitted, so a block is shown exactly when the baseline shows it
    const shown = baseline.visible.has(id);
    times.push(
      await sampleMs(() => {
        const mark = markBlock(baseline.blocks.get(id) ?? null, block, {
          baseVisible: shown,
          visible: shown,
          moved: false,
          override: null,
        });
        const next = new Map(marks);
        if (mark === null) next.delete(id);
        else next.set(id, mark);
        const sources = [...earlier, source(ISSUED + 1, next)];
        for (let i = first; i < first + IN_VIEW; i++)
          pageRevision(p, i, sources, "collated");
        marks = next;
      }),
    );
  }
  return times;
}

/**
 * `marks_ms`: 20 keystrokes, each in another of the 400 changed blocks: its mark worked out again, as the
 * editor does for the block a transaction changed, and the revision of the three pages from its own on.
 */
const scenario: Scenario = {
  id: "production.marks",
  workload: "W1",
  processes: 5,
  run: async (): Promise<Measurement[]> => [
    { metric: "marks_ms", unit: "ms", samples: await marksTimes() },
  ],
};

export default scenario;
