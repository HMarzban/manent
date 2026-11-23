// What each Fountain fixture reads to, written out by hand.
import type { BlockJSON, TextAnchor, TextJSON } from "@manent/schema";
import type { ImportedScript, KeptItem } from "../src/index.ts";

const id = (n: number): string => `blk_${String(n).padStart(12, "0")}`;

const text = (value: string, ...marks: string[]): TextJSON =>
  marks.length === 0
    ? { type: "text", text: value }
    : { type: "text", text: value, marks: marks.map((type) => ({ type })) };

/** A block as a reader gives it: every attribute that is not null, defaults included. */
function block(
  n: number,
  type: string,
  content: string | TextJSON[],
  attrs: Record<string, unknown> = {},
): BlockJSON {
  const runs =
    typeof content === "string"
      ? content === ""
        ? []
        : [text(content)]
      : content;
  return {
    type: "block",
    attrs: {
      id: id(n),
      type,
      omitted: false,
      synopsis: "",
      noContd: false,
      noTiming: false,
      ...attrs,
    },
    ...(runs.length === 0 ? {} : { content: runs }),
  };
}

const note = (n: number, value: string, anchor: TextAnchor) => ({
  id: `n${n}`,
  note: { v: 1 as const, anchor, text: value, writerName: null, at: null },
});

const kept = (
  n: number,
  kind: KeptItem["kind"],
  of: number | null,
  name: string,
  value: string,
): KeptItem => ({
  id: `k${n}`,
  kind,
  from: "fountain",
  of: of === null ? null : id(of),
  name,
  value,
});

const script = (
  title: string | null,
  blocks: BlockJSON[],
  notes: ImportedScript["notes"],
  items: KeptItem[],
): ImportedScript => ({
  from: "fountain",
  title,
  paper: null,
  blocks,
  notes,
  production: null,
  kept: items,
  coloursMapped: 0,
  unread: [],
});

const ELEMENTS = script(
  null,
  [
    block(1, "scene_heading", "EXT. HARBOUR WALL - NIGHT", {
      synopsis: "The storm reaches the town.",
    }),
    block(2, "action", "Waves break over the wall. A lamp swings on its hook."),
    block(3, "action", "THE LAMP GOES OUT."),
    block(4, "action", "Everyone stops."),
    block(5, "character", "DANA"),
    block(6, "parenthetical", "(shouting)"),
    block(7, "dialogue", "Bring the boats in."),
    block(8, "character", "Priya"),
    block(9, "dialogue", "They won't come in for us."),
    block(10, "scene_heading", "THE LIGHTHOUSE STAIRS"),
    block(11, "action", "Sam climbs, counting the steps under his breath."),
    block(12, "transition", "CUT TO:"),
    block(13, "transition", "FADE TO BLACK."),
    block(14, "action", "THE NEXT MORNING", { align: "center" }),
    block(15, "action", "Low tide, low tide, bring the nets home."),
    block(16, "page_break", ""),
    block(17, "group", "The Second Night"),
    block(18, "action", "Priya reads the logbook."),
    block(19, "action", [
      text("Dana says it "),
      text("once", "italic"),
      text(", "),
      text("twice", "bold"),
      text(", "),
      text("three times", "bold", "italic"),
      text(", "),
      text("and means it", "underline"),
      text("."),
    ]),
  ],
  [
    note(1, "Is this her handwriting?", {
      blockId: id(18),
      start: 24,
      end: 24,
      quote: "",
      prefix: "ads the logbook.",
      suffix: "",
    }),
  ],
  [
    kept(1, "fountain_markup", 15, "lyric", ""),
    kept(2, "boneyard", 18, "boneyard", " A scene on the ferry, cut. "),
  ],
);

const TITLE_PAGE = [
  "Title: The Long Night",
  "Credit: Written by",
  "Author: Dana Reyes",
  "Draft date: 3 March",
  "Contact:",
  "    Dana Reyes",
  "    The Old Lamp House, Quay Road",
].join("\n");

const TITLE_NOTES = script(
  "The Long Night",
  [
    block(1, "group", "Act One"),
    block(2, "group", "The Quay"),
    block(3, "scene_heading", "INT. LAMP HOUSE - NIGHT", {
      synopsis: "Dana keeps watch alone. The radio is dead.",
    }),
    block(4, "action", "Dana sets the lamp on the sill."),
    block(5, "action", "The beam sweeps the water."),
    block(6, "character", "SAM"),
    block(7, "dialogue", "Is she still up there?"),
  ],
  [
    note(1, "Check the tide table.", {
      blockId: id(4),
      start: 9,
      end: 9,
      quote: "",
      prefix: "Dana sets",
      suffix: " the lamp on the",
    }),
    note(2, "Dana: shorter?\nMaybe.", {
      blockId: id(5),
      start: 0,
      end: 0,
      quote: "",
      prefix: "",
      suffix: "The beam sweeps ",
    }),
  ],
  [
    kept(1, "title_page", null, "title_page", TITLE_PAGE),
    kept(2, "fountain_markup", 1, "synopsis", "The town waits for the storm."),
    kept(3, "fountain_markup", 2, "section:2", ""),
    kept(4, "boneyard", 5, "boneyard", " Sam arrives early. Cut for length. "),
  ],
);

const DUAL = script(
  null,
  [
    block(1, "character", "DANA", { dual: "left" }),
    block(2, "dialogue", "Is the lamp lit?", { dual: "left" }),
    block(3, "character", "SAM", { dual: "right" }),
    block(4, "dialogue", "Since dusk.", { dual: "right" }),
  ],
  [],
  [],
);

const EDGE = script(
  null,
  [
    block(1, "scene_heading", "INT./EXT. FERRY - DAWN"),
    block(2, "action", [
      text("Dana reads "),
      text("the log, ", "italic"),
      text("all of it", "bold", "italic"),
      text(", twice", "italic"),
      text(" and sets it down."),
    ]),
    block(3, "action", "Sam writes *not* in the margin, by _hand_."),
    block(4, "character", "PRIYA"),
    block(5, "dialogue", "The engine coughs."),
    block(6, "dialogue", "It catches."),
    block(7, "action", "The ferry noses out."),
    block(8, "action", "HARD ABOUT TO:"),
    block(9, "act_break", "ACT TWO", { kind: "new_act" }),
    block(10, "scene_heading", "I/E VAN - DAY"),
    block(11, "scene_heading", "int. kitchen - later"),
    block(12, "action", "Gulls over the roof", { align: "center" }),
    block(13, "action", "The tide comes, the tide goes."),
    block(14, "page_break", ""),
    block(15, "action", "The kettle boils."),
  ],
  [],
  [
    kept(1, "scene_number", 1, "scene_number", "12A"),
    kept(2, "fountain_markup", 13, "lyric", ""),
  ],
);

/** Every fixture but `long-line.fountain`, which is refused, and what it reads to with its title page. */
export const FOUNTAIN_EXPECTED: Readonly<Record<string, ImportedScript>> = {
  "elements.fountain": ELEMENTS,
  "title-notes.fountain": TITLE_NOTES,
  "dual.fountain": DUAL,
  "edge.fountain": EDGE,
};
