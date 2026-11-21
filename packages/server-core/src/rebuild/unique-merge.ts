// The merge by block over documents that may hold one block ID twice, as two devices splitting one
// block at once may leave them: only the first block of an ID is matched, as the block writer
// finds the first.
import { mergeByBlock } from "@manent/revisions";
import type { BlockMerge, SetAsideBlock } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";

const blocksIn = (doc: DocJSON): BlockJSON[] =>
  (doc.content ?? []).flatMap((section) => section.content ?? []);

const spelled = (block: BlockJSON): string =>
  JSON.stringify(canonicalBlock(block));

/**
 * Mine without each block whose ID an earlier block of mine holds, and the text of those that
 * neither base nor theirs holds as they are.
 */
function firstOfEachId(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
): { mine: DocJSON; setAside: SetAsideBlock[] } {
  const held = new Set([...blocksIn(base), ...blocksIn(theirs)].map(spelled));
  const theirIds = new Set(blocksIn(theirs).map((block) => block.attrs?.id));
  const seen = new Set<string>();
  const setAside: SetAsideBlock[] = [];
  let near: string | null = null;
  const isFirst = (block: BlockJSON): boolean => {
    const id = block.attrs?.id;
    if (typeof id !== "string") return true;
    const first = !seen.has(id);
    seen.add(id);
    if (!first && !held.has(spelled(block))) {
      const text = (block.content ?? []).map((run) => run.text).join("");
      setAside.push({ blockId: id, nearBlockId: near, text });
    }
    if (theirIds.has(id)) near = id;
    return first;
  };
  const content = (mine.content ?? []).map((section) => ({
    ...section,
    content: (section.content ?? []).filter(isFirst),
  }));
  return { mine: { ...mine, content }, setAside };
}

/**
 * mergeByBlock over mine's first block of each ID, since a later block of an ID would be written
 * over the first. The text of a later one that neither base nor theirs holds as it is comes after
 * the merge's own set-aside text.
 */
export function mergeUnique(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
): BlockMerge {
  const unique = firstOfEachId(base, mine, theirs);
  const merge = mergeByBlock(base, unique.mine, theirs);
  return { ...merge, setAside: [...merge.setAside, ...unique.setAside] };
}

/** mergeThrough, each step a mergeUnique. RangeError for []. */
export function mergeUniqueThrough(
  base: DocJSON,
  mine: DocJSON,
  theirs: readonly DocJSON[],
): BlockMerge {
  const [first, ...later] = theirs;
  if (first === undefined)
    throw new RangeError(
      "a merge is carried through at least 1 later document, not 0",
    );
  let step = mergeUnique(base, mine, first);
  const overlaps = [...step.overlaps];
  const setAside = [...step.setAside];
  let previous = first;
  for (const next of later) {
    step = mergeUnique(previous, step.result, next);
    overlaps.push(...step.overlaps);
    setAside.push(...step.setAside);
    previous = next;
  }
  return { ...step, overlaps, setAside };
}
