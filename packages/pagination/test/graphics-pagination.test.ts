import { expect, test } from "bun:test";
import type { GraphicAttrs } from "@manent/schema";
import {
  ENGINE_VERSION,
  UNITS_PER_LINE,
  durationMs,
  formatGraphicCue,
  formatGraphicExportCue,
  graphicCueRows,
  layoutPage,
  linePlacesOf,
  measure,
  paginate,
  profileFor,
  repaginate,
  timeBlock,
  timeScript,
  toLayoutBlock,
} from "../src/index.ts";
import { filledBlock, viewOf } from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const SHA = "a".repeat(64);

function graphicAttrs(overrides: Partial<GraphicAttrs> = {}): GraphicAttrs {
  return {
    kind: "image",
    assetId: SHA,
    heightLines: 6,
    label: "Cue 1",
    alt: "Studio wide shot",
    aspectWidth: 1920,
    aspectHeight: 1080,
    ...overrides,
  };
}

function graphicBlock(
  id: string,
  caption: string,
  overrides: Partial<GraphicAttrs> = {},
) {
  return toLayoutBlock(
    viewOf(
      { id, type: "graphic", graphic: graphicAttrs(overrides) },
      ...(caption === "" ? [] : [[caption] as const]),
    ),
  );
}

test("measureGraphic computes boxLines + captionLines deterministically with clamping", () => {
  expect(ENGINE_VERSION).toBe(1);
  // Empty caption: exact boxLines only
  const noCaption = graphicBlock("g000000000000001", "", { heightLines: 8 });
  expect(measure(noCaption, sp).lines).toBe(8);

  // Single-line caption: boxLines + 1
  const oneLine = graphicBlock("g000000000000002", "City skyline at dusk", {
    heightLines: 6,
  });
  expect(measure(oneLine, sp).lines).toBe(7);

  // Multi-line wrapped caption at 60 cells: 120 chars -> 2 lines + 4 box lines = 6
  const twoLines = graphicBlock(
    "g000000000000003",
    `${"word ".repeat(12)}${"word ".repeat(12)}`.trim(),
    { heightLines: 4 },
  );
  const measured = measure(twoLines, sp);
  expect(measured.lines).toBe(6);
  expect(Array.from(measured.starts.slice(0, 4))).toEqual([0, 0, 0, 0]);
  expect(measured.starts[4]).toBe(0);
  expect(measured.starts[5]).toBeGreaterThan(0);

  // Clamping to 2..24 even if corrupted raw input is handed in
  const tooSmall = graphicBlock("g000000000000004", "", { heightLines: 1 });
  const tooBig = graphicBlock("g000000000000005", "", { heightLines: 99 });
  expect(measure(tooSmall, sp).lines).toBe(2);
  expect(measure(tooBig, sp).lines).toBe(24);
});

test("graphics stay atomic (split: never) and move whole to the next page when space runs short", () => {
  // Letter screenplay has 54 lines per page.
  // Place 48 lines of action, then a 10-line graphic + 1-line caption (11 lines + 1 spaceBefore = 12).
  // It does not fit on page 0 -> entire graphic + caption starts cleanly on page 1.
  const blocks = [
    filledBlock("action", 48, { id: "a000000000000001" }),
    graphicBlock("g000000000000001", "Live studio shot", {
      kind: "lower_third",
      heightLines: 10,
      label: "GFX 1",
    }),
    filledBlock("action", 2, { id: "a000000000000002" }),
  ];
  const p = paginate(blocks, sp);
  expect(p.pages).toHaveLength(2);
  expect(p.pages[1]!.block).toBe(1);
  expect(p.pages[1]!.line).toBe(0);

  const page0 = layoutPage(p, 0);
  const page1 = layoutPage(p, 1);
  expect(page0.graphics).toEqual([]);
  expect(page1.graphics).toEqual([
    {
      blockId: "g000000000000001",
      kind: "lower_third",
      assetId: SHA,
      label: "GFX 1",
      alt: "Studio wide shot",
      x: 0,
      y: 0,
      widthCells: 60,
      heightLines: 10,
      aspectWidth: 1920,
      aspectHeight: 1080,
    },
  ]);

  // Caption line appears immediately below the 10-line box (y = 10 * 2 = 20)
  const captionLines = page1.lines.filter(
    (l) => l.blockId === "g000000000000001",
  );
  expect(captionLines).toHaveLength(1);
  expect(captionLines[0]!.blockLine).toBe(0);
  expect(captionLines[0]!.y).toBe(10 * UNITS_PER_LINE);
  expect(captionLines[0]!.runs.map((r) => r.text).join("")).toBe(
    "Live studio shot",
  );

  // Following action block sits after caption + 1 blank line (y = (10 + 1 + 1) * 2 = 24)
  const afterLines = page1.lines.filter(
    (l) => l.blockId === "a000000000000002",
  );
  expect(afterLines[0]!.y).toBe(12 * UNITS_PER_LINE);
});

test("an oversized graphic on a tiny page still stays atomic at line 0", () => {
  const tiny = profileFor("screenplay", { linesPerPage: 10 })!;
  const blocks = [
    graphicBlock("g000000000000010", "Oversized caption", { heightLines: 12 }),
    filledBlock("action", 2, { id: "a000000000000010" }),
  ];
  const p = paginate(blocks, tiny);
  expect(p.pages).toHaveLength(2);
  expect(p.pages[0]!.block).toBe(0);
  expect(p.pages[1]!.block).toBe(1);
  const page0 = layoutPage(p, 0);
  expect(page0.graphics).toHaveLength(1);
  expect(page0.graphics[0]!.heightLines).toBe(12);
  expect(
    page0.lines.filter((l) => l.blockId === "g000000000000010"),
  ).toHaveLength(1);
});

test("empty-caption graphic emits zero text lines on page while keeping a linePlace anchor", () => {
  const blocks = [
    graphicBlock("g000000000000020", "", { heightLines: 5 }),
    filledBlock("action", 1, { id: "a000000000000020" }),
  ];
  const p = paginate(blocks, sp);
  const laid = layoutPage(p, 0);
  expect(laid.graphics).toHaveLength(1);
  expect(laid.lines.filter((l) => l.blockId === "g000000000000020")).toEqual(
    [],
  );
  const places = linePlacesOf(p, 0);
  expect(places.filter((pl) => pl.blockId === "g000000000000020")).toEqual([
    { blockId: "g000000000000020", blockLine: 0, y: 0 },
  ]);
});

test("repaginate matches full paginate when graphic heightLines or caption changes", () => {
  const blocks1 = [
    filledBlock("action", 40, { id: "a000000000000001" }),
    graphicBlock("g000000000000001", "Original", { heightLines: 4 }),
    filledBlock("action", 10, { id: "a000000000000002" }),
  ];
  const p1 = paginate(blocks1, sp);
  const blocks2 = [
    blocks1[0]!,
    graphicBlock("g000000000000001", "Updated caption", { heightLines: 14 }),
    blocks1[2]!,
  ];
  const inc = repaginate(p1, blocks2);
  const full = paginate(blocks2, sp);
  expect(inc.pages).toEqual(full.pages);
  expect(layoutPage(inc, 0)).toEqual(layoutPage(full, 0));
  expect(layoutPage(inc, 1)).toEqual(layoutPage(full, 1));
});

test("graphic blocks contribute 0 ms spoken timing and emit structured Brackets cue rows", () => {
  const blocks = [
    {
      id: "s000000000000001",
      type: "slug",
      text: "HEADLINES",
      noTiming: false,
    },
    {
      id: "g000000000000001",
      type: "graphic",
      text: "Dana Chen — Anchor",
      noTiming: false,
      graphic: graphicAttrs({ kind: "lower_third", label: "Cue 1" }),
    },
    {
      id: "g000000000000002",
      type: "graphic",
      text: "Parliament map",
      noTiming: false,
      graphic: graphicAttrs({ kind: "ots", label: "" }),
    },
    {
      id: "g000000000000003",
      type: "graphic",
      text: "",
      noTiming: false,
      graphic: graphicAttrs({ kind: "full_screen", label: "Poll Results" }),
    },
    {
      id: "g000000000000004",
      type: "graphic",
      text: "Omitted graphic",
      noTiming: false,
      omitted: true,
      graphic: graphicAttrs({ kind: "image", label: "Skip" }),
    },
    {
      id: "d000000000000001",
      type: "dialogue",
      text: "Good evening.",
      noTiming: false,
    },
  ];
  expect(timeBlock(blocks[1]!)).toEqual({
    dialogueChars: 0,
    bracketMs: 0,
    brackets: [],
  });
  const timed = timeScript(blocks);
  expect(timed.total).toEqual({
    dialogueChars: "Good evening.".length,
    bracketMs: 0,
  });
  expect(durationMs([timed.total], 13)).toBe(
    Math.round(("Good evening.".length * 1000) / 13),
  );

  expect(graphicCueRows(blocks)).toEqual([
    {
      blockId: "g000000000000001",
      kind: "lower_third",
      tag: "LOWER THIRD",
      label: "Cue 1",
      caption: "Dana Chen — Anchor",
      text: "[LOWER THIRD] Cue 1 — Dana Chen — Anchor",
      durationMs: 0,
    },
    {
      blockId: "g000000000000002",
      kind: "ots",
      tag: "OTS",
      label: "",
      caption: "Parliament map",
      text: "[OTS] Parliament map",
      durationMs: 0,
    },
    {
      blockId: "g000000000000003",
      kind: "full_screen",
      tag: "FULL SCREEN",
      label: "Poll Results",
      caption: "",
      text: "[FULL SCREEN] Poll Results",
      durationMs: 0,
    },
  ]);
  expect(formatGraphicCue(blocks[0]!)).toBeNull();
  expect(formatGraphicExportCue(blocks[1]!.graphic, blocks[1]!.text)).toBe(
    "[GRAPHIC: Cue 1 — Dana Chen — Anchor]",
  );
  expect(formatGraphicExportCue(blocks[3]!.graphic, "")).toBe(
    "[GRAPHIC: Poll Results]",
  );
  expect(
    formatGraphicExportCue(graphicAttrs({ kind: "image", label: "" }), ""),
  ).toBe("[GRAPHIC: IMAGE]");
});
