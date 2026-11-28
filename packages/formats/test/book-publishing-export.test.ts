// Tests for Phase 3 book publishing exports: PDF cover/front/TOC/back/continuous pagination, DOCX front/TOC/oddPage/back, EPUB 3 cover/front/back/nested TOC/landmarks, and multi-part book compile.
import { describe, expect, test } from "bun:test";
import {
  buildBookToc,
  engineFor,
  layoutBookFrontPages,
} from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { strFromU8, unzipSync } from "fflate";
import {
  bookMatterFromFields,
  combineBookParts,
  writeDocx,
  writeEpub,
  writePdf,
  writePdfParts,
} from "../src/index.ts";
import type { ScriptFontFiles } from "../src/index.ts";

const loadFontFiles = async (
  pkg: string,
  prefix: string,
): Promise<ScriptFontFiles> => {
  const keys: readonly FontFaceKey[] = [
    "latin-400-normal",
    "latin-400-italic",
    "latin-700-normal",
    "latin-700-italic",
    "latin-ext-400-normal",
    "latin-ext-400-italic",
    "latin-ext-700-normal",
    "latin-ext-700-italic",
  ];
  const entries = await Promise.all(
    keys.map(async (key) => {
      const path = Bun.resolveSync(
        `${pkg}/files/${prefix}-${key}.woff`,
        import.meta.dir,
      );
      return [key, await Bun.file(path).bytes()] as const;
    }),
  );
  return Object.fromEntries(entries) as ScriptFontFiles;
};

// Minimal valid 1x1 PNG (67 bytes) for cover image embedding tests.
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01,
  0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

const SAMPLE_BLOCKS: readonly BlockJSON[] = [
  {
    type: "block",
    attrs: { id: "00000000-0000-4000-8000-000000000001", type: "chapter" },
    content: [{ type: "text", text: "Chapter 1: High Water" }],
  },
  {
    type: "block",
    attrs: { id: "00000000-0000-4000-8000-000000000002", type: "subheading" },
    content: [{ type: "text", text: "The Breakwater" }],
  },
  {
    type: "block",
    attrs: { id: "00000000-0000-4000-8000-000000000003", type: "body" },
    content: [
      {
        type: "text",
        text: "The tide came in quietly across the stone.",
        marks: [
          { type: "footnote", attrs: { id: "fn-1", text: "Recorded 1912." } },
        ],
      },
    ],
  },
  {
    type: "block",
    attrs: { id: "00000000-0000-4000-8000-000000000004", type: "chapter" },
    content: [{ type: "text", text: "Chapter 2: Low Water" }],
  },
  {
    type: "block",
    attrs: { id: "00000000-0000-4000-8000-000000000005", type: "body" },
    content: [{ type: "text", text: "Morning revealed the salt flats." }],
  },
];

const FRONT = {
  title: "The Salt Almanac",
  subtitle: "Notes on Tides and Light",
  author: "M. K. Rowe",
  copyright: "Copyright © 2026 M. K. Rowe",
  isbn: "978-0-123456-78-9",
  dedication: "For the harbour keepers.",
};

const BACK = {
  acknowledgments: "Thanks to the estuary archive.",
  aboutAuthor: "M. K. Rowe writes about coastal places.",
};

describe("Phase 3 Book Publishing Exports", () => {
  test("bookMatterFromFields splits combined fields into front, back and coverAssetId", () => {
    const res = bookMatterFromFields(
      {
        title: "The Salt Almanac",
        subtitle: "Notes",
        author: "Rowe",
        isbn: "978-0-00-000000-0",
        acknowledgments: "Thank you.",
        coverAssetId: "a".repeat(64),
      },
      "Fallback",
    );
    expect(res.front.title).toBe("The Salt Almanac");
    expect(res.front.subtitle).toBe("Notes");
    expect(res.back.acknowledgments).toBe("Thank you.");
    expect(res.coverAssetId).toBe("a".repeat(64));
  });

  test("combineBookParts joins parts sequentially and namespaces footnote ids without collision", () => {
    const partA = { title: "Part One", blocks: SAMPLE_BLOCKS.slice(0, 3) };
    const partB = {
      title: "Part Two",
      blocks: [
        {
          type: "block",
          attrs: { type: "body" },
          content: [
            {
              type: "text",
              text: "Second part note.",
              marks: [
                {
                  type: "footnote",
                  attrs: { id: "fn-1", text: "Duplicate id in part 2." },
                },
              ],
            },
          ],
        },
      ] satisfies BlockJSON[],
    };
    const combined = combineBookParts({
      title: "Complete Almanac",
      parts: [partA, partB],
    });
    expect(combined.format).toBe("manuscript");
    // Part B had no leading chapter, so a synthetic chapter heading "Part Two" is inserted.
    expect(combined.blocks[3]?.attrs?.type).toBe("chapter");
    const ids = combined.blocks
      .flatMap((b) => b.content ?? [])
      .flatMap((n) => n.marks ?? [])
      .filter((m) => m.type === "footnote")
      .map((m) => m.attrs?.id);
    expect(ids).toEqual(["p1-fn-1", "p2-fn-1"]);
  });

  test("EPUB 3 includes cover-image, front/back matter, ISBN, nested subheading TOC and landmarks", () => {
    const bytes = writeEpub(
      {
        title: "The Salt Almanac",
        format: "manuscript",
        blocks: SAMPLE_BLOCKS,
        notes: [],
        record: null,
        production: null,
      },
      {
        cover: { mime: "image/png", bytes: TINY_PNG },
        frontMatter: FRONT,
        backMatter: BACK,
        includeTocInSpine: true,
        includeSubheadingsInToc: true,
        modifiedAt: 0,
      },
    );
    const files = unzipSync(bytes);
    expect(strFromU8(files.mimetype!)).toBe("application/epub+zip");
    const opf = strFromU8(files["OEBPS/content.opf"]!);
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<meta name="cover" content="cover-image"/>');
    expect(opf).toContain("urn:isbn:978-0-123456-78-9");
    expect(opf).toContain('<itemref idref="cover"/>');
    expect(opf).toContain('<itemref idref="front-title"/>');
    expect(opf).toContain('<itemref idref="front-copyright"/>');
    expect(opf).toContain('<itemref idref="front-dedication"/>');
    expect(opf).toContain('<itemref idref="nav"/>');
    expect(opf).toContain('<itemref idref="back-acknowledgements"/>');
    expect(opf).toContain('<itemref idref="back-about-author"/>');

    const nav = strFromU8(files["OEBPS/nav.xhtml"]!);
    expect(nav).toContain('epub:type="landmarks"');
    expect(nav).toContain("chapter-001.xhtml#sub-001");
    expect(nav).toContain("The Breakwater");

    const ch1 = strFromU8(files["OEBPS/xhtml/chapter-001.xhtml"]!);
    expect(ch1).toContain(
      '<h2 class="subheading" id="sub-001">The Breakwater</h2>',
    );
    expect(files["OEBPS/images/cover.png"]?.byteLength).toBe(
      TINY_PNG.byteLength,
    );
  });

  test("DOCX writes front matter, Roman/Arabic section break, TOC field + updateFields, oddPage breaks and back matter", () => {
    const eng3 = engineFor(3)!;
    const profile = eng3.profileFor("manuscript", {
      paper: "trade_6x9",
      mirrorMargins: true,
      rectoChapters: true,
    })!;
    const paginated = eng3.paginate(
      eng3.toLayoutBlocks(
        blocksOf({
          type: "doc",
          content: [{ type: "section", content: [...SAMPLE_BLOCKS] }],
        }),
      ),
      profile,
    );
    const tocEntries = buildBookToc(paginated, { includeSubheadings: true });
    const bytes = writeDocx(
      {
        title: "The Salt Almanac",
        format: "manuscript",
        blocks: SAMPLE_BLOCKS,
        notes: [],
        record: null,
        production: null,
      },
      {
        paper: "trade_6x9",
        mirrorMargins: true,
        rectoChapters: true,
        frontMatter: FRONT,
        backMatter: BACK,
        includeToc: true,
        tocEntries,
      },
    );
    const files = unzipSync(bytes);
    const docXml = strFromU8(files["word/document.xml"]!);
    const settings = strFromU8(files["word/settings.xml"]!);
    expect(docXml).toContain("The Salt Almanac");
    expect(docXml).toContain("Notes on Tides and Light");
    expect(docXml).toContain("ISBN 978-0-123456-78-9");
    expect(docXml).toContain("For the harbour keepers.");
    expect(docXml).toContain('w:fmt="lowerRoman"');
    expect(docXml).toContain('w:val="oddPage"');
    expect(docXml).toContain('TOC \\o "1-2"');
    expect(docXml).toContain("The Breakwater");
    expect(docXml).toContain("Acknowledgements");
    expect(docXml).toContain("About the author");
    expect(settings).toContain("<w:mirrorMargins/>");
    expect(settings).toContain("<w:evenAndOddHeaders/>");
    expect(settings).toContain('<w:updateFields w:val="true"/>');
  });

  test("PDF writes cover, Engine 3 Roman front pages + TOC, body pages, endnotes and back matter cleanly", async () => {
    const fonts = await loadFontFiles(
      "@fontsource/courier-prime",
      "courier-prime",
    );
    const bookFonts = await loadFontFiles(
      "@fontsource/source-serif-4",
      "source-serif-4",
    );
    const eng3 = engineFor(3)!;
    const profile = eng3.profileFor("manuscript", {
      paper: "trade_6x9",
      mirrorMargins: true,
      rectoChapters: true,
    })!;
    const paginated = eng3.paginate(
      eng3.toLayoutBlocks(
        blocksOf({
          type: "doc",
          content: [{ type: "section", content: [...SAMPLE_BLOCKS] }],
        }),
      ),
      profile,
    );
    const toc = buildBookToc(paginated, { includeSubheadings: true });
    const front = layoutBookFrontPages({
      titlePage: { title: FRONT.title, authors: FRONT.author },
      matter: {
        subtitle: FRONT.subtitle,
        copyright: FRONT.copyright,
        isbn: FRONT.isbn,
        dedication: FRONT.dedication,
      },
      profile,
      toc,
      includeToc: true,
    });
    const pdf = await writePdf(paginated, {
      fonts,
      bookFonts,
      title: FRONT.title,
      cover: { mime: "image/png", bytes: TINY_PNG },
      front,
      backMatter: BACK,
      header: {
        left: { kind: "verso_title_recto_chapter" },
        center: { kind: "none" },
        right: { kind: "page_number" },
        firstPage: true,
        rule: false,
      },
      createdAt: 0,
    });
    const header = new TextDecoder().decode(pdf.subarray(0, 8));
    expect(header).toBe("%PDF-1.3");
    expect(pdf.byteLength).toBeGreaterThan(2000);

    // Continuous multi-part PDF also succeeds without throwing.
    const compiledPdf = await writePdfParts([paginated, paginated], {
      fonts,
      bookFonts,
      title: FRONT.title,
      continuousPageNumbers: true,
      createdAt: 0,
    });
    expect(compiledPdf.byteLength).toBeGreaterThan(2000);
  });
});
