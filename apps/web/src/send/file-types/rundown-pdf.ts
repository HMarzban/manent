import type { ExportFileType } from "../script-file.ts";

export const rundownPdfFileType: ExportFileType = {
  id: "rundown_pdf",
  label: "",
  mime: "application/pdf",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: true },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(new Error("the file type rundown_pdf writes no file")),
  leftOut: null,
};
