// Dotted inline underlines for bracket T= forms that set no time.
import type { BracketTime, BracketTimeCode } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import { Decoration } from "prosemirror-view";
import type { DecorationSet } from "prosemirror-view";

export type UnreadBracketTime = Extract<BracketTime, { ok: false }>;

/** Title text for an unread `T=` underline, either fixed or formatted from the typed form and its code. */
export type UnreadTimeWords =
  string | ((form: string, code: BracketTimeCode) => string);

export interface DecorationPatch {
  readonly stale: Decoration[];
  readonly added: Decoration[];
}

function titleOf(
  words: UnreadTimeWords,
  text: string,
  time: UnreadBracketTime,
): string {
  return typeof words === "function"
    ? words(text.slice(time.from, time.to), time.code)
    : words;
}

/** Appends one inline `.mn-timing-unread` decoration per unread `T=` form in `text`. */
export function pushUnreadDecorations(
  target: Decoration[],
  text: string,
  unread: readonly UnreadBracketTime[],
  contentStart: number,
  words: UnreadTimeWords,
): void {
  if (unread.length === 0) return;
  for (const time of unread)
    target.push(
      Decoration.inline(contentStart + time.from, contentStart + time.to, {
        nodeName: "span",
        class: "mn-timing-unread",
        title: titleOf(words, text, time),
      }),
    );
}

/** Records stale decorations inside one block and appends its fresh unread decorations to `patch`. */
export function collectBlockDecorations(
  patch: DecorationPatch,
  decorations: DecorationSet,
  blockNode: Node,
  unread: readonly UnreadBracketTime[],
  blockPos: number,
  words: UnreadTimeWords,
): void {
  const contentStart = blockPos + 1;
  const contentEnd = blockPos + blockNode.nodeSize - 1;
  for (const found of decorations.find(contentStart, contentEnd))
    patch.stale.push(found);
  pushUnreadDecorations(
    patch.added,
    blockNode.textContent,
    unread,
    contentStart,
    words,
  );
}

/** Applies a collected decoration patch to `decorations`, returning `decorations` unchanged when empty. */
export function applyDecorationPatch(
  decorations: DecorationSet,
  doc: Node,
  patch: DecorationPatch,
): DecorationSet {
  let next = decorations;
  if (patch.stale.length > 0) next = next.remove(patch.stale);
  if (patch.added.length > 0) next = next.add(doc, patch.added);
  return next;
}
