// Tests for pure-TS lossless Markdown (.md) writer and reader round-trip.
import { describe, expect, test } from "bun:test";
import type { BlockJSON } from "@manent/schema";
import { readMarkdown, writeMarkdown } from "../src/index.ts";
import { counter } from "../src/testing/index.ts";

describe("Markdown (.md) Book round-trip", () => {
  test("writeMarkdown -> readMarkdown preserves title, chapters, subheadings, epigraph, quote, breaks, inline marks, links and footnotes", () => {
    const blocks: BlockJSON[] = [
      {
        type: "block",
        attrs: { id: "b1", type: "chapter" },
        content: [{ type: "text", text: "High Water" }],
      },
      {
        type: "block",
        attrs: { id: "b2", type: "epigraph" },
        content: [{ type: "text", text: "Tides keep their own ledger." }],
      },
      {
        type: "block",
        attrs: { id: "b3", type: "subheading" },
        content: [{ type: "text", text: "The Bell" }],
      },
      {
        type: "block",
        attrs: { id: "b4", type: "body" },
        content: [
          { type: "text", text: "The " },
          { type: "text", text: "harbour", marks: [{ type: "bold" }] },
          { type: "text", text: " kept " },
          { type: "text", text: "two", marks: [{ type: "italic" }] },
          { type: "text", text: " " },
          {
            type: "text",
            text: "clocks",
            marks: [
              {
                type: "footnote",
                attrs: { id: "fn-1", text: "Watch Book, 1911." },
              },
            ],
          },
          { type: "text", text: " — see " },
          {
            type: "text",
            text: "chart",
            marks: [
              { type: "link", attrs: { href: "https://example.com/tide" } },
            ],
          },
          { type: "text", text: "." },
        ],
      },
      {
        type: "block",
        attrs: { id: "b5", type: "break" },
        content: [{ type: "text", text: "* * *" }],
      },
      {
        type: "block",
        attrs: { id: "b6", type: "quote" },
        content: [{ type: "text", text: "Keep a slack helm." }],
      },
      {
        type: "block",
        attrs: { id: "b7", type: "page_break" },
      },
    ];

    const md = writeMarkdown(
      {
        title: "The Salt Almanac",
        format: "manuscript",
        blocks,
        notes: [],
        record: null,
        production: null,
      },
      {
        frontMatter: {
          title: "The Salt Almanac",
          subtitle: "Notes on Tides",
          author: "M. K. Rowe",
          isbn: "978-0-123456-78-9",
        },
        backMatter: {
          acknowledgments: "Thanks to the estuary archive.",
        },
      },
    );

    expect(md).toContain('title: "The Salt Almanac"');
    expect(md).toContain("# High Water");
    expect(md).toContain("## The Bell");
    expect(md).toContain("**harbour**");
    expect(md).toContain("[chart](https://example.com/tide)");
    expect(md).toContain("[^1]: Watch Book, 1911.");
    expect(md).toContain("# Acknowledgements");

    const imported = readMarkdown(md, { ids: counter() });
    expect(imported.from).toBe("markdown");
    expect(imported.format).toBe("manuscript");
    expect(imported.title).toBe("The Salt Almanac");
    expect(imported.blocks[0]?.attrs?.type).toBe("chapter");
    expect(imported.blocks[1]?.attrs?.type).toBe("epigraph");
    expect(imported.blocks[2]?.attrs?.type).toBe("subheading");
    expect(imported.blocks[3]?.attrs?.type).toBe("body");
    expect(imported.blocks[4]?.attrs?.type).toBe("break");
    expect(imported.blocks[5]?.attrs?.type).toBe("quote");
    expect(imported.blocks[6]?.attrs?.type).toBe("page_break");

    const bodyRuns = imported.blocks[3]?.content ?? [];
    expect(bodyRuns.some((r) => r.marks?.some((m) => m.type === "bold"))).toBe(
      true,
    );
    expect(
      bodyRuns.some((r) =>
        r.marks?.some(
          (m) =>
            m.type === "link" && m.attrs?.href === "https://example.com/tide",
        ),
      ),
    ).toBe(true);
    expect(
      bodyRuns.some((r) =>
        r.marks?.some(
          (m) => m.type === "footnote" && m.attrs?.text === "Watch Book, 1911.",
        ),
      ),
    ).toBe(true);
  });
});
