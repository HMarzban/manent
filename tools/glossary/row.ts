// One row of the vocabulary: its words, the words they are never called, and their feature.
import type { Feature, Term } from "./index.ts";

/** One `Term` per word of a row, all sharing the row's never-called words and feature. */
export const row = (
  feature: Feature,
  words: readonly string[],
  neverCalled: readonly string[],
  paletteOnly: readonly string[] = [],
): Term[] => words.map((term) => ({ term, neverCalled, paletteOnly, feature }));
