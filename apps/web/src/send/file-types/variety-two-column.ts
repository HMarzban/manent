// Two-column Variety PDF file type: 40 % left directions, 60 % right speakers and dialogue.
import { RUNDOWN_SEND_WORDS } from "@manent/ui";
import {
  fetchFontBytes,
  rundownFileName,
} from "../../rundown/send/rundown-file-work.ts";
import type { RundownFileWork } from "../../rundown/send/rundown-file-work.ts";
import { loadPdfFonts } from "../pdf-fonts.ts";
import type { ExportFileType, WrittenFile } from "../script-file.ts";

/** Writes the two-column Variety PDF from `work`, loading `@manent/formats` dynamically. */
export async function writeVarietyTwoColumnFile(
  work: RundownFileWork,
): Promise<WrittenFile> {
  const [fonts, { writeVarietyTwoColumnPdf }] = await Promise.all([
    loadPdfFonts(fetchFontBytes),
    import("@manent/formats"),
  ]);
  const bytes = new Uint8Array(
    await writeVarietyTwoColumnPdf(work.rundown, {
      paper: work.paper,
      fonts,
      createdAt: work.now(),
    }),
  );
  return { bytes, name: rundownFileName(work, "two-column", ".pdf") };
}

export const varietyTwoColumnFileType: ExportFileType = {
  id: "variety_two_column",
  label: RUNDOWN_SEND_WORDS.types.variety_two_column,
  mime: "application/pdf",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new RangeError(
        "variety_two_column is written through the rundown Send form",
      ),
    ),
  leftOut: null,
};
