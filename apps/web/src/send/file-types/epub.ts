// Offline EPUB 3 (.epub) export file type offered strictly for Book (manuscript) documents.
import { IMPORT_WORDS } from "@manent/ui";
import { archiveSource } from "../../archive/archive-source.ts";
import { compileBookProject } from "../book-compile.ts";
import { readBookExportMeta } from "../book-export-meta.ts";
import { loadEpubCoverAsset, loadPdfAssetsForDoc } from "../pdf-assets.ts";
import { fileName } from "../script-file.ts";
import type {
  ExportFileType,
  ExportWork,
  WrittenFile,
} from "../script-file.ts";

const EPUB_MIME = "application/epub+zip";

async function writeEpubFile(work: ExportWork): Promise<WrittenFile> {
  const services = archiveSource.get();
  const compiled =
    work.whatId === "whole_book" && services !== null
      ? await compileBookProject(services, work.docId, work.title)
      : null;
  const title = compiled?.title ?? work.title;
  const bookMeta = readBookExportMeta(work.docId, title);
  const [{ scriptForExport }, { writeEpub }, assets, cover] = await Promise.all(
    [
      import("../../editor-host/export-source.ts"),
      import("@manent/formats"),
      work.pages === null
        ? Promise.resolve(undefined)
        : loadPdfAssetsForDoc(work.docId, work.pages),
      loadEpubCoverAsset(work.docId, bookMeta.coverAssetId),
    ],
  );
  const script = compiled?.script ?? (await scriptForExport(work.docId, title));
  if (script === null) throw new Error(`no open editor holds ${work.docId}`);
  return {
    bytes: writeEpub(script, {
      modifiedAt: work.now(),
      assets,
      cover,
      frontMatter: bookMeta.frontMatter,
      backMatter: bookMeta.backMatter,
      includeTocInSpine: bookMeta.includeToc,
      includeSubheadingsInToc: bookMeta.tocSubheadings,
    }),
    name: fileName(title, ".epub"),
  };
}

export const epubFileType: ExportFileType = {
  id: "epub",
  label: IMPORT_WORDS.asEpub,
  mime: EPUB_MIME,
  docKinds: ["script"],
  formats: ["manuscript"],
  forms: ["export", "send_draft"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: writeEpubFile,
  leftOut: null,
};
