// Rundown PDF file type: landscape table of chosen rows and columns in the script font.
import { RUNDOWN_SEND_WORDS, formatPosition } from "@manent/ui";
import {
  fetchFontBytes,
  rundownFileName,
} from "../../rundown/send/rundown-file-work.ts";
import type { RundownFileWork } from "../../rundown/send/rundown-file-work.ts";
import { loadPdfFonts } from "../pdf-fonts.ts";
import type { ExportFileType, WrittenFile } from "../script-file.ts";

/** Writes the rundown table PDF from `work`, loading `@manent/formats` dynamically. */
export async function writeRundownPdfFile(
  work: RundownFileWork,
): Promise<WrittenFile> {
  const [fonts, { writeRundownPdf }] = await Promise.all([
    loadPdfFonts(fetchFontBytes),
    import("@manent/formats"),
  ]);
  const bytes = new Uint8Array(
    await writeRundownPdf(work.rundown, {
      paper: work.paper,
      dateLabel: work.dateLabel,
      summaryLine: work.summaryLine,
      columnIds: work.columnIds,
      formatPageNumber: formatPosition,
      fonts,
      createdAt: work.now(),
    }),
  );
  return { bytes, name: rundownFileName(work, "rundown", ".pdf") };
}

export const rundownPdfFileType: ExportFileType = {
  id: "rundown_pdf",
  label: RUNDOWN_SEND_WORDS.types.rundown_pdf,
  mime: "application/pdf",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: true },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new RangeError("rundown_pdf is written through the rundown Send form"),
    ),
  leftOut: null,
};
