// Word (.docx) export file type for books and scripts.
import { parsePaper } from "@manent/pagination";
import { IMPORT_WORDS } from "@manent/ui";
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
  const script = await scriptForExport(work.docId, work.title);
  if (script === null) throw new Error(`no open editor holds ${work.docId}`);
  const profile = work.pages?.profile;
  const paper = parsePaper(profile?.paper, work.pages?.engineVersion ?? 1);
  const lineSpacing = profile?.elements.body.lineSpacing === 1 ? 1 : 2;
  const geometry = profile?.geometry;
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
    }),
    name: fileName(work.title, ".docx"),
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
