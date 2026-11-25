// All scripts as one PDF file type: chosen rows' stories in run order, each paginated with its own engine.
import { RUNDOWN_SEND_WORDS } from "@manent/ui";
import {
  fetchFontBytes,
  rundownFileName,
} from "../../rundown/send/rundown-file-work.ts";
import type { RundownFileWork } from "../../rundown/send/rundown-file-work.ts";
import { loadPdfFonts } from "../pdf-fonts.ts";
import type { ExportFileType, WrittenFile } from "../script-file.ts";

/** Writes all chosen stories as one PDF, loading `@manent/formats` dynamically. */
export async function writeRundownScriptsFile(
  work: RundownFileWork,
): Promise<WrittenFile> {
  const [fonts, { writeRundownScriptsPdf }] = await Promise.all([
    loadPdfFonts(fetchFontBytes),
    import("@manent/formats"),
  ]);
  const bytes = new Uint8Array(
    await writeRundownScriptsPdf(work.rundown, {
      fonts,
      title: work.rundown.title,
      createdAt: work.now(),
    }),
  );
  return { bytes, name: rundownFileName(work, "scripts", ".pdf") };
}

export const rundownScriptsFileType: ExportFileType = {
  id: "rundown_scripts",
  label: RUNDOWN_SEND_WORDS.types.rundown_scripts,
  mime: "application/pdf",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: true },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new RangeError(
        "rundown_scripts is written through the rundown Send form",
      ),
    ),
  leftOut: null,
};
