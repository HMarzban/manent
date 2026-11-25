import type { ExportFileType } from "../script-file.ts";

export const inkSourceFileType: ExportFileType = {
  id: "ink_source",
  label: "",
  mime: "text/plain;charset=utf-8",
  docKinds: [],
  formats: null,
  forms: [],
  print: { offered: false, reason: "isn't part of the Ink format" },
  lockedOnly: false,
  pagesOf: null,
  write: () => Promise.reject(new RangeError("not implemented")),
  leftOut: null,
};
