import type { ExportFileType } from "../script-file.ts";

export const lineDataXmlFileType: ExportFileType = {
  id: "line_data_xml",
  label: "",
  mime: "application/xml",
  docKinds: [],
  formats: null,
  forms: [],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () => Promise.reject(new RangeError("not implemented")),
  leftOut: null,
};
