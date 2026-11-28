// Pure OOXML Word (.docx) writer for manuscripts and scripts via fflate, preserving chapters, subheadings, epigraphs,
// quotes, inline marks, links, footnotes, trim sizes and mirrored margins.
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
import { strToU8, zipSync } from "fflate";
import { extractFootnotes } from "../script/footnotes.ts";
import type { ExtractedFootnote } from "../script/footnotes.ts";
import type { ScriptForExport } from "../script/model.ts";
import { HIGHLIGHT_FILL_HEX, TEXT_COLOUR_HEX } from "./colours.ts";
import {
  R_NS,
  W_NS,
  contentTypesXml,
  documentRelsXml,
  escapeXml,
  footnotesXml,
  rootRelsXml,
  settingsXml,
  stylesXml,
} from "./parts.ts";
import type { LinkEntry } from "./parts.ts";

export type DocxPaper =
  "letter" | "a4" | "trade_5x8" | "trade_5_5x8_5" | "trade_6x9";

const PAPER_TWIPS: Readonly<
  Record<DocxPaper, { readonly w: number; readonly h: number }>
> = Object.freeze({
  letter: { w: 12240, h: 15840 },
  a4: { w: 11906, h: 16838 },
  trade_5x8: { w: 7200, h: 11520 },
  trade_5_5x8_5: { w: 7920, h: 12240 },
  trade_6x9: { w: 8640, h: 12960 },
});

function findMark(
  marks: readonly MarkJSON[] | undefined,
  type: string,
): MarkJSON | undefined {
  return marks?.find((mark) => mark.type === type);
}

function runPropsXml(marks: readonly MarkJSON[] | undefined): string {
  if (marks === undefined || marks.length === 0) return "";
  const parts: string[] = [];
  if (findMark(marks, "bold") !== undefined) parts.push("<w:b/>");
  if (findMark(marks, "italic") !== undefined) parts.push("<w:i/>");
  const hasUnderline = findMark(marks, "underline") !== undefined;
  if (hasUnderline) parts.push('<w:u w:val="single"/>');
  if (findMark(marks, "strike") !== undefined) parts.push("<w:strike/>");
  if (findMark(marks, "caps") !== undefined) parts.push("<w:caps/>");
  if (findMark(marks, "sup") !== undefined)
    parts.push('<w:vertAlign w:val="superscript"/>');
  if (findMark(marks, "sub") !== undefined)
    parts.push('<w:vertAlign w:val="subscript"/>');
  const colorName = findMark(marks, "color")?.attrs?.value;
  if (
    typeof colorName === "string" &&
    Object.hasOwn(TEXT_COLOUR_HEX, colorName)
  )
    parts.push(`<w:color w:val="${TEXT_COLOUR_HEX[colorName]}"/>`);
  const hlName = findMark(marks, "highlight")?.attrs?.value;
  if (typeof hlName === "string" && Object.hasOwn(HIGHLIGHT_FILL_HEX, hlName))
    parts.push(
      `<w:shd w:val="clear" w:color="auto" w:fill="${HIGHLIGHT_FILL_HEX[hlName]}"/>`,
    );
  if (findMark(marks, "link") !== undefined && !hasUnderline) {
    parts.push('<w:u w:val="single"/>');
  }
  return parts.length === 0 ? "" : `<w:rPr>${parts.join("")}</w:rPr>`;
}

function footnoteRefsXml(
  notes: readonly ExtractedFootnote[] | undefined,
): string {
  if (notes === undefined || notes.length === 0) return "";
  return notes
    .map(
      (note) =>
        `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${note.ordinal}"/></w:r>`,
    )
    .join("");
}

function inlineXml(
  node: TextJSON,
  links: LinkEntry[],
  endingNotes: readonly ExtractedFootnote[] | undefined,
): string {
  if (node.type !== "text" || node.text === "") return "";
  const rPr = runPropsXml(node.marks);
  const run = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(node.text)}</w:t></w:r>`;
  const linkMark = findMark(node.marks, "link");
  const href = linkMark?.attrs?.href;
  const wrapped =
    typeof href === "string" && href !== ""
      ? (() => {
          const id = `rId${links.length + 2}`;
          links.push({ id, href });
          return `<w:hyperlink r:id="${id}">${run}</w:hyperlink>`;
        })()
      : run;
  return wrapped + footnoteRefsXml(endingNotes);
}

function alignValue(align: unknown, fallback: string | null): string | null {
  if (align === "left" || align === "center" || align === "right") return align;
  return fallback;
}

function renderRunsWithOffset(
  nodes: readonly TextJSON[],
  blockIndex: number,
  startIndex: number,
  links: LinkEntry[],
  endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>,
): string {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    out += inlineXml(
      nodes[i]!,
      links,
      endingAt.get(`${blockIndex}:${startIndex + i}`),
    );
  }
  return out;
}

function raisedCapRunsXml(
  nodes: readonly TextJSON[],
  blockIndex: number,
  links: LinkEntry[],
  endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>,
): string | null {
  const firstIdx = nodes.findIndex((n) => n.type === "text" && n.text !== "");
  if (firstIdx < 0) return null;
  const first = nodes[firstIdx]!;
  const chars = [...first.text];
  const initial = chars[0];
  if (initial === undefined) return null;
  const tailText = chars.slice(1).join("");
  const capRun = `<w:r><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr><w:t xml:space="preserve">${escapeXml(initial)}</w:t></w:r>`;
  const firstTail =
    tailText === ""
      ? footnoteRefsXml(endingAt.get(`${blockIndex}:${firstIdx}`))
      : inlineXml(
          { ...first, text: tailText },
          links,
          endingAt.get(`${blockIndex}:${firstIdx}`),
        );
  const rest = renderRunsWithOffset(
    nodes.slice(firstIdx + 1),
    blockIndex,
    firstIdx + 1,
    links,
    endingAt,
  );
  return capRun + firstTail + rest;
}

function dropCapRunXml(
  nodes: readonly TextJSON[],
  blockIndex: number,
  links: LinkEntry[],
  endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>,
  lineTwips: number,
): { dropXml: string; restXml: string } | null {
  const firstIdx = nodes.findIndex((n) => n.type === "text" && n.text !== "");
  if (firstIdx < 0) return null;
  const first = nodes[firstIdx]!;
  const chars = [...first.text];
  const initial = chars[0];
  if (initial === undefined) return null;
  const tailText = chars.slice(1).join("");
  const dropXml =
    '<w:p><w:pPr><w:pStyle w:val="Normal"/>' +
    '<w:framePr w:dropCap="drop" w:lines="3" w:wrap="around" w:vAnchor="text" w:hAnchor="text" w:hSpace="120"/>' +
    `<w:spacing w:line="${lineTwips}" w:lineRule="auto" w:after="0"/><w:ind w:firstLine="0"/></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:sz w:val="72"/><w:szCs w:val="72"/></w:rPr><w:t>${escapeXml(initial)}</w:t></w:r></w:p>`;
  const firstTail =
    tailText === ""
      ? footnoteRefsXml(endingAt.get(`${blockIndex}:${firstIdx}`))
      : inlineXml(
          { ...first, text: tailText },
          links,
          endingAt.get(`${blockIndex}:${firstIdx}`),
        );
  const restXml =
    firstTail +
    renderRunsWithOffset(
      nodes.slice(firstIdx + 1),
      blockIndex,
      firstIdx + 1,
      links,
      endingAt,
    );
  return { dropXml, restXml };
}

function paragraphXml(
  block: BlockJSON,
  index: number,
  seenChapter: boolean,
  links: LinkEntry[],
  endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>,
  lineTwips: number,
): { xml: string; isChapter: boolean } {
  const attrs = block.attrs ?? {};
  const type = typeof attrs.type === "string" ? attrs.type : "body";
  if (type === "group") return { xml: "", isChapter: false };
  if (type === "page_break") {
    return {
      xml: '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      isChapter: false,
    };
  }
  const pPr: string[] = [];
  let defaultAlign: string | null = null;
  let isChapter = false;

  if (type === "chapter") {
    isChapter = true;
    pPr.push('<w:pStyle w:val="Heading1"/>');
    if (seenChapter && index > 0) pPr.push("<w:pageBreakBefore/>");
    defaultAlign = "center";
  } else if (type === "subheading") {
    pPr.push('<w:pStyle w:val="Heading2"/>');
  } else if (type === "epigraph") {
    pPr.push('<w:pStyle w:val="Epigraph"/>');
    defaultAlign = "right";
  } else if (type === "quote") {
    pPr.push('<w:pStyle w:val="Quote"/>');
  } else if (type === "break") {
    pPr.push('<w:pStyle w:val="SceneBreak"/>');
    defaultAlign = "center";
  } else if (type === "graphic") {
    pPr.push('<w:pStyle w:val="Caption"/>');
  } else {
    pPr.push('<w:pStyle w:val="Normal"/>');
  }

  const firstLine = attrs.firstLine;
  if (
    firstLine === "flush" ||
    firstLine === "drop_cap" ||
    firstLine === "raised_cap"
  ) {
    pPr.push('<w:ind w:firstLine="0"/>');
  }

  const jc = alignValue(attrs.align, defaultAlign);
  if (jc !== null) pPr.push(`<w:jc w:val="${jc}"/>`);

  if (firstLine === "drop_cap" && block.content !== undefined) {
    const split = dropCapRunXml(
      block.content,
      index,
      links,
      endingAt,
      lineTwips,
    );
    if (split !== null) {
      return {
        xml: `${split.dropXml}<w:p><w:pPr>${pPr.join("")}</w:pPr>${split.restXml}</w:p>`,
        isChapter,
      };
    }
  }

  const runs =
    firstLine === "raised_cap" && block.content !== undefined
      ? (raisedCapRunsXml(block.content, index, links, endingAt) ?? "")
      : renderRunsWithOffset(block.content ?? [], index, 0, links, endingAt);
  const content =
    runs !== ""
      ? runs
      : type === "break"
        ? '<w:r><w:t xml:space="preserve">* * *</w:t></w:r>'
        : "";
  return {
    xml: `<w:p><w:pPr>${pPr.join("")}</w:pPr>${content}</w:p>`,
    isChapter,
  };
}

export interface DocxWriteOptions {
  readonly paper?: DocxPaper;
  readonly lineSpacing?: 1 | 2;
  readonly mirrorMargins?: boolean;
  readonly marginsPt?: {
    readonly inner: number;
    readonly outer: number;
    readonly top: number;
    readonly bottom: number;
  };
  readonly bookFont?: string;
  readonly fontSizePt?: number;
}

const toTwips = (pt: number): number => Math.round(pt * 20);

/** Writes `script` as a valid Word (.docx) archive with chapters, subheadings, epigraphs, inline marks, links, footnotes and optional mirrored margins. */
export function writeDocx(
  script: ScriptForExport,
  options?: DocxWriteOptions,
): Uint8Array<ArrayBuffer> {
  const paper = PAPER_TWIPS[options?.paper ?? "letter"];
  const lineTwips = options?.lineSpacing === 1 ? 240 : 480;
  const mirrorMargins = options?.mirrorMargins === true;
  const leftTwips =
    options?.marginsPt === undefined ? 1440 : toTwips(options.marginsPt.inner);
  const rightTwips =
    options?.marginsPt === undefined ? 1440 : toTwips(options.marginsPt.outer);
  const topTwips =
    options?.marginsPt === undefined ? 1440 : toTwips(options.marginsPt.top);
  const bottomTwips =
    options?.marginsPt === undefined ? 1440 : toTwips(options.marginsPt.bottom);
  const fontName = options?.bookFont ?? "Georgia";
  const fontHalfPt = Math.round((options?.fontSizePt ?? 12) * 2);

  const footnotes = extractFootnotes(script.blocks);
  const hasFootnotes = footnotes.notes.length > 0;
  const hasSettings = mirrorMargins;
  const links: LinkEntry[] = [];
  let seenChapter = false;
  const paragraphs: string[] = [];

  for (let i = 0; i < script.blocks.length; i++) {
    const { xml, isChapter } = paragraphXml(
      script.blocks[i]!,
      i,
      seenChapter,
      links,
      footnotes.endingAt,
      lineTwips,
    );
    if (xml !== "") paragraphs.push(xml);
    if (isChapter) seenChapter = true;
  }

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>` +
    paragraphs.join("") +
    `<w:sectPr><w:pgSz w:w="${paper.w}" w:h="${paper.h}"/>` +
    `<w:pgMar w:top="${topTwips}" w:right="${rightTwips}" w:bottom="${bottomTwips}" w:left="${leftTwips}" w:header="720" w:footer="720" w:gutter="0"/>` +
    "</w:sectPr></w:body></w:document>";

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      contentTypesXml({ hasFootnotes, hasSettings }),
    ),
    "_rels/.rels": strToU8(rootRelsXml()),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(stylesXml(lineTwips, fontName, fontHalfPt)),
    "word/_rels/document.xml.rels": strToU8(
      documentRelsXml(links, { hasFootnotes, hasSettings }),
    ),
  };
  if (hasFootnotes)
    files["word/footnotes.xml"] = strToU8(footnotesXml(footnotes.notes));
  if (hasSettings)
    files["word/settings.xml"] = strToU8(settingsXml(mirrorMargins));

  return new Uint8Array(zipSync(files));
}
