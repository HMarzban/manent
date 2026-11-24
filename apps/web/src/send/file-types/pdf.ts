// The clean PDF: the pages on screen, in the script font, with the pages before page 1.
import { EDITOR_WORDS } from "@manent/ui";
import { liveFrontPages } from "../../editor-host/live-editor.ts";
import { loadPdfFonts } from "../pdf-fonts.ts";
import { PAGED_FORMATS, fileName } from "../script-file.ts";
import type {
  ExportFileType,
  ExportWork,
  WrittenFile,
} from "../script-file.ts";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Named for the script's title; rejects when the fonts or the writer fail. */
async function writeCleanPdf(work: ExportWork): Promise<WrittenFile> {
  const { docId, pages, title, now } = work;
  const front = liveFrontPages(docId) ?? [];
  const [fonts, { writePdf }] = await Promise.all([
    loadPdfFonts(fetchBytes),
    import("@manent/formats"),
  ]);
  // a copy over an ArrayBuffer of its own, which a Blob takes
  const bytes = new Uint8Array(
    await writePdf(pages, { fonts, front, title, createdAt: now() }),
  );
  return { bytes, name: fileName(title, ".pdf") };
}

export const pdfFileType: ExportFileType = {
  id: "pdf",
  label: EDITOR_WORDS.send.cleanPdf,
  mime: "application/pdf",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export", "send_draft"],
  print: { offered: true },
  lockedOnly: false,
  pagesOf: null,
  write: writeCleanPdf,
  leftOut: null,
};
