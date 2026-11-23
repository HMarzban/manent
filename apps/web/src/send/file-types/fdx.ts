// The script as an FDX file, written from the open editor's script.
import { IMPORT_WORDS } from "@manent/ui";
import {
  PAGED_FORMATS,
  SCRIPT_FILES,
  scriptFileBytes,
  scriptFileLeftOut,
} from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const fdxFileType: ExportFileType = {
  id: "fdx",
  label: IMPORT_WORDS.asFdx,
  ...SCRIPT_FILES.fdx,
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: (work) => scriptFileBytes("fdx", work),
  leftOut: (work) => scriptFileLeftOut("fdx", work),
};
