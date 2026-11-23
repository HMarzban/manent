// The clean PDF: the pages on screen, in the script font, with the pages before page 1.
import { EDITOR_WORDS } from "@manent/ui";
import { liveFrontPages } from "../../editor-host/live-editor.ts";
import { loadPdfFonts } from "../pdf-fonts.ts";
import { PAGED_FORMATS } from "../script-file.ts";
import type { ExportFileType, ExportWork } from "../script-file.ts";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Rejects when the fonts or the writer fail. */
async function writeCleanPdf(
  work: ExportWork,
): Promise<Uint8Array<ArrayBuffer>> {
  const { docId, pages, title, now } = work;
  const front = liveFrontPages(docId) ?? [];
  const [fonts, { writePdf }] = await Promise.all([
    loadPdfFonts(fetchBytes),
    import("@manent/formats"),
  ]);
  // a copy over an ArrayBuffer of its own, which a Blob takes
  return new Uint8Array(
    await writePdf(pages, { fonts, front, title, createdAt: now() }),
  );
}

export const pdfFileType: ExportFileType = {
  id: "pdf",
  label: EDITOR_WORDS.send.cleanPdf,
  extension: ".pdf",
  mime: "application/pdf",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export"],
  print: { offered: true },
  lockedOnly: false,
  pagesOf: null,
  write: writeCleanPdf,
  leftOut: null,
};
