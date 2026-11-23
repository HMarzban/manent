import type { ExportFileType } from "../script-file.ts";

export const prompterTextFileType: ExportFileType = {
  id: "prompter_text",
  label: "",
  mime: "text/plain;charset=utf-8",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(new Error("the file type prompter_text writes no file")),
  leftOut: null,
};
