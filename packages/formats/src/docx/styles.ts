// XML helpers and paragraph style resolution for Word (.docx) files across screenplay and manuscript styles.
import type { BlockType, FormatId } from "@manent/schema";
import type { XmlNode } from "../xml/node.ts";

/** Screenplay paragraph style names mapped by lower-cased name with all spaces removed. */
const SCREENPLAY_STYLES: Readonly<Record<string, BlockType>> = Object.freeze({
  sceneheading: "scene_heading",
  action: "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  transition: "transition",
  shot: "shot",
  general: "general",
});

/** Book (manuscript) paragraph style names mapped by lower-cased name with all spaces removed. */
const BOOK_STYLES: Readonly<Record<string, BlockType>> = Object.freeze({
  heading1: "chapter",
  title: "chapter",
  chapter: "chapter",
  chapterheading: "chapter",
  chaptertitle: "chapter",
  heading2: "subheading",
  heading3: "subheading",
  subheading: "subheading",
  subtitle: "subheading",
  epigraph: "epigraph",
  quote: "quote",
  blockquote: "quote",
  intensequote: "quote",
  scenebreak: "break",
  break: "break",
  sectionbreak: "break",
  normal: "body",
  body: "body",
  bodytext: "body",
  bodytextfirstindent: "body",
  firstparagraph: "body",
  paragraph: "body",
  listparagraph: "body",
  caption: "body",
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

/** True when `word/styles.xml` gives the `Normal` paragraph style a positive first-line indent. */
export function hasNormalFirstLineIndent(stylesRoot: XmlNode | null): boolean {
  if (stylesRoot === null) return false;
  for (const child of childElements(stylesRoot)) {
    if (localName(child.name) !== "style") continue;
    const id = wordAttr(child, "styleId");
    if (id !== "Normal" && wordAttr(child, "default") !== "1") continue;
    const pPr = firstChild(child, "pPr");
    const ind = pPr === null ? null : firstChild(pPr, "ind");
    const first = ind === null ? null : Number(wordAttr(ind, "firstLine") ?? 0);
    if (Number.isFinite(first) && first !== null && first > 0) return true;
  }
  return false;
}

const normalizeStyle = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, "");

function isScreenplaySpecific(key: string): boolean {
  return Object.hasOwn(SCREENPLAY_STYLES, key) && key !== "general";
}

function isBookSpecific(key: string): boolean {
  return (
    Object.hasOwn(BOOK_STYLES, key) &&
    key !== "normal" &&
    key !== "body" &&
    key !== "paragraph" &&
    key !== "caption"
  );
}

/** Infers whether a `.docx` body represents a Book (`manuscript`) or a `screenplay`. */
export function detectDocxFormat(
  body: XmlNode,
  stylesRoot: XmlNode | null,
  styleNames: ReadonlyMap<string, string>,
): FormatId {
  let sawBookSignal = false;
  const inspect = (container: XmlNode): boolean => {
    for (const child of childElements(container)) {
      const tag = localName(child.name);
      if (tag === "sdt") {
        const content = firstChild(child, "sdtContent");
        if (content !== null && inspect(content)) return true;
        continue;
      }
      if (tag !== "p") continue;
      const pPr = firstChild(child, "pPr");
      if (pPr === null) continue;
      const frame = firstChild(pPr, "framePr");
      if (frame !== null && wordAttr(frame, "dropCap") !== null)
        sawBookSignal = true;
      const styleNode = firstChild(pPr, "pStyle");
      const styleId = styleNode === null ? null : wordAttr(styleNode, "val");
      if (styleId === null || styleId.trim() === "") continue;
      const byId = normalizeStyle(styleId);
      const byName = normalizeStyle(styleNames.get(styleId) ?? styleId);
      if (isScreenplaySpecific(byName) || isScreenplaySpecific(byId))
        return true;
      if (isBookSpecific(byName) || isBookSpecific(byId)) sawBookSignal = true;
    }
    return false;
  };
  if (inspect(body)) return "screenplay";
  if (sawBookSignal || hasNormalFirstLineIndent(stylesRoot))
    return "manuscript";
  return "screenplay";
}

export interface StyleMatch {
  readonly type: BlockType;
  /** The Word style name when it mapped to no element and fell back to Action/Body; null when mapped or unstyled. */
  readonly unmapped: string | null;
}

/** Resolves a Word paragraph's `styleId` to a Manent screenplay or manuscript element. */
export function resolveParagraphStyle(
  styleId: string | null,
  styleNames: ReadonlyMap<string, string>,
  format: FormatId = "screenplay",
): StyleMatch {
  const fallback: BlockType = format === "manuscript" ? "body" : "action";
  if (styleId === null || styleId.trim() === "")
    return { type: fallback, unmapped: null };
  const display = styleNames.get(styleId) ?? styleId;
  const byDisplay = normalizeStyle(display);
  const byId = normalizeStyle(styleId);
  const primary = format === "manuscript" ? BOOK_STYLES : SCREENPLAY_STYLES;
  const secondary = format === "manuscript" ? SCREENPLAY_STYLES : BOOK_STYLES;
  if (Object.hasOwn(primary, byDisplay))
    return { type: primary[byDisplay]!, unmapped: null };
  if (Object.hasOwn(primary, byId))
    return { type: primary[byId]!, unmapped: null };
  if (format === "manuscript") {
    if (Object.hasOwn(secondary, byDisplay))
      return { type: secondary[byDisplay]!, unmapped: null };
    if (Object.hasOwn(secondary, byId))
      return { type: secondary[byId]!, unmapped: null };
  }
  const label = display.trim();
  return { type: fallback, unmapped: label === "" ? null : label };
}
