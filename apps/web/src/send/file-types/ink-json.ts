import type { ExportFileType } from "../script-file.ts";

export const inkJsonFileType: ExportFileType = {
  id: "ink_json",
  label: "",
  mime: "application/json",
  docKinds: [],
  formats: null,
  forms: [],
  print: { offered: false, reason: "isn't part of the Ink format" },
  lockedOnly: false,
  pagesOf: null,
  write: () => Promise.reject(new RangeError("not implemented")),
  leftOut: null,
};
