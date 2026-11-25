import { expect, test } from "bun:test";
import {
  pageStarts,
  paginate,
  profileFor,
  toLayoutBlock,
} from "@manent/pagination";
import type { FontFaceKey, PageProfile } from "@manent/pagination";
import {
  RULE_SCRIPTS,
  cueBlock,
  filledBlock,
  generateBlocks,
  layoutBlocksOf,
  viewOf,
} from "@manent/pagination/testing";
import type { CorpusFormat } from "@manent/pagination/testing";
import type { BlockView } from "@manent/schema";
import {
  findUnsupportedCharacters,
  placeWatermark,
  writePdf,
} from "../src/index.ts";
import type { ScriptFontFiles } from "../src/index.ts";
import { readPdf } from "./read-pdf.ts";

const sp = profileFor("screenplay")!;
const A = (n: number) => filledBlock("action", n);
const ruleScript = (name: string) =>
  RULE_SCRIPTS.find((script) => script.name === name)!.blocks;

const woff = (key: FontFaceKey) =>
  Bun.file(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      import.meta.dir,
    ),
  ).bytes();

async function loadWoff(): Promise<ScriptFontFiles> {
  return {
    "latin-400-normal": await woff("latin-400-normal"),
    "latin-400-italic": await woff("latin-400-italic"),
    "latin-700-normal": await woff("latin-700-normal"),
    "latin-700-italic": await woff("latin-700-italic"),
    "latin-ext-400-normal": await woff("latin-ext-400-normal"),
    "latin-ext-400-italic": await woff("latin-ext-400-italic"),
    "latin-ext-700-normal": await woff("latin-ext-700-normal"),
    "latin-ext-700-italic": await woff("latin-ext-700-italic"),
  };
}

const fonts = await loadWoff();

const CORPUS_BLOCKS = 600;
const corpus = (name: string, format: CorpusFormat, profile: PageProfile) => ({
  name,
  blocks: layoutBlocksOf(generateBlocks(format, CORPUS_BLOCKS, 1)),
  profile,
});
const PDF_SCRIPTS = [
  corpus("the screenplay corpus on Letter", "screenplay", sp),
  corpus(
    "the screenplay corpus on A4",
    "screenplay",
    profileFor("screenplay", { paper: "a4" })!,
  ),
  corpus("the multicam corpus", "multicam", profileFor("multicam")!),
  corpus("the manuscript corpus", "manuscript", profileFor("manuscript")!),
  corpus("the stage play corpus", "stage_play", profileFor("stage_play")!),
  ...RULE_SCRIPTS.filter((script) => script.name !== "outside-the-font").map(
    (script) => ({
      name: `the ${script.name} script`,
      blocks: layoutBlocksOf(script.blocks),
      profile: profileFor(script.format)!,
    }),
  ),
];

const squash = (s: string) => s.replace(new RegExp("\\s+", "g"), " ").trim();
const startsOf = (pages: Awaited<ReturnType<typeof readPdf>>, top: number) =>
  pages.map((pg) => ({
    label: pg.label,
    firstLine: squash(
      pg.lines
        .filter((l) => l.y >= top)
        .map((l) => l.text)
        .slice(0, 1)
        .join(""),
    ),
  }));

for (const g of PDF_SCRIPTS)
  test(`the PDF of ${g.name} starts every page where the engine does`, async () => {
    const p = paginate(g.blocks, g.profile);
    const pdf = await readPdf(await writePdf(p, { fonts }));
    expect(startsOf(pdf, g.profile.geometry.marginTopPt)).toEqual(
      pageStarts(p).map((s) => ({
        label: s.label,
        firstLine: squash(s.firstLine),
      })),
    );
    expect([pdf[0]!.width, pdf[0]!.height]).toEqual([
      g.profile.geometry.widthPt,
      g.profile.geometry.heightPt,
    ]);
  });

const r = (n: number) => Math.round(n * 10) / 10;
const line = async (v: BlockView) =>
  (
    await readPdf(await writePdf(paginate([toLayoutBlock(v)], sp), { fonts }))
  )[0]!.lines[0]!;
const decor = (i: number) =>
  i === 1
    ? {
        header: "Blue Rev. (16 Nov 2026)",
        marks: [{ y: 4, text: "*" }],
        tint: [204, 230, 255] as const,
      }
    : null;

test("lines sit where the profile puts them", async () => {
  const p = paginate(
    [
      A(1),
      cueBlock("JANE"),
      filledBlock("dialogue", 1),
      ...Array.from({ length: 60 }, () => A(1)),
    ],
    sp,
  );
  const [one, two] = await readPdf(await writePdf(p, { fonts }));
  // the action's baseline is 72 + 8.64; the cue follows a blank line at 108 + 22 × 7.2; the
  // dialogue sits at 108 + 10 × 7.2
  expect(
    one!.lines.slice(0, 3).map((l) => [r(l.x), r(l.y), r(l.width)]),
  ).toEqual([
    [108, 80.6, 432],
    [266.4, 104.6, 28.8],
    [180, 116.6, 252],
  ]);
  // the page number ends at the column's edge, half an inch down
  expect([
    two!.lines[0]!.text,
    r(two!.lines[0]!.x + two!.lines[0]!.width),
    r(two!.lines[0]!.y),
  ]).toEqual(["2.", 540, 44.6]);
});

test("the same script gives the same bytes, and a page range gives those pages", async () => {
  const p = paginate([A(120)], sp);
  expect(await writePdf(p, { fonts })).toEqual(await writePdf(p, { fonts }));
  expect(
    (await readPdf(await writePdf(p, { fonts, pages: [1] }))).map(
      (pg) => pg.label,
    ),
  ).toEqual(["2"]);
});

test("accented text switches to the face that has it, and italic letter pairs keep their cells", async () => {
  expect((await line(viewOf({ type: "action" }, ["Łódź café"]))).text).toBe(
    "Łódź café",
  );
  // four cells, not two
  expect(
    Math.round(
      (await line(viewOf({ type: "action" }, ["fifl", "italic"]))).width * 10,
    ),
  ).toBe(288);
});

test("a page carries its revision header, its asterisks and its tint", async () => {
  const p = paginate([A(120)], sp);
  const pdf = await readPdf(await writePdf(p, { fonts, decor }));
  const head = pdf[1]!.lines.find((l) => r(l.y) === 44.6)!;
  const star = pdf[1]!.lines.find((l) =>
    l.items.some((it) => it.text === "*"),
  )!;
  expect([r(head.items[0]!.x), head.items[0]!.text, pdf[1]!.label]).toEqual([
    108,
    "Blue Rev. (16 Nov 2026)",
    "2",
  ]);
  // 108 + 67 × 7.2; 72 + 4 × 6 + 8.64
  expect([r(star.items.find((it) => it.text === "*")!.x), r(star.y)]).toEqual([
    590.4, 104.6,
  ]);
  // a black page fails here
  expect([
    pdf.map((pg) => pg.tinted),
    pdf[1]!.tintColor,
    pdf[0]!.lines.some((l) => l.text.includes("*")),
  ]).toEqual([[false, true, false], "#cce6ff", false]);
  // a page without decor is drawn as before
  expect([pdf[0], pdf[2]]).toEqual(
    await readPdf(await writePdf(p, { fonts, pages: [0, 2] })),
  );
});

test("characters outside the font are listed and drawn as boxes", async () => {
  const p = paginate(layoutBlocksOf(ruleScript("outside-the-font")), sp);
  expect(findUnsupportedCharacters(p).flatMap((e) => e.characters)).toEqual(
    expect.arrayContaining(["日", "👨‍👩‍👧", "س"]),
  );
  const text = (await readPdf(await writePdf(p, { fonts })))
    .flatMap((pg) => pg.lines.map((l) => l.text))
    .join(" ");
  expect([
    text.includes("family"),
    text.includes("日"),
    findUnsupportedCharacters(paginate([A(2)], sp)),
  ]).toEqual([true, false, []]);
});

test("a letter whose accent the font lacks is listed whole and drawn as one box", async () => {
  // e and a combining acute accent
  const view = viewOf({ type: "action" }, ["Cafe\u0301 au lait"]);
  const drawn = await line(view);
  // the box takes the fourth of 12 cells
  expect([
    findUnsupportedCharacters(paginate([toLayoutBlock(view)], sp)),
    drawn.text,
    r(drawn.width),
  ]).toEqual([[{ blockId: "", characters: ["e\u0301"] }], "Caf au lait", 86.4]);
});

test("watermark placement sits below footer.center and PdfOptions.watermark draws it on every page", async () => {
  expect(placeWatermark(sp.geometry)).toEqual({ topPt: 768, centerPt: 306 });
  const p = paginate([A(120)], sp);
  const pdf = await readPdf(
    await writePdf(p, { fonts, watermark: "Leo Marsh" }),
  );
  expect(pdf.map((pg) => pg.lines.find((l) => l.text === "Leo Marsh"))).toEqual(
    [
      expect.objectContaining({ text: "Leo Marsh" }),
      expect.objectContaining({ text: "Leo Marsh" }),
      expect.objectContaining({ text: "Leo Marsh" }),
    ],
  );
  // topPt 768 + BASELINE_PT (~8.64) ≈ 776.6, strictly below bottom margin midpoint (750-762)
  const wmLine = pdf[0]!.lines.find((l) => l.text === "Leo Marsh")!;
  expect(wmLine.y).toBeGreaterThan(770);
});
