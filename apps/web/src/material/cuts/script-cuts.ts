// Reading and resolving a script's cuts for the Cuts tab: newest first, with their first line and scene heading.
import { isCut } from "@manent/crdt";
import type { Cut } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";

/** A cut with the id it is kept under in the script's cuts map. */
export interface KeptCut extends Cut {
  id: string;
}

const SCENE_HEADINGS: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
  "chapter",
]);

const byNewest = (a: KeptCut, b: KeptCut): number =>
  b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every valid cut among `entries`, newest first by `createdAt`, then by id. */
export function readCuts(
  entries: Readonly<Record<string, unknown>>,
): readonly KeptCut[] {
  const cuts: KeptCut[] = [];
  for (const [id, value] of Object.entries(entries))
    if (isCut(value)) cuts.push({ ...value, id });
  return cuts.toSorted(byNewest);
}

/** The plain text of `block`. */
export function blockText(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

/** The cut's first non-empty line, or `""` when every block in it is blank. */
export function cutFirstLine(cut: Cut): string {
  return cut.blocks.map(blockText).find((line) => line.trim() !== "") ?? "";
}

/** Heading text by block id, preferring live script blocks over outline rows and other cuts. */
export function headingsMap(
  liveBlocks: readonly BlockJSON[],
  outlineRows: readonly { blockId: string; kind: string; heading: string }[],
  allCuts: readonly KeptCut[],
): ReadonlyMap<string, string> {
  const headings = new Map<string, string>();
  for (const cut of allCuts)
    for (const block of cut.blocks) {
      const id = block.attrs?.id;
      if (
        typeof id === "string" &&
        SCENE_HEADINGS.has(String(block.attrs?.type))
      )
        headings.set(id, blockText(block));
    }
  for (const row of outlineRows)
    if (row.kind === "scene") headings.set(row.blockId, row.heading);
  for (const block of liveBlocks) {
    const id = block.attrs?.id;
    if (typeof id === "string" && SCENE_HEADINGS.has(String(block.attrs?.type)))
      headings.set(id, blockText(block));
  }
  return headings;
}

/**
 * The scene heading of `cut`, null when it came from before the first scene heading, and `""` when its origin
 * heading is no longer anywhere in the script or its cuts.
 */
export function cutSceneHeading(
  cut: Cut,
  headings: ReadonlyMap<string, string>,
): string | null {
  const first = cut.blocks[0];
  if (first !== undefined && SCENE_HEADINGS.has(String(first.attrs?.type))) {
    const own = blockText(first).trim();
    if (own !== "") return own;
  }
  if (cut.origin.sceneHeadingId === null) return null;
  return headings.get(cut.origin.sceneHeadingId) ?? "";
}
