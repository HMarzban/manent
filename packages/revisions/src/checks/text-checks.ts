// Prose-level pre-send Checks: overused words and new proper nouns since the last sent draft.
import type { TextAnchor } from "@manent/schema";
import { findNearMatches } from "../names/near-match.ts";
import {
  NON_PROPER_NOUNS,
  OVERUSED_STOP_WORDS,
  TITLE_ABBREVIATIONS,
} from "./stop-words.ts";

export interface CheckBlock {
  readonly id: string;
  readonly type: string;
  readonly text: string;
}

export interface OverusedWordCheck {
  readonly kind: "overused_word";
  readonly key: string;
  readonly text: string;
  readonly count: number;
  readonly anchor: TextAnchor | null;
}

export interface NewProperNounCheck {
  readonly kind: "new_proper_noun";
  readonly key: string;
  readonly text: string;
  readonly anchor: TextAnchor | null;
}

export interface ListedNameSets {
  readonly fullKeys: ReadonlySet<string>;
  readonly wordKeys: ReadonlySet<string>;
}

/** Prose and spoken elements scanned for overused words and new proper nouns (all-caps cues and headings are excluded). */
const PROSE_ELEMENTS: ReadonlySet<string> = new Set([
  "action",
  "dialogue",
  "parenthetical",
  "general",
  "body",
  "quote",
  "bracket",
  "emote",
  "ink_line",
]);

/** At most five overused words are reported. */
const MAX_OVERUSED_WORDS = 5;
/** Minimum occurrences for an overused word in any script. */
const MIN_OVERUSED_COUNT = 8;
/** Minimum share of prose words (0.25%) for a word to count as overused in longer scripts. */
const OVERUSED_SHARE = 0.0025;
/** Minimum letter length of a word considered for overuse. */
const MIN_OVERUSED_LENGTH = 3;

const SPACES = /\s+/gu;
export const LETTERS_WORD = /\p{L}+/gu;
// Constructed with new RegExp because the pattern includes an apostrophe.
export const WORD_TOKEN = new RegExp(
  "[\\p{L}\\p{N}]+(?:['’\\-][\\p{L}\\p{N}]+)*",
  "gu",
);
export const POSSESSIVE = new RegExp("['’]s$", "u");
const SENTENCE_END = new RegExp("[.!?…:][\"'”’)\\]]*\\s+$", "u");
const LEADING_OPEN = new RegExp("^[\\s\"'“‘(\\[—–-]*$", "u");
const CAPITALISED = /^\p{Lu}\p{Ll}/u;
const HONORIFIC_END = /(\p{L}+)\.\s+$/u;

export const keyOf = (text: string): string =>
  text.replace(SPACES, "").toLowerCase();

function isAtSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index);
  if (LEADING_OPEN.test(before)) return true;
  if (!SENTENCE_END.test(before)) return false;
  const honorific = HONORIFIC_END.exec(before);
  return (
    honorific === null || !TITLE_ABBREVIATIONS.has(honorific[1]!.toLowerCase())
  );
}

/** If `text` immediately before `index` ends with a title abbreviation ("Dr. "), returns its start offset; else `index`. */
function titleStartBefore(text: string, index: number): number {
  const before = text.slice(0, index);
  const honorific = HONORIFIC_END.exec(before);
  if (
    honorific === null ||
    !TITLE_ABBREVIATIONS.has(honorific[1]!.toLowerCase())
  )
    return index;
  return honorific.index;
}

export function findOverusedWords(
  blocks: readonly CheckBlock[],
  excludedWords: ReadonlySet<string>,
  anchorOf: (
    block: CheckBlock,
    start: number,
    end: number,
  ) => TextAnchor | null,
): OverusedWordCheck[] {
  let totalWords = 0;
  const counts = new Map<
    string,
    { count: number; block: CheckBlock; from: number; to: number }
  >();
  for (const block of blocks) {
    if (!PROSE_ELEMENTS.has(block.type)) continue;
    for (const match of block.text.matchAll(LETTERS_WORD)) {
      const raw = match[0];
      totalWords += 1;
      if (raw.length < MIN_OVERUSED_LENGTH) continue;
      const lower = raw.toLowerCase();
      if (OVERUSED_STOP_WORDS.has(lower) || excludedWords.has(lower)) continue;
      const entry = counts.get(lower);
      if (entry === undefined)
        counts.set(lower, {
          count: 1,
          block,
          from: match.index,
          to: match.index + raw.length,
        });
      else entry.count += 1;
    }
  }
  const threshold = Math.max(
    MIN_OVERUSED_COUNT,
    Math.ceil(totalWords * OVERUSED_SHARE),
  );
  return [...counts.entries()]
    .filter(([, info]) => info.count >= threshold)
    .toSorted(([a, ia], [b, ib]) => ib.count - ia.count || a.localeCompare(b))
    .slice(0, MAX_OVERUSED_WORDS)
    .map(([word, info]) => ({
      kind: "overused_word",
      key: `overused_word:${word}`,
      text: word,
      count: info.count,
      anchor: anchorOf(info.block, info.from, info.to),
    }));
}

export function findNewProperNouns(
  blocks: readonly CheckBlock[],
  listed: ListedNameSets,
  names: readonly string[],
  sentWords: ReadonlySet<string>,
  reportedNewNames: ReadonlySet<string>,
  anchorOf: (
    block: CheckBlock,
    start: number,
    end: number,
  ) => TextAnchor | null,
): NewProperNounCheck[] {
  const checks: NewProperNounCheck[] = [];
  const reported = new Set<string>();
  for (const block of blocks) {
    if (!PROSE_ELEMENTS.has(block.type)) continue;
    for (const match of block.text.matchAll(WORD_TOKEN)) {
      const raw = match[0].replace(POSSESSIVE, "");
      if (!CAPITALISED.test(raw)) continue;
      const lower = raw.toLowerCase();
      if (TITLE_ABBREVIATIONS.has(lower) || NON_PROPER_NOUNS.has(lower))
        continue;
      const wordStart = match.index;
      if (isAtSentenceStart(block.text, wordStart)) continue;
      const spanStart = titleStartBefore(block.text, wordStart);
      const spanEnd = wordStart + raw.length;
      const noun = block.text.slice(spanStart, spanEnd);
      const fullKey = keyOf(noun);
      if (
        listed.fullKeys.has(fullKey) ||
        listed.wordKeys.has(lower) ||
        reportedNewNames.has(fullKey) ||
        reportedNewNames.has(lower) ||
        sentWords.has(lower) ||
        reported.has(fullKey) ||
        findNearMatches(noun, names).length > 0
      )
        continue;
      reported.add(fullKey);
      checks.push({
        kind: "new_proper_noun",
        key: `new_proper_noun:${noun}`,
        text: noun,
        anchor: anchorOf(block, spanStart, spanEnd),
      });
    }
  }
  return checks;
}
