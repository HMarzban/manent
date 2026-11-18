import type { AttributeSpec, MarkSpec, TagParseRule } from "prosemirror-model";
import { isCount, isString } from "./shape.ts";
import type { Check } from "./shape.ts";

export const MARK_NAMES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "caps",
  "color",
  "highlight",
  "link",
  "suggest_insert",
  "suggest_delete",
] as const;
export type MarkName = (typeof MARK_NAMES)[number];

export function isMarkName(value: unknown): value is MarkName {
  return MARK_NAMES.some((name) => name === value);
}

/** Marks of which several, with different attributes, can sit on the same text. */
export const OVERLAPPING_MARKS = ["suggest_insert", "suggest_delete"] as const;

/** The named text colours a `color` mark holds. */
export const TEXT_COLOUR_NAMES = [
  "red",
  "orange",
  "green",
  "blue",
  "violet",
] as const;

/** The named highlights a `highlight` mark holds. */
export const HIGHLIGHT_NAMES = [
  "yellow",
  "green",
  "pink",
  "orange",
  "violet",
] as const;

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

/** True for an absolute http:, https: or mailto: address, and nothing else. */
export function isSafeHref(href: string): boolean {
  if (!URL.canParse(href)) return false;
  return SAFE_PROTOCOLS.includes(new URL(href).protocol);
}

/** A suggestion's attributes, in stored order: each one's default and its valid values. */
const SUGGESTION_ATTRS: Readonly<
  Record<string, { default: unknown; check: Check }>
> = {
  id: { default: "", check: isString },
  authorUserId: { default: "", check: isString },
  /** Milliseconds since the epoch. */
  at: { default: 0, check: isCount },
};

const SUGGESTION_SPEC_ATTRS: Record<string, AttributeSpec> = Object.fromEntries(
  Object.entries(SUGGESTION_ATTRS).map(([key, attr]) => [
    key,
    { default: attr.default },
  ]),
);

const SUGGESTION_CHECKS: Record<string, Check> = Object.fromEntries(
  Object.entries(SUGGESTION_ATTRS).map(([key, attr]) => [key, attr.check]),
);

/** Reads `tag`'s attribute `attr` as the mark's `value`; no mark when it is not one of `names`. */
function namedValueRule(
  tag: string,
  attr: string,
  names: readonly string[],
): TagParseRule {
  return {
    tag,
    getAttrs: (dom) => {
      const value = dom.getAttribute(attr);
      return value !== null && names.includes(value) ? { value } : false;
    },
  };
}

function suggestion(tag: "ins" | "del"): MarkSpec {
  return {
    attrs: SUGGESTION_SPEC_ATTRS,
    excludes: "",
    inclusive: false,
    toDOM: (mark) => [
      tag,
      { "data-suggest": mark.attrs.id, "data-author": mark.attrs.authorUserId },
      0,
    ],
  };
}

export const MARK_SPECS: Record<MarkName, MarkSpec> = {
  bold: {
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
    toDOM: () => ["strong", 0],
  },
  italic: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
  underline: { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "del:not([data-suggest])" }],
    toDOM: () => ["s", 0],
  },
  // display only: the stored text keeps its case
  caps: {
    parseDOM: [{ tag: "span.caps" }],
    toDOM: () => ["span", { class: "caps" }, 0],
  },
  color: {
    attrs: { value: { default: "" } },
    parseDOM: [
      namedValueRule("span[data-color]", "data-color", TEXT_COLOUR_NAMES),
    ],
    toDOM: (mark) => ["span", { "data-color": mark.attrs.value }, 0],
  },
  highlight: {
    attrs: { value: { default: "" } },
    parseDOM: [
      namedValueRule("mark[data-highlight]", "data-highlight", HIGHLIGHT_NAMES),
    ],
    toDOM: (mark) => ["mark", { "data-highlight": mark.attrs.value }, 0],
  },
  link: {
    attrs: { href: { default: "" } },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom) => {
          const href = dom.getAttribute("href");
          return href !== null && isSafeHref(href) ? { href } : false;
        },
      },
    ],
    toDOM: (mark) => {
      const href: unknown = mark.attrs.href;
      const rel = "noopener noreferrer nofollow";
      return [
        "a",
        typeof href === "string" && isSafeHref(href) ? { href, rel } : { rel },
        0,
      ];
    },
  },
  suggest_insert: suggestion("ins"),
  suggest_delete: suggestion("del"),
};

/** The attributes of each mark, with their valid values. */
export const MARK_ATTR_CHECKS: Readonly<
  Record<MarkName, Readonly<Record<string, Check>>>
> = {
  bold: {},
  italic: {},
  underline: {},
  strike: {},
  caps: {},
  color: { value: isString },
  highlight: { value: isString },
  link: { href: isString },
  suggest_insert: SUGGESTION_CHECKS,
  suggest_delete: SUGGESTION_CHECKS,
};
