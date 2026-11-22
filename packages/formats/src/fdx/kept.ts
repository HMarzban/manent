// What a Final Draft file holds that Manent does not show, kept as it was, and the element reading it shares.
import type { KeptItem } from "../script/model.ts";
import type { XmlNode } from "../xml/node.ts";

/** A kept item before its id: ids follow the order of the items a read keeps in the end. */
export type KeptDraft = Omit<KeptItem, "id">;

/** The drafts as kept items, numbered "k1", "k2" … in their order. */
export function numberKept(drafts: readonly KeptDraft[]): KeptItem[] {
  return drafts.map((draft, i) => ({ id: `k${i + 1}`, ...draft }));
}

/** The attribute's value, null when the element has none of that name. */
export function attr(node: XmlNode, name: string): string | null {
  return Object.hasOwn(node.attributes, name)
    ? (node.attributes[name] ?? null)
    : null;
}

export function elementsOf(node: XmlNode): XmlNode[] {
  return node.children.filter(
    (child): child is XmlNode => typeof child !== "string",
  );
}

export function childNamed(node: XmlNode, name: string): XmlNode | null {
  return elementsOf(node).find((child) => child.name === name) ?? null;
}

/** The string children joined: the text of a `Text` run. */
export function textOf(node: XmlNode): string {
  return node.children
    .filter((child): child is string => typeof child === "string")
    .join("");
}

/** The text of a paragraph's `Text` runs, joined. */
export function paragraphText(paragraph: XmlNode): string {
  return elementsOf(paragraph)
    .filter((child) => child.name === "Text")
    .map(textOf)
    .join("");
}

/** The element's attributes, but those named in `taken`. */
export function withoutAttributes(
  node: XmlNode,
  taken: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(node.attributes).filter(([key]) => !taken.has(key)),
  );
}
