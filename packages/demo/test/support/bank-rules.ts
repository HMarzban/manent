// The rules every phrase bank is held to: the names it may hold, the lines it may not repeat, and its voice's limits.
import {
  DOWN_THE_TOLLE_GUIDE,
  EKBO_GUIDE,
  EMBER_FLEET_GUIDE,
  HANDED_IN_GUIDE,
  HARBOUR_LIGHTS_GUIDE,
  JUMPOX_GUIDE,
  KEEPER_GUIDE,
  KEEPER_PROSE,
  LAMP_ROOM_GUIDE,
  LARCH_ROAD_GUIDE,
  LATE_DESK_GUIDE,
  LIVE_GUIDE,
  LONG_NIGHT_GUIDE,
  MOSS_AND_PEBBLE_GUIDE,
  NED_ASHBY_GUIDE,
  NED_PROSE,
  NEWS_GUIDE,
  SLATE_GUIDES,
  TWELVE_ON_FOOT_GUIDE,
  WARD_NINE_GUIDE,
} from "../../src/generate/index.ts";
import type {
  ProseGuide,
  StyleGuide,
  StyleRules,
  VarietyStory,
} from "../../src/generate/index.ts";

export const BANK_ISSUE_CODES = [
  "unlisted_name",
  "repeated",
  "too_long",
  "off_voice",
  "not_a_sentence",
  "unknown_speaker",
] as const;
export type BankIssueCode = (typeof BANK_ISSUE_CODES)[number];

/** `entry` is the entry's text as written. */
export interface BankIssue {
  code: BankIssueCode;
  entry: string;
}

type Guide = StyleGuide | ProseGuide;

/** Every bank, in the order a repeat across banks is blamed on the later one. */
export const ALL_GUIDES: readonly Guide[] = Object.freeze([
  EKBO_GUIDE,
  JUMPOX_GUIDE,
  HANDED_IN_GUIDE,
  LONG_NIGHT_GUIDE,
  HARBOUR_LIGHTS_GUIDE,
  LAMP_ROOM_GUIDE,
  TWELVE_ON_FOOT_GUIDE,
  LATE_DESK_GUIDE,
  NEWS_GUIDE,
  NED_ASHBY_GUIDE,
  NED_PROSE,
  EMBER_FLEET_GUIDE,
  KEEPER_GUIDE,
  KEEPER_PROSE,
  WARD_NINE_GUIDE,
  LARCH_ROAD_GUIDE,
  MOSS_AND_PEBBLE_GUIDE,
  LIVE_GUIDE,
  DOWN_THE_TOLLE_GUIDE,
  ...SLATE_GUIDES,
]);

export function othersThan(guide: Guide): readonly Guide[] {
  return ALL_GUIDES.filter((other) => other !== guide);
}

const COMMON_CAPITALS = [
  "I",
  "I'm",
  "I'll",
  "I've",
  "I'd",
  "Mum",
  "Dad",
  "Gran",
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "INT.",
  "EXT.",
  "V.O.",
  "O.S.",
  "CONT'D",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const COMMON = new Set(COMMON_CAPITALS.map((word) => word.toLowerCase()));

const FILLER = /lorem|ipsum|\bTBD\b|placeholder|^Scene \d+$/i;
const BRACKET_TIME = /^T=(\d+):(\d{2})\s*/;
const WORD_RUN = new RegExp("[\\p{L}\\p{N}'.-]+", "gu");
const LEADING = new RegExp("^['.-]+");
const TRAILING = new RegExp("['.-]+$");
const SENTENCE = new RegExp("^[\"“‘']?\\p{Lu}[\\s\\S]*[.!?…][\"”’']?$", "u");
const SCENE_PREFIX = /^(?:INT\.|EXT\.)(?:\/(?:INT\.|EXT\.))?\s*/;

type EntryKind = "action" | "dialogue" | "sentence" | "other";

const WORD_LIMIT: Readonly<
  Record<EntryKind, (style: StyleRules) => number | null>
> = Object.freeze({
  action: (style) => style.actionWords,
  dialogue: (style) => style.dialogueWords,
  sentence: (style) => style.sentenceWords,
  other: () => null,
});

/** Fields whose entries may recur, so `repeated` never reads them. */
const RECURRING_FIELDS: ReadonlySet<string> = new Set(["chapters[].tags"]);

interface Entry {
  field: string;
  kind: EntryKind;
  written: string;
  /** What the rules read: `’` as `'`, and a bracket without its leading time. */
  text: string;
  /** The cue to find in the cast; null when there is none to check. */
  speaker: string | null;
}

const plain = (text: string): string => text.replaceAll("’", "'");

function entry(
  field: string,
  kind: EntryKind,
  written: string,
  speaker: string | null = null,
): Entry {
  return { field, kind, written, text: plain(written), speaker };
}

function styleEntries(guide: StyleGuide): Entry[] {
  return [
    ...guide.action.map((text) => entry("action", "action", text)),
    ...guide.dialogue.map((line) =>
      entry("dialogue[].text", "dialogue", line.text, line.speaker),
    ),
    ...guide.tags.map((text) => entry("tags", "dialogue", text)),
    ...guide.stories.flatMap((story) =>
      story.lines.map((line) =>
        entry("stories[].lines[].text", "dialogue", line.text, line.speaker),
      ),
    ),
    ...guide.barks.map((bark) => entry("barks[].text", "dialogue", bark.text)),
    ...guide.stories.flatMap((story) =>
      story.brackets.map((bracket) => ({
        ...entry("stories[].brackets", "other", bracket),
        text: plain(bracket.replace(BRACKET_TIME, "")),
      })),
    ),
    ...guide.beats.map((beat) =>
      entry("beats[].summary", "other", beat.summary),
    ),
  ];
}

function proseEntries(guide: ProseGuide): Entry[] {
  return [
    ...guide.sentences.map((line) =>
      entry("sentences[].text", "sentence", line.text),
    ),
    ...guide.chapters.map((c) => entry("chapters[].title", "other", c.title)),
    ...guide.chapters.flatMap((c) =>
      c.beats.map((beat) => entry("chapters[].beats", "other", beat)),
    ),
    ...guide.chapters.map((c) => entry("chapters[].ledger", "other", c.ledger)),
    ...guide.chapters.flatMap((c) =>
      c.tags.map((tag) => entry("chapters[].tags", "other", tag)),
    ),
  ];
}

const isProse = (guide: Guide): guide is ProseGuide => "sentences" in guide;

const entriesOf = (guide: Guide): Entry[] =>
  isProse(guide) ? proseEntries(guide) : styleEntries(guide);

/** Words as the name rule reads them: a final `'s` dropped, and the full stop of a common capital kept. */
function wordsOf(text: string): string[] {
  const words: string[] = [];
  for (const [run] of plain(text).matchAll(WORD_RUN)) {
    const lead = run.replace(LEADING, "");
    const core = lead.replace(TRAILING, "");
    const word =
      COMMON.has(`${core}.`.toLowerCase()) && lead.startsWith(`${core}.`)
        ? `${core}.`
        : core;
    const bare = word.endsWith("'s") ? word.slice(0, -2) : word;
    if (bare !== "") words.push(bare);
  }
  return words;
}

const isCapitalised = (word: string): boolean => /^\P{L}*\p{Lu}/u.test(word);

function listedWords(guide: Guide): Set<string> {
  const sources = isProse(guide)
    ? guide.names
    : [
        ...guide.cast.flatMap((member) => [member.cue, member.name]),
        ...guide.places.map((place) => place.replace(SCENE_PREFIX, "")),
        ...guide.names,
      ];
  return new Set([
    ...COMMON,
    ...sources.flatMap(wordsOf).map((word) => word.toLowerCase()),
  ]);
}

function lowerCaseWords(guides: readonly Guide[]): Set<string> {
  const texts = guides.flatMap((guide) => [
    ...entriesOf(guide).map((e) => e.text),
    ...(isProse(guide) ? [] : guide.vocabulary),
  ]);
  return new Set(
    texts.flatMap(wordsOf).filter((word) => word === word.toLowerCase()),
  );
}

const repeatKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/ +/g, " ")
    .trim();

/** The banks whose entries this one may not repeat: those before it in ALL_GUIDES, or every one when it is not there. */
function earlierThan(guide: Guide, others: readonly Guide[]): Guide[] {
  const at = ALL_GUIDES.indexOf(guide);
  if (at === -1) return [...others];
  return others.filter((other) => {
    const index = ALL_GUIDES.indexOf(other);
    return index !== -1 && index < at;
  });
}

/** Marks each entry that repeats an earlier one: the same words, or six opening words shared within its field. */
function findRepeats(
  entries: readonly Entry[],
  earlier: readonly Entry[],
): boolean[] {
  const seen = new Set(
    earlier
      .filter((e) => !RECURRING_FIELDS.has(e.field))
      .map((e) => repeatKey(e.text)),
  );
  const openings = new Set<string>();
  return entries.map((e) => {
    if (RECURRING_FIELDS.has(e.field)) return false;
    const key = repeatKey(e.text);
    const words = key.split(" ");
    const opening =
      words.length >= 6 ? `${e.field}:${words.slice(0, 6).join(" ")}` : null;
    const repeated =
      seen.has(key) || (opening !== null && openings.has(opening));
    seen.add(key);
    if (opening !== null) openings.add(opening);
    return repeated;
  });
}

/**
 * Every issue of a bank's entries, entry by entry in field order and, for one
 * entry, in BANK_ISSUE_CODES order. `others` decides which capitalised words
 * are ordinary and which lines are taken already.
 */
export function checkBank(guide: Guide, others: readonly Guide[]): BankIssue[] {
  const entries = entriesOf(guide);
  const listed = listedWords(guide);
  const ordinary = lowerCaseWords([guide, ...others]);
  const repeats = findRepeats(
    entries,
    earlierThan(guide, others).flatMap(entriesOf),
  );
  const cues = new Set(isProse(guide) ? [] : guide.cast.map((m) => m.cue));
  const banned = [...guide.style.banned, FILLER];
  return entries.flatMap((e, index) => {
    const limit = WORD_LIMIT[e.kind](guide.style);
    const words = wordsOf(e.text);
    const failed: Record<BankIssueCode, boolean> = {
      unlisted_name: words.some((word) => {
        const lower = word.toLowerCase();
        return (
          isCapitalised(word) && !listed.has(lower) && !ordinary.has(lower)
        );
      }),
      repeated: repeats[index] === true,
      too_long: limit !== null && words.length > limit,
      off_voice: banned.some((pattern) => pattern.test(e.text)),
      not_a_sentence:
        (e.kind === "action" || e.kind === "sentence") &&
        !SENTENCE.test(e.text),
      unknown_speaker: e.speaker !== null && !cues.has(e.speaker),
    };
    return BANK_ISSUE_CODES.filter((code) => failed[code]).map((code) => ({
      code,
      entry: e.written,
    }));
  });
}

/** Reading time at 11.25 characters a second, plus each bracket's time; throws a RangeError for a bracket that does not open with `T=m:ss`. */
export function storyDurationMs(story: VarietyStory): number {
  const characters = story.lines.reduce(
    (sum, line) => sum + line.text.length,
    0,
  );
  const bracketsMs = story.brackets.reduce((sum, bracket) => {
    const time = BRACKET_TIME.exec(bracket);
    if (time === null)
      throw new RangeError(`a bracket opens with T=m:ss, not ${bracket}`);
    return sum + (Number(time[1]) * 60 + Number(time[2])) * 1000;
  }, 0);
  return Math.round((characters / 11.25) * 1000) + bracketsMs;
}
