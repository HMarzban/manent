// Sides selection on a locked pagination: the pages holding the chosen scenes, with unselected scenes struck through.
import { STYLE, engineFor } from "@manent/pagination";
import type { Engine, LayoutBlock, Pagination } from "@manent/pagination";

/** One scene heading in a pagination, in script order. */
export interface SidesScene {
  readonly blockId: string;
  readonly number: string;
  readonly heading: string;
  readonly omitted: boolean;
}

/** The locked pages holding the chosen scenes, and a view of the pagination with every other scene's lines struck through. */
export interface SidesSelection {
  readonly pages: readonly number[];
  readonly pagination: Pagination;
}

const HEADING_TYPES: ReadonlySet<string> = new Set(["scene_heading", "slug"]);
const OMITTED_TEXT = "OMITTED";

function isHeadingBlock(block: LayoutBlock): boolean {
  return HEADING_TYPES.has(block.type);
}

function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `this build carries no layout engine ${p.engineVersion}`,
    );
  return engine;
}

/** Every printed scene heading in `p`, in script order, with its displayed number and heading text. */
export function sidesScenesOf(p: Pagination): SidesScene[] {
  const scenes: SidesScene[] = [];
  let count = 0;
  for (let i = 0; i < p.blocks.length; i++) {
    const block = p.blocks[i]!;
    if (!isHeadingBlock(block)) continue;
    count++;
    const spec = p.metrics[i]?.spec;
    const raw = block.text.trim();
    const heading = spec?.capitalized ? raw.toUpperCase() : raw;
    scenes.push({
      blockId: block.id,
      number: block.num ?? String(count),
      heading,
      omitted: raw === OMITTED_TEXT,
    });
  }
  return scenes;
}

/**
 * The heading block ids in `scenes` between `firstId` and `lastId`, inclusive, in script order.
 * Reversed bounds are normalised; if only one bound exists in `scenes`, that single scene is returned.
 */
export function resolveSidesRange(
  scenes: readonly SidesScene[],
  firstId: string,
  lastId: string,
): ReadonlySet<string> {
  const firstIndex = scenes.findIndex((scene) => scene.blockId === firstId);
  const lastIndex = scenes.findIndex((scene) => scene.blockId === lastId);
  if (firstIndex < 0 && lastIndex < 0) return new Set();
  const lo =
    firstIndex < 0
      ? lastIndex
      : lastIndex < 0
        ? firstIndex
        : Math.min(firstIndex, lastIndex);
  const hi =
    firstIndex < 0
      ? lastIndex
      : lastIndex < 0
        ? firstIndex
        : Math.max(firstIndex, lastIndex);
  const chosen = new Set<string>();
  for (let i = lo; i <= hi; i++) chosen.add(scenes[i]!.blockId);
  return chosen;
}

function strikeBlock(block: LayoutBlock): LayoutBlock {
  if (block.text.length === 0) return block;
  const styles = new Uint8Array(block.text.length);
  for (let k = 0; k < block.text.length; k++)
    styles[k] = (block.styles?.[k] ?? 0) | STYLE.STRIKE;
  return Object.freeze({ ...block, styles });
}

/**
 * Selects every page of `p` carrying at least one line of a scene in `selectedHeadingIds`, preserving
 * every page's locked label without re-paginating. Every block belonging to a scene outside
 * `selectedHeadingIds` has `STYLE.STRIKE` set on its text so shared pages cross out surrounding scenes.
 */
export function selectSides(
  p: Pagination,
  selectedHeadingIds: ReadonlySet<string>,
): SidesSelection {
  const selectedBlockIds = new Set<string>();
  let currentHeadingId: string | null = null;
  for (const block of p.blocks) {
    if (isHeadingBlock(block)) currentHeadingId = block.id;
    if (currentHeadingId !== null && selectedHeadingIds.has(currentHeadingId))
      selectedBlockIds.add(block.id);
  }
  const engine = engineOf(p);
  const pages: number[] = [];
  for (const page of p.pages) {
    const places = engine.linePlacesOf(p, page.index);
    if (places.some((place) => selectedBlockIds.has(place.blockId)))
      pages.push(page.index);
  }
  const blocks = p.blocks.map((block) =>
    selectedBlockIds.has(block.id) ? block : strikeBlock(block),
  );
  return { pages, pagination: { ...p, blocks } };
}
