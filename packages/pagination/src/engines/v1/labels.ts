// Page labels: their order, and the labels the pages between two locked pages take.
import { RANGE_DASH } from "./locks.ts";

const LABEL_FORM = /^([A-Z]*)([0-9]+)([A-Z]*)$/;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** The prefix series stops a letter short of Z, so a label is always left between it and the next. */
const PREFIX_LETTERS = LETTERS.slice(0, -1);
const LAST_LETTER = "Z";

interface Parts {
  readonly prefix: string;
  readonly number: string;
  readonly suffix: string;
}

// A label's parts; a range is read as its first part; null for a label of another form.
function partsOf(label: string): Parts | null {
  const match = LABEL_FORM.exec(label.split(RANGE_DASH, 1)[0]!);
  if (match === null) return null;
  return { prefix: match[1]!, number: match[2]!, suffix: match[3]! };
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function byNumber(a: string, b: string): number {
  const x = a.replace(/^0+/, "");
  const y = b.replace(/^0+/, "");
  return x.length - y.length || byCodeUnit(x, y);
}

// Letter by letter; where one prefix ends and the other goes on, the one that goes on first; none last.
function byPrefix(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  for (let at = 0; at < a.length && at < b.length; at++)
    if (a[at] !== b[at]) return byCodeUnit(a[at]!, b[at]!);
  return b.length - a.length;
}

/**
 * The order of page labels: negative, 0 or positive. By number, then suffix, then prefix; a range as
 * its first part; a label of another form after every label of this form; and labels these rules
 * leave equal by UTF-16 code unit, so 0 means the same string.
 */
export function comparePageLabels(a: string, b: string): number {
  const x = partsOf(a);
  const y = partsOf(b);
  if (x === null || y === null)
    return x === y ? byCodeUnit(a, b) : x === null ? 1 : -1;
  return (
    byNumber(x.number, y.number) ||
    byCodeUnit(x.suffix, y.suffix) ||
    byPrefix(x.prefix, y.prefix) ||
    byCodeUnit(a, b)
  );
}

// `letters` followed by A, B, … then the last letter and A, B, … again, one level deeper each time.
function lettersAt(letters: string, index: number): string {
  const depth = Math.floor(index / letters.length);
  return LAST_LETTER.repeat(depth) + letters[index % letters.length]!;
}

// The `index`th label of the series of `base`: base followed by A … Z, ZA … ZZ, ZZA …; 1, 2, 3 … for null.
function seriesAt(base: string | null, index: number): string {
  return base === null ? String(index + 1) : base + lettersAt(LETTERS, index);
}

// Some label sorts after `lower` and before `upper`. None does when `lower` does not sort first, or
// when the two share a number and suffix and `lower`'s prefix is `upper`'s with nothing but Z's added
// (Z12A before 12A): every prefix on `upper` then sorts before `lower`.
function hasRoom(lower: string | null, upper: string): boolean {
  if (lower === null) return true;
  if (comparePageLabels(lower, upper) >= 0) return false;
  const x = partsOf(lower);
  const y = partsOf(upper);
  if (
    x === null ||
    y === null ||
    byNumber(x.number, y.number) !== 0 ||
    x.suffix !== y.suffix ||
    !x.prefix.startsWith(y.prefix)
  )
    return true;
  return !/^Z*$/.test(x.prefix.slice(y.prefix.length));
}

/**
 * `count` labels in increasing order, each after `lower`, before `upper` and not in `taken`: the
 * series of `lower`, one level deeper where it reaches `upper`, then prefixes on `upper` where no
 * series fits. Where no label sorts between the two, `upper` is ignored. A range is read as its last
 * part for `lower` and its first for `upper`.
 */
export function labelsBetween(
  lower: string | null,
  upper: string | null,
  count: number,
  taken: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const low = lower === null ? null : lower.split(RANGE_DASH).at(-1)!;
  const high = upper === null ? null : upper.split(RANGE_DASH)[0]!;
  let bound = high !== null && hasRoom(low, high) ? high : null;
  let base = low;
  let index = 0;
  let before: string | null = null; // the last candidate of this series that sorted before the bound
  let prefixed = -1; // the next prefix on the bound, once no series fits
  while (out.length < count) {
    const floor = out.at(-1) ?? low;
    if (bound !== null && prefixed >= 0) {
      const parts = partsOf(bound);
      // a label of another form takes no prefix
      if (parts === null || !hasRoom(floor, bound)) {
        bound = null;
        continue;
      }
      const label =
        parts.prefix +
        lettersAt(PREFIX_LETTERS, prefixed++) +
        bound.slice(parts.prefix.length);
      if (
        (floor === null || comparePageLabels(floor, label) < 0) &&
        !taken.has(label)
      )
        out.push(label);
      continue;
    }
    const label = seriesAt(base, index++);
    if (bound !== null && comparePageLabels(label, bound) >= 0) {
      if (before === null) prefixed = 0;
      else {
        base = before;
        index = 0;
        before = null;
      }
      continue;
    }
    before = label;
    if (!taken.has(label)) out.push(label);
  }
  return out;
}
