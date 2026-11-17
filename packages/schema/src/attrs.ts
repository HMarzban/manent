import type { ActBreakKind } from "./block-types.ts";

/** A block's attributes. Every value is a scalar. */
export interface BlockAttrs {
  /** Null only until the client assigns one. */
  id: string | null;
  /** A BlockType, or an unknown string written by a newer schema. */
  type: string;
  /** A scene number such as "12", "12A" or "A13". */
  num: string | null;
  omitted: boolean;
  dual: "left" | "right" | null;
  synopsis: string;
  align: "left" | "center" | "right" | null;
  /** In cells. */
  indent: number | null;
  /** In cells. */
  width: number | null;
  /** In lines. */
  spaceBefore: number | null;
  noContd: boolean;
  noTiming: boolean;
  owner: string | null;
  /** "added", "removed", or the element the block had before a suggested change. */
  suggest: string | null;
  /** "<originId>:<nonce>": the block this one was split from. */
  from: string | null;
  /** On act_break only. */
  kind: ActBreakKind | null;
  /** With `suggest`: the suggestion, its author and its time. */
  suggestId: string | null;
  suggestBy: string | null;
  suggestAt: number | null;
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
  owner: null,
  suggest: null,
  from: null,
  kind: null,
  suggestId: null,
  suggestBy: null,
  suggestAt: null,
});

const BLOCK_ATTR_KEYS = Object.keys(
  DEFAULT_BLOCK_ATTRS,
) as (keyof BlockAttrs)[];

/**
 * Every block attribute: a known key keeps its value as given, a missing key
 * gets its default, and an unknown key is dropped. Values are not checked.
 */
export function fillBlockAttrs(attrs?: Record<string, unknown>): BlockAttrs {
  const filled: Record<string, unknown> = {};
  for (const key of BLOCK_ATTR_KEYS) {
    const given =
      attrs !== undefined && Object.hasOwn(attrs, key) ? attrs[key] : undefined;
    filled[key] = given === undefined ? DEFAULT_BLOCK_ATTRS[key] : given;
  }
  return filled as unknown as BlockAttrs;
}
