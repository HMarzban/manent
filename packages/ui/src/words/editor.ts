// The editor's words: element names and placeholders, the reasons a page command cannot run, the Layout group and the Export and Print forms.
import { formatCount } from "./format.ts";

export const EDITOR_WORDS = {
  elements: {
    scene_heading: "Scene Heading",
    action: "Action",
    character: "Character",
    parenthetical: "Parenthetical",
    dialogue: "Dialogue",
    transition: "Transition",
    shot: "Shot",
    general: "General",
    slug: "Slug",
    bracket: "Bracket",
    emote: "Emote",
    camera: "Camera",
    engine: "Engine Direction",
    chapter: "Chapter",
    body: "Body",
    quote: "Quote",
    break: "Break",
    group: "Section",
    page_break: "Page break",
    ink_line: "Ink line",
  },
  actBreaks: {
    new_act: "New Act",
    end_of_act: "End of Act",
    teaser: "Teaser",
    tag: "Tag scene",
  },
  stagePlay: { scene_heading: "Scene", action: "Stage direction" },
  // a podcast project's Variety script
  podcast: { slug: "Segment", bracket: "Cue" },
  placeholders: {
    scene_heading: "Scene heading — type INT. or EXT.",
    action: "Action · Tab for Character",
    character: "Character — type a name",
    parenthetical: "Parenthetical — how the line is said",
    dialogue: "Dialogue — what they say",
    transition: "Transition — for example CUT TO:",
    shot: "Shot — for example CLOSE ON",
    general: "General — text with no layout of its own",
    group: "Section — a name for a group of scenes; it never prints",
    slug: "Slug — name this part of the show",
    bracket: "Bracket — a direction; T=0:30 sets its time",
    emote: "Emote — how the character reacts",
    camera: "Camera — what the camera does",
    engine: "Engine direction — an instruction for the game",
    chapter: "Chapter — its title",
    body: "Body — the chapter's text",
    quote: "Quote — a passage set apart from the text",
    break: "Break — a pause between scenes in a chapter",
    ink_line: "Ink line — story text; * starts a choice, === a knot",
  },
  actBreakPlaceholders: {
    new_act: "New act — for example ACT TWO",
    end_of_act: "End of act — for example END OF ACT ONE",
    teaser: "Teaser — the scenes before Act One",
    tag: "Tag scene — the scene after the last act",
  },
  stagePlayPlaceholders: {
    scene_heading: "Scene — its number and where it happens",
    action: "Stage direction · Tab for Character",
  },
  podcastPlaceholders: {
    slug: "Segment — name this part of the episode",
    bracket: "Cue — music, sound or a direction; T=0:30 sets its time",
  },
  gameGeneralPlaceholder:
    "General — text, or * for a choice and - for a gather",
  picker: "Element",
  // Element ▾'s accessible name
  elementButton: (label: string) => `Element: ${label}`,
  reasons: {
    needsTwoSpeeches: "needs two speeches",
    notInFormat: (format: string) => `isn't part of the ${format} format`,
    readOnly: "isn't available on a read-only page",
  },
  offFontNote:
    "Outside the script font — page breaks near this text may differ and it will not print correctly.",
  // announced when the caret crosses a page start
  pageStart: (label: string) => `Page ${label}`,
  personArrived: (name: string) => `${name} arrived`,
  personLeft: (name: string) => `${name} left`,
  pastComfortLimit: (title: string) =>
    `'${title}' is longer than this device handles comfortably, so typing may slow down.`,
  splitIntoParts: "Split into parts",
  // Details → Selection → Layout
  layout: {
    group: "Layout",
    alignment: "Alignment",
    indent: "Indent",
    width: "Width",
    spaceBefore: "Space before",
    left: "Left",
    centre: "Centre",
    right: "Right",
    inches: (n: string) => `${n} in`,
    lines: (n: number) => (n === 1 ? "1 line" : `${n} lines`),
  },
  // the Export and Print forms
  send: {
    exportTitle: (files: number) =>
      files === 1 ? "Export 1 file" : `Export ${formatCount(files)} files`,
    printTitle: (pages: number) =>
      pages === 1 ? "Print 1 page" : `Print ${formatCount(pages)} pages`,
    // the title and the button while the page count is not known yet
    print: "Print",
    exporting: (files: number) =>
      files === 1
        ? "Exporting 1 file…"
        : `Exporting ${formatCount(files)} files…`,
    preparing: (pages: number) =>
      pages === 1
        ? "Preparing 1 page…"
        : `Preparing ${formatCount(pages)} pages…`,
    wholeScript: "Whole script",
    cleanPdf: "Clean PDF",
    morePages: (n: number) => `… ${formatCount(n)} more`,
    // the characters joined as names are
    outsideFont: (count: number, characters: string) =>
      count === 1
        ? `${characters} is outside the script font and prints as a box`
        : `${characters} are outside the script font and print as boxes`,
    exportFailed: (title: string) => `Couldn't export '${title}'. Try again.`,
    printFailed: (title: string) =>
      `Couldn't prepare '${title}' to print. Try again.`,
    exported: (title: string) => `Exported '${title}'.`,
    // beside the busy button after 2 s
    progress: (page: number, pages: number) =>
      `Page ${formatCount(page)} of ${formatCount(pages)}`,
  },
  // View ▾ → Zoom, and what is said when it changes
  zoom: {
    fitWidth: "Fit width",
    percent: (n: number) => `${n} %`,
    announce: (label: string) => `Zoom: ${label}`,
  },
} as const;
