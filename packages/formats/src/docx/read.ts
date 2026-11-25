// Reading a Word (.docx) file into the format-neutral script: paragraphs by style name, and unmapped parts in unread.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import { decodeText } from "../script/decode.ts";
import { FormatError } from "../script/model.ts";
import type { ImportedScript } from "../script/model.ts";
import { parseXmlChecked } from "../xml/checks.ts";
import type { XmlNode, XmlParser } from "../xml/node.ts";
import {
  childElements,
  firstChild,
  localName,
  readStyleNames,
  resolveParagraphStyle,
  wordAttr,
} from "./styles.ts";
import { extractDocxParts } from "./zip.ts";

/** Page sizes in twips (1 inch = 1440 twips), with tolerance for rounding. */
const PAPER_TWIPS: readonly {
  readonly paper: "letter" | "a4";
  readonly width: number;
  readonly height: number;
}[] = [
  { paper: "letter", width: 12240, height: 15840 },
  { paper: "a4", width: 11906, height: 16838 },
];
const PAPER_TOLERANCE = 80;
const FURNITURE_TEXT =
  /^(?:\(more\)|\(continued\)|continued:(?:\s*\(\d+\))?)$/i;
const PAGE_FIELD = /\bPAGE\b/i;

interface DocxReader {
  readonly ids: IdSource;
  readonly styleNames: ReadonlyMap<string, string>;
  readonly blocks: BlockJSON[];
  readonly unread: Set<string>;
  paper: "letter" | "a4" | null;
}

function paperFromSectPr(sectPr: XmlNode): "letter" | "a4" | null {
  const pgSz = firstChild(sectPr, "pgSz");
  if (pgSz === null) return null;
  const width = Number(wordAttr(pgSz, "w") ?? Number.NaN);
  const height = Number(wordAttr(pgSz, "h") ?? Number.NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return (
    PAPER_TWIPS.find(
      (entry) =>
        Math.abs(entry.width - width) <= PAPER_TOLERANCE &&
        Math.abs(entry.height - height) <= PAPER_TOLERANCE,
    )?.paper ?? null
  );
}

function readSectPr(reader: DocxReader, sectPr: XmlNode): void {
  reader.paper ??= paperFromSectPr(sectPr);
  for (const child of childElements(sectPr)) {
    const tag = localName(child.name);
    if (tag === "headerReference" || tag === "footerReference")
      reader.unread.add("page_furniture");
  }
}

function textChildren(node: XmlNode): string {
  return node.children
    .filter((child): child is string => typeof child === "string")
    .join("");
}

/** Walks inline elements inside a paragraph, collecting visible text and recording unmapped constructs. */
function collectParagraph(
  node: XmlNode,
  chunks: string[],
  unread: Set<string>,
): void {
  for (const child of childElements(node)) {
    const tag = localName(child.name);
    switch (tag) {
      case "pPr":
      case "rPr":
      case "del":
      case "delText":
      case "moveFrom":
        break;
      case "t":
        chunks.push(textChildren(child));
        break;
      case "tab":
      case "br":
      case "cr":
        chunks.push(" ");
        break;
      case "drawing":
      case "pict":
      case "object":
        unread.add("image");
        break;
      case "footnoteReference":
      case "endnoteReference":
        unread.add("footnote");
        break;
      case "commentReference":
      case "commentRangeStart":
      case "commentRangeEnd":
        unread.add("comment");
        break;
      case "pgNum":
        unread.add("page_furniture");
        break;
      case "instrText":
        if (PAGE_FIELD.test(textChildren(child))) unread.add("page_furniture");
        break;
      default:
        collectParagraph(child, chunks, unread);
    }
  }
}

function readParagraph(reader: DocxReader, paragraph: XmlNode): void {
  const pPr = firstChild(paragraph, "pPr");
  if (pPr !== null) {
    const sectPr = firstChild(pPr, "sectPr");
    if (sectPr !== null) readSectPr(reader, sectPr);
  }
  const styleNode = pPr === null ? null : firstChild(pPr, "pStyle");
  const styleId = styleNode === null ? null : wordAttr(styleNode, "val");
  const chunks: string[] = [];
  collectParagraph(paragraph, chunks, reader.unread);
  const text = chunks.join("").replace(/\s+/g, " ").trim();
  if (text === "") return;
  if (FURNITURE_TEXT.test(text)) {
    reader.unread.add("page_furniture");
    return;
  }
  const matched = resolveParagraphStyle(styleId, reader.styleNames);
  if (matched.unmapped !== null) reader.unread.add(`style:${matched.unmapped}`);
  reader.blocks.push(
    canonicalBlock({
      type: "block",
      attrs: { id: reader.ids(), type: matched.type },
      content: [{ type: "text", text }],
    }),
  );
}

function readContainer(reader: DocxReader, container: XmlNode): void {
  for (const child of childElements(container)) {
    const tag = localName(child.name);
    switch (tag) {
      case "p":
        readParagraph(reader, child);
        break;
      case "tbl":
        reader.unread.add("table");
        break;
      case "sectPr":
        readSectPr(reader, child);
        break;
      case "commentRangeStart":
      case "commentRangeEnd":
      case "commentReference":
        reader.unread.add("comment");
        break;
      case "sdt": {
        const content = firstChild(child, "sdtContent");
        if (content !== null) readContainer(reader, content);
        break;
      }
      default:
        break;
    }
  }
}

/**
 * The script a Word `.docx` file holds: paragraphs mapped by Word style name (ignoring case and spaces) into
 * screenplay elements, and unmapped styles, tables, images, footnotes, comments and page furniture recorded in
 * `unread`. Refuses archives over IMPORT_LIMIT_BYTES or XML parts over DOCX_PART_LIMIT_BYTES before inflating.
 */
export function readDocx(
  bytes: Uint8Array,
  options: { parseXml: XmlParser; ids: IdSource },
): ImportedScript {
  const parts = extractDocxParts(bytes);
  const root = parseXmlChecked(decodeText(parts.body), options.parseXml);
  if (localName(root.name) !== "document")
    throw new FormatError(
      "not_this_format",
      `the root is ${root.name}, not a Word document`,
    );
  const body = firstChild(root, "body");
  if (body === null)
    throw new FormatError(
      "not_this_format",
      "the Word document holds no body element",
    );
  const stylesRoot =
    parts.styles === null
      ? null
      : parseXmlChecked(decodeText(parts.styles), options.parseXml);
  const reader: DocxReader = {
    ids: options.ids,
    styleNames: readStyleNames(stylesRoot),
    blocks: [],
    unread: new Set(),
    paper: null,
  };
  readContainer(reader, body);
  return {
    from: "docx",
    title: null,
    paper: reader.paper,
    blocks: reader.blocks,
    notes: [],
    production: null,
    kept: [],
    coloursMapped: 0,
    unread: [...reader.unread],
  };
}
