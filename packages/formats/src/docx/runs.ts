// Inline run, hyperlink, colour/highlight and footnote parsing for Word (.docx) paragraphs.
import { isSafeHref } from "@manent/schema";
import type { IdSource, MarkJSON, TextJSON } from "@manent/schema";
import type { XmlNode } from "../xml/node.ts";
import { mapWordHighlight, mapWordTextColour } from "./colours.ts";
import { childElements, firstChild, localName, wordAttr } from "./styles.ts";

const PAGE_FIELD = /\bPAGE\b/i;

export function textChildren(node: XmlNode): string {
  return node.children
    .filter((child): child is string => typeof child === "string")
    .join("");
}

/** Parses `word/_rels/document.xml.rels` into safe external hyperlink targets keyed by Relationship `Id`. */
export function readHyperlinkRels(
  relsRoot: XmlNode | null,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (relsRoot === null) return map;
  for (const child of childElements(relsRoot)) {
    if (localName(child.name) !== "Relationship") continue;
    const type = wordAttr(child, "Type") ?? "";
    if (!type.endsWith("/hyperlink")) continue;
    const id = wordAttr(child, "Id");
    const target = wordAttr(child, "Target");
    if (id !== null && target !== null && isSafeHref(target))
      map.set(id, target);
  }
  return map;
}

/** Parses `word/footnotes.xml` into plain text keyed by footnote `w:id`. */
export function readFootnotesPart(
  footnotesRoot: XmlNode | null,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (footnotesRoot === null) return map;
  for (const child of childElements(footnotesRoot)) {
    if (localName(child.name) !== "footnote") continue;
    const type = wordAttr(child, "type");
    if (type === "separator" || type === "continuationSeparator") continue;
    const id = wordAttr(child, "id");
    if (id === null || id === "") continue;
    const chunks: string[] = [];
    collectPlainText(child, chunks);
    const text = chunks.join("").replace(/\s+/g, " ").trim();
    if (text !== "") map.set(id, text);
  }
  return map;
}

function collectPlainText(node: XmlNode, chunks: string[]): void {
  for (const child of childElements(node)) {
    const tag = localName(child.name);
    if (tag === "t") chunks.push(textChildren(child));
    else if (tag === "tab" || tag === "br" || tag === "cr") chunks.push(" ");
    else if (tag !== "pPr" && tag !== "rPr" && tag !== "footnoteRef")
      collectPlainText(child, chunks);
  }
}

function isEnabledToggle(node: XmlNode): boolean {
  const val = wordAttr(node, "val");
  return val !== "0" && val !== "false" && val !== "off";
}

interface ParsedRunProps {
  readonly marks: MarkJSON[];
  readonly sizeHalfPt: number | null;
  readonly coloursMapped: number;
}

function parseRunProps(
  rPr: XmlNode | null,
  inHyperlink: boolean,
): ParsedRunProps {
  if (rPr === null) return { marks: [], sizeHalfPt: null, coloursMapped: 0 };
  const marks: MarkJSON[] = [];
  let sizeHalfPt: number | null = null;
  let coloursMapped = 0;
  let hasHighlight = false;

  for (const child of childElements(rPr)) {
    const tag = localName(child.name);
    switch (tag) {
      case "b":
        if (isEnabledToggle(child)) marks.push({ type: "bold" });
        break;
      case "i":
        if (isEnabledToggle(child)) marks.push({ type: "italic" });
        break;
      case "u": {
        const val = wordAttr(child, "val");
        if (
          val !== "none" &&
          !(inHyperlink && (val === null || val === "single"))
        )
          marks.push({ type: "underline" });
        break;
      }
      case "strike":
      case "dstrike":
        if (isEnabledToggle(child)) marks.push({ type: "strike" });
        break;
      case "caps":
        if (isEnabledToggle(child)) marks.push({ type: "caps" });
        break;
      case "vertAlign": {
        const val = wordAttr(child, "val");
        if (val === "superscript") marks.push({ type: "sup" });
        else if (val === "subscript") marks.push({ type: "sub" });
        break;
      }
      case "color": {
        const val = wordAttr(child, "val");
        if (val !== null) {
          const mapped = mapWordTextColour(val);
          if (mapped !== null) {
            marks.push({ type: "color", attrs: { value: mapped.name } });
            if (!mapped.exact) coloursMapped++;
          }
        }
        break;
      }
      case "highlight":
      case "shd": {
        if (hasHighlight) break;
        const val =
          tag === "highlight"
            ? wordAttr(child, "val")
            : wordAttr(child, "fill");
        if (val !== null) {
          const mapped = mapWordHighlight(val);
          if (mapped !== null) {
            hasHighlight = true;
            marks.push({ type: "highlight", attrs: { value: mapped.name } });
            if (!mapped.exact) coloursMapped++;
          }
        }
        break;
      }
      case "sz": {
        const val = Number(wordAttr(child, "val") ?? Number.NaN);
        if (Number.isFinite(val)) sizeHalfPt = val;
        break;
      }
      default:
        break;
    }
  }
  return { marks, sizeHalfPt, coloursMapped };
}

export interface ParsedRun {
  readonly text: string;
  readonly marks: MarkJSON[];
  readonly sizeHalfPt: number | null;
}

export interface ParsedParagraphContent {
  readonly runs: ParsedRun[];
  readonly hasPageBreak: boolean;
  readonly coloursMapped: number;
}

function attachFootnoteToLastRun(
  runs: ParsedRun[],
  footnoteText: string,
  ids: IdSource,
): void {
  const last = runs.at(-1);
  if (last === undefined || last.text.trim() === "") return;
  const mark: MarkJSON = {
    type: "footnote",
    attrs: { id: ids(), text: footnoteText },
  };
  runs[runs.length - 1] = { ...last, marks: [...last.marks, mark] };
}

/** Walks `<w:p>` children into styled runs, hyperlinks, page breaks, and footnotes. */
export function parseParagraphContent(
  paragraph: XmlNode,
  context: {
    readonly hyperlinks: ReadonlyMap<string, string>;
    readonly footnotes: ReadonlyMap<string, string>;
    readonly ids: IdSource;
    readonly unread: Set<string>;
  },
): ParsedParagraphContent {
  const runs: ParsedRun[] = [];
  let hasPageBreak = false;
  let coloursMapped = 0;

  const walk = (node: XmlNode, linkHref: string | null): void => {
    for (const child of childElements(node)) {
      const tag = localName(child.name);
      switch (tag) {
        case "pPr":
        case "rPr":
        case "del":
        case "delText":
        case "moveFrom":
          break;
        case "hyperlink": {
          const rId = wordAttr(child, "id");
          const href =
            rId === null ? null : (context.hyperlinks.get(rId) ?? null);
          walk(child, href);
          break;
        }
        case "r": {
          const rPr = firstChild(child, "rPr");
          const parsed = parseRunProps(rPr, linkHref !== null);
          coloursMapped += parsed.coloursMapped;
          const marks: MarkJSON[] =
            linkHref === null
              ? parsed.marks
              : [...parsed.marks, { type: "link", attrs: { href: linkHref } }];
          let text = "";
          for (const inner of childElements(child)) {
            const innerTag = localName(inner.name);
            switch (innerTag) {
              case "rPr":
                break;
              case "t":
                text += textChildren(inner);
                break;
              case "tab":
              case "cr":
                text += " ";
                break;
              case "br":
                if (wordAttr(inner, "type") === "page") hasPageBreak = true;
                else text += " ";
                break;
              case "drawing":
              case "pict":
              case "object":
                context.unread.add("image");
                break;
              case "footnoteReference": {
                const fnId = wordAttr(inner, "id");
                const fnText =
                  fnId === null ? undefined : context.footnotes.get(fnId);
                if (fnText !== undefined) {
                  if (text !== "") {
                    runs.push({ text, marks, sizeHalfPt: parsed.sizeHalfPt });
                    text = "";
                  }
                  attachFootnoteToLastRun(runs, fnText, context.ids);
                } else {
                  context.unread.add("footnote");
                }
                break;
              }
              case "endnoteReference":
                context.unread.add("footnote");
                break;
              case "commentReference":
              case "commentRangeStart":
              case "commentRangeEnd":
                context.unread.add("comment");
                break;
              case "pgNum":
                context.unread.add("page_furniture");
                break;
              case "instrText":
                if (PAGE_FIELD.test(textChildren(inner)))
                  context.unread.add("page_furniture");
                break;
              default:
                break;
            }
          }
          if (text !== "")
            runs.push({ text, marks, sizeHalfPt: parsed.sizeHalfPt });
          break;
        }
        case "drawing":
        case "pict":
        case "object":
          context.unread.add("image");
          break;
        case "commentReference":
        case "commentRangeStart":
        case "commentRangeEnd":
          context.unread.add("comment");
          break;
        default:
          walk(child, linkHref);
      }
    }
  };

  walk(paragraph, null);
  return { runs, hasPageBreak, coloursMapped };
}

function marksKey(marks: readonly MarkJSON[]): string {
  return marks.length === 0 ? "" : JSON.stringify(marks);
}

/** Coalesces adjacent runs sharing identical marks and trims outer whitespace cleanly. */
export function coalesceRuns(parsed: readonly ParsedRun[]): TextJSON[] {
  const merged: { text: string; marks: MarkJSON[]; key: string }[] = [];
  for (const run of parsed) {
    if (run.text === "") continue;
    const key = marksKey(run.marks);
    const prev = merged.at(-1);
    if (prev !== undefined && prev.key === key) prev.text += run.text;
    else merged.push({ text: run.text, marks: [...run.marks], key });
  }
  while (merged.length > 0) {
    const first = merged[0]!;
    first.text = first.text.replace(/^\s+/, "");
    if (first.text === "") merged.shift();
    else break;
  }
  while (merged.length > 0) {
    const last = merged.at(-1)!;
    last.text = last.text.replace(/\s+$/, "");
    if (last.text === "") merged.pop();
    else break;
  }
  return merged.map((item) =>
    item.marks.length === 0
      ? { type: "text", text: item.text }
      : { type: "text", text: item.text, marks: item.marks },
  );
}
