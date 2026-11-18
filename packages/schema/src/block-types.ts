// The elements a block can be, and which elements each format offers.

export const BLOCK_TYPES = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "general",
  "slug",
  "bracket",
  "emote",
  "camera",
  "engine",
  "ink_line",
  "act_break",
  "group",
  "page_break",
  // the Manuscript format's Chapter, Body, Break and Quote
  "chapter",
  "body",
  "break",
  "quote",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export function isBlockType(value: unknown): value is BlockType {
  return BLOCK_TYPES.some((type) => type === value);
}

export const ACT_BREAK_KINDS = [
  "new_act",
  "end_of_act",
  "teaser",
  "tag",
] as const;
export type ActBreakKind = (typeof ACT_BREAK_KINDS)[number];

export const FORMATS = [
  "screenplay",
  "multicam",
  "animation",
  "variety",
  "game",
  "ink",
  "manuscript",
  "stage_play",
] as const;
export type FormatId = (typeof FORMATS)[number];

/** The elements every format has. */
const STRUCTURE = ["act_break", "group", "page_break"] as const;

const SCREENPLAY = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "general",
  ...STRUCTURE,
] as const;

export const FORMAT_ELEMENTS: Readonly<Record<FormatId, readonly BlockType[]>> =
  {
    screenplay: SCREENPLAY,
    multicam: SCREENPLAY,
    animation: SCREENPLAY,
    variety: [
      "slug",
      "bracket",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
      "shot",
      "general",
      ...STRUCTURE,
    ],
    game: [
      "scene_heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
      "shot",
      "general",
      "emote",
      "camera",
      "engine",
      ...STRUCTURE,
    ],
    ink: ["ink_line", ...STRUCTURE],
    manuscript: ["chapter", "body", "break", "quote", ...STRUCTURE],
    // the layout shows Action as a stage direction; Transition and Shot are not part of the format
    stage_play: [
      "scene_heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "general",
      ...STRUCTURE,
    ],
  };

/** The element a block renders as: a type this build does not know renders as General. */
export function renderedType(type: string): BlockType {
  return isBlockType(type) ? type : "general";
}
