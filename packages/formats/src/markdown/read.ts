// Pure-TypeScript Markdown (.md) reader producing a Book (manuscript) ImportedScript with headings, quotes, breaks, inline marks and footnotes.
import type { BlockJSON, IdSource } from "@manent/schema";
import { FormatError } from "../script/model.ts";
import type { ImportedScript } from "../script/model.ts";
import { parseMarkdownInline } from "./inline.ts";

export interface ReadMarkdownOptions {
  readonly ids: IdSource;
}

const YAML_FENCE = /^---\s*$/;
const YAML_PAIR = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/;
const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BREAK_RE = /^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)\s*$/;
const PAGE_BREAK_RE = /^<!--\s*pagebreak\s*-->$/i;

function unquoteYaml(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return trimmed;
}

function stripFrontMatter(lines: readonly string[]): {
  readonly title: string | null;
  readonly bodyStart: number;
} {
  if (lines.length < 3 || !YAML_FENCE.test(lines[0]!)) {
    return { title: null, bodyStart: 0 };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (YAML_FENCE.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  if (end < 0) return { title: null, bodyStart: 0 };
  let title: string | null = null;
  for (let i = 1; i < end; i++) {
    const match = YAML_PAIR.exec(lines[i]!);
    if (match?.[1]?.toLowerCase() === "title") {
      const value = unquoteYaml(match[2]!);
      if (value !== "") title = value;
    }
  }
  return { title, bodyStart: end + 1 };
}

/** Reads Markdown text into a Book (`format: "manuscript"`) `ImportedScript`. */
export function readMarkdown(
  rawText: string,
  options: ReadMarkdownOptions,
): ImportedScript {
  const normalized = rawText.replace(/\r\n?/g, "\n");
  if (normalized.trim() === "") {
    throw new FormatError("malformed", "markdown input is empty");
  }
  const allLines = normalized.split("\n");
  const { title: yamlTitle, bodyStart } = stripFrontMatter(allLines);
  const bodyLines = allLines.slice(bodyStart);

  // First pass: collect footnote definitions (`[^id]: text`) and exclude them from prose paragraphs.
  const footnotes = new Map<string, string>();
  const keptLines: string[] = [];
  for (const line of bodyLines) {
    const match = FOOTNOTE_DEF.exec(line.trim());
    if (match !== null) {
      footnotes.set(match[1]!, match[2]!.trim());
      continue;
    }
    keptLines.push(line);
  }

  let fnCounter = 0;
  const nextFootnoteId = (): string => {
    fnCounter += 1;
    return `fn-${fnCounter}`;
  };

  const blocks: BlockJSON[] = [];
  let firstChapterTitle: string | null = null;
  let lastType: string | null = null;
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    const joined = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (joined === "") return;
    blocks.push({
      type: "block",
      attrs: { id: options.ids(), type: "body" },
      content: parseMarkdownInline(joined, footnotes, nextFootnoteId),
    });
    lastType = "body";
  };

  for (const rawLine of keptLines) {
    const trimmed = rawLine.trim();
    if (trimmed === "") {
      flushParagraph();
      continue;
    }
    if (PAGE_BREAK_RE.test(trimmed)) {
      flushParagraph();
      blocks.push({
        type: "block",
        attrs: { id: options.ids(), type: "page_break" },
      });
      lastType = "page_break";
      continue;
    }
    if (BREAK_RE.test(trimmed)) {
      flushParagraph();
      blocks.push({
        type: "block",
        attrs: { id: options.ids(), type: "break" },
        content: [{ type: "text", text: "* * *" }],
      });
      lastType = "break";
      continue;
    }
    const heading = HEADING_RE.exec(trimmed);
    if (heading !== null) {
      flushParagraph();
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      const blockType = level === 1 ? "chapter" : "subheading";
      if (
        blockType === "chapter" &&
        firstChapterTitle === null &&
        text !== ""
      ) {
        firstChapterTitle = text;
      }
      blocks.push({
        type: "block",
        attrs: { id: options.ids(), type: blockType },
        content: parseMarkdownInline(text, footnotes, nextFootnoteId),
      });
      lastType = blockType;
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      const text = trimmed.replace(/^>\s?/, "").trim();
      const quoteType: "epigraph" | "quote" =
        lastType === "chapter" ? "epigraph" : "quote";
      blocks.push({
        type: "block",
        attrs: { id: options.ids(), type: quoteType },
        content: parseMarkdownInline(text, footnotes, nextFootnoteId),
      });
      lastType = quoteType;
      continue;
    }
    paragraphLines.push(trimmed);
  }
  flushParagraph();

  if (blocks.length === 0) {
    blocks.push({
      type: "block",
      attrs: { id: options.ids(), type: "body" },
    });
  }

  return {
    from: "markdown",
    format: "manuscript",
    title: yamlTitle ?? firstChapterTitle,
    paper: null,
    blocks,
    notes: [],
    production: null,
    kept: [],
    coloursMapped: 0,
    unread: [],
  };
}
