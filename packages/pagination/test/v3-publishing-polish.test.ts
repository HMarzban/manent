import { expect, test } from "bun:test";
import {
  buildBookToc,
  engineFor,
  layoutBookFrontPages,
  pageRunningContext,
  resolveBarSlots,
  romanNumeral,
} from "../src/index.ts";
import type { LayoutBlock } from "../src/index.ts";

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

test("Engine 3 rectoChapters inserts blind-folio blank verso pages, suppresses headers on chapter openings, and alternates Book/Chapter headers", () => {
  const v3 = engineFor(3)!;
  const profile = v3.profileFor("manuscript", {
    paper: "trade_6x9",
    mirrorMargins: true,
    rectoChapters: true,
  })!;
  const blocks = [
    makeBlock("c1", "chapter", "1. High Water"),
    makeBlock("s1", "subheading", "At the Quay"),
    makeBlock("b1", "body", "Short chapter one that finishes on page 1."),
    makeBlock("c2", "chapter", "2. The Bar"),
    makeBlock("b2", "body", "Chapter two starts on recto page 3."),
  ];
  const p = v3.paginate(blocks, profile);
  // Page 0 (label "1"): Chapter 1 (recto)
  // Page 1 (label "2"): Blank verso
  // Page 2 (label "3"): Chapter 2 (recto)
  expect(p.pages.map((pg) => [pg.label, pg.blank === true])).toEqual([
    ["1", false],
    ["2", true],
    ["3", false],
  ]);
  expect(v3.pageOf(p, 3, 0)).toBe(2); // skips blank verso page!
  expect(v3.pageNumberText(p.pages[1]!)).toBeNull();
  expect(v3.layoutPage(p, 1).lines).toEqual([]);

  const ctx = pageRunningContext(p);
  expect(ctx).toEqual([
    { section: "1. High Water", isChapterOpening: true, isBlank: false },
    { section: "1. High Water", isChapterOpening: false, isBlank: true },
    { section: "2. The Bar", isChapterOpening: true, isBlank: false },
  ]);

  const alternatingHeader = {
    left: { kind: "none" as const },
    center: { kind: "verso_title_recto_chapter" as const },
    right: { kind: "page_number" as const },
    firstPage: true,
    rule: false,
  };
  // Suppressed on chapter opening page 0 & 2, suppressed on blank page 1
  expect(
    resolveBarSlots(
      alternatingHeader,
      {
        pageIndex: 0,
        pageCount: 3,
        pageLabel: "1",
        profile,
        title: "The Salt Almanac",
        section: "1. High Water",
        dateFormat: null,
        revisionLabel: null,
        day: null,
        durationMs: null,
        isChapterOpening: true,
        isBlank: false,
      },
      "header",
    ),
  ).toBeNull();
  expect(
    resolveBarSlots(
      alternatingHeader,
      {
        pageIndex: 1,
        pageCount: 3,
        pageLabel: "2",
        profile,
        title: "The Salt Almanac",
        section: "1. High Water",
        dateFormat: null,
        revisionLabel: null,
        day: null,
        durationMs: null,
        isChapterOpening: false,
        isBlank: true,
      },
      "header",
    ),
  ).toBeNull();
  // On non-chapter verso page (index 1 non-blank) vs non-chapter recto page (index 2 non-chapter):
  expect(
    resolveBarSlots(
      alternatingHeader,
      {
        pageIndex: 1,
        pageCount: 4,
        pageLabel: "2",
        profile,
        title: "The Salt Almanac",
        section: "1. High Water",
        dateFormat: null,
        revisionLabel: null,
        day: null,
        durationMs: null,
        isChapterOpening: false,
        isBlank: false,
      },
      "header",
    ),
  ).toEqual({ left: "2", center: "The Salt Almanac", right: "", rule: false });
  expect(
    resolveBarSlots(
      alternatingHeader,
      {
        pageIndex: 2,
        pageCount: 4,
        pageLabel: "3",
        profile,
        title: "The Salt Almanac",
        section: "1. High Water",
        dateFormat: null,
        revisionLabel: null,
        day: null,
        durationMs: null,
        isChapterOpening: false,
        isBlank: false,
      },
      "header",
    ),
  ).toEqual({ left: "", center: "1. High Water", right: "3", rule: false });

  // Auto-TOC resolves recto labels ("1" and "3") and layoutBookFrontPages pads to even count for recto Page 1
  const toc = buildBookToc(p, { includeSubheadings: true });
  expect(toc).toEqual([
    {
      blockIndex: 0,
      blockId: "c1",
      level: 1,
      title: "1. High Water",
      pageLabel: "1",
      pageIndex: 0,
    },
    {
      blockIndex: 1,
      blockId: "s1",
      level: 2,
      title: "At the Quay",
      pageLabel: "1",
      pageIndex: 0,
    },
    {
      blockIndex: 3,
      blockId: "c2",
      level: 1,
      title: "2. The Bar",
      pageLabel: "3",
      pageIndex: 2,
    },
  ]);

  const front = layoutBookFrontPages({
    titlePage: { title: "The Salt Almanac", authors: "Dana Reyes" },
    matter: {
      subtitle: "Tides of the North Channel",
      isbn: "978-0-00-000000-0",
      copyright: "© 2026 Dana Reyes",
      dedication: "For the harbour watch.",
    },
    profile,
    toc,
    includeToc: true,
  });
  expect(front.length % 2).toBe(0);
  expect(front[0]!.label).toBe("i");
  expect(front[1]!.label).toBe("ii");
  expect(romanNumeral(4)).toBe("iv");
  expect(romanNumeral(14)).toBe("xiv");
});
