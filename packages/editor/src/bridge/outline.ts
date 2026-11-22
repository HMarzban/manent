// The script's outline: its acts, sections, scene headings, slugs and chapters, read from the engine's blocks, never
// the document.
import { letters } from "@manent/pagination";
import type { LayoutBlock, Pagination } from "@manent/pagination";
import type { OutlineEntry } from "../script-editor/ports.ts";

/** `headingBlocks[k]` is the block index of `entries[k]`, ascending. */
export interface OutlineIndex {
  readonly entries: readonly OutlineEntry[];
  readonly headingBlocks: Int32Array;
}

const EIGHTHS = 8;

/** The outline's kind of `block`; null for a block the outline does not list. An act ends with End of Act, which starts none. */
function kindOf(block: LayoutBlock): OutlineEntry["kind"] | null {
  const { type } = block;
  if (type === "scene_heading" || type === "slug" || type === "chapter")
    return "scene";
  if (type === "act_break") return block.kind === "end_of_act" ? null : "act";
  return type === "group" ? "section" : null;
}

/** The lines block `i` takes on a page, its space before included; 0 for a block that is not printed. */
function linesOf(p: Pagination, i: number): number {
  const { lines, spec } = p.metrics[i]!;
  return lines === 0 ? 0 : lines + spec.spaceBefore;
}

/** A scene's length from its lines: whole eighths of a page, rounded up, never under one. */
const eighthsOf = (lines: number, linesPerPage: number): number =>
  Math.max(1, Math.ceil((EIGHTHS * lines) / linesPerPage));

/**
 * One pass over the pagination's blocks; run at most every 250 ms. A scene heading or slug shows its stored number,
 * else its count among them (in letters where the profile letters scenes), as the pages do; a chapter, an act and a
 * section have none. A scene heading, slug or chapter with no text has no entry, though a scene heading or slug is
 * still counted, as the pages count it. A scene's length runs to the next scene or act; a section does not end it.
 * `omitted` and `synopsis` are unset: the blocks do not carry them, and the bridge reads them from the heading's node.
 * `current` marks the scene at or before `caretBlock`.
 */
export function outlineOf(p: Pagination, caretBlock: number): OutlineIndex {
  const entries: OutlineEntry[] = [];
  const headingBlocks: number[] = [];
  const { scenesLettered } = p.profile.furniture;
  const { linesPerPage } = p.profile;
  let scenes = 0;
  let scene: number | null = null;
  let lines = 0;
  const close = (): void => {
    if (scene === null) return;
    entries[scene] = {
      ...entries[scene]!,
      eighths: eighthsOf(lines, linesPerPage),
    };
    scene = null;
  };
  for (let i = 0; i < p.blocks.length; i++) {
    const block = p.blocks[i]!;
    const kind = kindOf(block);
    const untitled = kind === "scene" && block.text.trim() === "";
    if (kind === "scene" || kind === "act") close();
    if (kind === "scene" && !untitled) {
      scene = entries.length;
      lines = 0;
    }
    lines += linesOf(p, i);
    if (kind === null) continue;
    let number: string | null = null;
    if (kind === "scene" && block.type !== "chapter") {
      scenes++;
      number = block.num ?? (scenesLettered ? letters(scenes) : String(scenes));
    }
    if (untitled) continue;
    entries.push({
      blockId: block.id,
      kind,
      number,
      heading: block.text,
      synopsis: "",
      eighths: null,
      omitted: false,
      current: false,
    });
    headingBlocks.push(i);
  }
  close();
  const outline = { entries, headingBlocks: Int32Array.from(headingBlocks) };
  const current = headingAt(outline, caretBlock);
  if (current !== null)
    entries[current] = { ...entries[current]!, current: true };
  return outline;
}

/** The index in `outline.entries` of the scene at or before block `block`; null before the first. */
export function headingAt(outline: OutlineIndex, block: number): number | null {
  const { headingBlocks, entries } = outline;
  let lo = 0;
  let hi = headingBlocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (headingBlocks[mid]! <= block) lo = mid + 1;
    else hi = mid;
  }
  for (let k = lo - 1; k >= 0; k--) if (entries[k]!.kind === "scene") return k;
  return null;
}

/** The number of the scene at or before the block; null before the first, or when that scene is a chapter. */
export function sceneAt(outline: OutlineIndex, block: number): string | null {
  const k = headingAt(outline, block);
  return k === null ? null : outline.entries[k]!.number;
}
