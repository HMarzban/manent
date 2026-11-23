import type { ExportFileType } from "../script-file.ts";

export const varietyTwoColumnFileType: ExportFileType = {
  id: "variety_two_column",
  label: "",
  mime: "application/pdf",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new Error("the file type variety_two_column writes no file"),
    ),
  leftOut: null,
};
