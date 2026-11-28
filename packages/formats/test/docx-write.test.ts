import { expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { writeDocx } from "../src/docx/write.ts";
import type { ScriptForExport } from "../src/script/model.ts";

function sampleBook(): ScriptForExport {
  return {
    title: "The Salt Almanac",
    format: "manuscript",
    blocks: [
      {
        type: "block",
        attrs: { id: "b1", type: "chapter" },
        content: [{ type: "text", text: "1. High Water & Tide" }],
      },
      {
        type: "block",
        attrs: { id: "b2", type: "body", firstLine: "drop_cap" },
        content: [
          { type: "text", text: "Every " },
          {
            type: "text",
            text: "harbour",
            marks: [{ type: "bold" }, { type: "italic" }],
          },
          { type: "text", text: " keeps " },
          {
            type: "text",
            text: "tide tables",
            marks: [
              { type: "link", attrs: { href: "https://example.com/tides" } },
            ],
          },
          { type: "text", text: "." },
          { type: "text", text: "1", marks: [{ type: "sup" }] },
          {
            type: "text",
            text: " Red",
            marks: [
              { type: "color", attrs: { value: "red" } },
              { type: "highlight", attrs: { value: "yellow" } },
            ],
          },
        ],
      },
      {
        type: "block",
        attrs: { id: "b2b", type: "body", firstLine: "raised_cap" },
        content: [{ type: "text", text: "Dawn broke over the breakwater." }],
      },
      {
        type: "block",
        attrs: { id: "b3", type: "break" },
        content: [],
      },
      {
        type: "block",
        attrs: { id: "b4", type: "quote" },
        content: [{ type: "text", text: "Spring tide, 14 October." }],
      },
      {
        type: "block",
        attrs: { id: "b5", type: "page_break" },
        content: [],
      },
      {
        type: "block",
        attrs: { id: "b6", type: "chapter" },
        content: [{ type: "text", text: "2. The Bar and the Buoy" }],
      },
      {
        type: "block",
        attrs: { id: "b7", type: "group" },
        content: [{ type: "text", text: "Unprinted outline note" }],
      },
    ],
    notes: [],
    record: null,
    production: null,
  };
}

test("writeDocx writes valid OOXML archive with chapters, inline marks, links, breaks and A4 geometry", () => {
  const bytes = writeDocx(sampleBook(), { paper: "a4" });
  const files = unzipSync(bytes);

  expect(Object.keys(files).toSorted()).toEqual([
    "[Content_Types].xml",
    "_rels/.rels",
    "word/_rels/document.xml.rels",
    "word/document.xml",
    "word/styles.xml",
  ]);

  const docXml = strFromU8(files["word/document.xml"]!);
  const relsXml = strFromU8(files["word/_rels/document.xml.rels"]!);
  const stylesXml = strFromU8(files["word/styles.xml"]!);

  expect(docXml).toContain("1. High Water &amp; Tide");
  expect(docXml).toContain('<w:pStyle w:val="Heading1"/>');
  expect(docXml).toContain('<w:framePr w:dropCap="drop" w:lines="3"');
  expect(docXml).toContain("<w:t>E</w:t>");
  expect(docXml).toContain('<w:ind w:firstLine="0"/>');
  expect(docXml).toContain("<w:pageBreakBefore/>");
  expect(docXml).toContain("<w:b/><w:i/>");
  expect(docXml).toContain("* * *");
  expect(docXml).toContain('<w:pStyle w:val="Quote"/>');
  expect(docXml).toContain('<w:br w:type="page"/>');
  expect(docXml).toContain('<w:hyperlink r:id="rId2">');
  expect(docXml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
  expect(docXml).toContain('<w:vertAlign w:val="superscript"/>');
  expect(docXml).toContain('<w:color w:val="B42318"/>');
  expect(docXml).toContain('w:fill="FEF08A"');
  expect(docXml).toContain('<w:sz w:val="44"/>');
  expect(docXml).not.toContain("Unprinted outline note");

  expect(relsXml).toContain(
    'Target="https://example.com/tides" TargetMode="External"',
  );
  expect(stylesXml).toContain('w:styleId="Heading1"');
  expect(stylesXml).toContain('w:styleId="Quote"');
  expect(stylesXml).toContain('w:line="480"');

  const singleBytes = writeDocx(sampleBook(), {
    paper: "letter",
    lineSpacing: 1,
  });
  const singleStyles = strFromU8(unzipSync(singleBytes)["word/styles.xml"]!);
  expect(singleStyles).toContain('w:line="240"');
});
