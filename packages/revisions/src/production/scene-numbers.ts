// Scene numbers in production: what lock takes, the lettered numbers of scenes added after it, and their order.
import type { FlatBlock } from "@manent/schema";
import type { NumberingScheme } from "./model.ts";

const SCENE_NUMBER = /^([A-Z]*)(\d+)([A-Z]*)$/;
const LETTER_Z = 0x5a;

interface SceneNumber {
  readonly prefix: string;
  readonly digits: string;
  readonly suffix: string;
}

function parseSceneNumber(num: string | null): SceneNumber | null {
  const match = num === null ? null : SCENE_NUMBER.exec(num);
  if (match === null) return null;
  return { prefix: match[1]!, digits: match[2]!, suffix: match[3]! };
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareDigits(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, "");
  const y = b.replace(/^0+(?=\d)/, "");
  return x.length - y.length || compareText(x, y);
}

// A prefixed number comes before the scene it is lettered from: A12 < B12 < 12.
function comparePrefixes(a: string, b: string): number {
  if (a === "" || b === "") return compareText(b, a);
  return compareText(a, b);
}

/**
 * Orders scene numbers as a schedule reads them: A12 < 12 < 12A < 12AA < 12B < A13 < 13.
 * A number that is not letters, digits and letters sorts after every one that is, by its text.
 */
export function compareSceneNumbers(a: string, b: string): number {
  const x = parseSceneNumber(a);
  const y = parseSceneNumber(b);
  if (x === null || y === null) {
    if (x === y) return compareText(a, b);
    return x === null ? 1 : -1;
  }
  return (
    compareDigits(x.digits, y.digits) ||
    comparePrefixes(x.prefix, y.prefix) ||
    compareText(x.suffix, y.suffix) ||
    compareText(a, b)
  );
}

function isNumberedHeading(block: FlatBlock): boolean {
  return block.attrs.type === "scene_heading" || block.attrs.type === "slug";
}

/** At lock: each heading's displayed number, its `num`, else its count among the headings. A heading without an id is counted and left out. */
export function lockNumbers(
  blocks: readonly FlatBlock[],
): { blockId: string; num: string }[] {
  const locked: { blockId: string; num: string }[] = [];
  let count = 0;
  for (const block of blocks) {
    if (!isNumberedHeading(block)) continue;
    count++;
    const { id, num } = block.attrs;
    if (id !== null) locked.push({ blockId: id, num: num ?? String(count) });
  }
  return locked;
}

function advance(letters: string): string | null {
  if (letters === "") return "A";
  const last = letters.charCodeAt(letters.length - 1);
  if (last === LETTER_Z) return null;
  return letters.slice(0, -1) + String.fromCharCode(last + 1);
}

// Letters after `from`, ascending: the next sibling while it fits, else one level deeper from the last given
// (12A, 12B, then 12AA, 12AB …). Ends when even the deeper one does not fit.
function* lettersAfter(
  from: string,
  fits: (letters: string) => boolean,
): Generator<string> {
  let last = from;
  for (;;) {
    const sibling = advance(last);
    const next = sibling !== null && fits(sibling) ? sibling : `${last}A`;
    if (!fits(next)) return;
    yield next;
    last = next;
  }
}

function* afterNumber(p: SceneNumber, bound: string | null): Generator<string> {
  const stem = `${p.prefix}${p.digits}`;
  const fits = (letters: string): boolean =>
    bound === null || compareSceneNumbers(stem + letters, bound) < 0;
  for (const letters of lettersAfter(p.suffix, fits)) yield stem + letters;
}

function* beforeNumber(n: string, tail: string): Generator<string> {
  const fits = (letters: string): boolean =>
    compareSceneNumbers(letters + tail, n) < 0;
  for (const letters of lettersAfter("", fits)) yield letters + tail;
}

function* counting(): Generator<string> {
  for (let count = 1; ; count++) yield String(count);
}

// The candidates between P and N in order, as the scheme letters them.
function candidates(
  p: SceneNumber | null,
  next: string | null,
  scheme: NumberingScheme,
): Iterable<string> {
  const n = parseSceneNumber(next);
  const prefixed =
    scheme === "prefix" &&
    next !== null &&
    n?.prefix === "" &&
    (p === null || p.prefix !== "" || compareDigits(p.digits, n.digits) !== 0);
  if (prefixed) return beforeNumber(next, next);
  if (p !== null) return afterNumber(p, next);
  if (next !== null && n !== null) return beforeNumber(next, n.digits);
  return counting();
}

// When no number is left between the neighbours, or they are out of order: the next free one after the last given.
function overflow(
  last: string | null,
  p: SceneNumber | null,
  next: string | null,
): Iterable<string> {
  const from = parseSceneNumber(last) ?? p ?? parseSceneNumber(next);
  return from === null ? counting() : afterNumber(from, null);
}

function runNumbers(
  count: number,
  previous: string | null,
  next: string | null,
  scheme: NumberingScheme,
  taken: ReadonlySet<string>,
): string[] {
  const p = parseSceneNumber(previous);
  const bound =
    previous !== null &&
    next !== null &&
    compareSceneNumbers(previous, next) >= 0
      ? null
      : next;
  // A P that is not a scene number bounds nothing.
  const floor = p === null ? null : previous;
  const picked: string[] = [];
  const pick = (from: Iterable<string>): void => {
    for (const candidate of from) {
      if (picked.length === count) return;
      const above = floor === null || compareSceneNumbers(floor, candidate) < 0;
      if (above && !taken.has(candidate)) picked.push(candidate);
    }
  };
  pick(candidates(p, bound, scheme));
  if (picked.length < count) pick(overflow(picked.at(-1) ?? null, p, bound));
  return picked;
}

/**
 * A number for every heading whose `num` is null, lettered from its nearest numbered neighbours P and N:
 * `suffix` gives P's siblings (12A, 12B, then 12AA once one would not sort before N), or "A" + N's digits
 * with no P; `prefix` gives "A" + N, "B" + N … when N has no prefix letter, else the suffix rule on P.
 * No number in `used` (issued and reserved) or held by a heading is given. Where no number is left between
 * P and N, or they are out of order, the next free one after the last given is used; with no numbered
 * heading at all, 1, 2, 3 … The same headings in the same order always get the same numbers.
 */
export function deriveNumbers(
  headings: readonly { blockId: string; num: string | null }[],
  scheme: NumberingScheme,
  used: ReadonlySet<string>,
): Map<string, string> {
  const taken = new Set(used);
  for (const heading of headings)
    if (heading.num !== null) taken.add(heading.num);
  const numbers = new Map<string, string>();
  const number = (
    run: readonly string[],
    previous: string | null,
    next: string | null,
  ): void => {
    const given = runNumbers(run.length, previous, next, scheme, taken);
    run.forEach((blockId, i) => {
      numbers.set(blockId, given[i]!);
      taken.add(given[i]!);
    });
  };
  let previous: string | null = null;
  let run: string[] = [];
  for (const heading of headings) {
    if (heading.num === null) {
      run.push(heading.blockId);
      continue;
    }
    number(run, previous, heading.num);
    previous = heading.num;
    run = [];
  }
  number(run, previous, null);
  return numbers;
}
