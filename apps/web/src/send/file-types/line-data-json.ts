// A Game Script's lines as JSON with stable block IDs, speaker names, and branching kinds and depths.
import { GAME_EXPORTS_WORDS } from "@manent/ui";
import type { ExportFileType } from "../script-file.ts";

export const lineDataJsonFileType: ExportFileType = {
  id: "line_data_json",
  label: GAME_EXPORTS_WORDS.lineDataJson,
  mime: "application/json",
  docKinds: ["script"],
  formats: ["game"],
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) =>
    (await import("../ink-files.ts")).writeLineDataFile("json", work),
  leftOut: () => Promise.resolve(null),
};
