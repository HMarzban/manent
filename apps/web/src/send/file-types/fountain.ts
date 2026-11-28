// The script as a Fountain file, written from the open editor's script.
import { IMPORT_WORDS } from "@manent/ui";
import {
  SCRIPT_FILES,
  SCRIPT_ONLY_FORMATS,
  writeScriptFile,
  scriptFileLeftOut,
} from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const fountainFileType: ExportFileType = {
  id: "fountain",
  label: IMPORT_WORDS.asFountain,
  mime: SCRIPT_FILES.fountain.mime,
  docKinds: ["script"],
  formats: SCRIPT_ONLY_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: (work) => writeScriptFile("fountain", work),
  leftOut: (work) => scriptFileLeftOut("fountain", work),
};
