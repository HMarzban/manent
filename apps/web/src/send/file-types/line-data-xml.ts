// A Game Script's lines as XML with stable block IDs, speaker names, and branching kinds and depths.
import { GAME_EXPORTS_WORDS } from "@manent/ui";
import type { ExportFileType } from "../script-file.ts";

export const lineDataXmlFileType: ExportFileType = {
  id: "line_data_xml",
  label: GAME_EXPORTS_WORDS.lineDataXml,
  mime: "application/xml",
  docKinds: ["script"],
  formats: ["game"],
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) =>
    (await import("../ink-files.ts")).writeLineDataFile("xml", work),
  leftOut: () => Promise.resolve(null),
};
