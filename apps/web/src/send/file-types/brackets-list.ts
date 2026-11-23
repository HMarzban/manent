import type { ExportFileType } from "../script-file.ts";

export const bracketsListFileType: ExportFileType = {
  id: "brackets_list",
  label: "",
  mime: "text/plain;charset=utf-8",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(new Error("the file type brackets_list writes no file")),
  leftOut: null,
};
