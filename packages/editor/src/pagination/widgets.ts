// The DOM of a page break and of a cast list: furniture drawn by the page styles from data attributes, never a text node.
import type { BreakKind, BreakSpec } from "./break-specs.ts";

const ROOT_CLASS: Readonly<Record<BreakKind, string>> = Object.freeze({
  first: "pb pb-first",
  page: "pb",
  mid: "pb pb-mid",
  col: "pb pb-col",
  last: "pb pb-last",
  rule: "pb pb-rule",
});

/** Each child as [class, its text or null], in order, only when it applies. */
function childrenOf(spec: BreakSpec): [string, string | null][] {
  switch (spec.kind) {
    case "first":
      return [["pb-head", null]];
    case "rule":
      return [];
    case "last":
      return [
        ["pb-fill", null],
        ["pb-foot", spec.foot],
      ];
    case "page":
    case "mid":
    case "col": {
      const children: [string, string | null][] = [];
      if (spec.more !== null) children.push(["pb-more", spec.more]);
      children.push(
        ["pb-fill", null],
        ["pb-foot", spec.foot],
        ["pb-gap", null],
        ["pb-head", spec.head],
      );
      if (spec.continued !== null)
        children.push(["pb-continued", spec.continued]);
      if (spec.contd !== null) children.push(["pb-contd", spec.contd]);
      return children;
    }
  }
}

/** A `div` between blocks; inside a block the same tree of `span`s, which the page styles make blocks. */
export function renderBreak(spec: BreakSpec): HTMLElement {
  const tag = spec.kind === "mid" || spec.kind === "col" ? "span" : "div";
  const root = document.createElement(tag);
  root.className = ROOT_CLASS[spec.kind];
  root.dataset["label"] = spec.label;
  root.contentEditable = "false";
  root.setAttribute("aria-hidden", "true");
  const children = childrenOf(spec);
  if (children.some(([name]) => name === "pb-fill"))
    root.style.setProperty("--fill", String(spec.fillUnits));
  for (const [name, text] of children) {
    const child = document.createElement(tag);
    child.className = name;
    if (text !== null) child.dataset["text"] = text;
    root.append(child);
  }
  return root;
}

/** The cast list under a scene heading: a `span` the page styles make a block of its own lines. */
export function renderCast(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "mn-cast";
  span.dataset["text"] = text;
  span.contentEditable = "false";
  span.setAttribute("aria-hidden", "true");
  return span;
}

/** The replacement label of an omitted heading (for example, "OMITTED"): real uneditable text matching layout. */
export function renderOmitted(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "mn-omitted";
  span.contentEditable = "false";
  span.textContent = text;
  return span;
}
