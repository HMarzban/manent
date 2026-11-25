import { WRITING_TOOLS_WORDS } from "@manent/ui";
import { PAGED_FORMATS } from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const characterReportFileType: ExportFileType = {
  id: "character_report",
  label: WRITING_TOOLS_WORDS.characterReportCsv,
  mime: "text/csv;charset=utf-8",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) => {
    const { writeCharacterReportCsv } =
      await import("../../numbers/report-files.ts");
    return writeCharacterReportCsv(work);
  },
  leftOut: null,
};
