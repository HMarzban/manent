// Every Ink document of the project on this device joined into one .ink file.
import { GAME_EXPORTS_WORDS } from "@manent/ui";
import type { ExportFileType } from "../script-file.ts";

export const inkProjectFileType: ExportFileType = {
  id: "ink_project",
  label: GAME_EXPORTS_WORDS.inkProject,
  mime: "text/plain;charset=utf-8",
  docKinds: ["ink"],
  formats: ["ink"],
  forms: ["export"],
  print: { offered: false, reason: GAME_EXPORTS_WORDS.inkNoPrint },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) =>
    (await import("../ink-files.ts")).writeInkProjectFile(work),
  leftOut: async (work) =>
    (await import("../ink-files.ts")).inkProjectLeftOut(work),
};
