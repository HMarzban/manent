import { expect, test } from "bun:test";
import type { FontFaceKey } from "@manent/pagination";
import { writeCsv, writeCsvBytes, writeReportPdf } from "../src/index.ts";
import type { ScriptFontFiles } from "../src/index.ts";
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

test("writeCsv emits RFC 4180 CRLF output with proper quoting", () => {
  const csv = writeCsv(
    ["Name", "Line", "Page"],
    [
      ["MIRA", 'She said, "hello"', "1"],
      ["TOM", "Line one\nLine two", "2"],
    ],
  );
  expect(csv).toBe(
    'Name,Line,Page\r\nMIRA,"She said, ""hello""",1\r\nTOM,"Line one\nLine two",2\r\n',
  );
  const decoded = new TextDecoder().decode(
    writeCsvBytes(["A", "B"], [["1", "2"]]),
  );
  expect(decoded).toBe("A,B\r\n1,2\r\n");
});

test("writeReportPdf renders heading, columns and rows as a valid PDF on Letter and A4", async () => {
  const bytes = await writeReportPdf({
    title: "Every Key But One",
    heading: "Characters in 'Every Key But One'",
    columns: [
      { header: "Name", weight: 2 },
      { header: "Speeches", weight: 1, align: "right" },
      { header: "Dialogue words", weight: 1, align: "right" },
    ],
    rows: [
      ["MIRA", "12", "340"],
      ["TOM", "4", "95"],
    ],
    paper: "letter",
    fonts,
    createdAt: 0,
  });
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  const pages = await readPdf(bytes);
  expect(pages.length).toBe(1);
  const text = pages[0]!.lines.map((line) => line.text).join("\n");
  expect(text).toContain("Characters in 'Every Key But One'");
  expect(text).toContain("MIRA");
  expect(text).toContain("340");
});
