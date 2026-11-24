// The script as an FDX file, written from the open editor's script.
import { IMPORT_WORDS } from "@manent/ui";
import {
  PAGED_FORMATS,
  SCRIPT_FILES,
  writeScriptFile,
  scriptFileLeftOut,
} from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const fdxFileType: ExportFileType = {
  id: "fdx",
  label: IMPORT_WORDS.asFdx,
  mime: SCRIPT_FILES.fdx.mime,
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export", "send_draft"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: (work) => writeScriptFile("fdx", work),
  leftOut: (work) => scriptFileLeftOut("fdx", work),
};
