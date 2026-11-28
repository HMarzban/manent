import { WRITING_TOOLS_WORDS } from "@manent/ui";
import { SCRIPT_ONLY_FORMATS } from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const sceneReportFileType: ExportFileType = {
  id: "scene_report",
  label: WRITING_TOOLS_WORDS.sceneReportCsv,
  mime: "text/csv;charset=utf-8",
  docKinds: ["script"],
  formats: SCRIPT_ONLY_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) => {
    const { writeSceneReportCsv } =
      await import("../../numbers/report-files.ts");
    return writeSceneReportCsv(work);
  },
  leftOut: null,
};
