// Final Draft's script-wide character offsets, as page locks, ranged notes and deletions count them.

/**
 * Where each block starts, then the script's end, in UTF-16 units: every block counts its text, then 1 for
 * its end, and a block whose `duals` entry is true (the last of a dual run) 1 more, its wrapper's end.
 */
export function scriptOffsets(
  blocks: readonly { text: string }[],
  duals: readonly boolean[],
): Int32Array {
  const starts = new Int32Array(blocks.length + 1);
  let at = 0;
  blocks.forEach((block, i) => {
    starts[i] = at;
    at += block.text.length + 1 + (duals[i] === true ? 1 : 0);
  });
  starts[blocks.length] = at;
  return starts;
}

/** The block holding script offset `offset` and the offset inside it; null before the script or from its end on. */
export function blockAtOffset(
  starts: Int32Array,
  offset: number,
): { block: number; offset: number } | null {
  const end = starts.at(-1) ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset >= end) return null;
  let low = 0;
  let high = starts.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return { block: low, offset: offset - starts[low]! };
}
