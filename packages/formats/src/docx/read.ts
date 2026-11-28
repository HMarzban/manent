// Reading a Word (.docx) file into the format-neutral script with full inline marks, links, openings, footnotes and Book format detection.
import { canonicalBlock } from "@manent/schema";
import type {
  Alignment,
  BlockJSON,
  FirstLine,
  FormatId,
  IdSource,
} from "@manent/schema";
import { decodeText } from "../script/decode.ts";
import { FormatError } from "../script/model.ts";
import type { ImportedScript } from "../script/model.ts";
import { parseXmlChecked } from "../xml/checks.ts";
import type { XmlNode, XmlParser } from "../xml/node.ts";
import {
  coalesceRuns,
  parseParagraphContent,
  readFootnotesPart,
  readHyperlinkRels,
} from "./runs.ts";
import type { ParsedRun } from "./runs.ts";
import {
  childElements,
  detectDocxFormat,
  firstChild,
  hasNormalFirstLineIndent,
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
const SCENE_BREAK_TEXT = /^(?:\*\s*\*\s*\*|---)$/;

interface DocxReader {
  readonly ids: IdSource;
  readonly format: FormatId;
  readonly styleNames: ReadonlyMap<string, string>;
  readonly hyperlinks: ReadonlyMap<string, string>;
  readonly footnotes: ReadonlyMap<string, string>;
  readonly normalFirstLineIndent: boolean;
  readonly blocks: BlockJSON[];
  readonly unread: Set<string>;
  paper: "letter" | "a4" | null;
  coloursMapped: number;
  pendingDropCap: string | null;
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

function readAlignment(
  pPr: XmlNode | null,
  type: string,
): Alignment | undefined {
  if (pPr === null) return undefined;
  const jc = firstChild(pPr, "jc");
  const raw = jc === null ? null : wordAttr(jc, "val");
  let align: Alignment | undefined;
  if (raw === "left" || raw === "start") align = "left";
  else if (raw === "center") align = "center";
  else if (raw === "right" || raw === "end") align = "right";
  if (align === undefined) return undefined;
  if ((type === "chapter" || type === "break") && align === "center")
    return undefined;
  if (type === "epigraph" && align === "right") return undefined;
  return align;
}

function hasExplicitFlushIndent(pPr: XmlNode | null): boolean {
  if (pPr === null) return false;
  const ind = firstChild(pPr, "ind");
  return ind !== null && wordAttr(ind, "firstLine") === "0";
}

function isDropCapFrame(pPr: XmlNode | null): boolean {
  if (pPr === null) return false;
  const frame = firstChild(pPr, "framePr");
  if (frame === null) return false;
  const mode = wordAttr(frame, "dropCap");
  return mode === "drop" || mode === "margin";
}

/** Strips synthetic raised-cap bold/size styling from a single-character leading run when present. */
function detectRaisedCap(runs: ParsedRun[]): boolean {
  const first = runs[0];
  if (first === undefined || first.sizeHalfPt === null || first.sizeHalfPt < 36)
    return false;
  if ([...first.text].length !== 1) return false;
  const nextMarks = runs[1]?.marks ?? [];
  runs[0] = {
    text: first.text,
    marks: [...nextMarks],
    sizeHalfPt: null,
  };
  return true;
}

function flushDanglingDropCap(reader: DocxReader): void {
  if (reader.pendingDropCap === null) return;
  const text = reader.pendingDropCap;
  reader.pendingDropCap = null;
  reader.blocks.push(
    canonicalBlock({
      type: "block",
      attrs: { id: reader.ids(), type: "body", firstLine: "drop_cap" },
      content: [{ type: "text", text }],
    }),
  );
}

function readParagraph(reader: DocxReader, paragraph: XmlNode): void {
  const pPr = firstChild(paragraph, "pPr");
  if (pPr !== null) {
    const sectPr = firstChild(pPr, "sectPr");
    if (sectPr !== null) readSectPr(reader, sectPr);
  }
  const styleNode = pPr === null ? null : firstChild(pPr, "pStyle");
  const styleId = styleNode === null ? null : wordAttr(styleNode, "val");

  const parsed = parseParagraphContent(paragraph, {
    hyperlinks: reader.hyperlinks,
    footnotes: reader.footnotes,
    ids: reader.ids,
    unread: reader.unread,
  });
  reader.coloursMapped += parsed.coloursMapped;

  if (isDropCapFrame(pPr)) {
    const initial = parsed.runs
      .map((r) => r.text)
      .join("")
      .trim();
    if (initial !== "") {
      flushDanglingDropCap(reader);
      reader.pendingDropCap = initial;
    }
    return;
  }

  const plain = parsed.runs
    .map((r) => r.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (plain === "") {
    if (parsed.hasPageBreak) {
      flushDanglingDropCap(reader);
      reader.blocks.push(
        canonicalBlock({
          type: "block",
          attrs: { id: reader.ids(), type: "page_break" },
          content: [],
        }),
      );
    }
    return;
  }

  if (FURNITURE_TEXT.test(plain)) {
    reader.unread.add("page_furniture");
    return;
  }

  const matched = resolveParagraphStyle(
    styleId,
    reader.styleNames,
    reader.format,
  );
  if (matched.unmapped !== null) reader.unread.add(`style:${matched.unmapped}`);

  let firstLine: FirstLine | undefined;
  const runs = [...parsed.runs];
  if (reader.pendingDropCap !== null) {
    const initial = reader.pendingDropCap;
    reader.pendingDropCap = null;
    if (runs.length > 0) {
      runs[0] = { ...runs[0]!, text: initial + runs[0]!.text };
    } else {
      runs.push({ text: initial, marks: [], sizeHalfPt: null });
    }
    if (matched.type === "body") firstLine = "drop_cap";
  } else if (matched.type === "body") {
    const flush = hasExplicitFlushIndent(pPr);
    if (flush && detectRaisedCap(runs)) {
      firstLine = "raised_cap";
    } else if (flush && reader.normalFirstLineIndent) {
      firstLine = "flush";
    }
  }

  const align = readAlignment(pPr, matched.type);
  const content =
    matched.type === "break" && SCENE_BREAK_TEXT.test(plain)
      ? []
      : coalesceRuns(runs);

  reader.blocks.push(
    canonicalBlock({
      type: "block",
      attrs: {
        id: reader.ids(),
        type: matched.type,
        ...(align === undefined ? {} : { align }),
        ...(firstLine === undefined ? {} : { firstLine }),
      },
      content,
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
 * The script a Word `.docx` file holds: paragraphs mapped by Word style name into screenplay or Book (manuscript)
 * elements, reconstructing inline marks, hyperlinks, opening styles (`drop_cap`, `raised_cap`, `flush`), alignment,
 * page breaks and footnotes, with unmapped constructs recorded in `unread`.
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
  const relsRoot =
    parts.rels === null
      ? null
      : parseXmlChecked(decodeText(parts.rels), options.parseXml);
  const footnotesRoot =
    parts.footnotes === null
      ? null
      : parseXmlChecked(decodeText(parts.footnotes), options.parseXml);
  const styleNames = readStyleNames(stylesRoot);
  const format = detectDocxFormat(body, stylesRoot, styleNames);
  const reader: DocxReader = {
    ids: options.ids,
    format,
    styleNames,
    hyperlinks: readHyperlinkRels(relsRoot),
    footnotes: readFootnotesPart(footnotesRoot),
    normalFirstLineIndent: hasNormalFirstLineIndent(stylesRoot),
    blocks: [],
    unread: new Set(),
    paper: null,
    coloursMapped: 0,
    pendingDropCap: null,
  };
  readContainer(reader, body);
  flushDanglingDropCap(reader);
  return {
    from: "docx",
    ...(format === "manuscript" ? { format } : {}),
    title: null,
    paper: reader.paper,
    blocks: reader.blocks,
    notes: [],
    production: null,
    kept: [],
    coloursMapped: reader.coloursMapped,
    unread: [...reader.unread],
  };
}
