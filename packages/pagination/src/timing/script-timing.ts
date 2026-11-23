// What a script's dialogue and bracket times add up to. Totals carry no read rate,
// so a new rate re-times a script without reading its text again.
import { findBracketTimes } from "./brackets.ts";
import type { BracketTime } from "./brackets.ts";

export interface TimedBlock {
  readonly id: string;
  readonly type: string;
  readonly text: string;
  readonly noTiming: boolean;
}
/** Dialogue in UTF-16 units and bracket time in whole milliseconds. */
export interface TimeTotal {
  readonly dialogueChars: number;
  readonly bracketMs: number;
}
/** The time of the blocks from one slug to the next; `null` for the blocks before the first slug. */
export interface SlugTime {
  readonly slugId: string | null;
  readonly total: TimeTotal;
}

const NOTHING: TimeTotal = Object.freeze({ dialogueChars: 0, bracketMs: 0 });
const NO_BRACKETS: readonly BracketTime[] = Object.freeze([]);

const add = (a: TimeTotal, b: TimeTotal): TimeTotal => ({
  dialogueChars: a.dialogueChars + b.dialogueChars,
  bracketMs: a.bracketMs + b.bracketMs,
});

/**
 * One block's share: a dialogue block counts every UTF-16 unit of its text, a bracket its first
 * well-formed `T=` time, any other element nothing. A block excluded from timing counts nothing
 * but keeps its bracket forms.
 */
export function timeBlock(
  block: TimedBlock,
): TimeTotal & { readonly brackets: readonly BracketTime[] } {
  const brackets =
    block.type === "bracket" ? findBracketTimes(block.text) : NO_BRACKETS;
  if (block.noTiming) return { ...NOTHING, brackets };
  const dialogueChars = block.type === "dialogue" ? block.text.length : 0;
  const bracketMs = brackets.reduce(
    (sum, time) => (time.ok ? sum + time.ms : sum),
    0,
  );
  return { dialogueChars, bracketMs, brackets };
}

/**
 * The running time in whole milliseconds at `readRate` characters per second; the dialogue is
 * rounded once, over the sum. Throws a RangeError for a rate that is not a positive number.
 */
export function durationMs(
  totals: Iterable<TimeTotal>,
  readRate: number,
): number {
  if (!(readRate > 0) || !Number.isFinite(readRate))
    throw new RangeError(
      `a read rate must be a positive number of characters per second, not ${readRate}`,
    );
  let dialogueChars = 0;
  let bracketMs = 0;
  for (const total of totals) {
    dialogueChars += total.dialogueChars;
    bracketMs += total.bracketMs;
  }
  return Math.round((dialogueChars * 1000) / readRate) + bracketMs;
}

/**
 * The whole script's total and one entry per slug in order, each slug's entry holding every block
 * up to the next slug; an act break does not end one. An entry with `slugId: null` comes first
 * only when a block precedes the first slug.
 */
export function timeScript(blocks: readonly TimedBlock[]): {
  readonly total: TimeTotal;
  readonly slugs: readonly SlugTime[];
} {
  const slugs: SlugTime[] = [];
  let total = NOTHING;
  for (const block of blocks) {
    if (block.type === "slug") slugs.push({ slugId: block.id, total: NOTHING });
    else if (slugs.length === 0) slugs.push({ slugId: null, total: NOTHING });
    const time = timeBlock(block);
    const last = slugs.length - 1;
    // the pushes above leave at least one entry
    slugs[last] = {
      slugId: slugs[last]!.slugId,
      total: add(slugs[last]!.total, time),
    };
    total = add(total, time);
  }
  return { total, slugs };
}
