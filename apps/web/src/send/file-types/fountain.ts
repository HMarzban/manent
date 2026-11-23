// The script as a Fountain file, written from the open editor's script.
import { IMPORT_WORDS } from "@manent/ui";
import {
  PAGED_FORMATS,
  SCRIPT_FILES,
  scriptFileBytes,
  scriptFileLeftOut,
} from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const fountainFileType: ExportFileType = {
  id: "fountain",
  label: IMPORT_WORDS.asFountain,
  ...SCRIPT_FILES.fountain,
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: (work) => scriptFileBytes("fountain", work),
  leftOut: (work) => scriptFileLeftOut("fountain", work),
};
