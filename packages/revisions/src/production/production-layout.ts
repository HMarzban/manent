// What the engine reads in production: derived scene numbers, and omitted scenes that keep their number and take no room.
import type { FlatBlock } from "@manent/schema";
import type { LayoutPatch, LayoutPatches } from "@manent/pagination";

const OMITTED: LayoutPatch = Object.freeze({ text: "OMITTED" });
const HIDDEN: LayoutPatch = Object.freeze({ type: "group", text: "" });
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function isNumberedHeading(block: FlatBlock): boolean {
  return block.attrs.type === "scene_heading" || block.attrs.type === "slug";
}

/** FNV-1a 32-bit of the UTF-8 bytes, as 8 hex digits. */
function hashOf(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text))
    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

// The omitted heading that stands for a run of them: its patch when alone, and the number it shows.
interface OmittedRun {
  readonly blockId: string;
  readonly single: LayoutPatch;
  readonly first: string | null;
}

/**
 * The patches, by block id in document order, that lay out the script as production shows it. A heading
 * (scene heading or slug) takes its number from `numbers` when it is there. An omitted heading reads
 * OMITTED and every block after it up to the next heading takes no room; a run of omitted headings keeps
 * only its first, numbered with the run's range ("113–121"). A block without an id is passed over: no
 * patch can name it. The key is a hash of the patches, so it changes when they do.
 */
export function productionLayout(
  blocks: readonly FlatBlock[],
  numbers: ReadonlyMap<string, string>,
): LayoutPatches {
  const patches = new Map<string, LayoutPatch>();
  let run: OmittedRun | null = null;
  for (const block of blocks) {
    const { id, num, omitted } = block.attrs;
    if (id === null) continue;
    if (!isNumberedHeading(block)) {
      if (run !== null) patches.set(id, HIDDEN);
      continue;
    }
    const derived = numbers.get(id);
    const shown = derived ?? num;
    if (!omitted) {
      run = null;
      if (derived !== undefined) patches.set(id, { num: derived });
    } else if (run === null) {
      const single =
        derived === undefined ? OMITTED : { ...OMITTED, num: derived };
      run = { blockId: id, single, first: shown };
      patches.set(id, single);
    } else {
      const range =
        run.first === null || shown === null ? null : `${run.first}–${shown}`;
      patches.set(
        run.blockId,
        range === null ? run.single : { ...OMITTED, num: range },
      );
      patches.set(id, HIDDEN);
    }
  }
  return { key: hashOf(JSON.stringify([...patches])), patches };
}
