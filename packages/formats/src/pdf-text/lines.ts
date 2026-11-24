// Grouping positioned PDF text items into lines, dropping page furniture and classifying elements by left edge.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockType, IdSource } from "@manent/schema";

const PT_PER_INCH = 72;
/** Lines with baselines above 1 inch from the top, or below 0.85 inch from the bottom, are header/footer furniture. */
const TOP_MARGIN_PT = 72;
const BOTTOM_MARGIN_PT = 62;
/** Items whose baselines differ by at most this many points sit on the same line. */
const LINE_Y_TOLERANCE_PT = 3;
/** Horizontal gap under which adjacent text items are concatenated without an extra space. */
const TOUCHING_GAP_PT = 1.5;
/** Horizontal gap above which a separate margin token (scene number, revision mark) is split off. */
const CHUNK_GAP_PT = 36;
/** Maximum vertical baseline step (in points) for consecutive lines of one wrapped paragraph. */
const WRAP_LINE_GAP_PT = 18;
/** Minimum right-margin position (points from right edge) for a trailing revision asterisk or right scene number. */
const RIGHT_MARGIN_INSET_PT = 108;

const SCENE_HEADING_PREFIX = /^(?:int\.|ext\.|i\/e(?:\.|\b)|est\.)/i;
const MORE_LINE = /^\(more\)$/i;
const CONTINUED_LINE = /^(?:\(continued\)|continued:(?:\s*\(\d+\))?)$/i;
const CONTD_SUFFIX = new RegExp("\\s*\\(CONT['’]D\\)$", "i");
const PAGE_NUMBER_TEXT = /^\d+[A-Z]*\.?$/;
const SCENE_NUMBER_TOKEN = /^[A-Z]?\d+[A-Z]*\.?$/i;

export interface PdfSpan {
  readonly x: number;
  readonly end: number;
  readonly y: number;
  readonly text: string;
}

export interface PdfPageInput {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly spans: readonly PdfSpan[];
}

interface TextChunk {
  readonly x: number;
  readonly end: number;
  readonly text: string;
}

interface VisualLine {
  readonly y: number;
  readonly chunks: readonly TextChunk[];
}

interface DraftBlock {
  readonly type: BlockType;
  text: string;
  lastY: number;
  pageIndex: number;
}

/** Joins horizontally adjacent spans on one line into chunks separated by wide gaps. */
function buildChunks(spans: readonly PdfSpan[]): TextChunk[] {
  const ordered = spans.toSorted((a, b) => a.x - b.x);
  const chunks: TextChunk[] = [];
  for (const span of ordered) {
    const prev = chunks.at(-1);
    if (prev === undefined) {
      chunks.push({ x: span.x, end: span.end, text: span.text });
      continue;
    }
    const gap = span.x - prev.end;
    if (gap > CHUNK_GAP_PT) {
      chunks.push({ x: span.x, end: span.end, text: span.text });
      continue;
    }
    const spacer =
      gap >= TOUCHING_GAP_PT &&
      !prev.text.endsWith(" ") &&
      !span.text.startsWith(" ")
        ? " "
        : "";
    chunks[chunks.length - 1] = {
      x: prev.x,
      end: Math.max(prev.end, span.end),
      text: prev.text + spacer + span.text,
    };
  }
  return chunks
    .map((chunk) => ({ ...chunk, text: chunk.text.trim() }))
    .filter((chunk) => chunk.text !== "");
}

/** Clusters spans on one page into top-to-bottom visual lines by baseline tolerance. */
function groupLines(spans: readonly PdfSpan[]): VisualLine[] {
  const ordered = spans.toSorted((a, b) => a.y - b.y || a.x - b.x);
  const groups: { y: number; spans: PdfSpan[] }[] = [];
  for (const span of ordered) {
    const last = groups.at(-1);
    if (last !== undefined && Math.abs(span.y - last.y) <= LINE_Y_TOLERANCE_PT)
      last.spans.push(span);
    else groups.push({ y: span.y, spans: [span] });
  }
  return groups
    .map((group) => ({ y: group.y, chunks: buildChunks(group.spans) }))
    .filter((line) => line.chunks.length > 0);
}

/** Removes left/right margin scene numbers and trailing revision asterisks when body text sits beside them. */
function stripMarginMarks(
  chunks: readonly TextChunk[],
  widthPt: number,
): readonly TextChunk[] {
  if (chunks.length < 2) return chunks;
  let kept = [...chunks];
  const last = kept.at(-1)!;
  if (
    last.x >= widthPt - RIGHT_MARGIN_INSET_PT &&
    (last.text === "*" || SCENE_NUMBER_TOKEN.test(last.text))
  )
    kept.pop();
  if (kept.length >= 2) {
    const first = kept[0]!;
    const second = kept[1]!;
    if (
      first.x < 100 &&
      second.x >= 100 &&
      SCENE_NUMBER_TOKEN.test(first.text) &&
      SCENE_HEADING_PREFIX.test(second.text)
    )
      kept = kept.slice(1);
  }
  return kept;
}

/** Places a body line by its left edge in inches from the left of the page. */
export function classifyPdfLine(leftPt: number, text: string): BlockType {
  const inches = leftPt / PT_PER_INCH;
  if (inches >= 5.5) return "transition";
  if (inches >= 3.5) return "character";
  if (inches >= 2.9) return "parenthetical";
  if (inches >= 2.0) return "dialogue";
  return SCENE_HEADING_PREFIX.test(text) ? "scene_heading" : "action";
}

const canWrap = (type: BlockType): boolean =>
  type === "action" ||
  type === "dialogue" ||
  type === "scene_heading" ||
  type === "parenthetical";

/**
 * Turns extracted page spans into screenplay blocks, dropping headers, footers, page numbers, `(MORE)` and
 * `(CONT'D)` and adding `"page_furniture"` to `unread` whenever any is dropped.
 */
export function buildPdfBlocks(
  pages: readonly PdfPageInput[],
  ids: IdSource,
  unread: Set<string>,
): BlockJSON[] {
  const drafts: DraftBlock[] = [];
  let pendingMore = false;
  for (const [pageIndex, page] of pages.entries()) {
    const lines = groupLines(page.spans);
    for (const [lineIndex, line] of lines.entries()) {
      if (line.y < TOP_MARGIN_PT || line.y > page.heightPt - BOTTOM_MARGIN_PT) {
        unread.add("page_furniture");
        continue;
      }
      const chunks = stripMarginMarks(line.chunks, page.widthPt);
      const primary = chunks[0];
      if (primary === undefined) continue;
      const text = chunks.map((chunk) => chunk.text).join(" ");
      if (
        lineIndex === 0 &&
        primary.x / PT_PER_INCH >= 5.5 &&
        PAGE_NUMBER_TEXT.test(text)
      ) {
        unread.add("page_furniture");
        continue;
      }
      if (MORE_LINE.test(text)) {
        unread.add("page_furniture");
        pendingMore = true;
        continue;
      }
      if (CONTINUED_LINE.test(text)) {
        unread.add("page_furniture");
        continue;
      }
      const type = classifyPdfLine(primary.x, text);
      if (type === "character" && CONTD_SUFFIX.test(text)) {
        unread.add("page_furniture");
        if (pendingMore) {
          pendingMore = false;
          continue;
        }
        const stripped = text.replace(CONTD_SUFFIX, "").trim();
        if (stripped !== "")
          drafts.push({ type, text: stripped, lastY: line.y, pageIndex });
        continue;
      }
      const last = drafts.at(-1);
      if (pendingMore && type === "dialogue" && last?.type === "dialogue") {
        last.text += ` ${text}`;
        last.lastY = line.y;
        last.pageIndex = pageIndex;
        pendingMore = false;
        continue;
      }
      pendingMore = false;
      if (
        last !== undefined &&
        last.type === type &&
        canWrap(type) &&
        last.pageIndex === pageIndex &&
        line.y - last.lastY <= WRAP_LINE_GAP_PT
      ) {
        last.text += ` ${text}`;
        last.lastY = line.y;
      } else {
        drafts.push({ type, text, lastY: line.y, pageIndex });
      }
    }
  }
  return drafts.map(({ type, text }) =>
    canonicalBlock({
      type: "block",
      attrs: { id: ids(), type },
      content: [{ type: "text", text }],
    }),
  );
}
