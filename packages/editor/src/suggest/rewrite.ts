// What one edit becomes while its writer suggests: inserted text marked as theirs, deleted text kept and struck,
// a split's new block added, a join that keeps both blocks, and an element change that remembers the element.
import { schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import { Fragment, Slice } from "prosemirror-model";
import type { Mark, Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { blockEnd, blockStart, blocksIn } from "./touched.ts";
import type { Touched } from "./touched.ts";

/** Who suggests, when, and where a new suggestion's id comes from. */
export interface Suggester {
  userId: string;
  now: () => number;
  ids: IdSource;
}

/** A suggestion mark's attributes, in stored order. */
interface SuggestAttrs {
  id: string;
  authorUserId: string;
  at: number;
}

const SUGGEST_MARKS = ["suggest_insert", "suggest_delete"] as const;
const BLOCK_KINDS: readonly string[] = ["added", "removed"];

const CLEARED = Object.freeze({
  suggest: null,
  suggestId: null,
  suggestAuthorUserId: null,
  suggestAt: null,
});

const isOwn = (mark: Mark, userId: string, names: readonly string[]): boolean =>
  names.includes(mark.type.name) && mark.attrs.authorUserId === userId;

const isOwnAdded = (node: Node, userId: string): boolean =>
  node.attrs.suggest === "added" && node.attrs.suggestAuthorUserId === userId;

const blockAttrs = (kind: string, attrs: SuggestAttrs) => ({
  suggest: kind,
  suggestId: attrs.id,
  suggestAuthorUserId: attrs.authorUserId,
  suggestAt: attrs.at,
});

function fresh(by: Suggester): SuggestAttrs {
  return { id: by.ids(), authorUserId: by.userId, at: by.now() };
}

/** Each position of `fragment` as one string: a character with its marks, or a node's start (with its id) or end. */
function pushTokens(
  fragment: Fragment,
  openStart: number,
  openEnd: number,
  out: string[],
): void {
  const last = fragment.childCount - 1;
  fragment.forEach((node, _offset, index) => {
    const text = node.text;
    if (text !== undefined) {
      const marks = JSON.stringify(node.marks.map((mark) => mark.toJSON()));
      for (let i = 0; i < text.length; i++) out.push(text[i]! + marks);
      return;
    }
    const start = index === 0 ? openStart : 0;
    const end = index === last ? openEnd : 0;
    if (start === 0) out.push(`<${node.type.name} ${String(node.attrs.id)}`);
    pushTokens(node.content, Math.max(start - 1, 0), Math.max(end - 1, 0), out);
    if (end === 0) out.push(">");
  });
}

function tokensOf(doc: Node, from: number, to: number): string[] {
  const slice = doc.slice(from, to);
  const out: string[] = [];
  pushTokens(slice.content, slice.openStart, slice.openEnd, out);
  return out;
}

/** What the edit took out and put in, trimmed to where the two documents differ, in each one's positions. */
function differenceOf(
  old: Node,
  doc: Node,
  touched: Touched,
): { from: number; oldTo: number; to: number } {
  const { from } = touched;
  const oldEnd = touched.to + old.content.size - doc.content.size;
  const was = tokensOf(old, from, oldEnd);
  const now = tokensOf(doc, from, touched.to);
  let prefix = 0;
  while (
    prefix < was.length &&
    prefix < now.length &&
    was[prefix] === now[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < Math.min(was.length, now.length) - prefix &&
    was[was.length - 1 - suffix] === now[now.length - 1 - suffix]
  )
    suffix++;
  return {
    from: from + prefix,
    oldTo: oldEnd - suffix,
    to: touched.to - suffix,
  };
}

/** `fragment` without the person's own inserted text and own added blocks, which deleting takes out for good. */
function withoutOwn(
  fragment: Fragment,
  userId: string,
  openStart: number,
  openEnd: number,
): Fragment {
  const kept: Node[] = [];
  const last = fragment.childCount - 1;
  fragment.forEach((node, _offset, index) => {
    if (node.isText) {
      if (!node.marks.some((m) => isOwn(m, userId, ["suggest_insert"])))
        kept.push(node);
      return;
    }
    const start = index === 0 ? openStart : 0;
    const end = index === last ? openEnd : 0;
    if (start === 0 && end === 0 && isOwnAdded(node, userId)) return;
    const inner = withoutOwn(
      node.content,
      userId,
      Math.max(start - 1, 0),
      Math.max(end - 1, 0),
    );
    kept.push(node.copy(inner));
  });
  return Fragment.from(kept);
}

/** The person's own suggestion that touches `from`–`to` in its block, whose attributes a continued change keeps. */
function adjoining(
  doc: Node,
  from: number,
  to: number,
  userId: string,
): SuggestAttrs | null {
  const $from = doc.resolve(from);
  if (isOwnAdded($from.parent, userId)) {
    const { suggestId, suggestAuthorUserId, suggestAt } = $from.parent.attrs;
    return { id: suggestId, authorUserId: suggestAuthorUserId, at: suggestAt };
  }
  for (const node of [$from.nodeBefore, doc.resolve(to).nodeAfter]) {
    const mark = node?.marks.find((m) => isOwn(m, userId, SUGGEST_MARKS));
    if (mark !== undefined) {
      const { id, authorUserId, at } = mark.attrs;
      return { id, authorUserId, at };
    }
  }
  return null;
}

/** Marks the text of `from`–`to` in one block `name`, leaving out text that `skip` says is already settled. */
function markText(
  tr: Transaction,
  from: number,
  to: number,
  name: "suggest_insert" | "suggest_delete",
  by: Suggester,
  skip: (node: Node) => boolean,
): void {
  if (from >= to) return;
  const attrs = adjoining(tr.doc, from, to, by.userId) ?? fresh(by);
  const mark = schema.marks[name].create(attrs);
  const ranges: [number, number][] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || skip(node)) return true;
    ranges.push([Math.max(pos, from), Math.min(pos + node.nodeSize, to)]);
    return false;
  });
  for (const [start, end] of ranges) tr.addMark(start, end, mark);
}

/** Where `at` goes once `write` has run on `tr`: past whatever it put at `at`. */
function after(tr: Transaction, at: number, write: () => void): number {
  const steps = tr.steps.length;
  write();
  return tr.mapping.slice(steps).map(at, 1);
}

/** Puts back what the edit deleted, at `at`, struck; a whole block comes back `removed`. Answers where it ends. */
function restore(
  tr: Transaction,
  at: number,
  slice: Slice,
  by: Suggester,
): number {
  const end = after(tr, at, () => tr.replace(at, at, slice));
  for (const { node, pos } of blocksIn(tr.doc, at, end)) {
    if (pos >= at && pos + node.nodeSize <= end) {
      if (node.attrs.suggest === null)
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...blockAttrs("removed", fresh(by)),
        });
      continue;
    }
    const from = Math.max(at, pos + 1);
    const to = Math.min(end, pos + node.nodeSize - 1);
    markText(tr, from, to, "suggest_delete", by, (text) =>
      text.marks.some((m) => m.type.name === "suggest_delete"),
    );
  }
  return end;
}

/** Marks what the edit put in at `from`–`to`: its text as inserted, and each block that begins there as added. */
function markInserted(
  tr: Transaction,
  from: number,
  to: number,
  by: Suggester,
): void {
  for (const name of SUGGEST_MARKS) tr.removeMark(from, to, schema.marks[name]);
  for (const { node, pos } of blocksIn(tr.doc, from, to)) {
    if (pos >= from)
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...blockAttrs("added", fresh(by)),
      });
  }
  for (const { node, pos } of blocksIn(tr.doc, from, to))
    markText(
      tr,
      Math.max(from, pos + 1),
      Math.min(to, pos + node.nodeSize - 1),
      "suggest_insert",
      by,
      () => false,
    );
}

/**
 * Backspace or Delete over the boundary between two blocks: both stay as they were, the first gains the second's
 * text as inserted, and the second becomes `removed` under the same suggestion. The person's own added block is
 * joined for good.
 */
function suggestJoin(
  tr: Transaction,
  old: Node,
  at: number,
  oldTo: number,
  by: Suggester,
): void {
  const second = blocksIn(old, at, oldTo).find(({ pos }) => pos >= at);
  if (second === undefined || isOwnAdded(second.node, by.userId)) return;
  tr.setNodeMarkup(
    blockStart(tr.doc, at),
    undefined,
    old.resolve(at).parent.attrs,
  );
  const bPos =
    after(tr, at, () => tr.replace(at, at, old.slice(at, oldTo))) - 1;
  const block = tr.doc.nodeAt(bPos);
  if (block === null) return;
  const attrs = fresh(by);
  const mark = schema.marks.suggest_insert.create(attrs);
  const copied: Node[] = [];
  block.content.forEach((text) =>
    copied.push(text.mark(mark.addToSet(text.marks))),
  );
  tr.insert(at, copied);
  tr.setNodeMarkup(bPos + block.content.size, undefined, {
    ...block.attrs,
    ...blockAttrs("removed", attrs),
  });
  tr.setSelection(TextSelection.create(tr.doc, at));
}

/** True for a deletion that took out only the boundary of one block. */
function isJoin(old: Node, from: number, oldTo: number, to: number): boolean {
  if (to !== from || oldTo <= from || old.resolve(from).depth < 2) return false;
  const blocks = blocksIn(old, from, oldTo).filter(({ pos }) => pos >= from);
  return blocks.length === 1 && old.textBetween(from, oldTo) === "";
}

/** The element each block the edit retyped had before, as a block suggestion; retyping it back clears it. */
function markElements(
  tr: Transaction,
  old: EditorState,
  state: EditorState,
  touched: Touched,
  by: Suggester,
): void {
  const back = touched.mapping.invert();
  const from = blockStart(state.doc, touched.from);
  const to = blockEnd(state.doc, touched.to);
  for (const { node, pos } of blocksIn(state.doc, from, to)) {
    const was = old.doc.nodeAt(back.map(pos, 1));
    const at = tr.mapping.map(pos, 1);
    const block = tr.doc.nodeAt(at);
    const { id } = node.attrs;
    if (was?.type.name !== "block" || was.attrs.id !== id) continue;
    if (block === null || block.attrs.id !== id) continue;
    const { suggest, suggestAuthorUserId, type } = block.attrs;
    if (type === was.attrs.type || BLOCK_KINDS.includes(String(suggest)))
      continue;
    if (suggest === null)
      tr.setNodeMarkup(at, undefined, {
        ...block.attrs,
        ...blockAttrs(String(was.attrs.type), fresh(by)),
      });
    else if (suggest === type && suggestAuthorUserId === by.userId)
      tr.setNodeMarkup(at, undefined, { ...block.attrs, ...CLEARED });
  }
}

/**
 * The transaction that turns the edit from `old` to `state` into suggestions by `by`; null when the edit needs
 * nothing more. Its work is bounded by the edit, never by the script.
 */
export function suggestEdit(
  old: EditorState,
  state: EditorState,
  touched: Touched,
  by: Suggester,
): Transaction | null {
  const tr = state.tr;
  const { from, oldTo, to } = differenceOf(old.doc, state.doc, touched);
  if (isJoin(old.doc, from, oldTo, to)) {
    suggestJoin(tr, old.doc, from, oldTo, by);
  } else {
    let inserted = from;
    if (oldTo > from) {
      const taken = old.doc.slice(from, oldTo);
      const kept = new Slice(
        withoutOwn(taken.content, by.userId, taken.openStart, taken.openEnd),
        taken.openStart,
        taken.openEnd,
      );
      if (kept.size > 0) inserted = restore(tr, from, kept, by);
      // Backspace leaves the caret before what it struck, so the next one strikes the text before that
      const { selection } = old;
      const backward = selection.empty && selection.head === oldTo;
      if (backward && tr.doc.resolve(from).parent.inlineContent)
        tr.setSelection(TextSelection.create(tr.doc, from));
    }
    if (to > from) markInserted(tr, inserted, inserted + (to - from), by);
  }
  markElements(tr, old, state, touched, by);
  return tr.docChanged ? tr : null;
}
