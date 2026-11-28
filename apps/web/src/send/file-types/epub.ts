// Offline EPUB 3 (.epub) export file type offered strictly for Book (manuscript) documents.
import { IMPORT_WORDS } from "@manent/ui";
import { loadPdfAssetsForDoc } from "../pdf-assets.ts";
import { fileName } from "../script-file.ts";
import type {
  ExportFileType,
  ExportWork,
  WrittenFile,
} from "../script-file.ts";

const EPUB_MIME = "application/epub+zip";

async function writeEpubFile(work: ExportWork): Promise<WrittenFile> {
  const [{ scriptForExport }, { writeEpub }, assets] = await Promise.all([
    import("../../editor-host/export-source.ts"),
    import("@manent/formats"),
    work.pages === null
      ? Promise.resolve(undefined)
      : loadPdfAssetsForDoc(work.docId, work.pages),
  ]);
  const script = await scriptForExport(work.docId, work.title);
  if (script === null) throw new Error(`no open editor holds ${work.docId}`);
  return {
    bytes: writeEpub(script, {
      modifiedAt: work.now(),
      assets,
    }),
    name: fileName(work.title, ".epub"),
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
