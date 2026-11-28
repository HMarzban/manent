import { expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { writeEpub } from "../src/epub/index.ts";
import type { ScriptForExport } from "../src/script/model.ts";
import { bunXml } from "../src/testing/bun-xml.ts";

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const ASSET_ID = "a".repeat(64);

test("writeEpub produces valid EPUB 3 archive with uncompressed mimetype first, TOC, chapters, craft elements, footnotes and images", () => {
  const book: ScriptForExport = {
    title: "The Salt Almanac",
    format: "manuscript",
    blocks: [
      {
        type: "block",
        attrs: { id: "c1", type: "chapter" },
        content: [{ type: "text", text: "1. High Water" }],
      },
      {
        type: "block",
        attrs: { id: "e1", type: "epigraph" },
        content: [{ type: "text", text: "Tides wait for no clerk." }],
      },
      {
        type: "block",
        attrs: { id: "s1", type: "subheading" },
        content: [{ type: "text", text: "Morning on the Quay" }],
      },
      {
        type: "block",
        attrs: { id: "b1", type: "body", firstLine: "drop_cap" },
        content: [
          { type: "text", text: "Every " },
          {
            type: "text",
            text: "harbour",
            marks: [
              { type: "bold" },
              { type: "color", attrs: { value: "blue" } },
              {
                type: "footnote",
                attrs: { id: "fn1", text: "Watch Book, 1911." },
              },
            ],
          },
          { type: "text", text: " keeps two clocks, see " },
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
        attrs: {
          id: "g1",
          type: "graphic",
          graphic: {
            kind: "image",
            assetId: ASSET_ID,
            heightLines: 6,
            label: "Fig. 1",
            alt: "Autumn spring-tide curve",
            aspectWidth: 400,
            aspectHeight: 200,
          },
        },
        content: [{ type: "text", text: "Fig. 1 — Autumn tide curve." }],
      },
      {
        type: "block",
        attrs: { id: "grp", type: "group" },
        content: [{ type: "text", text: "Hidden editorial section" }],
      },
      {
        type: "block",
        attrs: { id: "c2", type: "chapter" },
        content: [{ type: "text", text: "2. The Bar" }],
      },
      {
        type: "block",
        attrs: { id: "b2", type: "body", firstLine: "raised_cap" },
        content: [{ type: "text", text: "Beyond the outer breakwater." }],
      },
    ],
    notes: [],
    record: null,
    production: null,
  };

  const bytes = writeEpub(book, {
    language: "en-GB",
    author: "Priya Nair",
    modifiedAt: Date.UTC(2026, 10, 28, 9, 0, 0),
    assets: new Map([[ASSET_ID, { mime: "image/png", bytes: TINY_PNG }]]),
  });

  // OCF 3.2: uncompressed `mimetype` entry starts at byte 30
  const headText = new TextDecoder().decode(bytes.subarray(30, 58));
  expect(headText).toBe("mimetypeapplication/epub+zip");

  const files = unzipSync(bytes);
  expect(strFromU8(files["mimetype"]!)).toBe("application/epub+zip");

  const container = strFromU8(files["META-INF/container.xml"]!);
  const opf = strFromU8(files["OEBPS/content.opf"]!);
  const nav = strFromU8(files["OEBPS/nav.xhtml"]!);
  const ch1 = strFromU8(files["OEBPS/xhtml/chapter-001.xhtml"]!);
  const ch2 = strFromU8(files["OEBPS/xhtml/chapter-002.xhtml"]!);

  // Every XML/XHTML part parses strictly
  expect(() => bunXml(container)).not.toThrow();
  expect(() => bunXml(opf)).not.toThrow();
  expect(() => bunXml(nav)).not.toThrow();
  expect(() => bunXml(ch1)).not.toThrow();
  expect(() => bunXml(ch2)).not.toThrow();

  expect(opf).toContain("<dc:title>The Salt Almanac</dc:title>");
  expect(opf).toContain("<dc:creator>Priya Nair</dc:creator>");
  expect(opf).toContain('properties="nav"');
  expect(opf).toContain('href="images/img-001.png" media-type="image/png"');
  expect(nav).toContain("1. High Water");
  expect(nav).toContain("2. The Bar");
  expect(ch1).toContain('<blockquote class="epigraph">');
  expect(ch1).toContain(
    '<h2 class="subheading" id="sub-001">Morning on the Quay</h2>',
  );
  expect(ch1).toContain('class="body drop-cap"');
  expect(ch1).toContain('<span class="initial">E</span>');
  expect(ch1).toContain('epub:type="noteref"');
  expect(ch1).toContain('epub:type="footnote"');
  expect(ch1).toContain("Watch Book, 1911.");
  expect(ch1).toContain('href="https://example.com/tide"');
  expect(ch1).toContain('src="../images/img-001.png"');
  expect(ch1).not.toContain("Hidden editorial section");
  expect(ch2).toContain('class="body raised-cap"');
  expect(files["OEBPS/images/img-001.png"]).toEqual(TINY_PNG);
});
