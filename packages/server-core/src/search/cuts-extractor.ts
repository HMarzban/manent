// Editor-only text extractor for script cuts (never included in viewer-visible search text).
import { CUTS_MAP, isCut, jsonMap } from "@manent/crdt";
import type { CrdtDoc, Cut } from "@manent/crdt";

/**
 * Extracts plain text from every valid cut in `CUTS_MAP`, newest first.
 * Indexed exclusively into the editor-only search partition (`editorText`).
 */
export function extractCutsText(doc: CrdtDoc): string {
  const valid: Array<{ id: string; cut: Cut }> = [];
  for (const [id, raw] of Object.entries(jsonMap(doc, CUTS_MAP).entries())) {
    if (isCut(raw)) valid.push({ id, cut: raw });
  }
  const ordered = valid.toSorted(
    (a, b) => b.cut.createdAt - a.cut.createdAt || a.id.localeCompare(b.id),
  );
  const lines: string[] = [];
  for (const { cut } of ordered) {
    for (const block of cut.blocks) {
      const text = (block.content ?? []).map((run) => run.text).join("");
      if (text.length > 0) lines.push(text);
    }
  }
  return lines.join("\n");
}
