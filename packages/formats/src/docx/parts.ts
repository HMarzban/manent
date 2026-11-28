// Static OOXML package parts for Word (.docx) export: styles, footnotes, settings, content types and relationships.
import type { ExtractedFootnote } from "../script/footnotes.ts";

export const W_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const R_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const STYLES_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const FOOTNOTES_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
const SETTINGS_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";
const HYPERLINK_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

export interface LinkEntry {
  readonly id: string;
  readonly href: string;
}

export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function stylesXml(
  lineTwips: number,
  fontName: string,
  fontHalfPt: number,
): string {
  const fontEsc = escapeXml(fontName);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles xmlns:w="${W_NS}">` +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    `<w:rFonts w:ascii="${fontEsc}" w:hAnsi="${fontEsc}" w:cs="${fontEsc}"/>` +
    `<w:sz w:val="${fontHalfPt}"/><w:szCs w:val="${fontHalfPt}"/>` +
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
    '<w:style w:type="paragraph" w:styleId="Heading2">' +
    '<w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    `<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120" w:line="${lineTwips}" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr>` +
    '<w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>' +
    "</w:style>" +
    '<w:style w:type="paragraph" w:styleId="Epigraph">' +
    '<w:name w:val="Epigraph"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    `<w:pPr><w:spacing w:before="240" w:after="240" w:line="${lineTwips === 240 ? 240 : 360}" w:lineRule="auto"/><w:ind w:left="1440" w:right="720" w:firstLine="0"/><w:jc w:val="right"/></w:pPr>` +
    "<w:rPr><w:i/></w:rPr>" +
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
    '<w:style w:type="character" w:styleId="FootnoteReference">' +
    '<w:name w:val="footnote reference"/>' +
    '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>' +
    "</w:style>" +
    '<w:style w:type="paragraph" w:styleId="FootnoteText">' +
    '<w:name w:val="footnote text"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:line="240" w:lineRule="auto" w:after="60"/><w:ind w:firstLine="0"/></w:pPr>' +
    '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
    "</w:style>" +
    "</w:styles>"
  );
}

export function footnotesXml(notes: readonly ExtractedFootnote[]): string {
  const items = notes
    .map(
      (note) =>
        `<w:footnote w:id="${note.ordinal}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` +
        '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>' +
        `<w:r><w:t xml:space="preserve"> ${escapeXml(note.text)}</w:t></w:r></w:p></w:footnote>`,
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:footnotes xmlns:w="${W_NS}">` +
    '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>' +
    '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>' +
    `${items}</w:footnotes>`
  );
}

export function settingsXml(mirrorMargins: boolean): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:settings xmlns:w="${W_NS}">${mirrorMargins ? "<w:mirrorMargins/>" : ""}</w:settings>`
  );
}

export function contentTypesXml(options: {
  readonly hasFootnotes: boolean;
  readonly hasSettings: boolean;
}): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    (options.hasFootnotes
      ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
      : "") +
    (options.hasSettings
      ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      : "") +
    "</Types>"
  );
}

export function rootRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="${PKG_REL_NS}">` +
    `<Relationship Id="rId1" Type="${DOC_REL_TYPE}" Target="word/document.xml"/>` +
    "</Relationships>"
  );
}

export function documentRelsXml(
  links: readonly LinkEntry[],
  options: { readonly hasFootnotes: boolean; readonly hasSettings: boolean },
): string {
  const rels = [
    `<Relationship Id="rId1" Type="${STYLES_REL_TYPE}" Target="styles.xml"/>`,
    ...(options.hasFootnotes
      ? [
          `<Relationship Id="rIdFootnotes" Type="${FOOTNOTES_REL_TYPE}" Target="footnotes.xml"/>`,
        ]
      : []),
    ...(options.hasSettings
      ? [
          `<Relationship Id="rIdSettings" Type="${SETTINGS_REL_TYPE}" Target="settings.xml"/>`,
        ]
      : []),
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
