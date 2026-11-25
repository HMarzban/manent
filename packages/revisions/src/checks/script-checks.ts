// Pure pre-send Checks over a script, its last sent draft, the project's names, its page count and its target length.
import { textAnchorAt } from "@manent/schema";
import type { BlockJSON, DocJSON, TextAnchor } from "@manent/schema";
import { findNearMatches } from "../names/near-match.ts";
import {
  LETTERS_WORD,
  POSSESSIVE,
  WORD_TOKEN,
  findNewProperNouns,
  findOverusedWords,
  keyOf,
} from "./text-checks.ts";
import type {
  CheckBlock,
  ListedNameSets,
  NewProperNounCheck,
  OverusedWordCheck,
} from "./text-checks.ts";

export type { NewProperNounCheck, OverusedWordCheck };

export const SCRIPT_CHECK_KINDS = [
  "new_name",
  "near_match",
  "overused_word",
  "pages_over_target",
  "new_proper_noun",
] as const;

export type ScriptCheckKind = (typeof SCRIPT_CHECK_KINDS)[number];

interface ScriptCheckBase {
  /** Stable key `<kind>:<text>` for flagging and deduplication. */
  readonly key: string;
  /** The subject named by the Check ("Dr. Feld", "Marguerita", "fog", "61 pages", "Ardle"). */
  readonly text: string;
  /** First place in the script where this Check occurs, or null when it has none. */
  readonly anchor: TextAnchor | null;
}

export interface NewNameCheck extends ScriptCheckBase {
  readonly kind: "new_name";
}

export interface NearMatchCheck extends ScriptCheckBase {
  readonly kind: "near_match";
  readonly matchedName: string;
}

export interface PagesOverTargetCheck extends ScriptCheckBase {
  readonly kind: "pages_over_target";
  readonly pages: number;
  readonly target: number;
  readonly over: number;
}

export type ScriptCheck =
  | NewNameCheck
  | NearMatchCheck
  | OverusedWordCheck
  | PagesOverTargetCheck
  | NewProperNounCheck;

export interface ScriptChecksInput {
  readonly doc: DocJSON;
  /** Last sent version's JSON, or null when no draft has been sent yet. */
  readonly lastSent: DocJSON | null;
  /** The project's listed spellings (characters, sets and terms). */
  readonly names: readonly string[];
  /** Current script page count. */
  readonly pageCount: number;
  /** Project target page count (`project.targetPages`), or null when unset. */
  readonly targetPages: number | null;
}

const LETTER = /\p{L}/u;

function blockText(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

function flatBlocksOf(doc: DocJSON): CheckBlock[] {
  const flat: CheckBlock[] = [];
  for (const section of doc.content ?? []) {
    if (section.type !== "section") continue;
    for (const block of section.content ?? []) {
      if (block.type !== "block") continue;
      flat.push({
        id: typeof block.attrs?.id === "string" ? block.attrs.id : "",
        type:
          typeof block.attrs?.type === "string" ? block.attrs.type : "general",
        text: blockText(block),
      });
    }
  }
  return flat;
}

function anchorOf(
  block: CheckBlock,
  start: number,
  end: number,
): TextAnchor | null {
  if (block.id === "" || start < 0 || end < start || end > block.text.length)
    return null;
  return textAnchorAt({ id: block.id, text: block.text }, start, end);
}

/** A character cue's name before any parenthetical extension, with its UTF-16 range inside `text`. */
function cueRangeOf(
  text: string,
): { name: string; start: number; end: number } | null {
  const paren = text.indexOf("(");
  const head = paren < 0 ? text : text.slice(0, paren);
  const trimmed = head.trim();
  if (trimmed === "" || !LETTER.test(trimmed)) return null;
  const start = head.indexOf(trimmed);
  return { name: trimmed, start, end: start + trimmed.length };
}

/** Every listed name's normalised full key, plus every individual word appearing inside a listed name. */
function listedSets(names: readonly string[]): ListedNameSets {
  const fullKeys = new Set<string>();
  const wordKeys = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === "") continue;
    fullKeys.add(keyOf(trimmed));
    for (const match of trimmed.matchAll(WORD_TOKEN))
      wordKeys.add(match[0].replace(POSSESSIVE, "").toLowerCase());
  }
  return { fullKeys, wordKeys };
}

/** Character cue keys present in `blocks`. */
function cueKeysOf(blocks: readonly CheckBlock[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "character") continue;
    const cue = cueRangeOf(block.text);
    if (cue !== null) keys.add(keyOf(cue.name));
  }
  return keys;
}

/** All lower-case words present in `blocks` (used to detect what is new since the last sent draft). */
function wordsOf(blocks: readonly CheckBlock[]): ReadonlySet<string> {
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const match of block.text.matchAll(WORD_TOKEN)) {
      const clean = match[0].replace(POSSESSIVE, "");
      if (clean !== "") seen.add(clean.toLowerCase());
    }
  }
  return seen;
}

function findNewNames(
  blocks: readonly CheckBlock[],
  listedFullKeys: ReadonlySet<string>,
  names: readonly string[],
  sentCueKeys: ReadonlySet<string>,
): { checks: NewNameCheck[]; cueKeys: Set<string> } {
  const checks: NewNameCheck[] = [];
  const reported = new Set<string>();
  const cueKeys = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "character") continue;
    const cue = cueRangeOf(block.text);
    if (cue === null) continue;
    const key = keyOf(cue.name);
    cueKeys.add(key);
    if (
      listedFullKeys.has(key) ||
      sentCueKeys.has(key) ||
      reported.has(key) ||
      findNearMatches(cue.name, names).length > 0
    )
      continue;
    reported.add(key);
    checks.push({
      kind: "new_name",
      key: `new_name:${cue.name}`,
      text: cue.name,
      anchor: anchorOf(block, cue.start, cue.end),
    });
  }
  return { checks, cueKeys };
}

function findVariants(
  blocks: readonly CheckBlock[],
  names: readonly string[],
): NearMatchCheck[] {
  if (names.length === 0) return [];
  const checks: NearMatchCheck[] = [];
  const reported = new Set<string>();
  for (const block of blocks) {
    for (const match of findNearMatches(block.text, names)) {
      const found = block.text.slice(match.from, match.to);
      const dedupeKey = keyOf(found);
      if (reported.has(dedupeKey)) continue;
      reported.add(dedupeKey);
      checks.push({
        kind: "near_match",
        key: `near_match:${found}`,
        text: found,
        matchedName: match.name,
        anchor: anchorOf(block, match.from, match.to),
      });
    }
  }
  return checks;
}

/**
 * Pure pre-send Checks for a script:
 * - `new_name`: a Character cue's name not in `names` (and not a near-match of one) and absent from `lastSent`'s cues.
 * - `near_match`: a run of words matching `findNearMatches` against `names`.
 * - `overused_word`: up to five lower-cased words of at least 3 letters in prose/dialogue blocks (excluding English
 *   function words, project names and character cue names) appearing at least `max(8, ceil(0.25% of prose words))` times,
 *   ordered by descending count then alphabetically.
 * - `pages_over_target`: emitted when `targetPages` is positive and `pageCount > targetPages`.
 * - `new_proper_noun`: a capitalised word (with any immediately preceding title abbreviation such as "Dr.") not at a
 *   sentence start in prose/dialogue blocks, absent from `lastSent`, `names` and already-reported new Character cues.
 *
 * When `lastSent` is null, the two "since the last draft" Checks (`new_name` and `new_proper_noun`) compare against an
 * empty script. Every Check carries a `<kind>:<text>` key and the `TextAnchor` of its first occurrence (or null).
 */
export function findScriptChecks(input: ScriptChecksInput): ScriptCheck[] {
  const { doc, lastSent, names, pageCount, targetPages } = input;
  const blocks = flatBlocksOf(doc);
  const sentBlocks = lastSent === null ? [] : flatBlocksOf(lastSent);
  const listed = listedSets(names);
  const sentCueKeys = cueKeysOf(sentBlocks);
  const sentWords = wordsOf(sentBlocks);

  const { checks: newNames, cueKeys } = findNewNames(
    blocks,
    listed.fullKeys,
    names,
    sentCueKeys,
  );
  const nearMatches = findVariants(blocks, names);
  const excludedForOveruse = new Set<string>([...listed.wordKeys, ...cueKeys]);
  for (const block of blocks) {
    if (block.type !== "character") continue;
    const cue = cueRangeOf(block.text);
    if (cue === null) continue;
    for (const match of cue.name.matchAll(LETTERS_WORD))
      excludedForOveruse.add(match[0].toLowerCase());
  }
  const overused = findOverusedWords(blocks, excludedForOveruse, anchorOf);
  const overTarget: PagesOverTargetCheck[] =
    targetPages !== null && targetPages > 0 && pageCount > targetPages
      ? [
          {
            kind: "pages_over_target",
            key: `pages_over_target:${pageCount} pages`,
            text: `${pageCount} pages`,
            pages: pageCount,
            target: targetPages,
            over: pageCount - targetPages,
            anchor: null,
          },
        ]
      : [];
  const reportedNewNameKeys = new Set(newNames.map((c) => keyOf(c.text)));
  const properNouns = findNewProperNouns(
    blocks,
    listed,
    names,
    sentWords,
    reportedNewNameKeys,
    anchorOf,
  );

  return [
    ...newNames,
    ...nearMatches,
    ...overused,
    ...overTarget,
    ...properNouns,
  ];
}
