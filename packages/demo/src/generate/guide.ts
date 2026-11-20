// The shape of a project's style guide and phrase bank, and the error a seed build stops with.
import type { FormatId } from "@manent/schema";

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
