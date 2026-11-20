// The hard cases of locked page numbers: one script locked for production, one change each, and the labels
// its pages print. Each list of labels was worked once by running and checked by hand against the rule
// written beside it.
import { applyLayoutPatches, engineFor } from "@manent/pagination";
import type {
  LayoutBlock,
  LockAnchorRecord,
  PageProfile,
} from "@manent/pagination";
import {
  corpusDoc,
  corpusId,
  generateBlocks,
} from "@manent/pagination/testing";
import { blocksOf, sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON, FlatBlock } from "@manent/schema";
import {
  captureAnchors,
  lockNumbers,
  lockedPagination,
  mergeAnchors,
  planRestore,
  productionLayout,
} from "../src/index.ts";
import type { LockedLayout, SceneNumberRecord } from "../src/index.ts";
import { b, blockJSONs } from "./history-docs.ts";

export interface HardCase {
  name: string;
  blocks: LayoutBlock[];
  records: LockAnchorRecord[];
  labels: string[];
}

export const v1 = engineFor(1)!;
export const SCREENPLAY: PageProfile = v1.profileFor("screenplay")!;

/** The labels "from" to "to", as numbers. */
function pages(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
}

export function flatOf(blocks: readonly BlockJSON[]): FlatBlock[] {
  return blocksOf(sectionize(blocks));
}

/** The blocks as production lays them out: omitted scenes take no room. */
export function layoutOf(blocks: readonly BlockJSON[]): LayoutBlock[] {
  const flat = flatOf(blocks);
  return applyLayoutPatches(
    v1.toLayoutBlocks(flat),
    productionLayout(flat, new Map()),
  );
}

export function pagesUnder(
  blocks: readonly LayoutBlock[],
  records: readonly LockAnchorRecord[],
  profile: PageProfile = SCREENPLAY,
): LockedLayout {
  return lockedPagination(blocks, profile, records, v1);
}

export function labelsOf(layout: LockedLayout): string[] {
  return layout.pagination.pages.map((page) => page.label);
}

/** The script before lock, 47 pages of it: its headings carry no number. */
const UNLOCKED: DocJSON = corpusDoc(generateBlocks("screenplay", 750, 7));

/** Each heading's number as lock issued it. */
export const ISSUED: SceneNumberRecord[] = lockNumbers(blocksOf(UNLOCKED)).map(
  (n) => ({ ...n, reserved: false }),
);

const issuedNum = new Map(ISSUED.map((n) => [n.blockId, n.num]));

/** The script as locked: lock wrote each heading's number into it. */
const LOCKED: BlockJSON[] = blockJSONs(UNLOCKED).map((block) => {
  const num = issuedNum.get(String(block.attrs?.id));
  return num === undefined
    ? block
    : { ...block, attrs: { ...block.attrs, num } };
});

const lockOf = (blocks: readonly BlockJSON[]): LockAnchorRecord[] =>
  captureAnchors(
    v1.paginate(layoutOf(blocks), SCREENPLAY),
    "every_page",
    1,
    "lock",
  );

export const RECORDS: LockAnchorRecord[] = lockOf(LOCKED);

/** Where in `blocks` the anchor of the page `label` of `records` starts. */
function startOf(
  blocks: readonly BlockJSON[],
  records: readonly LockAnchorRecord[],
  label: string,
): { index: number; offset: number } {
  const anchor = records.find((record) => record.label === label)!;
  return {
    index: blocks.findIndex((block) => block.attrs?.id === anchor.blockId),
    offset: anchor.offset,
  };
}

// Lines of an action, each LINE units, that wrap exactly at its 60 cells and start with their own words, so
// that a quote of one is found in one place only.
const LINE = 61;
function lines(tag: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const head = `${tag} ${String(i + 1).padStart(3, "0")} `;
    return `${head}${"x".repeat(LINE - 2 - head.length)}. `;
  });
}

const added = (n: number, text: string) => b(corpusId(1000 + n), text);

/** Page 12 with an action of 60 lines added at its end. */
const GROWN: BlockJSON[] = LOCKED.toSpliced(
  startOf(LOCKED, RECORDS, "13").index,
  0,
  added(1, lines("Growth", 60).join("")),
);

/** What issuing the grown script records: its A-pages as issue anchors. */
const ISSUED_GROWN: LockAnchorRecord[] = (() => {
  const p = pagesUnder(layoutOf(GROWN), RECORDS).pagination;
  return mergeAnchors(
    RECORDS,
    captureAnchors(p, "derived_pages", 1, "issue"),
    p,
  );
})();

// After the issue, 30 of the added lines on page 12A are deleted.
function shrunk12A(): BlockJSON[] {
  const at = startOf(GROWN, ISSUED_GROWN, "12A");
  const growth = GROWN[at.index]!;
  const kept = lines("Growth", 60).toSpliced(at.offset / LINE + 10, 30);
  return GROWN.with(at.index, {
    ...growth,
    content: [{ type: "text", text: kept.join("") }],
  });
}

/** Every block of page 13 deleted, its anchor's fallbacks with them. */
export function deletedPage13(): BlockJSON[] {
  const from = startOf(LOCKED, RECORDS, "13").index;
  return LOCKED.toSpliced(from, startOf(LOCKED, RECORDS, "14").index - from);
}

// The heading of the first scene that starts on page 20.
function firstHeadingOn20(): number {
  const from = startOf(LOCKED, RECORDS, "20").index;
  return LOCKED.findIndex(
    (block, i) => i >= from && block.attrs?.type === "scene_heading",
  );
}

/** The first scene that starts on page 20, omitted. */
export function omittedOn20(): BlockJSON[] {
  const at = firstHeadingOn20();
  const heading = LOCKED[at]!;
  return LOCKED.with(at, {
    ...heading,
    attrs: { ...heading.attrs, omitted: true },
  });
}

/** The blocks that start pages 12 and 13, through the last before page 14, moved to the end of page 30. */
export function movedPages12To13(): BlockJSON[] {
  const from = startOf(LOCKED, RECORDS, "12").index;
  const to = startOf(LOCKED, RECORDS, "14").index;
  const end = startOf(LOCKED, RECORDS, "31").index;
  return [
    ...LOCKED.slice(0, from),
    ...LOCKED.slice(to, end),
    ...LOCKED.slice(from, to),
    ...LOCKED.slice(end),
  ];
}

/** The script locked with an action of 160 lines at the start of page 13, so that three anchors fall inside it. */
const LONG: BlockJSON[] = LOCKED.toSpliced(
  startOf(LOCKED, RECORDS, "13").index,
  0,
  added(2, lines("Long", 160).join("")),
);
export const LONG_RECORDS: LockAnchorRecord[] = lockOf(LONG);

// Five lines typed after the tenth line of the long action, on its first page.
function editedLong(): BlockJSON[] {
  const at = startOf(LONG, LONG_RECORDS, "13").index;
  const text = lines("Long", 160).toSpliced(10, 0, ...lines("Typed", 5));
  return LONG.with(at, {
    ...LONG[at]!,
    content: [{ type: "text", text: text.join("") }],
  });
}

/** Words typed at the start of the speech page 12 starts inside, before that anchor's quote. */
export const TYPED = "Not yet. ";

function typedBeforeQuote(): BlockJSON[] {
  const at = startOf(LOCKED, RECORDS, "12").index;
  const speech = LOCKED[at]!;
  const text = (speech.content ?? []).map((run) => run.text).join("");
  return LOCKED.with(at, {
    ...speech,
    content: [{ type: "text", text: TYPED + text }],
  });
}

/** The script edited in production (a scene's heading deleted, a speech on page 4 retyped), then the version from before lock restored. */
export function restoredFromBeforeLock(): DocJSON {
  const speech = LOCKED[40]!;
  const current = LOCKED.toSpliced(firstHeadingOn20(), 1).with(40, {
    ...speech,
    content: [{ type: "text", text: "Something else entirely." }],
  });
  return planRestore(
    sectionize(current),
    UNLOCKED,
    { kind: "script" },
    {
      authority: (blockId) => {
        const num = issuedNum.get(blockId);
        return num === undefined ? null : { num, omitted: false };
      },
      newId: () => corpusId(2000),
    },
  ).result;
}

const hardCaseOf = (
  name: string,
  blocks: readonly BlockJSON[],
  records: LockAnchorRecord[],
  labels: string[],
): HardCase => ({ name, blocks: layoutOf(blocks), records, labels });

export function hardCases(): HardCase[] {
  return [
    hardCaseOf("as locked", LOCKED, RECORDS, pages(1, 47)),
    // 51 lines and 61 more fill 12 and 12A and run onto a new 12B.
    hardCaseOf("page 12 grows by 60 lines", GROWN, RECORDS, [
      ...pages(1, 12),
      "12A",
      "12B",
      ...pages(13, 47),
    ]),
    // Issued anchors hold: 12A ends where 12B's quote now is, 24 lines down.
    hardCaseOf("an issued 12A shrinks", shrunk12A(), ISSUED_GROWN, [
      ...pages(1, 12),
      "12A",
      "12B",
      ...pages(13, 47),
    ]),
    // An anchor with nothing left joins the next kept one.
    hardCaseOf("page 13 deleted", deletedPage13(), RECORDS, [
      ...pages(1, 12),
      "13–14",
      ...pages(15, 47),
    ]),
    // The scene ends where page 21 starts: page 20 is short and nothing moves.
    hardCaseOf(
      "the first scene on page 20 omitted",
      omittedOn20(),
      RECORDS,
      pages(1, 47),
    ),
    // Anchors 12 and 13 are out of order and ignored; page 30's content and the moved blocks run onto three A-pages.
    hardCaseOf(
      "pages 12 and 13 moved after page 30",
      movedPages12To13(),
      RECORDS,
      [
        ...pages(1, 11),
        ...pages(14, 30),
        "30A",
        "30B",
        "30C",
        ...pages(31, 47),
      ],
    ),
    // Anchors 14 and 15 follow their quotes 5 lines down; 13's extra 5 lines make 13A.
    hardCaseOf(
      "a block spanning three pages edited before its second page",
      editedLong(),
      LONG_RECORDS,
      [...pages(1, 13), "13A", ...pages(14, 50)],
    ),
    // Page 12 starts at its quote, 9 units on; page 11 takes the typed words and still fits.
    hardCaseOf(
      "text typed before an anchor's quote",
      typedBeforeQuote(),
      RECORDS,
      pages(1, 47),
    ),
    // The restored text is the script as locked, with every number as issued.
    hardCaseOf(
      "a version from before lock restored",
      blockJSONs(restoredFromBeforeLock()),
      RECORDS,
      pages(1, 47),
    ),
  ];
}
