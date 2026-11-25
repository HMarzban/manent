import type { ExportFileType } from "../script-file.ts";

export const characterReportFileType: ExportFileType = {
  id: "character_report",
  label: "",
  mime: "text/csv;charset=utf-8",
  docKinds: [],
  formats: null,
  forms: [],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () => Promise.reject(new RangeError("not implemented")),
  leftOut: null,
};
