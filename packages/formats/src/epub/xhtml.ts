// Valid EPUB 3 XHTML chapter rendering: inline marks, links, drop/raised caps, subheadings, epigraphs, figures and popup footnotes.
import { isSafeHref } from "@manent/schema";
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
import type { ExtractedFootnote } from "../script/footnotes.ts";

export interface EpubImageRef {
  readonly fileName: string;
  readonly mime: "image/png" | "image/jpeg" | "image/webp";
}

export function escapeXhtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapInlineMarks(
  html: string,
  marks: readonly MarkJSON[] | undefined,
): string {
  if (marks === undefined || marks.length === 0) return html;
  let out = html;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<span class="u">${out}</span>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "caps":
        out = `<span class="caps">${out}</span>`;
        break;
      case "sup":
        out = `<sup>${out}</sup>`;
        break;
      case "sub":
        out = `<sub>${out}</sub>`;
        break;
      case "color": {
        const val = mark.attrs?.value;
        if (typeof val === "string" && /^[a-z]+$/.test(val))
          out = `<span class="c-${val}">${out}</span>`;
        break;
      }
      case "highlight": {
        const val = mark.attrs?.value;
        if (typeof val === "string" && /^[a-z]+$/.test(val))
          out = `<span class="hl-${val}">${out}</span>`;
        break;
      }
      case "link": {
        const href = mark.attrs?.href;
        if (typeof href === "string" && isSafeHref(href))
          out = `<a href="${escapeXhtml(href)}">${out}</a>`;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function renderFootnoteRefs(
  notes: readonly ExtractedFootnote[] | undefined,
): string {
  if (notes === undefined || notes.length === 0) return "";
  return notes
    .map(
      (note) =>
        `<a class="noteref" epub:type="noteref" role="doc-noteref" id="fnref-${note.ordinal}" href="#fn-${note.ordinal}"><sup>${note.ordinal}</sup></a>`,
    )
    .join("");
}

function renderRuns(
  nodes: readonly TextJSON[] | undefined,
  blockIndex: number,
  endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>,
  withInitialSpan: boolean,
): string {
  if (nodes === undefined || nodes.length === 0) return "";
  let initialDone = !withInitialSpan;
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.type !== "text" || node.text === "") continue;
    let bodyHtml: string;
    if (!initialDone) {
      const chars = [...node.text];
      const first = chars[0];
      if (first !== undefined) {
        initialDone = true;
        const rest = chars.slice(1).join("");
        bodyHtml =
          `<span class="initial">${escapeXhtml(first)}</span>` +
          (rest === "" ? "" : wrapInlineMarks(escapeXhtml(rest), node.marks));
      } else {
        bodyHtml = wrapInlineMarks(escapeXhtml(node.text), node.marks);
      }
    } else {
      bodyHtml = wrapInlineMarks(escapeXhtml(node.text), node.marks);
    }
    out += bodyHtml + renderFootnoteRefs(endingAt.get(`${blockIndex}:${i}`));
  }
  return out;
}

function alignClass(align: unknown): string {
  if (align === "left" || align === "center" || align === "right")
    return ` align-${align}`;
  return "";
}

export interface ChapterItem {
  readonly block: BlockJSON;
  readonly blockIndex: number;
}

/** Renders one chapter's blocks + popup footnotes into a standalone EPUB 3 XHTML document. */
export function renderChapterXhtml(options: {
  readonly title: string;
  readonly language: string;
  readonly items: readonly ChapterItem[];
  readonly endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>;
  readonly images: ReadonlyMap<string, EpubImageRef>;
}): string {
  const { title, language, items, endingAt, images } = options;
  const chapterNotes: ExtractedFootnote[] = [];
  const bodyParts: string[] = [];

  for (const { block, blockIndex } of items) {
    const attrs = block.attrs ?? {};
    const type = typeof attrs.type === "string" ? attrs.type : "body";
    if (type === "group") continue;

    // Collect footnotes appearing in this block for chapter-end popup asides
    const contentLen = block.content?.length ?? 0;
    for (let r = 0; r < contentLen; r++) {
      const ending = endingAt.get(`${blockIndex}:${r}`);
      if (ending !== undefined) chapterNotes.push(...ending);
    }

    if (type === "page_break") {
      bodyParts.push('<div class="page-break" epub:type="pagebreak"></div>');
      continue;
    }

    if (type === "graphic") {
      const graphic =
        typeof attrs.graphic === "object" && attrs.graphic !== null
          ? attrs.graphic
          : null;
      const assetId = graphic?.assetId ?? null;
      const alt = graphic?.alt ?? "";
      const caption = renderRuns(block.content, blockIndex, endingAt, false);
      const img = assetId === null ? undefined : images.get(assetId);
      const parts: string[] = [];
      if (img !== undefined)
        parts.push(
          `<img src="../images/${escapeXhtml(img.fileName)}" alt="${escapeXhtml(alt)}"/>`,
        );
      if (caption !== "") parts.push(`<figcaption>${caption}</figcaption>`);
      else if (graphic?.label !== undefined && graphic.label !== "")
        parts.push(`<figcaption>${escapeXhtml(graphic.label)}</figcaption>`);
      if (parts.length > 0)
        bodyParts.push(`<figure class="graphic">${parts.join("")}</figure>`);
      continue;
    }

    const align = alignClass(attrs.align);
    if (type === "chapter") {
      const inner = renderRuns(block.content, blockIndex, endingAt, false);
      bodyParts.push(`<h1 class="chapter${align}">${inner}</h1>`);
    } else if (type === "subheading") {
      const inner = renderRuns(block.content, blockIndex, endingAt, false);
      bodyParts.push(`<h2 class="subheading${align}">${inner}</h2>`);
    } else if (type === "epigraph") {
      const inner = renderRuns(block.content, blockIndex, endingAt, false);
      bodyParts.push(
        `<blockquote class="epigraph${align}"><p>${inner}</p></blockquote>`,
      );
    } else if (type === "quote") {
      const inner = renderRuns(block.content, blockIndex, endingAt, false);
      bodyParts.push(
        `<blockquote class="quote${align}"><p>${inner}</p></blockquote>`,
      );
    } else if (type === "break") {
      const inner = renderRuns(block.content, blockIndex, endingAt, false);
      bodyParts.push(
        `<p class="scene-break${align}">${inner === "" ? "* * *" : inner}</p>`,
      );
    } else {
      const firstLine = attrs.firstLine;
      const openClass =
        firstLine === "drop_cap"
          ? " drop-cap"
          : firstLine === "raised_cap"
            ? " raised-cap"
            : firstLine === "flush"
              ? " flush"
              : "";
      const hasInitial = firstLine === "drop_cap" || firstLine === "raised_cap";
      const inner = renderRuns(block.content, blockIndex, endingAt, hasInitial);
      bodyParts.push(`<p class="body${openClass}${align}">${inner}</p>`);
    }
  }

  const footnotesSection =
    chapterNotes.length === 0
      ? ""
      : '<section class="footnotes" epub:type="endnotes" role="doc-endnotes">' +
        chapterNotes
          .map(
            (note) =>
              `<aside epub:type="footnote" role="doc-footnote" id="fn-${note.ordinal}">` +
              `<p><a href="#fnref-${note.ordinal}" role="doc-backlink">${note.ordinal}.</a> ${escapeXhtml(note.text)}</p>` +
              "</aside>",
          )
          .join("") +
        "</section>";

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXhtml(language)}" lang="${escapeXhtml(language)}">\n` +
    "<head>\n" +
    `<title>${escapeXhtml(title)}</title>\n` +
    '<link rel="stylesheet" type="text/css" href="../styles/book.css"/>\n' +
    "</head>\n" +
    `<body>\n${bodyParts.join("\n")}\n${footnotesSection}\n</body>\n` +
    "</html>\n"
  );
}
