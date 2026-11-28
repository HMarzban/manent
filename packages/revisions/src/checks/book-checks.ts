// Pure manuscript-only pre-export Checks: empty footnotes, figures missing description, chapters under target, and unbalanced quotes (with multi-paragraph dialogue exemption).
import { textAnchorAt } from "@manent/schema";
import type { BlockJSON, DocJSON, TextAnchor } from "@manent/schema";

export interface EmptyFootnoteCheck {
  readonly kind: "empty_footnote";
  readonly key: string;
  readonly text: string;
  readonly ordinal: number;
  readonly anchor: TextAnchor | null;
}

export interface FigureMissingAltCheck {
  readonly kind: "figure_missing_alt";
  readonly key: string;
  readonly text: string;
  readonly anchor: TextAnchor | null;
}

export interface ChapterUnderTargetCheck {
  readonly kind: "chapter_under_target";
  readonly key: string;
  readonly text: string;
  readonly words: number;
  readonly target: number;
  readonly anchor: TextAnchor | null;
}

export interface UnbalancedQuotesCheck {
  readonly kind: "unbalanced_quotes";
  readonly key: string;
  readonly text: string;
  readonly anchor: TextAnchor | null;
}

export type BookCheck =
  | EmptyFootnoteCheck
  | FigureMissingAltCheck
  | ChapterUnderTargetCheck
  | UnbalancedQuotesCheck;

const WORD_RE = /\p{L}[\p{L}\p{N}'’-]*/gu;

function flatJsonBlocks(doc: DocJSON): BlockJSON[] {
  const out: BlockJSON[] = [];
  for (const section of doc.content ?? []) {
    if (section.type !== "section") continue;
    for (const block of section.content ?? []) {
      if (block.type === "block") out.push(block);
    }
  }
  return out;
}

function blockPlainText(block: BlockJSON): string {
  return (block.content ?? []).map((n) => n.text).join("");
}

function anchorAt(
  blockId: string,
  text: string,
  start: number,
  end: number,
): TextAnchor | null {
  if (blockId === "") return null;
  const clampedStart = Math.max(0, Math.min(start, text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, text.length));
  return textAnchorAt({ id: blockId, text }, clampedStart, clampedEnd);
}

function countWords(text: string): number {
  let count = 0;
  for (const _ of text.matchAll(WORD_RE)) count += 1;
  return count;
}

function startsWithOpeningQuote(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('"') || trimmed.startsWith("“");
}

function quoteDelta(text: string): {
  readonly openDelta: number;
  readonly straightCount: number;
  readonly hasCurly: boolean;
} {
  let openCurly = 0;
  let closeCurly = 0;
  let straightCount = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "“") openCurly += 1;
    else if (ch === "”") closeCurly += 1;
    else if (ch === '"') straightCount += 1;
  }
  const hasCurly = openCurly > 0 || closeCurly > 0;
  return {
    openDelta: openCurly - closeCurly,
    straightCount,
    hasCurly,
  };
}

/** Finds all four Book-only editorial Checks over a manuscript `DocJSON`. */
export function findBookChecks(doc: DocJSON): BookCheck[] {
  const blocks = flatJsonBlocks(doc);
  const emptyFootnotes: EmptyFootnoteCheck[] = [];
  const missingAlts: FigureMissingAltCheck[] = [];
  const underTargets: ChapterUnderTargetCheck[] = [];
  const unbalancedQuotes: UnbalancedQuotesCheck[] = [];

  // 1. Empty footnotes (in document order, deduplicated by footnote id)
  const seenFootnoteIds = new Set<string>();
  let footnoteOrdinal = 0;
  for (const block of blocks) {
    const blockId = typeof block.attrs?.id === "string" ? block.attrs.id : "";
    const fullText = blockPlainText(block);
    let offset = 0;
    for (const node of block.content ?? []) {
      const len = node.text.length;
      for (const mark of node.marks ?? []) {
        if (mark.type !== "footnote") continue;
        const id = typeof mark.attrs?.id === "string" ? mark.attrs.id : "";
        if (id === "" || seenFootnoteIds.has(id)) continue;
        seenFootnoteIds.add(id);
        footnoteOrdinal += 1;
        const noteText =
          typeof mark.attrs?.text === "string" ? mark.attrs.text : "";
        if (noteText.trim() === "") {
          const subject = `Footnote ${footnoteOrdinal}`;
          emptyFootnotes.push({
            kind: "empty_footnote",
            key: `empty_footnote:${subject}`,
            text: subject,
            ordinal: footnoteOrdinal,
            anchor: anchorAt(blockId, fullText, offset, offset + len),
          });
        }
      }
      offset += len;
    }
  }

  // 2. Figures missing alt text
  let figureIndex = 0;
  for (const block of blocks) {
    if (block.attrs?.type !== "graphic") continue;
    figureIndex += 1;
    const g =
      typeof block.attrs.graphic === "object" && block.attrs.graphic !== null
        ? block.attrs.graphic
        : null;
    const alt = typeof g?.alt === "string" ? g.alt.trim() : "";
    if (alt !== "") continue;
    const label = typeof g?.label === "string" ? g.label.trim() : "";
    const caption = blockPlainText(block).trim();
    const subject =
      label !== ""
        ? label
        : caption !== ""
          ? caption.slice(0, 40)
          : `Figure ${figureIndex}`;
    const blockId = typeof block.attrs.id === "string" ? block.attrs.id : "";
    missingAlts.push({
      kind: "figure_missing_alt",
      key: `figure_missing_alt:${subject}`,
      text: subject,
      anchor: anchorAt(blockId, caption, 0, caption.length),
    });
  }

  // 3. Chapters under word target
  interface OpenChapter {
    readonly blockId: string;
    readonly title: string;
    readonly target: number;
    words: number;
  }
  let currentChapter: OpenChapter | null = null;
  const finishChapter = (): void => {
    if (currentChapter === null) return;
    if (currentChapter.words < currentChapter.target) {
      underTargets.push({
        kind: "chapter_under_target",
        key: `chapter_under_target:${currentChapter.title}`,
        text: currentChapter.title,
        words: currentChapter.words,
        target: currentChapter.target,
        anchor: anchorAt(
          currentChapter.blockId,
          currentChapter.title,
          0,
          currentChapter.title.length,
        ),
      });
    }
    currentChapter = null;
  };
  let chapterNum = 0;
  for (const block of blocks) {
    const type =
      typeof block.attrs?.type === "string" ? block.attrs.type : "body";
    const text = blockPlainText(block);
    if (type === "chapter") {
      finishChapter();
      chapterNum += 1;
      const target =
        typeof block.attrs?.targetWords === "number" &&
        block.attrs.targetWords > 0
          ? block.attrs.targetWords
          : null;
      if (target !== null) {
        currentChapter = {
          blockId: typeof block.attrs?.id === "string" ? block.attrs.id : "",
          title: text.trim() || `Chapter ${chapterNum}`,
          target,
          words: 0,
        };
      }
      continue;
    }
    if (currentChapter !== null && type !== "group" && type !== "page_break") {
      currentChapter.words += countWords(text);
    }
  }
  finishChapter();

  // 4. Unbalanced quotation marks in prose, with standard multi-paragraph dialogue exemption
  let continuedDialogue = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const type =
      typeof block.attrs?.type === "string" ? block.attrs.type : "body";
    if (type !== "body" && type !== "quote" && type !== "epigraph") {
      continuedDialogue = false;
      continue;
    }
    const text = blockPlainText(block);
    const trimmed = text.trim();
    if (trimmed === "") continue;
    const { openDelta, straightCount, hasCurly } = quoteDelta(trimmed);
    const nextBlock = blocks[i + 1];
    const nextIsProse =
      nextBlock !== undefined &&
      (nextBlock.attrs?.type === "body" ||
        nextBlock.attrs?.type === "quote" ||
        nextBlock.attrs?.type === "epigraph");
    const nextStartsQuote =
      nextIsProse && startsWithOpeningQuote(blockPlainText(nextBlock));

    let unbalanced = false;
    if (hasCurly) {
      if (openDelta === 1 && nextStartsQuote) {
        // Multi-paragraph speech continues in the next paragraph with a fresh opening quote.
        continuedDialogue = true;
      } else if (openDelta === 0) {
        continuedDialogue = false;
      } else {
        unbalanced = true;
        continuedDialogue = false;
      }
    } else if (straightCount > 0) {
      if (straightCount % 2 === 1 && nextStartsQuote) {
        continuedDialogue = true;
      } else if (straightCount % 2 === 0) {
        continuedDialogue = false;
      } else {
        unbalanced = true;
        continuedDialogue = false;
      }
    } else {
      continuedDialogue = false;
    }

    // Silence lint on unused continuedDialogue state while keeping state machine explicit for future rules
    void continuedDialogue;

    if (unbalanced) {
      const snippet =
        trimmed.length > 36 ? `${trimmed.slice(0, 36).trimEnd()}…` : trimmed;
      const blockId = typeof block.attrs?.id === "string" ? block.attrs.id : "";
      unbalancedQuotes.push({
        kind: "unbalanced_quotes",
        key: `unbalanced_quotes:${blockId || i}:${snippet}`,
        text: snippet,
        anchor: anchorAt(blockId, text, 0, Math.min(text.length, 36)),
      });
    }
  }

  return [
    ...emptyFootnotes,
    ...missingAlts,
    ...underTargets,
    ...unbalancedQuotes,
  ];
}
