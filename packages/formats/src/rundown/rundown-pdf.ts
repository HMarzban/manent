// The rundown PDF: draws the pages laid out by `layoutRundownPages` in the script font via pdfkit.
import { STYLE } from "@manent/pagination";
import type { ScriptFontFiles } from "../pdf/fonts.ts";
import {
  drawHairline,
  drawScriptLine,
  fontScale,
  startPdf,
} from "./pdf-draw.ts";
import type { RundownForExport } from "./rundown-for-export.ts";
import { layoutRundownPages } from "./rundown-layout.ts";
import type { RundownLayoutOptions } from "./rundown-layout.ts";

export interface RundownPdfOptions extends RundownLayoutOptions {
  readonly fonts: ScriptFontFiles;
  /** Milliseconds since the epoch, written as the creation and modification dates; 0 when absent. */
  readonly createdAt?: number;
}

const RULE_RGB: readonly [number, number, number] = [160, 160, 160];

/**
 * The rundown table as a landscape PDF in the 10 pt script font, matching `layoutRundownPages`.
 * Equal input gives equal bytes.
 */
export async function writeRundownPdf(
  rundown: RundownForExport,
  options: RundownPdfOptions,
): Promise<Uint8Array> {
  const pages = layoutRundownPages(rundown, options);
  const first = pages[0]!;
  const scale = fontScale(first.fontSizePt);
  const { pdf, finish } = startPdf({
    widthPt: first.widthPt,
    heightPt: first.heightPt,
    title: rundown.title,
    createdAt: options.createdAt,
    fonts: options.fonts,
  });
  for (const page of pages) {
    pdf.addPage({ size: [page.widthPt, page.heightPt], margin: 0 });
    for (const line of page.lines)
      drawScriptLine(
        pdf,
        line.text,
        line.xPt,
        line.yPt + scale.baselinePt,
        line.bold ? STYLE.BOLD : 0,
        scale,
      );
    for (const rule of page.rules)
      drawHairline(
        pdf,
        rule.x1Pt,
        rule.yPt,
        rule.x2Pt,
        rule.yPt,
        rule.widthPt,
        RULE_RGB,
      );
  }
  return await finish();
}
