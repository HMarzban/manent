// What a scene's cues give the page: who speaks, the cast list under a heading, and each speech's number.
import type { LayoutBlock } from "../../layout-block.ts";
import type { PageProfile, SpecKey } from "../../page-profile.ts";
import type { Pagination } from "../../pages.ts";
import { upperCase } from "./cells.ts";
import { keyAt } from "./keep.ts";

const CAST_LIST_TEXT = Object.freeze({ open: "(", close: ")", between: ", " });

/** The element starts a scene that its number counts and that a page can be continued in. */
export function isSceneHeading(key: SpecKey): boolean {
  return key === "scene_heading" || key === "slug";
}

/** The element ends the scene before it: a scene heading, slug, chapter or act break. */
export function isSceneBoundary(key: SpecKey): boolean {
  return (
    isSceneHeading(key) || key === "chapter" || key.startsWith("act_break.")
  );
}

/** The name a cue speaks under: its text before the first "(", in capitals, trimmed. */
export function speakerName(text: string): string {
  const open = text.indexOf("(");
  return upperCase(open < 0 ? text : text.slice(0, open)).trim();
}

/**
 * The cast list drawn under scene heading i: the names of its scene's cues, dual cues included, each once in
 * the order they first speak, in parentheses. Null when the profile draws none, block i is not a heading,
 * its text is empty or no cue in its scene names anyone.
 */
export function castListOf(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): string | null {
  if (
    !profile.furniture.castLists ||
    !isSceneHeading(keyAt(blocks, i)) ||
    blocks[i]!.text.trim() === ""
  )
    return null;
  const names = new Set<string>();
  for (let j = i + 1; j < blocks.length; j++) {
    const key = keyAt(blocks, j);
    if (isSceneBoundary(key)) break;
    const name = key === "character" ? speakerName(blocks[j]!.text) : "";
    if (name !== "") names.add(name);
  }
  if (names.size === 0) return null;
  const { open, close, between } = CAST_LIST_TEXT;
  return open + [...names].join(between) + close;
}

const isNumberedCue = (blocks: readonly LayoutBlock[], i: number) =>
  keyAt(blocks, i) === "character" && blocks[i]!.text.trim() !== "";

/** The number drawn beside cue `block`, counted from 1 over the script's non-empty cues; null when the profile numbers no speech or the block is not one. */
export function speechNumber(p: Pagination, block: number): number | null {
  if (!p.profile.furniture.speechesNumbered || !isNumberedCue(p.blocks, block))
    return null;
  let count = 0;
  for (let i = 0; i <= block; i++) if (isNumberedCue(p.blocks, i)) count++;
  return count;
}
