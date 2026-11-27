// How a query matches a row, and the order matched rows are shown in.
import type { PaletteRow } from "./palette-sources.ts";

const WORD = new RegExp(String.raw`[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*`, "gu");
const APOSTROPHES = new RegExp("['’]", "g");

const normalize = (word: string): string => word.replace(APOSTROPHES, "");

const wordsOf = (text: string): string[] =>
  [...text.toLocaleLowerCase().matchAll(WORD)].map((m) => normalize(m[0]));

const initialsOf = (text: string): string =>
  wordsOf(text)
    .map((word) => word[0] ?? "")
    .join("");

const matchesWords = (
  queryWords: readonly string[],
  texts: readonly string[],
): boolean => {
  if (queryWords.length === 0) return true;
  const words = texts.flatMap(wordsOf);
  return queryWords.every((q) => words.some((word) => word.startsWith(q)));
};

/** True when a single-word query of at least 2 characters matches the leading initials of a multi-word text (e.g. "fm" -> "Focus mode"). */
const matchesAcronym = (
  queryWords: readonly string[],
  texts: readonly string[],
): boolean => {
  if (queryWords.length !== 1) return false;
  const q = queryWords[0]!;
  if (q.length < 2) return false;
  return texts.some((text) => {
    const initials = initialsOf(text);
    return initials.length >= q.length && initials.startsWith(q);
  });
};

/** True when every word of `query` begins a word of one of `texts` (apostrophe-normalised), or matches a multi-word acronym. */
export function matchesQuery(query: string, texts: readonly string[]): boolean {
  const queryWords = wordsOf(query);
  if (queryWords.length === 0) return true;
  return matchesWords(queryWords, texts) || matchesAcronym(queryWords, texts);
}

/** The label cut into runs, each marked when a query word matched its start; the runs joined are the label. */
export function matchedRuns(
  query: string,
  label: string,
): { text: string; matched: boolean }[] {
  const queryWords = wordsOf(query);
  if (queryWords.length === 0) return [{ text: label, matched: false }];
  const runs: { text: string; matched: boolean }[] = [];
  let at = 0;
  for (const m of label.matchAll(WORD)) {
    const raw = m[0];
    const norm = normalize(raw.toLocaleLowerCase());
    let matchedNormLen = 0;
    for (const q of queryWords) {
      if (norm.startsWith(q) && q.length > matchedNormLen) {
        matchedNormLen = q.length;
      }
    }
    if (matchedNormLen === 0) continue;
    // map normalised length back onto raw characters (preserving apostrophes inside the matched span)
    let rawLen = 0;
    let seen = 0;
    while (rawLen < raw.length && seen < matchedNormLen) {
      const ch = raw[rawLen]!;
      rawLen += 1;
      if (ch !== "'" && ch !== "\u2019") seen += 1;
    }
    if (m.index > at)
      runs.push({ text: label.slice(at, m.index), matched: false });
    runs.push({ text: label.slice(m.index, m.index + rawLen), matched: true });
    at = m.index + rawLen;
  }
  if (at < label.length) runs.push({ text: label.slice(at), matched: false });
  return runs;
}

// 0: exact full label; 1: label starts with whole query; 2: label holds every word; 3: label acronym; 4: keyword/synonym/value
function scoreOf(
  trimmed: string,
  queryWords: readonly string[],
  row: PaletteRow,
): number {
  if (trimmed === "") return 1;
  const label = row.label.toLocaleLowerCase();
  if (label === trimmed) return 0;
  if (label.startsWith(trimmed)) return 1;
  if (matchesWords(queryWords, [row.label])) return 2;
  if (matchesAcronym(queryWords, [row.label])) return 3;
  return 4;
}

// the palette's sections, in the order they are shown: each holds the rows of one kind
const SECTION_KINDS: readonly PaletteRow["kind"][] = Object.freeze([
  "command",
  "setting",
  "place",
  "document",
  "person",
  "help",
]);

export interface RankOptions {
  /** Optional contextual + frecency boost (higher ranks earlier within the same tier and section). */
  readonly boost?: (row: PaletteRow) => number;
}

/**
 * Orders rows a source already matched: by section, then enabled before unavailable, then match quality,
 * then optional contextual/frecency boost, and finally in the order given.
 */
export function rankRows(
  query: string,
  rows: readonly PaletteRow[],
  options?: RankOptions,
): readonly PaletteRow[] {
  const trimmed = query.trim().toLocaleLowerCase();
  const queryWords = wordsOf(query);
  const boost = options?.boost;
  return rows
    .map((row, index) => ({
      row,
      index,
      section: SECTION_KINDS.indexOf(row.kind),
      disabled: row.enabled ? 0 : 1,
      score: scoreOf(trimmed, queryWords, row),
      boost: boost === undefined ? 0 : boost(row),
    }))
    .toSorted(
      (a, b) =>
        a.disabled - b.disabled ||
        a.section - b.section ||
        a.score - b.score ||
        b.boost - a.boost ||
        a.index - b.index,
    )
    .map(({ row }) => row);
}
