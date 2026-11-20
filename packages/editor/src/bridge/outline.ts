// The script's outline: its scene headings, slugs and chapters, read from the engine's blocks, never the document.
import { letters } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import type { OutlineEntry } from "../script-editor/ports.ts";

/** `headingBlocks[k]` is the block index of `entries[k]`, ascending. */
export interface OutlineIndex {
  readonly entries: readonly OutlineEntry[];
  readonly headingBlocks: Int32Array;
}

/**
 * One pass over the pagination's blocks; run at most every 250 ms. A scene heading or slug shows its stored number,
 * else its count among them (in letters where the profile letters scenes), as the pages do; a chapter has none.
 * `omitted` is false: the blocks do not carry the attribute, which the bridge reads from the heading's node.
 * `current` marks the entry at or before `caretBlock`.
 */
export function outlineOf(p: Pagination, caretBlock: number): OutlineIndex {
  const entries: OutlineEntry[] = [];
  const headingBlocks: number[] = [];
  const { scenesLettered } = p.profile.furniture;
  let scenes = 0;
  for (let i = 0; i < p.blocks.length; i++) {
    const { id, type, num, text } = p.blocks[i]!;
    const scene = type === "scene_heading" || type === "slug";
    if (!scene && type !== "chapter") continue;
    let number: string | null = null;
    if (scene) {
      scenes++;
      number = num ?? (scenesLettered ? letters(scenes) : String(scenes));
    }
    entries.push({
      blockId: id,
      number,
      heading: text,
      omitted: false,
      current: false,
    });
    headingBlocks.push(i);
  }
  const outline = { entries, headingBlocks: Int32Array.from(headingBlocks) };
  const current = headingAt(outline, caretBlock);
  if (current !== null)
    entries[current] = { ...entries[current]!, current: true };
  return outline;
}

/** The index in `outline.entries` of the heading at or before block `block`; null before the first. */
export function headingAt(outline: OutlineIndex, block: number): number | null {
  const { headingBlocks } = outline;
  let lo = 0;
  let hi = headingBlocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (headingBlocks[mid]! <= block) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? null : lo - 1;
}

/** The number of the heading at or before the block; null before the first, or when that heading is a chapter. */
export function sceneAt(outline: OutlineIndex, block: number): string | null {
  const k = headingAt(outline, block);
  return k === null ? null : outline.entries[k]!.number;
}
