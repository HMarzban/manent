// Sides PDF export file type: clean locked pages for the chosen scene range with unselected scenes struck through.
import { PRODUCTION_OUTPUTS_WORDS } from "@manent/ui";
import { loadPdfFonts } from "../pdf-fonts.ts";
import { PAGED_FORMATS, fileName } from "../script-file.ts";
import type {
  ExportFileType,
  ExportWork,
  WrittenFile,
} from "../script-file.ts";
import { sidesPagesOf, sidesSelectionFor } from "../sides-file.tsx";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function writeSidesFile(work: ExportWork): Promise<WrittenFile> {
  const { docId, pages, title, now } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const choice = sidesSelectionFor(docId, pages);
  if (choice === null) throw new RangeError(`no scenes in ${docId}`);
  const [fonts, { writeSidesPdf }] = await Promise.all([
    loadPdfFonts(fetchBytes),
    import("@manent/formats"),
  ]);
  const bytes = new Uint8Array(
    await writeSidesPdf(pages, {
      fonts,
      selectedHeadingIds: choice.ids,
      title,
      createdAt: now(),
    }),
  );
  const name = fileName(
    PRODUCTION_OUTPUTS_WORDS.sidesFileName(
      title,
      choice.first.number,
      choice.last.number,
    ),
    ".pdf",
  );
  return { bytes, name };
}

export const sidesFileType: ExportFileType = {
  id: "sides",
  label: PRODUCTION_OUTPUTS_WORDS.sides,
  mime: "application/pdf",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export", "send_draft"],
  print: { offered: false, reason: null },
  lockedOnly: true,
  pagesOf: sidesPagesOf,
  write: writeSidesFile,
  leftOut: null,
};
