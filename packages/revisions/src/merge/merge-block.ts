// The three-way merge of one block: its attributes key by key, its text by character.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";

/** The most code points either side of a block may hold for it to merge by character. */
export const MAX_MERGE_CHARACTERS = 20_000;

/** `ok` false: the two sides' changes touch, or a side is too long to merge by character. */
export type BlockMergeResult = { ok: true; block: BlockJSON } | { ok: false };

/** Base tokens [from, to) become `insert`. */
interface Hunk {
  from: number;
  to: number;
  insert: Int32Array;
}

/** Every distinct pair of a code point and its run's canonical marks, as a number. */
interface Alphabet {
  numbers: Map<string, number>;
  characters: string[];
  marks: (MarkJSON[] | undefined)[];
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Each key from the side that changed it; null when the two changed one key differently. */
function mergeAttrs(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(mine),
    ...Object.keys(theirs),
  ])) {
    const [was, ours, other] = [base[key], mine[key], theirs[key]];
    if (
      !sameValue(ours, was) &&
      !sameValue(other, was) &&
      !sameValue(ours, other)
    )
      return null;
    const value = sameValue(ours, was) ? other : ours;
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** The block's code points as numbers, or null past MAX_MERGE_CHARACTERS. */
function tokensOf(block: BlockJSON, alphabet: Alphabet): Int32Array | null {
  const tokens: number[] = [];
  for (const run of block.content ?? []) {
    const marks = JSON.stringify(run.marks ?? []);
    for (const character of run.text) {
      if (tokens.length === MAX_MERGE_CHARACTERS) return null;
      const key = `${marks}\n${character}`;
      let token = alphabet.numbers.get(key);
      if (token === undefined) {
        token = alphabet.characters.length;
        alphabet.numbers.set(key, token);
        alphabet.characters.push(character);
        alphabet.marks.push(run.marks);
      }
      tokens.push(token);
    }
  }
  return Int32Array.from(tokens);
}

interface Diff {
  a: Int32Array;
  b: Int32Array;
  removed: Uint8Array;
  added: Uint8Array;
}

/**
 * Myers' middle snake of a[aLo, aHi) against b[bLo, bHi), which share neither
 * their first nor their last token: a point, relative to (aLo, bLo), that a
 * shortest edit path passes through, or null when the two share no token.
 */
function middle(
  d: Diff,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): [number, number] | null {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const max = Math.ceil((n + m) / 2);
  const forward = new Int32Array(2 * max + 2).fill(-1);
  const backward = new Int32Array(2 * max + 2).fill(-1);
  forward[max + 1] = 0;
  backward[max + 1] = 0;
  const delta = n - m;
  const odd = delta % 2 !== 0;
  let [forwardStart, forwardEnd, backwardStart, backwardEnd] = [0, 0, 0, 0];
  for (let step = 0; step < max; step++) {
    for (let k = -step + forwardStart; k <= step - forwardEnd; k += 2) {
      let x =
        k === -step ||
        (k !== step && forward[max + k - 1]! < forward[max + k + 1]!)
          ? forward[max + k + 1]!
          : forward[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && d.a[aLo + x] === d.b[bLo + y]) {
        x++;
        y++;
      }
      forward[max + k] = x;
      if (x > n) forwardEnd += 2;
      else if (y > m) forwardStart += 2;
      else if (odd) {
        const reached = backward[max + delta - k] ?? -1;
        if (reached !== -1 && x >= n - reached) return [x, y];
      }
    }
    for (let k = -step + backwardStart; k <= step - backwardEnd; k += 2) {
      let x =
        k === -step ||
        (k !== step && backward[max + k - 1]! < backward[max + k + 1]!)
          ? backward[max + k + 1]!
          : backward[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && d.a[aHi - 1 - x] === d.b[bHi - 1 - y]) {
        x++;
        y++;
      }
      backward[max + k] = x;
      if (x > n) backwardEnd += 2;
      else if (y > m) backwardStart += 2;
      else if (!odd) {
        const ahead = forward[max + delta - k] ?? -1;
        if (ahead !== -1 && ahead >= n - x) return [ahead, ahead - delta + k];
      }
    }
  }
  return null;
}

/** Marks the tokens a shortest edit script removes from a[aLo, aHi) and adds from b[bLo, bHi). */
function compare(
  d: Diff,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): void {
  let [a0, a1, b0, b1] = [aLo, aHi, bLo, bHi];
  while (a0 < a1 && b0 < b1 && d.a[a0] === d.b[b0]) [a0, b0] = [a0 + 1, b0 + 1];
  while (a0 < a1 && b0 < b1 && d.a[a1 - 1] === d.b[b1 - 1])
    [a1, b1] = [a1 - 1, b1 - 1];
  const split = a0 === a1 || b0 === b1 ? null : middle(d, a0, a1, b0, b1);
  if (split === null) {
    d.removed.fill(1, a0, a1);
    d.added.fill(1, b0, b1);
    return;
  }
  compare(d, a0, a0 + split[0], b0, b0 + split[1]);
  compare(d, a0 + split[0], a1, b0 + split[1], b1);
}

/** A minimal diff of `a` against `b`, as hunks in `a`'s positions, in order. */
function hunks(a: Int32Array, b: Int32Array): Hunk[] {
  const d: Diff = {
    a,
    b,
    removed: new Uint8Array(a.length),
    added: new Uint8Array(b.length),
  };
  compare(d, 0, a.length, 0, b.length);
  const found: Hunk[] = [];
  let [i, j] = [0, 0];
  while (i < a.length || j < b.length) {
    if (
      i < a.length &&
      j < b.length &&
      d.removed[i] === 0 &&
      d.added[j] === 0
    ) {
      [i, j] = [i + 1, j + 1];
      continue;
    }
    const [from, start] = [i, j];
    while (i < a.length && d.removed[i] === 1) i++;
    while (j < b.length && d.added[j] === 1) j++;
    found.push({ from, to: i, insert: b.subarray(start, j) });
  }
  return found;
}

function isSameHunk(a: Hunk, b: Hunk): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.insert.length === b.insert.length &&
    a.insert.every((token, i) => token === b.insert[i])
  );
}

/**
 * Both sides' hunks applied to base, or null when a hunk of one side touches
 * one of the other (shares a position, even end to end) without being the same.
 */
function mergeTokens(
  base: Int32Array,
  mine: Int32Array,
  theirs: Int32Array,
): number[] | null {
  const all = [...hunks(base, mine), ...hunks(base, theirs)].toSorted(
    (a, b) => a.from - b.from || a.to - b.to,
  );
  const merged: number[] = [];
  let at = 0;
  let last: Hunk | null = null;
  for (const hunk of all) {
    if (last !== null && hunk.from <= last.to) {
      if (isSameHunk(last, hunk)) continue;
      return null;
    }
    for (; at < hunk.from; at++) merged.push(base[at]!);
    for (const token of hunk.insert) merged.push(token);
    at = hunk.to;
    last = hunk;
  }
  for (; at < base.length; at++) merged.push(base[at]!);
  return merged;
}

/**
 * The block both sides' changes make of base, in canonical form: each
 * attribute (defaults filled) from the side that changed it, and the text
 * merged character by character, a mark change counting as a change to its
 * characters. Not ok when the changes touch or a side holds more than
 * MAX_MERGE_CHARACTERS code points.
 */
export function mergeBlock(
  base: BlockJSON,
  mine: BlockJSON,
  theirs: BlockJSON,
): BlockMergeResult {
  const [was, ours, other] = [
    canonicalBlock(base),
    canonicalBlock(mine),
    canonicalBlock(theirs),
  ];
  const attrs = mergeAttrs(
    was.attrs ?? {},
    ours.attrs ?? {},
    other.attrs ?? {},
  );
  if (attrs === null) return { ok: false };
  const alphabet: Alphabet = { numbers: new Map(), characters: [], marks: [] };
  const baseTokens = tokensOf(was, alphabet);
  const mineTokens = tokensOf(ours, alphabet);
  const theirsTokens = tokensOf(other, alphabet);
  if (baseTokens === null || mineTokens === null || theirsTokens === null)
    return { ok: false };
  const tokens = mergeTokens(baseTokens, mineTokens, theirsTokens);
  if (tokens === null) return { ok: false };
  const content: TextJSON[] = tokens.map((token) => ({
    type: "text",
    text: alphabet.characters[token]!,
    marks: alphabet.marks[token],
  }));
  return { ok: true, block: canonicalBlock({ type: "block", attrs, content }) };
}
