// The clean PDF: the pages on screen, in the script font, with the pages before page 1.
import {
  buildBookToc,
  engineFor,
  layoutBookFrontPages,
} from "@manent/pagination";
import { blocksOf, sectionize } from "@manent/schema";
import { EDITOR_WORDS } from "@manent/ui";
import { archiveSource } from "../../archive/archive-source.ts";
import {
  liveFrontPages,
  liveFurniture,
} from "../../editor-host/live-editor.ts";
import { compileBookProject } from "../book-compile.ts";
import { readBookExportMeta } from "../book-export-meta.ts";
import { loadPdfAssetsForDoc, loadPdfCoverAsset } from "../pdf-assets.ts";
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
  const { docId, pages: initialPages, title: initialTitle, now, whatId } = work;
  if (initialPages === null) throw new TypeError(`no pages for ${docId}`);
  const isManuscript = initialPages.profile.format === "manuscript";
  const services = archiveSource.get();
  const compiled =
    whatId === "whole_book" && isManuscript && services !== null
      ? await compileBookProject(services, docId, initialTitle)
      : null;
  const title = compiled?.title ?? initialTitle;
  const eng = engineFor(initialPages.engineVersion);
  const pages =
    compiled !== null && eng !== null
      ? eng.paginate(
          eng.toLayoutBlocks(blocksOf(sectionize(compiled.script.blocks))),
          initialPages.profile,
        )
      : initialPages;
  const bookMeta = isManuscript ? readBookExportMeta(docId, title) : null;
  const front =
    isManuscript && bookMeta !== null
      ? layoutBookFrontPages({
          titlePage: {
            title: bookMeta.frontMatter.title ?? "",
            authors: bookMeta.frontMatter.author ?? "",
          },
          matter: {
            subtitle: bookMeta.frontMatter.subtitle ?? "",
            copyright: bookMeta.frontMatter.copyright ?? "",
            isbn: bookMeta.frontMatter.isbn ?? "",
            dedication: bookMeta.frontMatter.dedication ?? "",
          },
          profile: pages.profile,
          toc: bookMeta.includeToc
            ? buildBookToc(pages, {
                includeSubheadings: bookMeta.tocSubheadings,
              })
            : [],
          includeToc: bookMeta.includeToc,
        })
      : (liveFrontPages(docId) ?? []);
  const furniture = liveFurniture(docId);
  const created = now();
  const needsBookFonts = pages.profile.typography?.kind === "book_serif";
  const [
    fonts,
    bookFonts,
    assets,
    cover,
    { extractFootnotes, writePdf },
    { scriptForExport },
  ] = await Promise.all([
    loadPdfFonts(fetchBytes),
    needsBookFonts
      ? import("../pdf-book-fonts.ts").then((m) =>
          m.loadBookPdfFonts(fetchBytes),
        )
      : Promise.resolve(undefined),
    loadPdfAssetsForDoc(docId, pages),
    bookMeta !== null
      ? loadPdfCoverAsset(docId, bookMeta.coverAssetId)
      : Promise.resolve(null),
    import("@manent/formats"),
    import("../../editor-host/export-source.ts"),
  ]);
  let footnotes:
    | readonly { ordinal: number; text: string; pageLabel: string | null }[]
    | undefined;
  if (pages.profile.format === "manuscript") {
    const script = compiled?.script ?? (await scriptForExport(docId, title));
    if (script !== null) {
      const extracted = extractFootnotes(script.blocks);
      if (extracted.notes.length > 0) {
        footnotes = extracted.notes.map((note) => {
          const pageIdx =
            eng === null ? null : eng.pageOf(pages, note.blockIndex, 0);
          const label =
            pageIdx === null ? null : (pages.pages[pageIdx]?.label ?? null);
          return { ordinal: note.ordinal, text: note.text, pageLabel: label };
        });
      }
    }
  }
  // a copy over an ArrayBuffer of its own, which a Blob takes
  const bytes = new Uint8Array(
    await writePdf(pages, {
      fonts,
      bookFonts,
      cover,
      front,
      backMatter: bookMeta?.backMatter ?? null,
      title,
      createdAt: created,
      header: furniture.header ?? null,
      footer: furniture.footer ?? null,
      dateFormat: furniture.dateFormat ?? null,
      revisionLabel: furniture.revisionLabel ?? null,
      day: furniture.day ?? isoDay(created),
      durationMs: furniture.durationMs,
      assets,
      footnotes,
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
