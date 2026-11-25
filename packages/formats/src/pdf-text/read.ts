// Reading a text-based screenplay PDF via pdf.js (loaded lazily on first call, running on the main thread).
import type { IdSource } from "@manent/schema";
import { IMPORT_LIMIT_BYTES } from "../script/decode.ts";
import { FormatError } from "../script/model.ts";
import type { ImportedScript } from "../script/model.ts";
import { buildPdfBlocks } from "./lines.ts";
import type { PdfPageInput, PdfSpan } from "./lines.ts";

/** PDF signature bytes ("%PDF-"), which the PDF specification requires within the first 1024 bytes. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const PDF_HEADER_WINDOW = 1024;
/** Upper bounds to prevent denial of service from pathological PDFs. */
const PDF_PAGE_LIMIT = 5000;
const PDF_ITEM_LIMIT = 500_000;
const PAPER_TOLERANCE_PT = 4;

const COMMENT_SUBTYPES = new Set([
  "Text",
  "FreeText",
  "Highlight",
  "Underline",
  "Squiggly",
  "StrikeOut",
  "Caret",
  "Popup",
]);

function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_MAGIC.length;
  for (let i = 0; i <= limit; i++) {
    if (PDF_MAGIC.every((byte, offset) => bytes[i + offset] === byte))
      return true;
  }
  return false;
}

function paperOf(widthPt: number, heightPt: number): "letter" | "a4" | null {
  if (
    Math.abs(widthPt - 612) <= PAPER_TOLERANCE_PT &&
    Math.abs(heightPt - 792) <= PAPER_TOLERANCE_PT
  )
    return "letter";
  if (
    Math.abs(widthPt - 595.28) <= PAPER_TOLERANCE_PT &&
    Math.abs(heightPt - 841.89) <= PAPER_TOLERANCE_PT
  )
    return "a4";
  return null;
}

function isCommentAnnotation(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const subtype: unknown = Reflect.get(value, "subtype");
  return typeof subtype === "string" && COMMENT_SUBTYPES.has(subtype);
}

/**
 * Reads a text-based PDF into screenplay elements using each text item's left edge in inches. Dynamically loads
 * pdf.js legacy and its worker so first-load bundles stay clean. Refuses PDFs with no text items with
 * `FormatError("not_this_format")`, malformed files with `"malformed"`, and oversized files with `"too_large"`.
 */
export async function readPdf(
  bytes: Uint8Array,
  options: { ids: IdSource },
): Promise<ImportedScript> {
  if (bytes.length > IMPORT_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `a file may be ${IMPORT_LIMIT_BYTES} bytes, not ${bytes.length}`,
    );
  if (!hasPdfHeader(bytes))
    throw new FormatError("malformed", "the bytes do not carry a PDF header");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
  ]);
  // copy the buffer because pdf.js transfers/detaches it; disable network fetches, fonts and XFA forms
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    enableXfa: false,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > PDF_PAGE_LIMIT)
      throw new FormatError(
        "too_large",
        `a PDF may hold ${PDF_PAGE_LIMIT} pages, not ${pdf.numPages}`,
      );
    const pages: PdfPageInput[] = [];
    const unread = new Set<string>();
    let paper: "letter" | "a4" | null = null;
    let totalItems = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const view = page.view;
      const viewX0 = view[0] ?? 0;
      const viewY0 = view[1] ?? 0;
      const viewX1 = view[2] ?? 612;
      const viewY1 = view[3] ?? 792;
      const widthPt = Math.max(1, viewX1 - viewX0);
      const heightPt = Math.max(1, viewY1 - viewY0);
      if (n === 1) paper = paperOf(widthPt, heightPt);
      const content = await page.getTextContent();
      const spans: PdfSpan[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        totalItems += 1;
        if (totalItems > PDF_ITEM_LIMIT)
          throw new FormatError(
            "too_large",
            `a PDF may hold at most ${PDF_ITEM_LIMIT} text items`,
          );
        const x = (item.transform[4] ?? 0) - viewX0;
        const y = viewY1 - (item.transform[5] ?? 0);
        const width =
          typeof item.width === "number" && item.width > 0 ? item.width : 0;
        spans.push({ x, end: x + width, y, text: item.str });
      }
      if (!unread.has("image")) {
        const operators = await page.getOperatorList();
        if (operators.fnArray.some((op) => imageOps.has(op)))
          unread.add("image");
      }
      if (!unread.has("comment")) {
        const annotations = await page.getAnnotations();
        if (annotations.some(isCommentAnnotation)) unread.add("comment");
      }
      pages.push({ widthPt, heightPt, spans });
    }
    if (totalItems === 0)
      throw new FormatError("not_this_format", "the PDF holds no text items");
    const blocks = buildPdfBlocks(pages, options.ids, unread);
    return {
      from: "pdf",
      title: null,
      paper,
      blocks,
      notes: [],
      production: null,
      kept: [],
      coloursMapped: 0,
      unread: [...unread],
    };
  } catch (cause) {
    if (cause instanceof FormatError) throw cause;
    throw new FormatError("malformed", "the file is not a readable PDF", {
      cause,
    });
  } finally {
    await task.destroy().catch(() => {
      // ignore destroy errors after a malformed PDF already threw
    });
  }
}
