// How each element is laid out before a format or a project's style changes it.

import type { ElementSpec, SpecKey } from "../../page-profile.ts";

const ACTION: ElementSpec = Object.freeze({
  indent: 0,
  width: 60,
  firstLineIndent: 0,
  align: "left",
  spaceBefore: 1,
  dropLines: 0,
  lineSpacing: 1,
  capitalized: false,
  keptWithNext: false,
  split: "action",
  startingPage: false,
  printed: true,
  enclosure: null,
});

function like(changes: Partial<ElementSpec>): ElementSpec {
  return Object.freeze({ ...ACTION, ...changes });
}

const HEADING = like({ capitalized: true, keptWithNext: true, split: "never" });
const PARENTHETICAL = like({
  indent: 16,
  width: 25,
  spaceBefore: 0,
  keptWithNext: true,
  split: "never",
});
const ACT_START = like({
  align: "center",
  capitalized: true,
  keptWithNext: true,
  split: "never",
});
const UNPRINTED = like({ printed: false });

/** A new element in `schema` fails to compile until it has a row here. */
export const ELEMENT_ROWS: Readonly<Record<SpecKey, ElementSpec>> =
  Object.freeze({
    scene_heading: HEADING,
    action: ACTION,
    character: like({
      indent: 22,
      width: 38,
      capitalized: true,
      keptWithNext: true,
      split: "never",
    }),
    parenthetical: PARENTHETICAL,
    dialogue: like({
      indent: 10,
      width: 35,
      spaceBefore: 0,
      split: "dialogue",
    }),
    transition: like({ align: "right", capitalized: true, split: "never" }),
    shot: HEADING,
    general: ACTION,
    slug: HEADING,
    bracket: ACTION,
    emote: PARENTHETICAL,
    camera: HEADING,
    engine: ACTION,
    "act_break.new_act": ACT_START,
    "act_break.end_of_act": like({ ...ACT_START, keptWithNext: false }),
    "act_break.teaser": ACT_START,
    "act_break.tag": ACT_START,
    group: UNPRINTED,
    page_break: UNPRINTED,
    chapter: ACTION,
    body: ACTION,
    break: ACTION,
    quote: ACTION,
    graphic: like({ split: "never" }),
  });

/** The manuscript's own elements, on its 65-cell column and double-spaced. */
export const MANUSCRIPT_ROWS: Readonly<
  Record<"chapter" | "body" | "break" | "quote", ElementSpec>
> = Object.freeze({
  chapter: like({
    width: 65,
    align: "center",
    lineSpacing: 2,
    keptWithNext: true,
    startingPage: true,
    dropLines: 18,
  }),
  body: like({ width: 65, firstLineIndent: 5, spaceBefore: 0, lineSpacing: 2 }),
  break: like({
    width: 65,
    align: "center",
    spaceBefore: 0,
    lineSpacing: 2,
    keptWithNext: true,
  }),
  quote: like({ indent: 5, width: 55, spaceBefore: 0, lineSpacing: 2 }),
});
