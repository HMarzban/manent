import type { AttributeSpec, MarkSpec } from "prosemirror-model";
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
  author: { default: "", check: isString },
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

function suggestion(tag: "ins" | "del"): MarkSpec {
  return {
    attrs: SUGGESTION_SPEC_ATTRS,
    excludes: "",
    inclusive: false,
    toDOM: (mark) => [
      tag,
      { "data-suggest": mark.attrs.id, "data-author": mark.attrs.author },
      0,
    ],
  };
}

export const MARK_SPECS: Record<MarkName, MarkSpec> = {
  bold: { toDOM: () => ["strong", 0] },
  italic: { toDOM: () => ["em", 0] },
  underline: { toDOM: () => ["u", 0] },
  strike: { toDOM: () => ["s", 0] },
  // display only: the stored text keeps its case
  caps: { toDOM: () => ["span", { class: "caps" }, 0] },
  color: {
    attrs: { value: { default: "" } },
    toDOM: (mark) => ["span", { "data-color": mark.attrs.value }, 0],
  },
  highlight: {
    attrs: { value: { default: "" } },
    toDOM: (mark) => ["mark", { "data-highlight": mark.attrs.value }, 0],
  },
  link: {
    attrs: { href: { default: "" } },
    inclusive: false,
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
