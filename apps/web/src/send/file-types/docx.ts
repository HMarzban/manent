// Word (.docx) export file type for books and scripts.
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
  const paper = work.pages?.profile.paper === "a4" ? "a4" : "letter";
  const lineSpacing =
    work.pages?.profile.elements.body.lineSpacing === 1 ? 1 : 2;
  return {
    bytes: writeDocx(script, { paper, lineSpacing }),
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
