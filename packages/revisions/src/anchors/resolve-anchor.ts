// Finding an anchor's range again after edits, among the blocks around where it was.
import type { TextAnchor } from "@manent/schema";

/** A block's id and its plain text, as an anchor's offsets count it. */
export interface AnchorBlock {
  id: string;
  text: string;
}

/** Where an anchor's range is now, or that its text is gone ("Text removed"). */
export type AnchorResolution =
  | { ok: true; blockId: string; start: number; end: number }
  | { ok: false; reason: "removed" };

interface Match {
  block: AnchorBlock;
  at: number;
}

const REMOVED: AnchorResolution = Object.freeze({
  ok: false,
  reason: "removed",
});

function matchesIn(block: AnchorBlock, quote: string): Match[] {
  const matches: Match[] = [];
  for (
    let at = block.text.indexOf(quote);
    at !== -1;
    at = block.text.indexOf(quote, at + 1)
  )
    matches.push({ block, at });
  return matches;
}

/** The match whose surrounding text agrees with the anchor's prefix and suffix, else the first; null when there is none. */
function bestOf(
  matches: readonly Match[],
  anchor: TextAnchor,
): AnchorResolution | null {
  const first = matches[0];
  if (first === undefined) return null;
  const agreeing = matches.find(
    ({ block, at }) =>
      block.text.endsWith(anchor.prefix, at) &&
      block.text.startsWith(anchor.suffix, at + anchor.quote.length),
  );
  const { block, at } = agreeing ?? first;
  return {
    ok: true,
    blockId: block.id,
    start: at,
    end: at + anchor.quote.length,
  };
}

/**
 * Finds the anchor's range in `around`: the anchor's block with up to two blocks on each side, in their
 * order in the script (when that block is gone, the five blocks around where the anchor last resolved).
 * An empty range resolves to its own block, its offset kept inside the block's text, or is removed; it
 * is never searched for. A non-empty range with an empty quote cannot be its range's text, so it is
 * removed. Otherwise the quote is taken at `start` in its block, then elsewhere in that
 * block, then in the other blocks; within each step the match whose prefix and suffix agree wins, else
 * the first. Reads nothing but `around`.
 */
export function resolveAnchor(
  anchor: TextAnchor,
  around: readonly AnchorBlock[],
): AnchorResolution {
  const own = around.find((block) => block.id === anchor.blockId);
  if (anchor.start === anchor.end) {
    if (own === undefined) return REMOVED;
    const at = Math.min(anchor.start, own.text.length);
    return { ok: true, blockId: own.id, start: at, end: at };
  }
  if (anchor.quote === "") return REMOVED;
  if (own !== undefined) {
    if (own.text.startsWith(anchor.quote, anchor.start))
      return {
        ok: true,
        blockId: own.id,
        start: anchor.start,
        end: anchor.start + anchor.quote.length,
      };
    const inOwn = bestOf(matchesIn(own, anchor.quote), anchor);
    if (inOwn !== null) return inOwn;
  }
  const others = around
    .filter((block) => block.id !== anchor.blockId)
    .flatMap((block) => matchesIn(block, anchor.quote));
  return bestOf(others, anchor) ?? REMOVED;
}
