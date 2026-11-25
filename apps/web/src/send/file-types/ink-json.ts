// The open Ink document compiled to inkjs JSON (.ink.json).
import { GAME_EXPORTS_WORDS } from "@manent/ui";
import type { ExportFileType } from "../script-file.ts";

export const inkJsonFileType: ExportFileType = {
  id: "ink_json",
  label: GAME_EXPORTS_WORDS.inkJson,
  mime: "application/json",
  docKinds: ["ink"],
  formats: ["ink"],
  forms: ["export"],
  print: { offered: false, reason: GAME_EXPORTS_WORDS.inkNoPrint },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) =>
    (await import("../ink-files.ts")).writeInkJsonFile(work),
  leftOut: async (work) =>
    (await import("../ink-files.ts")).inkJsonLeftOut(work),
};
