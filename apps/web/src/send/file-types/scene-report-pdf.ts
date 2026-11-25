import { WRITING_TOOLS_WORDS } from "@manent/ui";
import { PAGED_FORMATS } from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const sceneReportPdfFileType: ExportFileType = {
  id: "scene_report_pdf",
  label: WRITING_TOOLS_WORDS.sceneReportPdf,
  mime: "application/pdf",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) => {
    const { writeSceneReportPdf } =
      await import("../../numbers/report-files.ts");
    return writeSceneReportPdf(work);
  },
  leftOut: null,
};
