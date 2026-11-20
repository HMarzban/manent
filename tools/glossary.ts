// The interface vocabulary as data: every listed term with the words it is never called, and its feature.
// It holds words only; what a word means is not written here.
import { DEMO_PEOPLE } from "@manent/demo";

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

/** One `Term` per word of a row, all sharing the row's never-called words and feature. */
const row = (
  feature: Feature,
  words: readonly string[],
  neverCalled: readonly string[],
  paletteOnly: readonly string[] = [],
): Term[] => words.map((term) => ({ term, neverCalled, paletteOnly, feature }));

/** A list written as its entries separated by commas. */
const listOf = (text: string): readonly string[] =>
  Object.freeze(text.trim().split(/\s*,\s*/));

export const TERMS: readonly Term[] = Object.freeze([
  // Places and containers
  ...row("workspaces", ["Library"], ["home", "dashboard"]),
  ...row("workspaces", ["Workspace"], ["organisation", "account"]),
  ...row("workspaces", ["Project"], ["title", "show"]),
  ...row(
    "formats",
    ["Film", "Series", "Show", "News", "Podcast", "Book", "Game", "Stage play"],
    ["show"],
  ),
  ...row("series", ["Season", "Episode"], []),
  ...row("series", ["Due"], ["deadline"]),
  ...row("workspaces", ["Folder"], ["private area"]),
  ...row("workspaces", ["Favourite"], ["bookmark"]),
  ...row("workspaces", ["Continue"], ["recents"]),
  ...row("workspaces", ["Trash"], ["bin", "archive"]),
  ...row("sharing", ["People"], ["members", "team"]),
  // Documents and formats
  ...row("formats", ["Document"], []),
  ...row("formats", ["Script"], []),
  ...row("rundown", ["Segment", "Story"], ["item", "piece"]),
  ...row("formats", ["Outline"], ["treatment"]),
  ...row("rundown", ["Rundown"], ["running order"]),
  ...row("series", ["Room log"], ["room notes"]),
  ...row("series", ["Board"], ["season board", "whiteboard"]),
  ...row("writing", ["Card", "Cards"], ["cards view", "corkboard"]),
  ...row("formats", ["Format"], ["template"]),
  ...row("formats", ["Template"], ["show format", "preset"]),
  ...row("writing", ["Element"], ["block type"], ["line type"]),
  ...row("writing", ["Section"], []),
  ...row(
    "writing",
    ["Scene", "Page", "Chapter", "Title page", "Dual dialogue", "Page break"],
    [],
  ),
  ...row("writing", ["Act"], []),
  ...row("formats", ["Stage direction"], ["action"]),
  ...row("formats", ["Cast of characters"], ["dramatis personae", "cast list"]),
  ...row("formats", ["Start a stage play from this…"], ["adapt", "convert"]),
  ...row("pages", ["Page label"], []),
  ...row("writing", ["Synopsis"], ["logline"]),
  ...row("pages", ["Layout engine"], ["pagination engine"]),
  ...row("games", ["Play"], ["run"]),
  ...row("games", ["Player"], ["preview"]),
  ...row("games", ["Play from here"], []),
  ...row("games", ["Passage"], ["paragraph", "node"]),
  ...row("games", ["Choice"], ["option", "branch"]),
  ...row("games", ["Gather"], []),
  ...row("games", ["Knot", "Stitch"], []),
  ...row("games", ["Variables"], ["state"]),
  // Annotations and things to settle
  ...row("saving", ["Note"], ["inline note", "script note"]),
  ...row("saving", ["Comment"], ["feedback"]),
  ...row("series", ["Round"], ["notes round"]),
  ...row("saving", ["Open", "Resolved"], ["closed", "done"]),
  ...row("saving", ["Text removed"], ["orphaned"]),
  ...row("saving", ["Overlap"], ["conflict"]),
  ...row("saving", ["To review"], []),
  ...row("saving", ["Recovered"], ["lost"]),
  ...row(
    "saving",
    ["Use mine", "Use Dana's", "Keep as merged", "Use this"],
    ["accept", "reject", "theirs"],
  ),
  ...row("saving", ["Use the other wording"], ["accept", "reject", "theirs"]),
  ...row("saving", ["Suggestion"], ["tracked change"]),
  ...row("writing", ["Alternate"], ["alt", "variant"]),
  ...row("series", ["Pitch"], []),
  ...row("writing", ["Cut"], ["cuts drawer"]),
  ...row("series", ["Names and facts"], [], ["bible", "shared lists"]),
  ...row("series", ["Fact", "Pin"], ["bible entry"]),
  ...row("series", ["Check", "Flag"], ["warning", "error"], ["proof"]),
  ...row("production", ["Consolidate"], []),
  ...row("writing", ["Merge"], []),
  ...row("series", ["Tag"], ["label"]),
  // History
  ...row("history", ["Version"], [], ["snapshot", "backup"]),
  ...row("history", ["Draft"], ["named version", "sent draft", "my draft"]),
  ...row("history", ["Working"], ["current", "latest"]),
  ...row("series", ["Ladder", "Stage"], ["draft rail"]),
  ...row(
    "history",
    ["History"],
    [],
    ["version history", "timeline", "time machine"],
  ),
  ...row("history", ["Changes since"], [], ["compare", "diff", "what's new"]),
  ...row("series", ["Changed since you opened"], ["updated"]),
  ...row("history", ["Filter"], []),
  ...row("saving", ["Change"], ["edit", "update"]),
  ...row("history", ["Restore"], ["revert", "roll back"]),
  ...row("history", ["Duplicate"], ["make a copy"]),
  // Production
  ...row("production", ["Lock for production"], ["lock script"]),
  ...row(
    "production",
    ["Page numbers locked", "Scene numbers locked"],
    ["locked pages", "locked script"],
  ),
  ...row("production", ["Lock A-pages"], ["second lock level"]),
  ...row("production", ["Frozen"], []),
  ...row("production", ["Revision"], ["revision set"]),
  ...row("production", ["Issue", "Recall"], ["publish"]),
  ...row("production", ["Revision marks", "Asterisk"], ["star", "starred"]),
  ...row("production", ["Colour revised pages"], ["full-page tint"]),
  ...row("production", ["Tint revised pages in the file"], []),
  ...row("production", ["Mark revised", "Clear revised"], []),
  ...row(
    "production",
    [
      "Colour order",
      "Numbering scheme",
      "Revised page",
      "A-page",
      "Omitted",
      "Memo",
      "Packet",
      "Sides",
      "Eighths",
      "Renumber",
      "Full draft",
      "End production",
      "Unlock",
    ],
    [],
  ),
  // Saving and syncing
  ...row("saving", ["Status"], ["state", "stage"]),
  ...row("saving", ["Server"], ["cloud", "backend"]),
  ...row("saving", ["Saved"], []),
  ...row("saving", ["Synced"], ["backed up"]),
  ...row("saving", ["Offline", "waiting"], ["pending", "queued"]),
  ...row("saving", ["Sync centre"], []),
  ...row("saving", ["Receipt"], ["log"]),
  ...row(
    "saving",
    ["On this device only", "Only in this browser", "Not on this device"],
    ["local"],
  ),
  // People and access
  ...row(
    "sharing",
    ["Owner", "Can edit", "Can comment", "Can view"],
    ["admin"],
  ),
  ...row("sharing", ["Can also"], ["a fifth role", "per-feature permission"]),
  ...row("sharing", ["Group"], ["distribution group", "show group"]),
  ...row("sharing", ["Share"], ["invite"]),
  ...row("history", ["Send"], ["publish", "release"]),
  ...row(
    "sharing",
    ["Link", "Draft link", "prompter link"],
    ["deep link", "reader link", "invitation"],
  ),
  ...row("sharing", ["Reader"], ["viewer"]),
  ...row(
    "sharing",
    ["Watermark", "Sent and opened"],
    ["send log", "access log"],
  ),
  ...row("series", ["Writer"], ["scene owner"]),
  ...row("series", ["Driver", "Take keys"], ["presenter"]),
  ...row("saving", ["Follow", "Following"], []),
  ...row("saving", ["Cursor"], ["remote caret", "pointer", "name flag"]),
  ...row("workspaces", ["Account"], ["login"]),
  ...row("sharing", ["View only", "Read-only"], []),
  // Surfaces and modes
  ...row(
    "writing",
    ["Screen", "Panel", "Bar", "Dialog", "Popover"],
    [
      "view",
      "drawer",
      "rail",
      "pill",
      "banner",
      "strip",
      "frame",
      "toast",
      "modal",
      "popup",
    ],
  ),
  ...row("writing", ["Left panel", "Side panel"], ["sidebar", "right panel"]),
  ...row("formats", ["Beside"], ["split editor"]),
  ...row("writing", ["Details"], ["inspector"], ["statistics"]),
  ...row("writing", ["Numbers"], ["stats"]),
  ...row("writing", ["Reports"], []),
  ...row(
    "writing",
    ["Title bar", "State bar", "Status bar", "Find bar", "Ruler", "Demo bar"],
    ["revision bar", "toolbar"],
  ),
  ...row("writing", ["State"], []),
  ...row("writing", ["Message slot"], ["status line", "notification"]),
  ...row("writing", ["Selection toolbar"], []),
  ...row(
    "writing",
    ["Layout", "Alignment", "Indent", "Width", "Space before"],
    [],
  ),
  ...row("writing", ["Row menu"], ["context menu"]),
  ...row("writing", ["Commands"], ["compact menu"]),
  ...row("writing", ["Title ▾", "View ▾", "person menu"], ["avatar menu"]),
  ...row("series", ["Present"], ["room view", "prompter view"]),
  ...row(
    "saving",
    ["Writing", "For everyone", "As suggestions", "Privately"],
    ["suggesting toggle", "private pass"],
    ["my draft", "suggest"],
  ),
  ...row("series", ["Hand in"], ["submit"]),
  ...row("pages", ["Page view", "Reflow view"], ["pageless"]),
  ...row("writing", ["Zoom", "Fit width"], ["magnification"]),
  ...row("writing", ["Focus mode", "Typewriter scrolling"], ["zen"]),
  ...row("history", ["Viewing a version"], ["preview"]),
  ...row("writing", ["Read aloud"], ["listen"]),
  ...row("writing", ["Goal", "Sprint"], ["streak"]),
  // Rundown, prompter and output
  ...row("rundown", ["Air", "Target", "Over", "Under"], []),
  ...row(
    "rundown",
    ["Dur", "Cume", "Start", "Back"],
    ["front time", "back time"],
  ),
  ...row("rundown", ["Columns"], ["fields"]),
  ...row("rundown", ["Air window"], []),
  ...row("rundown", ["On prompter", "Changed — not on prompter"], ["dirty"]),
  ...row("rundown", ["Send previous"], []),
  ...row("rundown", ["Live", "Feed lost"], ["connected"]),
  ...row("files", ["Export", "File", "File type"], ["download", "save as"]),
  ...row("files", ["Part", "Split into parts"], ["volume"]),
  ...row("pages", ["Print"], []),
  ...row("history", ["The pages as they will go"], ["proof"]),
  ...row("files", ["Import"], ["open"]),
  // Preferences and settings
  ...row("writing", ["Preference"], [], ["setting", "option", "config"]),
  ...row("writing", ["Preferences"], ["settings", "options"]),
  ...row("writing", ["Yours"], ["global", "account-wide"]),
  ...row("writing", ["This device", "This browser"], ["machine"]),
  ...row("writing", ["Script settings"], ["page preferences"]),
  ...row("formats", ["Project settings"], ["show template", "show style"]),
  ...row("workspaces", ["Workspace settings"], []),
  ...row("workspaces", ["Notifications"], ["alerts"]),
  ...row("writing", ["Set by you", "Set by Sam"], ["modified", "customised"]),
  ...row("writing", ["Default", "Reset"], ["factory", "revert"]),
  ...row("workspaces", ["Edit", "Update"], []),
  ...row("workspaces", ["AI pledge"], []),
  ...row("writing", ["System"], ["auto"]),
  ...row("writing", ["Theme"], [], ["night mode"]),
  ...row("writing", ["Shortcut"], ["hotkey", "keybinding"]),
  ...row("writing", ["Motion", "Contrast"], []),
  ...row("writing", ["Fixed"], []),
  // The demo's own words
  ...row(
    "demo",
    [
      "Choose who you are",
      "Chosen",
      "Demo bar",
      "Person",
      "Connection",
      "Online",
      "Slow",
      "Add writers",
      "Stop writers",
      "Stop the server",
      "Timings",
      "samples",
      "Reorganise",
      "Reset",
      "Tour",
      "Set it up",
      "What to check",
    ],
    [],
  ),
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
  "Courier Prime",
]);

/** Words that name no part, state or action of Manent: verbs, adjectives, function words and ordinary nouns. A word joins only in a reviewed change that says why it is not a term. */
export const PLAIN_WORDS: readonly string[] = listOf(`
  about, accepts, affect, after, again, ago, agreed, all, already, always, am, an, another, any,
  anyone, anyway, anywhere, apart, apostrophes, app, appear, applied, applies, apr, around, arrived,
  arriving, ask, at, aug, automatically, available, away, be, because, been, between, both, box, build,
  can't, cancel, cancels, cannot, capitals, changing, checking, clean, cleared, close, closing, comfortably,
  controls, copy, correctly, could, couldn't, created, data, date, day, dec, decline, deleted,
  differ, different, dismiss, do, down, each, edited, else, english, every, everything, example,
  existed, ext, features, feb, flow, fri, generates, getting, handles, happens, has, have, height,
  hidden, hide, how, hr, industry, installs, instruction, int, is, isn't, issued, itself, jan, jul,
  jun, just, kept, key, keystroke, language, last, later, leave, leaving, letters, linux, list,
  load, longer, look, made, make, mar, match, matches, may, mentions, min, missed, misspellings,
  mon, more, move, music, name, near, nearly, needs, never, newer, newscast, next, no, none,
  nothing, nov, now, number, oct, off, offered, older, once, one, opening, or, other, others, out,
  outside, own, paste, pause, pick, placed, prepare, preparing, press, pressing, put, re-applied, reach,
  reached, reacts, reading, ready, reduced, region, reload, reloading, removes, reorganised,
  request, resize, rest, right, running, runs, said, same, sat, save, say, says, sc, search, see,
  sees, sep, showing, sign, signed, slow, so, some, sound, speeches, standard, started, starting,
  stay, still, stopped, stored, style, summaries, sun, switch, terminal, than, that, their, them,
  then, there, these, thu, train, try, tue, turn, two, typing, unaffected, underlines, untitled,
  usage, used, voiceover, was, web, wed, were, whatever, when, where, which, while, whole, with, without,
  work, works, would, write, yet, your
`);

/** Words of the interface that name a part of Manent and are not yet listed terms; allowed until they are listed. */
export const PENDING_TERMS: readonly string[] = listOf(`
  access, align, all-caps, animation, announce, appearance, avatars, bold, canary, channel,
  collated, cont'd, continued, continueds, dark, desk, desktop, driving, editors, elsewhere,
  exported, exporting, font, help, highlight, interface, italic, keyboard, kind, light, manuscript,
  margin, mores, multi-camera, paper, pdf, picker, redo, rename, same-speaker, screenplay, setup,
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
  "Nothing to set. Manent updates once every Manent tab has been closed.",
  "Nothing to set. Manent is in English in this release; spelling follows your system's language.",
]);

/** The four sentences allowed to say "not sent", for changes that will never reach the server; `{…}` is any value. */
export const NOT_SENT_EXCEPTION: readonly string[] = Object.freeze([
  "Access removed, {n} not sent",
  "Deleted, {n} not sent",
  "You no longer have access to '{title}'. Your {n} changes that were not sent are kept on this device.",
  "'{title}' was deleted by {name} on {date}. Your {n} changes that were not sent are kept on this device.",
]);
