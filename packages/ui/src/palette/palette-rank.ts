// How a query matches a row, and the order matched rows are shown in.
import type { PaletteRow } from "./palette-sources.ts";

const WORD = new RegExp(String.raw`[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*`, "gu");

const wordsOf = (text: string): string[] =>
  [...text.toLocaleLowerCase().matchAll(WORD)].map((m) => m[0]);

/** True when every word of `query` begins a word of one of `texts`, in any case; an empty query matches everything. */
export function matchesQuery(query: string, texts: readonly string[]): boolean {
  const words = texts.flatMap(wordsOf);
  return wordsOf(query).every((q) => words.some((word) => word.startsWith(q)));
}

/** The label cut into runs, each marked when a query word matched its start; the runs joined are the label. */
export function matchedRuns(
  query: string,
  label: string,
): { text: string; matched: boolean }[] {
  const queryWords = wordsOf(query);
  const runs: { text: string; matched: boolean }[] = [];
  let at = 0;
  for (const m of label.matchAll(WORD)) {
    const word = m[0].toLocaleLowerCase();
    const length = Math.max(
      0,
      ...queryWords.filter((q) => word.startsWith(q)).map((q) => q.length),
    );
    if (length === 0) continue;
    if (m.index > at)
      runs.push({ text: label.slice(at, m.index), matched: false });
    runs.push({ text: label.slice(m.index, m.index + length), matched: true });
    at = m.index + length;
  }
  if (at < label.length) runs.push({ text: label.slice(at), matched: false });
  return runs;
}

// 0: the label starts with the whole query; 1: the label holds every word; 2: a keyword or the value matched
function scoreOf(query: string, row: PaletteRow): number {
  const label = row.label.toLocaleLowerCase();
  if (label.startsWith(query.trim().toLocaleLowerCase())) return 0;
  return matchesQuery(query, [row.label]) ? 1 : 2;
}

/** Orders rows a source already matched: by how well the label matches, and in source order where they match alike. */
export function rankRows(
  query: string,
  rows: readonly PaletteRow[],
): readonly PaletteRow[] {
  return rows
    .map((row, index) => ({ row, index, score: scoreOf(query, row) }))
    .toSorted((a, b) => a.score - b.score || a.index - b.index)
    .map(({ row }) => row);
}
