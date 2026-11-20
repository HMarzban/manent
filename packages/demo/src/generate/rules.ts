// The rules generated text is held to: no filler, no line back too soon, every speaker and place known, every question answered.
import type { SeedBlock } from "../content/markup.ts";
import { withTag } from "./grammar.ts";
import type {
  GeneratedIssue,
  LineIntent,
  ProseGuide,
  StyleGuide,
} from "./guide.ts";

const GENERATED_REPEAT_PAGES = 10;
const FILLER = /lorem|ipsum|\bTBD\b|placeholder|^Scene \d+$/i;
// a sentence ends at its full stop, question mark, exclamation mark or ellipsis, and any closing quotes
const SENTENCE = new RegExp("[^.!?…]*[.!?…]+[\"'”’]*", "g");
// a sentence of this many words or fewer may come back at any distance
const SHORT_SENTENCE_WORDS = 4;
// a question is answered when one of this many speeches after it answers it
const ANSWER_WITHIN = 2;

const flagged = (
  blocks: readonly SeedBlock[],
  code: GeneratedIssue["code"],
  breaks: (block: SeedBlock) => boolean,
): GeneratedIssue[] =>
  blocks.flatMap((block, blockIndex) =>
    breaks(block) ? [{ code, blockIndex }] : [],
  );

// the location of a heading is everything before its last " - "
const locationOf = (heading: string): string => {
  const dash = heading.lastIndexOf(" - ");
  return dash === -1 ? heading : heading.slice(0, dash);
};

function repeatedSentences(
  blocks: readonly SeedBlock[],
  distance: number,
): GeneratedIssue[] {
  const lastAt = new Map<string, number>();
  return blocks.flatMap((block, blockIndex) => {
    if (block.element === "dialogue") return [];
    let repeated = false;
    for (const match of block.text.match(SENTENCE) ?? []) {
      const sentence = match.trim();
      if (sentence.split(/\s+/).length <= SHORT_SENTENCE_WORDS) continue;
      const at = lastAt.get(sentence);
      if (at !== undefined && blockIndex - at < distance) repeated = true;
      lastAt.set(sentence, blockIndex);
    }
    return repeated ? [{ code: "repeated_sentence" as const, blockIndex }] : [];
  });
}

function repeatedDialogue(blocks: readonly SeedBlock[]): GeneratedIssue[] {
  const spoken = new Set<string>();
  return flagged(blocks, "repeated_dialogue", (block) => {
    if (block.element !== "dialogue") return false;
    if (spoken.has(block.text)) return true;
    spoken.add(block.text);
    return false;
  });
}

// a speech has the intent of the entry it equals, with or without one joined tag; any other speech states
function unanswered(
  blocks: readonly SeedBlock[],
  dialogue: StyleGuide["dialogue"],
  tags: StyleGuide["tags"],
): GeneratedIssue[] {
  const intents = new Map<string, LineIntent>();
  for (const entry of dialogue) {
    intents.set(entry.text, entry.intent);
    for (const tag of tags) intents.set(withTag(entry.text, tag), entry.intent);
  }
  const speeches: {
    blockIndex: number;
    cue: string | null;
    intent: LineIntent;
  }[] = [];
  let cue: string | null = null;
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.element === "character") cue = block.text;
    if (block.element === "dialogue")
      speeches.push({
        blockIndex,
        cue,
        intent: intents.get(block.text) ?? "state",
      });
  }
  return speeches
    .filter(
      (speech, n) =>
        speech.intent === "ask" &&
        !speeches
          .slice(n + 1, n + 1 + ANSWER_WITHIN)
          .some(
            (reply) => reply.intent === "answer" && reply.cue !== speech.cue,
          ),
    )
    .map((speech) => ({ code: "unanswered", blockIndex: speech.blockIndex }));
}

/**
 * What generated blocks break of the generator's rules, in block order. A sentence of more than four words
 * outside dialogue may come back only ten pages of `linesPerPage` blocks later; a speech never comes back.
 */
export function checkGenerated(
  blocks: readonly SeedBlock[],
  guide: StyleGuide | ProseGuide,
  linesPerPage: number,
): GeneratedIssue[] {
  const style = "cast" in guide ? guide : null;
  const cues = new Set(style?.cast.map((member) => member.cue));
  const places = new Set(style?.places);
  return [
    ...repeatedSentences(blocks, GENERATED_REPEAT_PAGES * linesPerPage),
    ...repeatedDialogue(blocks),
    ...flagged(
      blocks,
      "unknown_speaker",
      (block) => block.element === "character" && !cues.has(block.text),
    ),
    ...flagged(
      blocks,
      "unknown_place",
      (block) =>
        block.element === "scene_heading" &&
        !places.has(locationOf(block.text)),
    ),
    ...flagged(blocks, "filler", (block) => FILLER.test(block.text)),
    ...unanswered(blocks, style?.dialogue ?? [], style?.tags ?? []),
  ].toSorted((a, b) => a.blockIndex - b.blockIndex);
}
