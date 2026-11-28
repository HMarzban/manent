// Inline Markdown serialiser and parser: bold, italic, strikethrough, links and footnotes.
import { isSafeHref } from "@manent/schema";
import type { MarkJSON, TextJSON } from "@manent/schema";
import type { ExtractedFootnote } from "../script/footnotes.ts";

function findMark(
  marks: readonly MarkJSON[] | undefined,
  type: string,
): MarkJSON | undefined {
  return marks?.find((m) => m.type === type);
}

/** Renders one block's inline runs to Markdown with footnote references (`[^n]`). */
export function renderMarkdownRuns(
  nodes: readonly TextJSON[] | undefined,
  blockIndex: number,
  endingAt: ReadonlyMap<string, readonly ExtractedFootnote[]>,
): string {
  if (nodes === undefined || nodes.length === 0) return "";
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.type === "text" && node.text !== "") {
      let chunk = node.text;
      const marks = node.marks;
      if (findMark(marks, "bold") !== undefined) chunk = `**${chunk}**`;
      if (findMark(marks, "italic") !== undefined) chunk = `*${chunk}*`;
      if (findMark(marks, "strike") !== undefined) chunk = `~~${chunk}~~`;
      const href = findMark(marks, "link")?.attrs?.href;
      if (typeof href === "string" && isSafeHref(href)) {
        chunk = `[${chunk}](${href})`;
      }
      out += chunk;
    }
    const ending = endingAt.get(`${blockIndex}:${i}`);
    if (ending !== undefined) {
      for (const note of ending) out += `[^${note.ordinal}]`;
    }
  }
  return out;
}

function appendText(
  runs: TextJSON[],
  text: string,
  marks: readonly MarkJSON[],
): void {
  if (text === "") return;
  if (marks.length === 0) {
    const prev = runs[runs.length - 1];
    if (
      prev !== undefined &&
      (prev.marks === undefined || prev.marks.length === 0)
    ) {
      runs[runs.length - 1] = { type: "text", text: prev.text + text };
      return;
    }
    runs.push({ type: "text", text });
    return;
  }
  runs.push({ type: "text", text, marks: [...marks] });
}

const TOKEN_RE =
  /(\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|\[([^\]]+)\]\(([^)\s]+)\)|\[\^([^\]]+)\])/g;

/** Parses inline Markdown (`**bold**`, `*italic*`, `~~strike~~`, `[text](url)`, `[^id]`) into `TextJSON[]`. */
export function parseMarkdownInline(
  raw: string,
  footnotes: ReadonlyMap<string, string>,
  nextFootnoteId: () => string,
): TextJSON[] {
  const runs: TextJSON[] = [];
  let cursor = 0;
  for (const match of raw.matchAll(TOKEN_RE)) {
    const at = match.index ?? 0;
    if (at > cursor) appendText(runs, raw.slice(cursor, at), []);
    if (match[2] !== undefined) {
      appendText(runs, match[2], [{ type: "bold" }]);
    } else if (match[3] !== undefined) {
      appendText(runs, match[3], [{ type: "italic" }]);
    } else if (match[4] !== undefined) {
      appendText(runs, match[4], [{ type: "strike" }]);
    } else if (match[5] !== undefined && match[6] !== undefined) {
      const href = match[6];
      if (isSafeHref(href)) {
        appendText(runs, match[5], [{ type: "link", attrs: { href } }]);
      } else {
        appendText(runs, match[5], []);
      }
    } else if (match[7] !== undefined) {
      const refId = match[7];
      const noteText = footnotes.get(refId) ?? "";
      const fnMark: MarkJSON = {
        type: "footnote",
        attrs: { id: nextFootnoteId(), text: noteText },
      };
      // Attach the footnote mark to the preceding run (or a short anchor if at paragraph start).
      const prev = runs[runs.length - 1];
      if (prev !== undefined) {
        runs[runs.length - 1] = {
          ...prev,
          marks: [...(prev.marks ?? []), fnMark],
        };
      } else {
        appendText(runs, refId, [fnMark]);
      }
    }
    cursor = at + match[0].length;
  }
  if (cursor < raw.length) appendText(runs, raw.slice(cursor), []);
  return runs;
}
