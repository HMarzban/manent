import type { ExportFileType } from "../script-file.ts";

export const rundownJsonFileType: ExportFileType = {
  id: "rundown_json",
  label: "",
  mime: "application/json",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(new Error("the file type rundown_json writes no file")),
  leftOut: null,
};
