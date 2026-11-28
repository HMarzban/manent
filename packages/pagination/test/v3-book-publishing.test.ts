import { expect, test } from "bun:test";
import {
  BOOK_SERIF_TYPOGRAPHY,
  engineFor,
  isVersoPage,
  measureSerifPt,
  pageMarginLeftPt,
  parsePaper,
  profileFromSettings,
  readLayoutSettings,
} from "../src/index.ts";
import type { LayoutBlock, Paper } from "../src/index.ts";

function makeBlock(id: string, type: string, text: string): LayoutBlock {
  return {
    id,
    type,
    kind: null,
    text,
    styles: new Uint8Array(text.length),
    dual: null,
    num: null,
    align: null,
    indent: null,
    width: null,
    spaceBefore: null,
    noContd: false,
  };
}

test("Engine 3 Book Publishing supports all 5 trim sizes, mirrored margins and deterministic proportional Source Serif 4 layout", () => {
  const v3 = engineFor(3)!;
  expect(v3.version).toBe(3);

  const trims: readonly Paper[] = [
    "trade_5x8",
    "trade_5_5x8_5",
    "trade_6x9",
    "letter",
    "a4",
  ];
  for (const paper of trims) {
    expect(parsePaper(paper, 3)).toBe(paper);
    const mirrored = v3.profileFor("manuscript", {
      paper,
      mirrorMargins: true,
    })!;
    const symmetric = v3.profileFor("manuscript", {
      paper,
      mirrorMargins: false,
    })!;
    expect(mirrored.engineVersion).toBe(3);
    expect(mirrored.typography).toEqual(BOOK_SERIF_TYPOGRAPHY);
    expect(mirrored.geometry.mirrored).toBe(true);
    // Toggling mirrored margins keeps identical text width so zero words reflow
    expect(mirrored.columnCells).toBe(symmetric.columnCells);
    expect(mirrored.linesPerPage).toBe(symmetric.linesPerPage);
    // Recto (index 0) uses inner margin; Verso (index 1) uses outer margin
    expect(isVersoPage(0)).toBe(false);
    expect(isVersoPage(1)).toBe(true);
    expect(pageMarginLeftPt(mirrored.geometry, 0)).toBe(
      mirrored.geometry.marginInnerPt!,
    );
    expect(pageMarginLeftPt(mirrored.geometry, 1)).toBe(
      mirrored.geometry.marginOuterPt!,
    );
  }

  // Trade trims fall back to US Letter on Engine 1 & 2
  expect(parsePaper("trade_6x9", 1)).toBe("letter");
  expect(parsePaper("trade_6x9", 2)).toBe("letter");

  // Proportional serif advances differ for narrow vs wide glyphs
  expect(measureSerifPt("iiiiii", 0, 10.5)).toBeLessThan(
    measureSerifPt("WWWWWW", 0, 10.5),
  );

  // Full pagination & incremental repagination agree identically
  const profile = v3.profileFor("manuscript", {
    paper: "trade_6x9",
    mirrorMargins: true,
  })!;
  const longPara =
    "Every harbour keeps two clocks: the municipal dial on Tolle Exchange roof that answers to the timetable, and the dark tide-line along the granite steps that answers only to the moon. ".repeat(
      14,
    );
  const blocks = [
    makeBlock("c1", "chapter", "1. High Water at Gull Point"),
    makeBlock("e1", "epigraph", "The tide waits for no clerk."),
    makeBlock("s1", "subheading", "Morning on Ardle Quay"),
    makeBlock("b1", "body", longPara),
    makeBlock("b2", "body", longPara),
  ];
  const p1 = v3.paginate(blocks, profile);
  expect(p1.pages.length).toBeGreaterThanOrEqual(2);
  const laid0 = v3.layoutPage(p1, 0);
  expect(laid0.lines.length).toBeGreaterThan(0);
  expect(laid0.lines.every((l) => typeof l.xPt === "number")).toBe(true);

  const edited = [
    ...blocks.slice(0, 4),
    makeBlock("b2", "body", `${longPara} Dusk settled.`),
  ];
  const inc = v3.repaginate(p1, edited);
  const full = v3.paginate(edited, profile);
  expect(inc.pages).toEqual(full.pages);

  // Settings bridge reads trade_5x8 + mirrorMargins
  const settings = readLayoutSettings((k) =>
    k === "script.format"
      ? "manuscript"
      : k === "script.paper"
        ? "trade_5x8"
        : k === "script.mirrorMargins"
          ? false
          : undefined,
  );
  const fromSettings = profileFromSettings(v3, settings)!;
  expect(fromSettings.paper).toBe("trade_5x8");
  expect(fromSettings.geometry.mirrored).toBe(false);
});
