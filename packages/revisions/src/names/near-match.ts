// The project's names, and the rule that finds a run of words nearly, but not exactly, written as one of them.

export const PROJECT_NAME_KINDS = ["character", "set", "term"] as const;
export type ProjectNameKind = (typeof PROJECT_NAME_KINDS)[number];

/** One of a project's names: a character as its cues write it, a set as its scene headings write it, or a term. */
export interface ProjectName {
  readonly kind: ProjectNameKind;
  readonly name: string;
}

/** A run of a text, from `from` to `to` in UTF-16 units, that nearly matches the listed spelling `name`. */
export interface NearMatch {
  readonly from: number;
  readonly to: number;
  readonly name: string;
}

interface Word {
  readonly from: number;
  readonly to: number;
}

interface Listed {
  readonly name: string;
  /** Lower case, without white space. */
  readonly key: string;
  /** The ways of writing it that are the name itself. */
  readonly forms: ReadonlySet<string>;
  readonly words: number;
  /** How many letters it may differ by. */
  readonly allowed: number;
}

// letters and digits, joined by an apostrophe or a hyphen inside a word ("O'Neill", "Mary-Kate")
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const POSSESSIVE = /['’]s$/u;
const SPACE = /^\s+$/u;
const SPACES = /\s+/gu;

const keyOf = (text: string): string => text.replace(SPACES, "").toLowerCase();

const capitalised = (text: string): string =>
  text
    .toLowerCase()
    .replace(
      /(^|\s)(\p{L})/gu,
      (_, gap: string, letter: string) => gap + letter.toUpperCase(),
    );

/** How many letters a name of `length` letters may differ by: none under 5, one up to 7, two from 8. */
function allowance(length: number): number {
  if (length < 5) return 0;
  return length < 8 ? 1 : 2;
}

function listedOf(name: string): Listed {
  const upper = name.toUpperCase();
  // a name listed in capitals, as a cue writes it, is also itself with each word capitalised
  const forms = new Set([
    name,
    upper,
    ...(name === upper ? [capitalised(name)] : []),
  ]);
  const key = keyOf(name);
  return {
    name,
    key,
    forms,
    words: name.trim().split(SPACES).length,
    allowed: allowance(key.length),
  };
}

/** The words of `text`, a possessive "'s" left out. */
function wordsOf(text: string): Word[] {
  return [...text.matchAll(WORD)].map((m) => {
    const word = m[0].replace(POSSESSIVE, "");
    return { from: m.index, to: m.index + word.length };
  });
}

/** The word of `text` at `offset` (in it or at either end of it), a possessive "'s" left out; null where there is none. */
export function wordAt(
  text: string,
  offset: number,
): { from: number; to: number } | null {
  return (
    wordsOf(text).find((word) => word.from <= offset && offset <= word.to) ??
    null
  );
}

/** Edits (a letter added, removed or changed, or two side by side swapped) from `a` to `b`, or `limit + 1` once more. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, before[j - 2]! + 1);
      row.push(d);
      least = Math.min(least, d);
    }
    if (least > limit) return limit + 1;
    before = previous;
    previous = row;
  }
  return previous[b.length]!;
}

/** How far `run` is from `listed`; null when it is not a near match of it. */
function nearness(run: string, listed: Listed): number | null {
  const key = keyOf(run);
  if (key === listed.key) return 0;
  if (listed.allowed === 0 || key[0] !== listed.key[0]) return null;
  const d = distance(key, listed.key, listed.allowed);
  return d <= listed.allowed ? d : null;
}

/** Whether each word of `words` lies in a run written as a listed name. */
function writtenAsListed(
  text: string,
  words: readonly Word[],
  listed: readonly Listed[],
  longest: number,
): boolean[] {
  const covered = words.map(() => false);
  for (let i = 0; i < words.length; i++)
    for (let k = i; k < Math.min(words.length, i + longest); k++) {
      const run = text.slice(words[i]!.from, words[k]!.to);
      if (listed.some((l) => l.forms.has(run))) covered.fill(true, i, k + 1);
    }
  return covered;
}

/** The nearest listed name to `run`, and how near; null when none is near. */
function nearestTo(
  run: string,
  listed: readonly Listed[],
): { name: string; d: number } | null {
  let best: { name: string; d: number } | null = null;
  for (const l of listed) {
    const d = nearness(run, l);
    if (d !== null && (best === null || d < best.d)) best = { name: l.name, d };
  }
  return best;
}

/**
 * The runs of `text` that nearly match one of `names`, in order and never overlapping. A run is one or more words
 * with only white space between them, up to one word more than the longest name. It nearly matches a name when,
 * compared without case or white space, it is the same letters, or for a name of 5 to 7 letters one letter apart and
 * of 8 or more two letters apart (a letter added, removed or changed, or two side by side swapped), with the same
 * first letter; a name under 5 letters matches only in case and spacing. A run written as a listed name (as listed,
 * in capitals, or, for a name listed in capitals, with each word capitalised) is never a near match, nor is any run
 * holding one of its words. A possessive "'s" is left outside the run. Where runs overlap, the earliest is kept,
 * then the nearest, then the longest.
 */
export function findNearMatches(
  text: string,
  names: readonly string[],
): NearMatch[] {
  const listed = names.filter((name) => name.trim() !== "").map(listedOf);
  if (listed.length === 0) return [];
  const longest = Math.max(...listed.map((l) => l.words)) + 1;
  const words = wordsOf(text);
  const covered = writtenAsListed(text, words, listed, longest);
  const found: NearMatch[] = [];
  let i = 0;
  while (i < words.length) {
    let chosen: { k: number; name: string; d: number } | null = null;
    for (
      let k = i;
      k < Math.min(words.length, i + longest) && !covered[k];
      k++
    ) {
      if (k > i && !SPACE.test(text.slice(words[k - 1]!.to, words[k]!.from)))
        break;
      const near = nearestTo(text.slice(words[i]!.from, words[k]!.to), listed);
      if (near !== null && (chosen === null || near.d <= chosen.d))
        chosen = { k, ...near };
    }
    if (chosen === null) {
      i++;
      continue;
    }
    found.push({
      from: words[i]!.from,
      to: words[chosen.k]!.to,
      name: chosen.name,
    });
    i = chosen.k + 1;
  }
  return found;
}
