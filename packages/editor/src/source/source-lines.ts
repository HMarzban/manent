// How source lines are decorated: a node decoration naming each line's kind and depth, and one inline decoration per
// coloured range. Loaded apart from the editor, as only Ink and game scripts read lines as source.
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { classifyLine } from "./classify.ts";
import type { SourceLine, SourceMode } from "./classify.ts";

/** What a line's node decoration carries: the comment state it was read with and the one it leaves. */
interface LineSpec {
  readonly source: { readonly openIn: boolean; readonly openOut: boolean };
}

const isLineSpec = (spec: unknown): spec is LineSpec =>
  typeof spec === "object" && spec !== null && "source" in spec;

// Calls `visit` with each block from the one at or after `pos` to the end, while it returns true.
function walkBlocks(
  doc: Node,
  pos: number,
  visit: (block: Node, at: number) => boolean,
): void {
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  let s = $pos.index(0);
  let c = $pos.depth >= 1 ? $pos.index(1) : 0;
  let at =
    $pos.depth >= 2
      ? $pos.before(2)
      : $pos.depth === 1
        ? $pos.posAtIndex(c, 1)
        : $pos.posAtIndex(s, 0) + 1;
  for (; s < doc.childCount; s++, c = 0, at += 2) {
    const section = doc.child(s);
    for (; c < section.childCount; c++) {
      const block = section.child(c);
      if (!visit(block, at)) return;
      at += block.nodeSize;
    }
  }
}

// The decorations of one line: a node decoration naming its kind and depth (in Ink always, to carry the comment
// state), and one inline decoration per range.
function lineDecorations(
  line: SourceLine,
  at: number,
  block: Node,
  openIn: boolean,
  mode: SourceMode,
): Decoration[] {
  const decorations: Decoration[] = [];
  const attrs: Record<string, string> = {};
  if (line.kind !== null) {
    attrs["class"] = `src-${line.kind}`;
    // a game script's lines keep their place on the page
    if (mode === "ink" && line.depth > 0)
      attrs["style"] = `--depth: ${line.depth}`;
  }
  if (mode === "ink" || line.kind !== null) {
    const spec: LineSpec = {
      source: { openIn, openOut: line.commentOpen },
    };
    decorations.push(Decoration.node(at, at + block.nodeSize, attrs, spec));
  }
  for (const range of line.ranges)
    decorations.push(
      Decoration.inline(at + 1 + range.from, at + 1 + range.to, {
        class: `src-${range.role}`,
      }),
    );
  return decorations;
}

const readsAsSource = (block: Node, mode: SourceMode): boolean =>
  mode === "ink" || block.attrs["type"] === "general";

function classify(block: Node, mode: SourceMode, openIn: boolean): SourceLine {
  return readsAsSource(block, mode)
    ? classifyLine(block.textContent, mode, openIn)
    : classifyLine("", mode, false);
}

/** The decorations of every line of `doc`. */
export function decorateAll(doc: Node, mode: SourceMode): DecorationSet {
  const decorations: Decoration[] = [];
  let open = false;
  walkBlocks(doc, 0, (block, at) => {
    const line = classify(block, mode, open);
    decorations.push(...lineDecorations(line, at, block, open, mode));
    open = line.commentOpen;
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

// The span of the new document the transaction's steps replaced.
function changedSpan(tr: Transaction): { from: number; to: number } | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_oldFrom, _oldTo, start, end) => {
      from = Math.min(from, rest.map(start, -1));
      to = Math.max(to, rest.map(end, 1));
    });
  });
  return from > to ? null : { from, to };
}

// The line spec of the block at `at`; null when it has none.
function specAt(set: DecorationSet, at: number): LineSpec | null {
  const spec: unknown = set
    .find(at, at, isLineSpec)
    .find((d) => d.from === at)?.spec;
  return isLineSpec(spec) ? spec : null;
}

// The comment state the line before the block at `at` leaves: the line spec that ends last at or before it.
function openBefore(set: DecorationSet, at: number): boolean {
  let last: Decoration | null = null;
  for (const d of set.find(at - 2, at - 2, isLineSpec))
    if (d.to <= at && (last === null || d.from > last.from)) last = d;
  const spec: unknown = last?.spec;
  return isLineSpec(spec) && spec.source.openOut;
}

/** `prev` after `tr`: the lines the change touched read again, then those below it while the comment state they are read with differs. */
export function decorateChange(
  prev: DecorationSet,
  tr: Transaction,
  mode: SourceMode,
): DecorationSet {
  const mapped = prev.map(tr.mapping, tr.doc);
  const span = changedSpan(tr);
  if (span === null) return mapped;
  const stale: Decoration[] = [];
  const fresh: Decoration[] = [];
  let open = openBefore(mapped, span.from);
  walkBlocks(tr.doc, span.from, (block, at) => {
    const end = at + block.nodeSize;
    if (at > span.to) {
      const spec = specAt(mapped, at);
      if (
        mode === "branching" ||
        (spec !== null && spec.source.openIn === open)
      )
        return false;
    }
    stale.push(
      ...mapped.find(at, end).filter((d) => d.from >= at && d.from < end),
    );
    const line = classify(block, mode, open);
    fresh.push(...lineDecorations(line, at, block, open, mode));
    open = line.commentOpen;
    return true;
  });
  return mapped.remove(stale).add(tr.doc, fresh);
}
