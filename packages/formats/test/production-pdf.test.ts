import { expect, test } from "bun:test";
import { applyLayoutPatches, engineFor } from "@manent/pagination";
import type {
  FontFaceKey,
  LockAnchorRecord,
  PageProfile,
} from "@manent/pagination";
import {
  corpusDoc,
  corpusId,
  generateBlocks,
} from "@manent/pagination/testing";
import {
  captureAnchors,
  lockNumbers,
  lockedPagination,
  mergeAnchors,
  planRestore,
  productionLayout,
} from "@manent/revisions";
import type { RevisionSource } from "@manent/revisions";
import { blocksOf, canonicalBlock, sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { packetPagination, writePacket } from "../src/index.ts";
import type { PacketInput, ScriptFontFiles } from "../src/index.ts";
import { readPdf } from "./read-pdf.ts";

const woff = (key: FontFaceKey) =>
  Bun.file(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      import.meta.dir,
    ),
  ).bytes();

const fonts: ScriptFontFiles = {
  "latin-400-normal": await woff("latin-400-normal"),
  "latin-400-italic": await woff("latin-400-italic"),
  "latin-700-normal": await woff("latin-700-normal"),
  "latin-700-italic": await woff("latin-700-italic"),
  "latin-ext-400-normal": await woff("latin-ext-400-normal"),
  "latin-ext-400-italic": await woff("latin-ext-400-italic"),
  "latin-ext-700-normal": await woff("latin-ext-700-normal"),
  "latin-ext-700-italic": await woff("latin-ext-700-italic"),
};

// The hard cases of locked page numbers: one script locked for production, one change each, and the
// labels its pages print, as the screen shows them.
interface HardCase {
  name: string;
  blocks: BlockJSON[];
  records: LockAnchorRecord[];
  labels: string[];
}

const v1 = engineFor(1)!;
const SCREENPLAY: PageProfile = v1.profileFor("screenplay")!;

const pages = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

const flatOf = (blocks: readonly BlockJSON[]) => blocksOf(sectionize(blocks));

const action = (id: string, text: string): BlockJSON =>
  canonicalBlock({
    type: "block",
    attrs: { id, type: "action" },
    content: [{ type: "text", text }],
  });

const blockJSONs = (json: DocJSON): BlockJSON[] =>
  (json.content ?? [])
    .flatMap((section) => section.content ?? [])
    .map(canonicalBlock);

function pagesUnder(
  blocks: readonly BlockJSON[],
  records: readonly LockAnchorRecord[],
) {
  const flat = flatOf(blocks);
  const laid = applyLayoutPatches(
    v1.toLayoutBlocks(flat),
    productionLayout(flat, new Map()),
  );
  return lockedPagination(laid, SCREENPLAY, records, v1).pagination;
}

/** The script before lock, 47 pages of it: its headings carry no number. */
const UNLOCKED: DocJSON = corpusDoc(generateBlocks("screenplay", 750, 7));
const issuedNum = new Map(
  lockNumbers(blocksOf(UNLOCKED)).map((n) => [n.blockId, n.num]),
);

/** The script as locked: lock wrote each heading's number into it. */
const LOCKED: BlockJSON[] = blockJSONs(UNLOCKED).map((block) => {
  const num = issuedNum.get(String(block.attrs?.id));
  return num === undefined
    ? block
    : { ...block, attrs: { ...block.attrs, num } };
});

const lockOf = (blocks: readonly BlockJSON[]) =>
  captureAnchors(pagesUnder(blocks, []), "every_page", 1, "lock");

const RECORDS = lockOf(LOCKED);

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

// Lines of an action, each LINE units, that wrap exactly at its 60 cells and start with their own words.
const LINE = 61;
function lines(tag: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const head = `${tag} ${String(i + 1).padStart(3, "0")} `;
    return `${head}${"x".repeat(LINE - 2 - head.length)}. `;
  });
}

const GROWTH_ID = corpusId(1001);

/** Page 12 with an action of 60 lines added at its end. */
const GROWN = LOCKED.toSpliced(
  startOf(LOCKED, RECORDS, "13").index,
  0,
  action(GROWTH_ID, lines("Growth", 60).join("")),
);

const ISSUED_GROWN = (() => {
  const p = pagesUnder(GROWN, RECORDS);
  return mergeAnchors(
    RECORDS,
    captureAnchors(p, "derived_pages", 1, "issue"),
    p,
  );
})();

function shrunk12A(): BlockJSON[] {
  const at = startOf(GROWN, ISSUED_GROWN, "12A");
  const kept = lines("Growth", 60).toSpliced(at.offset / LINE + 10, 30);
  return GROWN.with(at.index, {
    ...GROWN[at.index]!,
    content: [{ type: "text", text: kept.join("") }],
  });
}

function deletedPage13(): BlockJSON[] {
  const from = startOf(LOCKED, RECORDS, "13").index;
  return LOCKED.toSpliced(from, startOf(LOCKED, RECORDS, "14").index - from);
}

function firstHeadingOn20(): number {
  const from = startOf(LOCKED, RECORDS, "20").index;
  return LOCKED.findIndex(
    (block, i) => i >= from && block.attrs?.type === "scene_heading",
  );
}

function omittedOn20(): BlockJSON[] {
  const at = firstHeadingOn20();
  const heading = LOCKED[at]!;
  return LOCKED.with(at, {
    ...heading,
    attrs: { ...heading.attrs, omitted: true },
  });
}

function movedPages12To13(): BlockJSON[] {
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
const LONG = LOCKED.toSpliced(
  startOf(LOCKED, RECORDS, "13").index,
  0,
  action(corpusId(1002), lines("Long", 160).join("")),
);
const LONG_RECORDS = lockOf(LONG);

function editedLong(): BlockJSON[] {
  const at = startOf(LONG, LONG_RECORDS, "13").index;
  const text = lines("Long", 160).toSpliced(10, 0, ...lines("Typed", 5));
  return LONG.with(at, {
    ...LONG[at]!,
    content: [{ type: "text", text: text.join("") }],
  });
}

function typedBeforeQuote(): BlockJSON[] {
  const at = startOf(LOCKED, RECORDS, "12").index;
  const speech = LOCKED[at]!;
  const text = (speech.content ?? []).map((run) => run.text).join("");
  return LOCKED.with(at, {
    ...speech,
    content: [{ type: "text", text: `Not yet. ${text}` }],
  });
}

function restoredFromBeforeLock(): BlockJSON[] {
  const speech = LOCKED[40]!;
  const current = LOCKED.toSpliced(firstHeadingOn20(), 1).with(40, {
    ...speech,
    content: [{ type: "text", text: "Something else entirely." }],
  });
  return blockJSONs(
    planRestore(
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
    ).result,
  );
}

const HARD_CASES: HardCase[] = [
  { name: "as locked", blocks: LOCKED, records: RECORDS, labels: pages(1, 47) },
  {
    name: "page 12 grows by 60 lines",
    blocks: GROWN,
    records: RECORDS,
    labels: [...pages(1, 12), "12A", "12B", ...pages(13, 47)],
  },
  {
    name: "an issued 12A shrinks",
    blocks: shrunk12A(),
    records: ISSUED_GROWN,
    labels: [...pages(1, 12), "12A", "12B", ...pages(13, 47)],
  },
  {
    name: "page 13 deleted",
    blocks: deletedPage13(),
    records: RECORDS,
    labels: [...pages(1, 12), "13–14", ...pages(15, 47)],
  },
  {
    name: "the first scene on page 20 omitted",
    blocks: omittedOn20(),
    records: RECORDS,
    labels: pages(1, 47),
  },
  {
    name: "pages 12 and 13 moved after page 30",
    blocks: movedPages12To13(),
    records: RECORDS,
    labels: [
      ...pages(1, 11),
      ...pages(14, 30),
      "30A",
      "30B",
      "30C",
      ...pages(31, 47),
    ],
  },
  {
    name: "a block spanning three pages edited before its second page",
    blocks: editedLong(),
    records: LONG_RECORDS,
    labels: [...pages(1, 13), "13A", ...pages(14, 50)],
  },
  {
    name: "text typed before an anchor's quote",
    blocks: typedBeforeQuote(),
    records: RECORDS,
    labels: pages(1, 47),
  },
  {
    name: "a version from before lock restored",
    blocks: restoredFromBeforeLock(),
    records: RECORDS,
    labels: pages(1, 47),
  },
];

const BLUE: RevisionSource = {
  ordinal: 1,
  name: "Blue",
  colour: "blue",
  mark: "*",
  day: "2026-11-16",
  fullDraft: false,
  marks: new Map([[GROWTH_ID, { kind: "whole" }]]),
};

const blue = HARD_CASES[1]!;

function input(
  c: HardCase,
  over: Partial<Omit<PacketInput, "content">>,
): PacketInput {
  return {
    content: { blocks: c.blocks },
    profile: SCREENPLAY,
    engine: v1,
    anchors: c.records,
    numbers: new Map(),
    sources: c === blue ? [BLUE] : [],
    pages: null,
    marked: true,
    tint: false,
    ...over,
  };
}

for (const c of HARD_CASES)
  test(`the packet's pages are the screen's: ${c.name}`, async () => {
    expect(
      (await readPdf(await writePacket(input(c, { pages: null }), fonts))).map(
        (p) => p.label,
      ),
    ).toEqual(c.labels.map((l, i) => (i === 0 ? null : l)));
  });

test("revised pages only, with and without asterisks", async () => {
  const marked = await readPdf(
    await writePacket(
      input(blue, { pages: ["12", "12A"], marked: true }),
      fonts,
    ),
  );
  const clean = await readPdf(
    await writePacket(
      input(blue, { pages: ["12", "12A"], marked: false }),
      fonts,
    ),
  );
  const starred = (page: (typeof marked)[number]) =>
    page.lines.some((l) => l.items.some((item) => item.text === "*"));
  expect([
    marked.map((p) => p.label),
    starred(marked[0]!),
    starred(clean[0]!),
    clean[0]!.lines[0]!.items[0]!.text,
  ]).toEqual([["12", "12A"], true, false, "Blue Rev. (16 Nov 2026)"]);
});

test("a tint is drawn only when asked", async () => {
  const [tinted] = await readPdf(
    await writePacket(input(blue, { pages: ["12"], tint: true }), fonts),
  );
  const [plain] = await readPdf(
    await writePacket(input(blue, { pages: ["12"], tint: false }), fonts),
  );
  expect([
    [tinted!.tinted, tinted!.tintColor],
    [plain!.tinted, plain!.tintColor],
  ]).toEqual([
    [true, "#d3e6fa"],
    [false, null],
  ]);
});

test("an omitted scene reads OMITTED in the packet, takes no room and shows the number it is given", () => {
  const omitted = HARD_CASES[4]!;
  const heading = String(
    omitted.blocks.find((b) => b.attrs?.omitted === true)!.attrs?.id,
  );
  const p = packetPagination(
    input(omitted, { numbers: new Map([[heading, "19A"]]) }),
  );
  const shown = p.blocks.find((b) => b.id === heading)!;
  expect([p.pages[19]!.usedUnits, shown.text, shown.num]).toEqual([
    50,
    "OMITTED",
    "19A",
  ]);
});

test("a page the packet does not print is refused", async () => {
  const refused: unknown = await writePacket(
    input(blue, { pages: ["12C"] }),
    fonts,
  ).catch((error: unknown) => error);
  expect([
    refused instanceof RangeError,
    refused instanceof Error && refused.message,
  ]).toEqual([true, "a packet's page must be a label it prints, not 12C"]);
});
