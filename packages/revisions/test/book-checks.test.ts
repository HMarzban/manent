// Tests for the 4 manuscript-only Book editorial Checks: empty footnotes, figures missing alt text,
// chapters under word target, and unbalanced quotation marks (with multi-paragraph dialogue exemption).
import { describe, expect, test } from "bun:test";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { findBookChecks, findScriptChecks } from "../src/index.ts";

const makeDoc = (blocks: readonly BlockJSON[]): DocJSON => ({
  type: "doc",
  content: [{ type: "section", content: [...blocks] }],
});

describe("Book-only pre-export Checks", () => {
  test("detects empty footnotes, figures missing description, chapters under target and unbalanced quotes", () => {
    const doc = makeDoc([
      {
        type: "block",
        attrs: { id: "blk-1", type: "chapter", targetWords: 100 },
        content: [{ type: "text", text: "Chapter 1" }],
      },
      {
        type: "block",
        attrs: { id: "blk-2", type: "body" },
        content: [
          {
            type: "text",
            text: "A quiet harbour",
            marks: [
              { type: "footnote", attrs: { id: "fn-empty", text: "   " } },
            ],
          },
          { type: "text", text: ' with an unclosed "quote here.' },
        ],
      },
      {
        type: "block",
        attrs: {
          id: "blk-3",
          type: "graphic",
          graphic: {
            kind: "image",
            assetId: null,
            heightLines: 6,
            label: "Fig. 1",
            alt: "",
            aspectWidth: null,
            aspectHeight: null,
          },
        },
        content: [{ type: "text", text: "Tide chart" }],
      },
    ]);

    const checks = findBookChecks(doc);
    expect(checks.map((c) => c.kind)).toEqual([
      "empty_footnote",
      "figure_missing_alt",
      "chapter_under_target",
      "unbalanced_quotes",
    ]);
    expect(checks[0]?.anchor?.blockId).toBe("blk-2");
    expect(checks[1]?.anchor?.blockId).toBe("blk-3");
    expect(checks[2]?.anchor?.blockId).toBe("blk-1");
    expect(checks[3]?.anchor?.blockId).toBe("blk-2");
  });

  test("exempts standard English multi-paragraph dialogue from unbalanced_quotes", () => {
    const doc = makeDoc([
      {
        type: "block",
        attrs: { id: "blk-1", type: "body" },
        content: [
          {
            type: "text",
            text: "“First paragraph of a long speech without closing quote.",
          },
        ],
      },
      {
        type: "block",
        attrs: { id: "blk-2", type: "body" },
        content: [
          {
            type: "text",
            text: "“Second paragraph continues and closes cleanly.”",
          },
        ],
      },
      {
        type: "block",
        attrs: { id: "blk-3", type: "body" },
        content: [
          { type: "text", text: '"Straight quote multi-paragraph opening.' },
        ],
      },
      {
        type: "block",
        attrs: { id: "blk-4", type: "body" },
        content: [{ type: "text", text: '"And closes properly."' }],
      },
    ]);

    const checks = findBookChecks(doc);
    expect(checks.filter((c) => c.kind === "unbalanced_quotes")).toEqual([]);
  });

  test("findScriptChecks runs Book Checks strictly for format='manuscript' and never for screenplay", () => {
    const doc = makeDoc([
      {
        type: "block",
        attrs: { id: "blk-1", type: "body" },
        content: [{ type: "text", text: 'Unclosed "quote.' }],
      },
    ]);

    const screenplayChecks = findScriptChecks({
      doc,
      lastSent: null,
      names: [],
      pageCount: 1,
      targetPages: null,
      format: "screenplay",
    });
    expect(screenplayChecks.some((c) => c.kind === "unbalanced_quotes")).toBe(
      false,
    );

    const bookChecks = findScriptChecks({
      doc,
      lastSent: null,
      names: [],
      pageCount: 1,
      targetPages: null,
      format: "manuscript",
    });
    expect(bookChecks.some((c) => c.kind === "unbalanced_quotes")).toBe(true);
  });
});
