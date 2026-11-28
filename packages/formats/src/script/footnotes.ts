// Shared pure extraction of inline `footnote` marks in document order for DOCX, EPUB and PDF exports.
import type { BlockJSON } from "@manent/schema";

export interface ExtractedFootnote {
  /** 1-based ordinal in document order. */
  readonly ordinal: number;
  readonly id: string;
  readonly text: string;
  readonly blockIndex: number;
  /** Index inside `block.content` of the last run carrying this footnote. */
  readonly lastRunIndex: number;
}

export interface DocumentFootnotes {
  readonly notes: readonly ExtractedFootnote[];
  /** Keyed by `${blockIndex}:${runIndex}` → footnotes whose span ends on that run. */
  readonly endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>;
}

/** Collects every distinct `(blockIndex, footnoteId)` mark in document order, preserving exact run endpoints. */
export function extractFootnotes(
  blocks: readonly BlockJSON[],
): DocumentFootnotes {
  const notes: ExtractedFootnote[] = [];
  const endingAt = new Map<string, ExtractedFootnote[]>();
  for (let b = 0; b < blocks.length; b++) {
    const content = blocks[b]!.content;
    if (content === undefined || content.length === 0) continue;
    const order: string[] = [];
    const byId = new Map<string, { text: string; lastRunIndex: number }>();
    for (let r = 0; r < content.length; r++) {
      const marks = content[r]!.marks;
      if (marks === undefined) continue;
      for (const mark of marks) {
        if (mark.type !== "footnote") continue;
        const id = typeof mark.attrs?.id === "string" ? mark.attrs.id : "";
        if (id === "") continue;
        const text =
          typeof mark.attrs?.text === "string" ? mark.attrs.text : "";
        if (!byId.has(id)) order.push(id);
        byId.set(id, { text, lastRunIndex: r });
      }
    }
    for (const id of order) {
      const info = byId.get(id)!;
      const entry: ExtractedFootnote = {
        ordinal: notes.length + 1,
        id,
        text: info.text,
        blockIndex: b,
        lastRunIndex: info.lastRunIndex,
      };
      notes.push(entry);
      const key = `${b}:${info.lastRunIndex}`;
      const list = endingAt.get(key);
      if (list === undefined) endingAt.set(key, [entry]);
      else list.push(entry);
    }
  }
  return { notes, endingAt };
}
