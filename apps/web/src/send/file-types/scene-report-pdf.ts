import type { ExportFileType } from "../script-file.ts";

export const sceneReportPdfFileType: ExportFileType = {
  id: "scene_report_pdf",
  label: "",
  mime: "application/pdf",
  docKinds: [],
  formats: null,
  forms: [],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () => Promise.reject(new RangeError("not implemented")),
  leftOut: null,
};
