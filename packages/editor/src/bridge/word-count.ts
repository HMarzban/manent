// Pure word count over Pagination.blocks (zero ProseMirror doc traversal, safe for ADR 0011 & bridge invariants).
import type { LayoutBlock } from "@manent/pagination";

const WORD_SPLIT = /\s+/;
const blockWordCache = new WeakMap<LayoutBlock, number>();

function wordsInBlock(block: LayoutBlock): number {
  const cached = blockWordCache.get(block);
  if (cached !== undefined) return cached;
  let count = 0;
  if (block.type !== "page_break" && block.type !== "group") {
    const trimmed = block.text.trim();
    if (trimmed !== "") count = trimmed.split(WORD_SPLIT).length;
  }
  blockWordCache.set(block, count);
  return count;
}

/** Counts words across all printed pagination blocks using per-LayoutBlock caching (zero ProseMirror doc walks). */
export function paginationWordCount(blocks: readonly LayoutBlock[]): number {
  let total = 0;
  for (let i = 0; i < blocks.length; i++) {
    total += wordsInBlock(blocks[i]!);
  }
  return total;
}
