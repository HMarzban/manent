// Lossless Markdown (.md) export file type offered strictly for Book (manuscript) documents.
import { IMPORT_WORDS } from "@manent/ui";
import { archiveSource } from "../../archive/archive-source.ts";
import { compileBookProject } from "../book-compile.ts";
import { readBookExportMeta } from "../book-export-meta.ts";
import { fileName } from "../script-file.ts";
import type {
  ExportFileType,
  ExportWork,
  WrittenFile,
} from "../script-file.ts";

const MARKDOWN_MIME = "text/markdown; charset=utf-8";

async function writeMarkdownFile(work: ExportWork): Promise<WrittenFile> {
  const services = archiveSource.get();
  const compiled =
    work.whatId === "whole_book" && services !== null
      ? await compileBookProject(services, work.docId, work.title)
      : null;
  const title = compiled?.title ?? work.title;
  const bookMeta = readBookExportMeta(work.docId, title);
  const [{ scriptForExport }, { writeMarkdown }] = await Promise.all([
    import("../../editor-host/export-source.ts"),
    import("@manent/formats"),
  ]);
  const script = compiled?.script ?? (await scriptForExport(work.docId, title));
  if (script === null) throw new Error(`no open editor holds ${work.docId}`);
  const text = writeMarkdown(script, {
    frontMatter: bookMeta.frontMatter,
    backMatter: bookMeta.backMatter,
  });
  return {
    bytes: new TextEncoder().encode(text),
    name: fileName(title, ".md"),
  };
}

export const markdownFileType: ExportFileType = {
  id: "markdown",
  label: IMPORT_WORDS.asMarkdown,
  mime: MARKDOWN_MIME,
  docKinds: ["script"],
  formats: ["manuscript"],
  forms: ["export", "send_draft"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: writeMarkdownFile,
  leftOut: null,
};
