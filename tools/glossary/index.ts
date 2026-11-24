// The interface vocabulary as data: every listed term with the words it is never called, and its feature.
// It holds words only; what a word means is not written here.
import { DEMO_PEOPLE } from "@manent/demo";
import { ANNOTATION_TERMS } from "./annotations.ts";
import { DEMO_TERMS } from "./demo.ts";
import { DOCUMENT_TERMS } from "./documents.ts";
import { HISTORY_TERMS } from "./history.ts";
import { PEOPLE_TERMS } from "./people.ts";
import { PLACE_TERMS } from "./places.ts";
import { PREFERENCE_TERMS } from "./preferences.ts";
import { PRODUCTION_TERMS } from "./production.ts";
import { RUNDOWN_TERMS } from "./rundown.ts";
import { SAVING_TERMS } from "./saving.ts";
import { SURFACE_TERMS } from "./surfaces.ts";

export const FEATURES = [
  "formats",
  "writing",
  "pages",
  "saving",
  "history",
  "production",
  "series",
  "sharing",
  "rundown",
  "games",
  "files",
  "workspaces",
  "demo",
] as const;
export type Feature = (typeof FEATURES)[number];

/** One word of the interface. `neverCalled` are words the interface never uses for it; `paletteOnly` are words the palette accepts for it and the interface never shows, which are never banned. */
export interface Term {
  term: string;
  neverCalled: readonly string[];
  paletteOnly: readonly string[];
  feature: Feature;
}

/** A list written as its entries separated by commas. */
export const listOf = (text: string): readonly string[] =>
  Object.freeze(text.trim().split(/\s*,\s*/));

export const TERMS: readonly Term[] = Object.freeze([
  ...PLACE_TERMS,
  ...DOCUMENT_TERMS,
  ...ANNOTATION_TERMS,
  ...HISTORY_TERMS,
  ...PRODUCTION_TERMS,
  ...SAVING_TERMS,
  ...PEOPLE_TERMS,
  ...SURFACE_TERMS,
  ...RUNDOWN_TERMS,
  ...PREFERENCE_TERMS,
  ...DEMO_TERMS,
]);

/** Names the interface may hold as they are: element names, revision colour names, the writer's colour names, the demo people's names and "Manent". */
export const NAMES: readonly string[] = Object.freeze([
  ...listOf(`
    Scene Heading, Action, Character, Parenthetical, Dialogue, Transition,
    Shot, General, New Act, End of Act, Teaser, Tag scene, Slug, Bracket,
    Cue, Emote, Camera, Engine Direction, Body, Quote, Break, Ink line,
    White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, Tan,
    Red, Orange, Violet
  `),
  ...DEMO_PEOPLE.map((person) => person.name),
  "Manent",
  "US Letter",
  "A4",
  "A12",
  "Courier Prime",
  "Final Draft",
  "Word",
]);

/** Words of the interface that name a part of Manent and are not yet listed terms; allowed until they are listed. */
export const PENDING_TERMS: readonly string[] = listOf(`
  access, align, all-caps, animation, announce, appearance, author, avatars, bold, canary,
  collated, cont'd, continued, continueds, dark, desk, desktop, docx, driving, editors, elsewhere,
  exported, exporting, fdx, font, fountain, help, highlight, interface, italic, keyboard, kind, light, manuscript,
  margin, mores, multi-camera, paper, pdf, picker, probe, reconnect, redo, rename, same-speaker, screenplay, setup,
  size, spelling, stable, strikethrough, syncing, tabs, underline, undo, variety
`);

export const ENGINEERING_WORDS: readonly string[] = Object.freeze([
  "generation",
  "rebuild",
  "conflict",
  "error",
  "failed",
]);

/** Sentences the interface shows word for word although they hold a never-called word; `{…}` is any value. */
export const BANNED_WORD_EXCEPTION: readonly string[] = Object.freeze([
  "Only in this browser — not backed up",
  "This script is only on this device, so it is not backed up and you cannot open it anywhere else. Sign in to sync it.",
  "This script is only in this browser, so it is not backed up and you cannot open it anywhere else. Sign in to sync it.",
  "Writing as suggestions — others accept or decline",
  "Manent could not accept this device's changes. They are saved as 'Recovered — this device'.",
  "Manent could not accept some changes from this device. They are saved as 'Recovered — this device' and the rest were re-applied.",
  "This has already been done in this demo. Reset the demo to do it again.",
  "This one needs the desktop app. Run make desktop, then open the Tour there.",
  "The demo is not running. Run make demo again.",
  "Couldn't get ready. Run make reset to try again.",
  "Nothing to set. Manent updates once every Manent tab has been closed.",
  "Nothing to set. Manent is in English in this release; spelling follows your system's language.",
  "Get the latest Manent",
  "Page numbers came in locked: pages start where Final Draft started them, not where Manent would.",
  "Cast list",
  "Paragraph settings",
  "To pick up an item, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, and Esc to put it back.",
  "No acts: scenes run straight through.",
  "+1 viewer",
  "1 viewer",
]);

/** The four sentences allowed to say "not sent", for changes that will never reach the server; `{…}` is any value. */
export const NOT_SENT_EXCEPTION: readonly string[] = Object.freeze([
  "Access removed, {n} not sent",
  "Deleted, {n} not sent",
  "You no longer have access to '{title}'. Your {n} changes that were not sent are kept on this device.",
  "'{title}' was deleted by {name} on {date}. Your {n} changes that were not sent are kept on this device.",
]);
