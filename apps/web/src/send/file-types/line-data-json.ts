import type { ExportFileType } from "../script-file.ts";

export const lineDataJsonFileType: ExportFileType = {
  id: "line_data_json",
  label: "",
  mime: "application/json",
  docKinds: [],
  formats: null,
  forms: [],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () => Promise.reject(new RangeError("not implemented")),
  leftOut: null,
};
