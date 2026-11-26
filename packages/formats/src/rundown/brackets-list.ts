// The brackets list for a rundown: one TSV line per Bracket or Graphic cue of the chosen rows' stories.
import { findBracketTimes, formatGraphicCue } from "@manent/pagination";
import {
  blockPlainText,
  formatMinutesSeconds,
  rowSlugCell,
} from "./rundown-for-export.ts";
import type { RundownForExport } from "./rundown-for-export.ts";

const NO_TIME = "—";
const TSV_BREAK = new RegExp("[\\t\\r\\n]+", "g");

function tsvField(text: string): string {
  return text.replace(TSV_BREAK, " ");
}

/**
 * One UTF-8 tab-separated list, one line per Bracket block in run order:
 * `<row number>\t<slug>\t<bracket text>\t<time>\n`, where `<slug>` is the nearest Slug block
 * above the bracket else the row's Segment or Story cell, and `<time>` is its first valid `T=`
 * time as `m:ss`, or `—` when absent, malformed or excluded from timing.
 */
export function writeBracketsList(rundown: RundownForExport): string {
  const lines: string[] = [];
  for (const row of rundown.rows) {
    if (row.kind !== "story" || row.story === null) continue;
    const rowNumber = row.number === null ? "" : String(row.number);
    const fallbackSlug = rowSlugCell(row);
    let currentSlug: string | null = null;
    for (const block of row.story.blocks) {
      if (block.attrs?.omitted === true) continue;
      const type = block.attrs?.type;
      const text = blockPlainText(block);
      if (type === "slug") {
        const trimmed = text.trim();
        if (trimmed !== "") currentSlug = trimmed;
        continue;
      }
      if (type === "graphic") {
        const cue = formatGraphicCue({
          id: block.attrs?.id ?? "",
          type,
          text,
          graphic: block.attrs?.graphic ?? null,
        });
        if (cue !== null)
          lines.push(
            `${tsvField(rowNumber)}\t${tsvField(currentSlug ?? fallbackSlug)}\t${tsvField(cue.text)}\t${NO_TIME}\n`,
          );
        continue;
      }
      if (type !== "bracket") continue;
      const valid =
        block.attrs?.noTiming === true
          ? undefined
          : findBracketTimes(text).find((entry) => entry.ok);
      const time =
        valid === undefined ? NO_TIME : formatMinutesSeconds(valid.ms);
      lines.push(
        `${tsvField(rowNumber)}\t${tsvField(currentSlug ?? fallbackSlug)}\t${tsvField(text)}\t${time}\n`,
      );
    }
  }
  return lines.join("");
}
