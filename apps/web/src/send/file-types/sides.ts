import { PRODUCTION_OUTPUTS_WORDS } from "@manent/ui";
import { PAGED_FORMATS } from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const sidesFileType: ExportFileType = {
  id: "sides",
  label: PRODUCTION_OUTPUTS_WORDS.sides,
  mime: "application/pdf",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export", "send_draft"],
  print: { offered: false, reason: null },
  lockedOnly: true,
  pagesOf: null,
  write: () => Promise.reject(new Error("sides not implemented")),
  leftOut: null,
};
