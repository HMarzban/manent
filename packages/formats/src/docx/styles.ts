// XML helpers and paragraph style resolution for Word (.docx) files.
import type { BlockType } from "@manent/schema";
import type { XmlNode } from "../xml/node.ts";

/** Paragraph style names mapped by lower-cased name with all spaces removed. */
const STYLE_MAP: Readonly<Record<string, BlockType>> = Object.freeze({
  sceneheading: "scene_heading",
  action: "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  transition: "transition",
  shot: "shot",
  general: "general",
});

/** Local XML tag or attribute name without its namespace prefix. */
export function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

/** Element children of `node` (ignoring text children). */
export function childElements(node: XmlNode): XmlNode[] {
  return node.children.filter(
    (child): child is XmlNode => typeof child !== "string",
  );
}

/** First element child whose local name equals `name`, or null. */
export function firstChild(node: XmlNode, name: string): XmlNode | null {
  return (
    childElements(node).find((child) => localName(child.name) === name) ?? null
  );
}

/** Value of attribute `w:<name>`, `<name>`, or any namespace-prefixed attribute with local name `<name>`. */
export function wordAttr(node: XmlNode, name: string): string | null {
  const prefixed = `w:${name}`;
  if (Object.hasOwn(node.attributes, prefixed))
    return node.attributes[prefixed] ?? null;
  if (Object.hasOwn(node.attributes, name))
    return node.attributes[name] ?? null;
  for (const [key, value] of Object.entries(node.attributes))
    if (localName(key) === name) return value;
  return null;
}

/** Map of Word paragraph `styleId` to its display `<w:name>` from `word/styles.xml`. */
export function readStyleNames(
  stylesRoot: XmlNode | null,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (stylesRoot === null) return names;
  for (const child of childElements(stylesRoot)) {
    if (localName(child.name) !== "style") continue;
    const kind = wordAttr(child, "type");
    if (kind !== null && kind !== "paragraph") continue;
    const styleId = wordAttr(child, "styleId");
    if (styleId === null || styleId === "") continue;
    const nameNode = firstChild(child, "name");
    const display = nameNode === null ? null : wordAttr(nameNode, "val");
    names.set(styleId, display !== null && display !== "" ? display : styleId);
  }
  return names;
}

const normalizeStyle = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, "");

export interface StyleMatch {
  readonly type: BlockType;
  /** The Word style name when it mapped to no element and fell back to Action; null when mapped or unstyled. */
  readonly unmapped: string | null;
}

/**
 * Resolves a Word paragraph's `styleId` to a Manent screenplay element. Unstyled paragraphs become Action without
 * adding an unread entry; unknown styles become Action with their display name reported in `unmapped`.
 */
export function resolveParagraphStyle(
  styleId: string | null,
  styleNames: ReadonlyMap<string, string>,
): StyleMatch {
  if (styleId === null || styleId.trim() === "")
    return { type: "action", unmapped: null };
  const display = styleNames.get(styleId) ?? styleId;
  const byDisplay = normalizeStyle(display);
  if (Object.hasOwn(STYLE_MAP, byDisplay))
    return { type: STYLE_MAP[byDisplay]!, unmapped: null };
  const byId = normalizeStyle(styleId);
  if (Object.hasOwn(STYLE_MAP, byId))
    return { type: STYLE_MAP[byId]!, unmapped: null };
  const label = display.trim();
  return { type: "action", unmapped: label === "" ? null : label };
}
