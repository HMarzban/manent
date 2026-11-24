// All scripts of a rundown as one PDF, each story keeping its own engine, profile and page labels.
import { writePdfParts } from "../pdf/write.ts";
import type { PdfOptions } from "../pdf/write.ts";
import type { RundownForExport } from "./rundown-for-export.ts";

/**
 * The chosen rows' stories in run order as one PDF through `writePdfParts`. Header rows and rows
 * without a story are skipped; each story starts on a new page with its own engine, page profile
 * and page labels. Throws RangeError when no row holds a story.
 */
export async function writeRundownScriptsPdf(
  rundown: RundownForExport,
  options: PdfOptions,
): Promise<Uint8Array> {
  const parts = rundown.rows
    .filter((row) => row.kind === "story" && row.story !== null)
    .map((row) => row.story!.pages);
  return await writePdfParts(parts, {
    ...options,
    title: options.title ?? rundown.title,
  });
}
