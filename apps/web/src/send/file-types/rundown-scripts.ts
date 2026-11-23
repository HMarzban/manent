import type { ExportFileType } from "../script-file.ts";

export const rundownScriptsFileType: ExportFileType = {
  id: "rundown_scripts",
  label: "",
  mime: "application/pdf",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: true },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(new Error("the file type rundown_scripts writes no file")),
  leftOut: null,
};
