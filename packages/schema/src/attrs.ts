import type { ActBreakKind } from "./block-types.ts";

export const DUALS = ["left", "right"] as const;
export type Dual = (typeof DUALS)[number];

export const ALIGNMENTS = ["left", "center", "right"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

export const FIRST_LINES = ["flush", "drop_cap", "raised_cap"] as const;
export type FirstLine = (typeof FIRST_LINES)[number];

/** What a General element may link to: an outline's beat or a script's scene heading. */
export const LINK_KINDS = ["beat", "scene"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Kinds of inline graphic block (schema 3). */
export const GRAPHIC_KINDS = [
  "image",
  "lower_third",
  "ots",
  "full_screen",
] as const;
export type GraphicKind = (typeof GRAPHIC_KINDS)[number];

export const GRAPHIC_MIN_HEIGHT_LINES = 2;
export const GRAPHIC_MAX_HEIGHT_LINES = 24;
export const GRAPHIC_MAX_LABEL_LENGTH = 120;
export const GRAPHIC_MAX_ALT_LENGTH = 400;
export const GRAPHIC_MAX_DIMENSION_PX = 4096;

/** Flat seven-primitive attributes carried by a `graphic` block (schema 3). */
export interface GraphicAttrs {
  readonly kind: GraphicKind;
  readonly assetId: string | null;
  readonly heightLines: number;
  readonly label: string;
  readonly alt: string;
  readonly aspectWidth: number | null;
  readonly aspectHeight: number | null;
}

/** Declared key order of `GraphicAttrs`, used for canonicalisation and validation. */
export const GRAPHIC_ATTR_KEYS: readonly (keyof GraphicAttrs)[] = Object.freeze(
  [
    "kind",
    "assetId",
    "heightLines",
    "label",
    "alt",
    "aspectWidth",
    "aspectHeight",
  ],
);

/** A block's attributes. Every value is a scalar but `tags` and `linkTo` (schema 2) and `graphic` (schema 3). */
export interface BlockAttrs {
  /** Null only until the client assigns one. */
  id: string | null;
  /** A BlockType, or an unknown string written by a newer schema. */
  type: string;
  /** A scene number such as "12", "12A" or "A13". */
  num: string | null;
  omitted: boolean;
  dual: Dual | null;
  synopsis: string;
  align: Alignment | null;
  /** In cells. */
  indent: number | null;
  /** In cells. */
  width: number | null;
  /** In lines. */
  spaceBefore: number | null;
  noContd: boolean;
  noTiming: boolean;
  writerUserId: string | null;
  /** "added", "removed", or the element the block had before a suggested change. */
  suggest: string | null;
  /** "<originId>:<nonce>": the block this one was split from. */
  from: string | null;
  /** On act_break only. */
  kind: ActBreakKind | null;
  /** With `suggest`: the suggestion, the user who made it, and its time. */
  suggestId: string | null;
  suggestAuthorUserId: string | null;
  /** Milliseconds since the epoch. */
  suggestAt: number | null;
  /** On general only: each tag a non-empty string. */
  tags: readonly string[];
  /** On general only: the beat or scene heading the line is about. */
  linkTo: { kind: LinkKind; blockId: string } | null;
  /** On graphic only (schema 3): flat seven-primitive box and asset metadata. */
  graphic: GraphicAttrs | null;
  /** On prose body blocks (schema 4): opening-line style ("flush" or "drop_cap"); null keeps the element's default indent. */
  firstLine: FirstLine | null;
}

/** The defaults, in the order the block node declares its attributes. */
export const DEFAULT_BLOCK_ATTRS: BlockAttrs = Object.freeze({
  id: null,
  type: "action",
  num: null,
  omitted: false,
  dual: null,
  synopsis: "",
  align: null,
  indent: null,
  width: null,
  spaceBefore: null,
  noContd: false,
  noTiming: false,
  writerUserId: null,
  suggest: null,
  from: null,
  kind: null,
  suggestId: null,
  suggestAuthorUserId: null,
  suggestAt: null,
  tags: Object.freeze([]),
  linkTo: null,
  graphic: null,
  firstLine: null,
});

function isBlockAttrName(key: string): key is keyof BlockAttrs {
  return Object.hasOwn(DEFAULT_BLOCK_ATTRS, key);
}

/**
 * A known key keeps its value as given, a missing key gets its default, an
 * unknown key is dropped. Values are not checked.
 */
export function fillBlockAttrs(
  attrs?: Record<string, unknown>,
): Record<keyof BlockAttrs, unknown> {
  const filled: Record<keyof BlockAttrs, unknown> = { ...DEFAULT_BLOCK_ATTRS };
  for (const [key, value] of Object.entries(attrs ?? {}))
    if (value !== undefined && isBlockAttrName(key)) filled[key] = value;
  return filled;
}
