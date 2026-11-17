import type { MarkSpec } from "prosemirror-model";

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

/** Marks of which several, with different attributes, can sit on the same text. */
export const OVERLAPPING_MARKS = ["suggest_insert", "suggest_delete"] as const;

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

/** True for an absolute http:, https: or mailto: address, and nothing else. */
export function isSafeHref(href: string): boolean {
  if (!URL.canParse(href)) return false;
  return SAFE_PROTOCOLS.includes(new URL(href).protocol);
}

function suggestion(tag: "ins" | "del"): MarkSpec {
  return {
    attrs: { id: { default: "" }, author: { default: "" }, at: { default: 0 } },
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
