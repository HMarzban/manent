// The open Ink document as an .ink source file.
import { GAME_EXPORTS_WORDS } from "@manent/ui";
import type { ExportFileType } from "../script-file.ts";

export const inkSourceFileType: ExportFileType = {
  id: "ink_source",
  label: GAME_EXPORTS_WORDS.inkSource,
  mime: "text/plain;charset=utf-8",
  docKinds: ["ink"],
  formats: ["ink"],
  forms: ["export"],
  print: { offered: false, reason: GAME_EXPORTS_WORDS.inkNoPrint },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) =>
    (await import("../ink-files.ts")).writeInkSourceFile(work),
  leftOut: () => Promise.resolve(null),
};
