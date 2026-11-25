// Viewer-safe text extractor for rundown documents (row cell values and air date only).
import { readRundown } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { RundownColumnId } from "@manent/schema";

const SEARCHABLE_RUNDOWN_COLUMNS: readonly RundownColumnId[] = Object.freeze([
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
]);

/**
 * Extracts searchable plain text from a rundown's air date and stored string row cells
 * (`segment`, `story`, `writer`, `presenter`, `type`). Never reads previous values or internal metadata.
 */
export function extractRundownText(doc: CrdtDoc): string {
  const { rundown, rows } = readRundown(doc);
  const lines: string[] = [];
  const airDate = rundown.airDate.trim();
  if (airDate.length > 0) lines.push(airDate);
  for (const row of rows) {
    const parts: string[] = [];
    for (const col of SEARCHABLE_RUNDOWN_COLUMNS) {
      const val = row.cells[col]?.value;
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed.length > 0) parts.push(trimmed);
      }
    }
    if (parts.length > 0) lines.push(parts.join(" "));
  }
  return lines.join("\n");
}
