// The Tour's Write scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario, TourWindow } from "../format.ts";

const EKBO = docPath("small/every-key-but-one/script");
const TWELVE_ON_FOOT = docPath("medium/game-samples/twelve-on-foot-1");
const KEEPERS_LOGBOOK = docPath("medium/game-samples/keepers-logbook");

/** A scenario's set-up in any shell: its first window, then `extraWindows`, after the preparation `prepare` when it is set. */
export const setupOf = (
  first: TourWindow,
  extraWindows: readonly TourWindow[] = [],
  prepare: string | null = null,
): TourScenario["setup"] => ({ ...first, extraWindows, prepare, shell: "any" });

export const WRITE: readonly TourScenario[] = [
  {
    id: "write-first-run",
    group: "Write",
    promise: "Start writing at once: no account, nothing to set up.",
    setup: setupOf({ userId: "you", open: "/" }, [], "you-first-run"),
    steps: [
      { text: "Type a scene heading: INT. KITCHEN - NIGHT", highlight: "page" },
      {
        text: "Your words are already saved in this browser.",
        highlight: "status:device",
      },
      {
        text: "Open the Sync centre and choose Sign in to sync.",
        highlight: "app.signInToSync",
      },
    ],
    check:
      'The status reads "Saved · Only in this browser — not backed up" until you sign in, then "Saved · Synced".',
    evidence: [
      "Saved · Only in this browser — not backed up",
      "Saved · Synced",
    ],
    fresh: true,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-true-pages",
    group: "Write",
    promise: "Write in true pages: what you see is what prints.",
    setup: setupOf({ userId: "sam", open: EKBO }),
    steps: [
      {
        text: "At the end of a speech press Enter, then type M: the names in this script are offered.",
        highlight: "page",
      },
      {
        text: "Press Tab for a line of dialogue, and Enter for the next element.",
        highlight: "page",
      },
      {
        text: "The readout says which page you are on, of how many.",
        highlight: "status:page",
      },
    ],
    check: 'Autocomplete offers MIRA; the readout reads "Page 1 of 99".',
    evidence: ["MIRA", "Page 1 of 99"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-more-contd",
    group: "Write",
    promise: "Pages break as you type, exactly where they will print.",
    setup: setupOf({ userId: "sam", open: EKBO }),
    steps: [
      {
        text: "Scroll until a speech runs over the foot of a page.",
        highlight: "page",
      },
      {
        text: "Type into that speech and watch the break move.",
        highlight: "page",
      },
    ],
    check:
      'The speech ends its page with "(MORE)" and goes on under "(CONT\'D)".',
    evidence: ["(MORE)", "(CONT'D)"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-format-switch",
    group: "Write",
    promise: "Change a script's format and every word stays as it was.",
    setup: setupOf({ userId: "sam", open: EKBO }, [], "ekbo-screenplay"),
    steps: [
      { text: "Open Script settings.", highlight: "doc.scriptSettings" },
      {
        text: "Set Format to Multi-camera: the pages take its layout.",
        highlight: "setting:script.format",
      },
      {
        text: "Set Format back to Screenplay.",
        highlight: "setting:script.format",
      },
    ],
    check:
      'Format reads "Multi-camera", then "Screenplay"; the text is unchanged.',
    evidence: ["Multi-camera", "Screenplay"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-manuscript",
    group: "Write",
    promise:
      "Write a book: chapters, first-line indents, each chapter on a new page.",
    setup: setupOf({ userId: "sam", open: docPath("small/jumpox/manuscript") }),
    steps: [
      { text: "Choose Left panel in View.", highlight: "view.leftPanel" },
      {
        text: "In a book the Scenes tab reads Chapters; choose one to go to it.",
        highlight: "tab:scenes",
      },
    ],
    check:
      'The tab reads "Chapters" and lists "Chapter One: The Box Nobody Wanted" first.',
    evidence: ["Chapters", "Chapter One: The Box Nobody Wanted"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-stage-play",
    group: "Write",
    promise:
      "Write a play: centred scenes, and stage directions whose brackets you never type.",
    setup: setupOf({
      userId: "sam",
      open: docPath("small/down-the-back/script"),
    }),
    steps: [
      {
        text: "Choose Left panel in View: the play's scenes are listed.",
        highlight: "view.leftPanel",
      },
      {
        text: "At the end of Scene 2 press Enter and type a stage direction, with no brackets.",
        highlight: "page",
      },
    ],
    check:
      'The layout draws the brackets; the list holds "Scene 1: Mallow Street" and "Scene 2: The Box" under "ACT ONE".',
    evidence: ["ACT ONE", "Scene 1: Mallow Street", "Scene 2: The Box"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-game-script",
    group: "Write",
    promise:
      "Write a game script: emotes, camera and engine lines beside the dialogue.",
    setup: setupOf({ userId: "sam", open: TWELVE_ON_FOOT }),
    steps: [
      {
        text: "Put the caret on the line PIKE: FLAT · CAL: STUNG.",
        highlight: "page",
      },
      {
        text: "The Element readout names what each line is.",
        highlight: "readout:element",
      },
    ],
    check:
      'Element reads "Emote" there, and "Camera" and "Engine Direction" on those lines.',
    evidence: ["Emote", "Camera", "Engine Direction"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-ruler",
    group: "Write",
    promise: "Set a speech's indent on the ruler, and the page follows.",
    setup: setupOf({
      userId: "sam",
      open: docPath("medium/harbour-lights/205"),
    }),
    steps: [
      { text: "Choose Ruler in View.", highlight: "view.ruler" },
      {
        text: "Put the caret in a line of dialogue and drag the ruler's left marker.",
        highlight: "ruler",
      },
      {
        text: "Open Details: Layout shows the indent you set.",
        highlight: "tab:details",
      },
    ],
    check:
      "The speech moves with the marker, and Details reads its new value under Layout, Indent.",
    evidence: ["Layout", "Indent"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-export",
    group: "Write",
    promise: "Export a PDF whose pages are the pages on screen.",
    setup: setupOf({ userId: "sam", open: EKBO }),
    steps: [
      { text: "Choose Export… in the title menu.", highlight: "doc.export" },
      { text: "Choose Export 1 file.", highlight: "send:confirm" },
    ],
    check:
      "The PDF downloads with the screen's 99 pages, and the message reads \"Exported 'Every Key But One'.\"",
    evidence: ["Exported 'Every Key But One'."],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "write-names",
    group: "Write",
    promise: "Names you use are checked as you type.",
    setup: setupOf({
      userId: "sam",
      open: docPath("medium/harbour-lights/205"),
    }),
    steps: [
      {
        text: "Go to scene 4, where the action names Marguerita.",
        highlight: "page",
      },
      {
        text: "Hold the pointer over the dotted underline.",
        highlight: "page",
      },
    ],
    check:
      '"Marguerita" is underlined with dots, and the underline offers "Marguerite".',
    evidence: ["Marguerite"],
    fresh: false,
    waitsFor: "names_and_facts",
    hidden: null,
  },
  {
    id: "write-podcast-timing",
    group: "Write",
    promise: "See a podcast's running time as you write it.",
    setup: setupOf({ userId: "sam", open: docPath("small/handed-in/ep4") }),
    steps: [
      { text: "Type a line of dialogue.", highlight: "page" },
      { text: "Read the running time as it grows.", highlight: "page" },
    ],
    check: 'The running time reads "14:10" of 20:00, and "Under 5:50".',
    evidence: ["14:10", "Under 5:50"],
    fresh: false,
    waitsFor: "variety_timing",
    hidden: null,
  },
  {
    id: "write-outline",
    group: "Write",
    promise: "Turn an outline into scene headings in one step.",
    setup: setupOf({
      userId: "dana",
      open: docPath("medium/harbour-lights/206"),
    }),
    steps: [
      { text: "Open the outline beside the script.", highlight: "page" },
      { text: "Choose Start script from outline.", highlight: "page" },
    ],
    check:
      '"Start script from outline" makes 31 scene headings, each with its synopsis.',
    evidence: ["Start script from outline"],
    fresh: false,
    waitsFor: "outline_to_script",
    hidden: null,
  },
  {
    id: "write-alternates",
    group: "Write",
    promise: "Keep other ways to say a line, and cuts you may want back.",
    setup: setupOf({
      userId: "sam",
      open: docPath("medium/the-late-desk/monologue"),
    }),
    steps: [
      {
        text: "Put the caret in a line that has alternates, and swap one in.",
        highlight: "page",
      },
      { text: "Bring a cut back from the left panel.", highlight: "page" },
    ],
    check:
      'An alternate takes the line\'s place, a cut comes back from "Cuts", and the timing changes.',
    evidence: ["Cuts"],
    fresh: false,
    waitsFor: "alternates_and_cuts",
    hidden: null,
  },
  {
    id: "write-game-lines",
    group: "Write",
    promise:
      "A game script's branching lines, coloured and exported with their IDs.",
    setup: setupOf({ userId: "sam", open: TWELVE_ON_FOOT }),
    steps: [
      {
        text: "Go to scene 4: its choices are coloured and nested.",
        highlight: "page",
      },
      { text: "Export the script's line data.", highlight: "page" },
    ],
    check:
      'The choices are coloured and nested by their markers, and the line data gives each line its "kind" and "depth".',
    evidence: ["kind", "depth"],
    fresh: false,
    waitsFor: "game_lines",
    hidden: null,
  },
  {
    id: "write-ink-play",
    group: "Write",
    promise:
      "Play an Ink story beside its source, and watch it follow your edits.",
    setup: setupOf({ userId: "sam", open: KEEPERS_LOGBOOK }),
    steps: [
      {
        text: "Play the story beside its source and choose Ask about the storm.",
        highlight: "page",
      },
      {
        text: "Change Four hours to Five hours on line 24.",
        highlight: "page",
      },
    ],
    check:
      'The state reads "Compiling…", then "Up to date", and the player replays both choices with the new line.',
    evidence: ["Compiling…", "Up to date"],
    fresh: false,
    waitsFor: "ink_player",
    hidden: null,
  },
  {
    id: "write-ink-problem",
    group: "Write",
    promise:
      "A mistake in an Ink story is marked on its line, and the story keeps playing.",
    setup: setupOf({ userId: "sam", open: KEEPERS_LOGBOOK }),
    steps: [
      { text: "Change -> dark on line 56 to -> cottage.", highlight: "page" },
      { text: "Undo the change.", highlight: "page" },
    ],
    check:
      'The line is marked, the state reads "1 problem", and the player keeps playing, marked "Playing the last version that compiled".',
    evidence: ["1 problem", "Playing the last version that compiled"],
    fresh: false,
    waitsFor: "ink_player",
    hidden: null,
  },
  {
    id: "write-adapt",
    group: "Write",
    promise: "Adapt a book as a stage play, with the book open beside it.",
    setup: setupOf({
      userId: "sam",
      open: docPath("small/down-the-back/script"),
    }),
    steps: [
      {
        text: "Open Jumpox — Spark & Looki beside the play.",
        highlight: "page",
      },
      { text: "Move the caret to Act One, scene 4.", highlight: "page" },
    ],
    check:
      'Chapter 6 of the book opens beside the play when the caret reaches "Mrs. Lomax\'s Spectacles".',
    evidence: ["Mrs. Lomax's Spectacles"],
    fresh: false,
    waitsFor: "start_from",
    hidden: null,
  },
];
