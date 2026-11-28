// Pure OOXML Word (.docx) writer for manuscripts and scripts via fflate, preserving chapters, quotes, inline marks and links.
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
import { strToU8, zipSync } from "fflate";
import type { ScriptForExport } from "../script/model.ts";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const STYLES_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const HYPERLINK_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

const PAPER_TWIPS: Readonly<
  Record<"letter" | "a4", { readonly w: number; readonly h: number }>
> = Object.freeze({
  letter: { w: 12240, h: 15840 },
  a4: { w: 11906, h: 16838 },
});

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function findMark(
  marks: readonly MarkJSON[] | undefined,
  type: string,
): MarkJSON | undefined {
  return marks?.find((mark) => mark.type === type);
}

const TEXT_COLOUR_HEX: Readonly<Record<string, string>> = Object.freeze({
  red: "B42318",
  orange: "B54708",
  green: "067647",
  blue: "175CD3",
  violet: "6941C6",
});

const HIGHLIGHT_FILL_HEX: Readonly<Record<string, string>> = Object.freeze({
  yellow: "FEF08A",
  green: "BBF7D0",
  pink: "FBCFE8",
  orange: "FED7AA",
  violet: "DDD6FE",
});

function runPropsXml(marks: readonly MarkJSON[] | undefined): string {
  if (marks === undefined || marks.length === 0) return "";
  const parts: string[] = [];
  if (findMark(marks, "bold") !== undefined) parts.push("<w:b/>");
  if (findMark(marks, "italic") !== undefined) parts.push("<w:i/>");
  if (findMark(marks, "underline") !== undefined)
    parts.push('<w:u w:val="single"/>');
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
  if (findMark(marks, "link") !== undefined) {
    parts.push('<w:u w:val="single"/>');
  }
  return parts.length === 0 ? "" : `<w:rPr>${parts.join("")}</w:rPr>`;
}

interface LinkEntry {
  readonly id: string;
  readonly href: string;
}

function inlineXml(node: TextJSON, links: LinkEntry[]): string {
  if (node.type !== "text" || node.text === "") return "";
  const rPr = runPropsXml(node.marks);
  const run = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(node.text)}</w:t></w:r>`;
  const linkMark = findMark(node.marks, "link");
  const href = linkMark?.attrs?.href;
  if (typeof href === "string" && href !== "") {
    const id = `rId${links.length + 2}`;
    links.push({ id, href });
    return `<w:hyperlink r:id="${id}">${run}</w:hyperlink>`;
  }
  return run;
}

function alignValue(align: unknown, fallback: string | null): string | null {
  if (align === "left" || align === "center" || align === "right") return align;
  return fallback;
}

function raisedCapRunsXml(
  nodes: readonly TextJSON[],
  links: LinkEntry[],
): string | null {
  const firstIdx = nodes.findIndex((n) => n.type === "text" && n.text !== "");
  if (firstIdx < 0) return null;
  const first = nodes[firstIdx]!;
  const chars = [...first.text];
  const initial = chars[0];
  if (initial === undefined) return null;
  const tailText = chars.slice(1).join("");
  const capRun = `<w:r><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr><w:t xml:space="preserve">${escapeXml(initial)}</w:t></w:r>`;
  const restNodes: TextJSON[] = [
    ...(tailText === "" ? [] : [{ ...first, text: tailText }]),
    ...nodes.slice(firstIdx + 1),
  ];
  return capRun + restNodes.map((node) => inlineXml(node, links)).join("");
}

function dropCapRunXml(
  nodes: readonly TextJSON[],
  links: LinkEntry[],
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
  const restNodes: TextJSON[] = [
    ...(tailText === "" ? [] : [{ ...first, text: tailText }]),
    ...nodes.slice(firstIdx + 1),
  ];
  const restXml = restNodes.map((node) => inlineXml(node, links)).join("");
  return { dropXml, restXml };
}

function paragraphXml(
  block: BlockJSON,
  index: number,
  seenChapter: boolean,
  links: LinkEntry[],
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
    const split = dropCapRunXml(block.content, links, lineTwips);
    if (split !== null) {
      return {
        xml: `${split.dropXml}<w:p><w:pPr>${pPr.join("")}</w:pPr>${split.restXml}</w:p>`,
        isChapter,
      };
    }
  }

  const runs =
    firstLine === "raised_cap" && block.content !== undefined
      ? (raisedCapRunsXml(block.content, links) ?? "")
      : (block.content ?? []).map((node) => inlineXml(node, links)).join("");
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

function stylesXml(lineTwips: number): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles xmlns:w="${W_NS}">` +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    "</w:rPr></w:rPrDefault></w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/>' +
    `<w:pPr><w:spacing w:line="${lineTwips}" w:lineRule="auto" w:after="0"/><w:ind w:firstLine="720"/></w:pPr>` +
    "</w:style>" +
    '<w:style w:type="paragraph" w:styleId="Heading1">' +
    '<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    `<w:pPr><w:keepNext/><w:spacing w:before="2880" w:after="480" w:line="${lineTwips}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>` +
    '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>' +
    "</w:style>" +
    '<w:style w:type="paragraph" w:styleId="Quote">' +
    '<w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
    `<w:pPr><w:spacing w:before="240" w:after="240" w:line="${lineTwips === 240 ? 240 : 360}" w:lineRule="auto"/><w:ind w:left="720" w:right="720" w:firstLine="0"/></w:pPr>` +
    "<w:rPr><w:i/></w:rPr>" +
    "</w:style>" +
    '<w:style w:type="paragraph" w:styleId="SceneBreak">' +
    '<w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/>' +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="240" w:line="${lineTwips}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>` +
    "</w:style>" +
    '<w:style w:type="paragraph" w:styleId="Caption">' +
    '<w:name w:val="Caption"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="120" w:after="240" w:line="300" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr>' +
    '<w:rPr><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
    "</w:style>" +
    "</w:styles>"
  );
}

function contentTypesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    "</Types>"
  );
}

function rootRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="${PKG_REL_NS}">` +
    `<Relationship Id="rId1" Type="${DOC_REL_TYPE}" Target="word/document.xml"/>` +
    "</Relationships>"
  );
}

function documentRelsXml(links: readonly LinkEntry[]): string {
  const rels = [
    `<Relationship Id="rId1" Type="${STYLES_REL_TYPE}" Target="styles.xml"/>`,
    ...links.map(
      (link) =>
        `<Relationship Id="${link.id}" Type="${HYPERLINK_REL_TYPE}" Target="${escapeXml(link.href)}" TargetMode="External"/>`,
    ),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="${PKG_REL_NS}">${rels.join("")}</Relationships>`
  );
}

/** Writes `script` as a valid Word (.docx) archive with Heading 1 chapters, prose spacing, quotes, inline marks and links. */
export function writeDocx(
  script: ScriptForExport,
  options?: { readonly paper?: "letter" | "a4"; readonly lineSpacing?: 1 | 2 },
): Uint8Array<ArrayBuffer> {
  const paper = PAPER_TWIPS[options?.paper ?? "letter"];
  const lineTwips = options?.lineSpacing === 1 ? 240 : 480;
  const links: LinkEntry[] = [];
  let seenChapter = false;
  const paragraphs: string[] = [];

  for (let i = 0; i < script.blocks.length; i++) {
    const { xml, isChapter } = paragraphXml(
      script.blocks[i]!,
      i,
      seenChapter,
      links,
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
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    "</w:sectPr></w:body></w:document>";

  const zipped = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelsXml()),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(stylesXml(lineTwips)),
    "word/_rels/document.xml.rels": strToU8(documentRelsXml(links)),
  });
  return new Uint8Array(zipped);
}
