// The names a script already uses, for autocomplete: cues, the parts of scene headings, transitions and slugs.
import type { LayoutBlock } from "@manent/pagination";

/** Each text, as written, and how many blocks use it, in the order of their first use. */
export interface Names {
  readonly characters: ReadonlyMap<string, number>;
  readonly locations: ReadonlyMap<string, number>;
  readonly times: ReadonlyMap<string, number>;
  readonly transitions: ReadonlyMap<string, number>;
  readonly slugs: ReadonlyMap<string, number>;
}

/** How far back the cues of the caret's scene are looked for. */
const RECENT_BLOCKS = 200;

/** A cue's name: its text before any extension. */
const cueName = (text: string): string => text.split("(", 1)[0]!.trim();

function counted(names: Map<string, number>, text: string): void {
  if (text !== "") names.set(text, (names.get(text) ?? 0) + 1);
}

/**
 * One pass over the blocks. A location is a scene heading's text between its intro (the text before the first
 * space) and its last ` - `, or the end; a time is what follows the last ` - `. Run at most every 250 ms, never
 * on a keystroke.
 */
export function collectNames(blocks: readonly LayoutBlock[]): Names {
  const names = {
    characters: new Map<string, number>(),
    locations: new Map<string, number>(),
    times: new Map<string, number>(),
    transitions: new Map<string, number>(),
    slugs: new Map<string, number>(),
  };
  for (const { type, text } of blocks)
    switch (type) {
      case "character":
        counted(names.characters, cueName(text));
        break;
      case "scene_heading": {
        const space = text.indexOf(" ");
        if (space < 0) break;
        const rest = text.slice(space + 1);
        const dash = rest.lastIndexOf(" - ");
        counted(
          names.locations,
          (dash < 0 ? rest : rest.slice(0, dash)).trim(),
        );
        if (dash >= 0) counted(names.times, rest.slice(dash + 3).trim());
        break;
      }
      case "transition":
        counted(names.transitions, text.trim());
        break;
      case "slug":
        counted(names.slugs, text.trim());
    }
  return names;
}

/** The names of the cues before block `block` back to its scene's heading, latest first; at most RECENT_BLOCKS blocks back. */
export function recentCues(
  blocks: readonly LayoutBlock[],
  block: number,
): string[] {
  const recent: string[] = [];
  for (let i = block - 1; i >= Math.max(0, block - RECENT_BLOCKS); i--) {
    const { type, text } = blocks[i]!;
    if (type === "scene_heading") break;
    const name = cueName(text);
    if (type === "character" && name !== "" && !recent.includes(name))
      recent.push(name);
  }
  return recent;
}
