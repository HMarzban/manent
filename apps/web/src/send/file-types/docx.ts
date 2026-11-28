// Word (.docx) export file type for books and scripts.
import { buildBookToc, engineFor, parsePaper } from "@manent/pagination";
import { blocksOf, sectionize } from "@manent/schema";
import { IMPORT_WORDS } from "@manent/ui";
import { archiveSource } from "../../archive/archive-source.ts";
import { compileBookProject } from "../book-compile.ts";
import { readBookExportMeta } from "../book-export-meta.ts";
import { PAGED_FORMATS, fileName } from "../script-file.ts";
import type {
  ExportFileType,
  ExportWork,
  WrittenFile,
} from "../script-file.ts";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function writeDocxFile(work: ExportWork): Promise<WrittenFile> {
  const [{ scriptForExport }, { writeDocx }] = await Promise.all([
    import("../../editor-host/export-source.ts"),
    import("@manent/formats"),
  ]);
  const profile = work.pages?.profile;
  const isManuscript = profile?.format === "manuscript";
  const services = archiveSource.get();
  const compiled =
    work.whatId === "whole_book" && isManuscript && services !== null
      ? await compileBookProject(services, work.docId, work.title)
      : null;
  const title = compiled?.title ?? work.title;
  const script = compiled?.script ?? (await scriptForExport(work.docId, title));
  if (script === null) throw new Error(`no open editor holds ${work.docId}`);
  const paper = parsePaper(profile?.paper, work.pages?.engineVersion ?? 1);
  const lineSpacing = profile?.elements.body.lineSpacing === 1 ? 1 : 2;
  const geometry = profile?.geometry;
  const bookMeta = isManuscript ? readBookExportMeta(work.docId, title) : null;
  const tocPages =
    compiled !== null && work.pages !== null
      ? (() => {
          const eng = engineFor(work.pages.engineVersion);
          return eng === null
            ? work.pages
            : eng.paginate(
                eng.toLayoutBlocks(
                  blocksOf(sectionize(compiled.script.blocks)),
                ),
                work.pages.profile,
              );
        })()
      : work.pages;
  const tocEntries =
    isManuscript && bookMeta?.includeToc && tocPages !== null
      ? buildBookToc(tocPages, {
          includeSubheadings: bookMeta.tocSubheadings,
        })
      : undefined;
  return {
    bytes: writeDocx(script, {
      paper,
      lineSpacing,
      mirrorMargins: geometry?.mirrored === true,
      marginsPt:
        geometry !== undefined
          ? {
              top: geometry.marginTopPt,
              bottom: geometry.marginBottomPt,
              inner: geometry.marginInnerPt ?? geometry.marginLeftPt,
              outer: geometry.marginOuterPt ?? geometry.marginRightPt,
            }
          : undefined,
      bookFont: profile?.typography?.family,
      fontSizePt: profile?.typography?.fontSizePt,
      frontMatter: bookMeta?.frontMatter,
      backMatter: bookMeta?.backMatter,
      includeToc: bookMeta?.includeToc,
      tocEntries,
      rectoChapters: bookMeta?.rectoChapters,
    }),
    name: fileName(title, ".docx"),
  };
}

export const docxFileType: ExportFileType = {
  id: "docx",
  label: IMPORT_WORDS.asDocx,
  mime: DOCX_MIME,
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export", "send_draft"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: writeDocxFile,
  leftOut: null,
};
