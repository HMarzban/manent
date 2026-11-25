// The clean PDF: the pages on screen, in the script font, with the pages before page 1.
import { EDITOR_WORDS } from "@manent/ui";
import {
  liveFrontPages,
  liveFurniture,
} from "../../editor-host/live-editor.ts";
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

function isoDay(at: number): string {
  const date = new Date(at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Named for the script's title; rejects when the fonts or the writer fail. */
async function writeCleanPdf(work: ExportWork): Promise<WrittenFile> {
  const { docId, pages, title, now } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const front = liveFrontPages(docId) ?? [];
  const furniture = liveFurniture(docId);
  const created = now();
  const [fonts, { writePdf }] = await Promise.all([
    loadPdfFonts(fetchBytes),
    import("@manent/formats"),
  ]);
  // a copy over an ArrayBuffer of its own, which a Blob takes
  const bytes = new Uint8Array(
    await writePdf(pages, {
      fonts,
      front,
      title,
      createdAt: created,
      header: furniture.header ?? null,
      footer: furniture.footer ?? null,
      dateFormat: furniture.dateFormat ?? null,
      revisionLabel: furniture.revisionLabel ?? null,
      day: furniture.day ?? isoDay(created),
      durationMs: furniture.durationMs,
    }),
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
