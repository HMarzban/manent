// The shape of a project's style guide and phrase bank, what a document takes from one, and the error a seed
// build stops with.
import { FORMAT_ELEMENTS } from "@manent/schema";
import type { BlockType, FormatId } from "@manent/schema";
import type { WriterLine } from "../writers/region.ts";

export type LineIntent = "ask" | "answer" | "instruct" | "state";

export interface DialogueEntry {
  /** null: any of the beat's cast may speak it. */
  speaker: string | null;
  intent: LineIntent;
  text: string;
}

/** A stretch of one document; `scenes` and `pages` are inclusive [first, last]. */
export interface Beat {
  /** `<document key>#<n>`, n counting from 1 within that document. */
  id: string;
  scenes: readonly [number, number];
  pages: readonly [number, number];
  /** In capitals, as the heading prints it. */
  timeOfDay: string;
  places: readonly string[];
  cast: readonly string[];
  summary: string;
}

/** The most words in one entry of each kind, and the voice's "never" list as patterns. */
export interface StyleRules {
  actionWords: number;
  dialogueWords: number;
  sentenceWords: number;
  banned: readonly RegExp[];
}

export interface StyleGuide {
  project: string;
  format: FormatId;
  /** `cue` is the character line exactly; `name` is the full name as action writes it. */
  cast: readonly { cue: string; name: string }[];
  /** As a scene heading names them, in capitals with their prefix. */
  places: readonly string[];
  /** Every other capitalised word an entry may hold: props, ships, streets, institutions. */
  names: readonly string[];
  vocabulary: readonly string[];
  beats: readonly Beat[];
  style: StyleRules;
  /** Hand-written action fragments, each a whole sentence. */
  action: readonly string[];
  dialogue: readonly DialogueEntry[];
  /** Short spoken clauses a line may end with; at most one line in three carries one. */
  tags: readonly string[];
  /** Variety and news only, else empty: one hand-written script per row, not composed. */
  stories: readonly VarietyStory[];
  /** The game's barks only, else empty; a `gated` bark plays only once `{finn_found}` is set. */
  barks: readonly { text: string; gated: boolean }[];
}

/** One row's script; `slug` is its document's key suffix in the catalogue. */
export interface VarietyStory {
  slug: string;
  /** The row's running time. */
  durMs: number;
  lines: readonly DialogueEntry[];
  /** Each written `T=m:ss <what>`; its seconds count toward the story's running time. */
  brackets: readonly string[];
}

/** Whether `guide`'s beats write the document whose catalogue key is `key`, or a document under it. */
export function isGuideOf(guide: StyleGuide, key: string): boolean {
  return guide.beats.some(
    (beat) => beat.id.startsWith(`${key}#`) || beat.id.startsWith(`${key}/`),
  );
}

/** The element each format writes a guide's action in. */
const ACTION_ELEMENTS: Readonly<Record<FormatId, BlockType>> = {
  screenplay: "action",
  multicam: "action",
  animation: "action",
  variety: "general",
  game: "action",
  ink: "ink_line",
  manuscript: "body",
  stage_play: "action",
};

/** `text` said by `cue` as `format` writes it: under the cue, or as `CUE: text` in a format that has no cues. */
export function speechOf(
  format: FormatId,
  cue: string,
  text: string,
): WriterLine {
  return FORMAT_ELEMENTS[format].includes("character")
    ? [
        { element: "character", text: cue },
        { element: "dialogue", text },
      ]
    : [{ element: ACTION_ELEMENTS[format], text: `${cue}: ${text}` }];
}

/** The first of each of `lists`, then the second of each, and so on until every one is used. */
const inTurn = <T>(lists: readonly (readonly T[])[]): T[] =>
  Array.from({ length: Math.max(0, ...lists.map((l) => l.length)) }, (_, i) =>
    lists.flatMap((list) => list.slice(i, i + 1)),
  ).flat();

/**
 * The hand-written lines of the first of `guides` that writes the document, else of the first that writes
 * another document of its project, as the document's format writes them: an action, then a speech of each
 * speaker in turn, and again, so that a writer's lines read as a scene. A speech any of the cast may say
 * goes to the cast of the guide's beats in turn, those in the room before a voice from elsewhere
 * ("GIL (V.O.)"). Null when no guide writes the project.
 */
export function guideLines(
  guides: readonly StyleGuide[],
  doc: { key: string; projectKey: string; format: FormatId },
): WriterLine[] | null {
  const guide =
    guides.find((g) => isGuideOf(g, doc.key)) ??
    guides.find((g) => isGuideOf(g, doc.projectKey));
  if (guide === undefined) return null;
  const cast = [...new Set(guide.beats.flatMap((beat) => beat.cast))];
  const inRoom = cast.filter((cue) => !cue.includes("("));
  const cues = inRoom.length > 0 ? inRoom : cast;
  const element = ACTION_ELEMENTS[doc.format];
  const said = guide.dialogue.flatMap((entry, i) => {
    const cue = entry.speaker ?? cues[i % cues.length];
    return cue === undefined ? [] : [{ cue, text: entry.text }];
  });
  const speakers = [...new Set(said.map((speech) => speech.cue))];
  return inTurn<WriterLine>([
    guide.action.map((text) => [{ element, text }]),
    ...speakers.map((cue) =>
      said
        .filter((speech) => speech.cue === cue)
        .map(({ text }) => speechOf(doc.format, cue, text)),
    ),
  ]);
}

export interface ProseGuide {
  project: string;
  names: readonly string[];
  style: StyleRules;
  /** `tags`: the places and threads the chapter visits. */
  chapters: readonly {
    number: number;
    title: string;
    beats: readonly string[];
    ledger: string;
    tags: readonly string[];
  }[];
  /** Each tagged by character, place and thread. */
  sentences: readonly { text: string; tags: readonly string[] }[];
}

export interface GeneratedIssue {
  code:
    | "repeated_sentence"
    | "repeated_dialogue"
    | "unknown_speaker"
    | "unknown_place"
    | "filler"
    | "unanswered";
  blockIndex: number;
}

/** `where` is the project's title, then ": " and the detail when there is one ("The Long Night: pages 9-14"). */
export class SeedBuildError extends Error {
  readonly code: "generator_exhausted" | "unfit" | "rules_broken";
  readonly where: string;

  constructor(code: SeedBuildError["code"], where: string) {
    super(`${code} in ${where}`);
    this.name = "SeedBuildError";
    this.code = code;
    this.where = where;
  }
}
