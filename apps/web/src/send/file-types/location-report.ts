import { WRITING_TOOLS_WORDS } from "@manent/ui";
import { SCRIPT_ONLY_FORMATS } from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const locationReportFileType: ExportFileType = {
  id: "location_report",
  label: WRITING_TOOLS_WORDS.locationReportCsv,
  mime: "text/csv;charset=utf-8",
  docKinds: ["script"],
  formats: SCRIPT_ONLY_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) => {
    const { writeLocationReportCsv } =
      await import("../../numbers/report-files.ts");
    return writeLocationReportCsv(work);
  },
  leftOut: null,
};
