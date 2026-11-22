import { expect, test } from "bun:test";
import { EDITOR_WORDS, messageFor } from "../src/index.ts";

/** The words with every function replaced by what it says for 1 and for 2 (with 12 as any second argument). */
function spoken(value: unknown): unknown {
  if (typeof value === "function")
    return [1, 2].map((n) => Reflect.apply(value, null, [n, 12]));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [key, spoken(inner)]),
  );
}

test("the editor's words are these, exactly", () => {
  expect(spoken(EDITOR_WORDS)).toEqual({
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
    elementButton: ["Element: 1", "Element: 2"],
    reasons: {
      needsTwoSpeeches: "needs two speeches",
      notInFormat: ["isn't part of the 1 format", "isn't part of the 2 format"],
      readOnly: "isn't available on a read-only page",
    },
    offFontNote:
      "Outside the script font — page breaks near this text may differ and it will not print correctly.",
    pageStart: ["Page 1", "Page 2"],
    personArrived: ["1 arrived", "2 arrived"],
    personLeft: ["1 left", "2 left"],
    pastComfortLimit: [
      "'1' is longer than this device handles comfortably, so typing may slow down.",
      "'2' is longer than this device handles comfortably, so typing may slow down.",
    ],
    splitIntoParts: "Split into parts",
    layout: {
      group: "Layout",
      alignment: "Alignment",
      indent: "Indent",
      width: "Width",
      spaceBefore: "Space before",
      left: "Left",
      centre: "Centre",
      right: "Right",
      inches: ["1 in", "2 in"],
      lines: ["1 line", "2 lines"],
    },
    send: {
      exportTitle: ["Export 1 file", "Export 2 files"],
      printTitle: ["Print 1 page", "Print 2 pages"],
      print: "Print",
      exporting: ["Exporting 1 file…", "Exporting 2 files…"],
      preparing: ["Preparing 1 page…", "Preparing 2 pages…"],
      wholeScript: "Whole script",
      cleanPdf: "Clean PDF",
      morePages: ["… 1 more", "… 2 more"],
      outsideFont: [
        "12 is outside the script font and prints as a box",
        "12 are outside the script font and print as boxes",
      ],
      exportFailed: [
        "Couldn't export '1'. Try again.",
        "Couldn't export '2'. Try again.",
      ],
      printFailed: [
        "Couldn't prepare '1' to print. Try again.",
        "Couldn't prepare '2' to print. Try again.",
      ],
      exported: ["Exported '1'.", "Exported '2'."],
      progress: ["Page 1 of 12", "Page 2 of 12"],
    },
    zoom: {
      fitWidth: "Fit width",
      percent: ["1\u00a0%", "2\u00a0%"],
      announce: ["Zoom: 1", "Zoom: 2"],
    },
  });
});

test("zoom is said as its palette row reads", () => {
  expect([
    EDITOR_WORDS.zoom.percent(125),
    EDITOR_WORDS.zoom.announce("125\u00a0%"),
    EDITOR_WORDS.zoom.announce("Fit width"),
  ]).toEqual(["125\u00a0%", "Zoom: 125\u00a0%", "Zoom: Fit width"]);
});

test("the comfort notice names the script and what to expect", () => {
  expect(
    messageFor({
      kind: "past_comfort_limit",
      title: "The Keeper of the Last Bell: The Complete Manuscript",
    }),
  ).toMatchObject({
    text: "'The Keeper of the Last Bell: The Complete Manuscript' is longer than this device handles comfortably, so typing may slow down.",
    actions: [{ label: "Split into parts", commandId: "doc.splitIntoParts" }],
    lifetime: "until_dismissed",
    ownWork: false,
  });
});
