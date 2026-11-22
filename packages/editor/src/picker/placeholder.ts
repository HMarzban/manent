// The sentence an empty element shows while the caret is in it, drawn by the page styles so it never enters the text.
import { schema } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorWords } from "../script-editor/ports.ts";

/** The page styles that draw a placeholder; the colour is the theme's token. */
export const PLACEHOLDER_CSS = `
.mn-empty::before {
  content: attr(data-placeholder);
  font-style: italic;
  text-transform: none;
  color: var(--page-ink-muted);
  pointer-events: none;
}
.mn-empty.el[data-open]::before {
  content: attr(data-open) attr(data-placeholder) attr(data-close);
}
.mn-empty.el[data-close]::after {
  content: none;
}
`;

interface Shown {
  /** The start of the block the placeholder is on; null: none is shown. */
  readonly at: number | null;
  readonly text: string | null;
  readonly decorations: DecorationSet;
}

const NONE: Shown = Object.freeze({
  at: null,
  text: null,
  decorations: DecorationSet.empty,
});

function shownIn(
  state: EditorState,
  format: FormatId,
  words: EditorWords,
): { at: number; to: number; text: string } | null {
  const { $head, empty } = state.selection;
  const block = $head.parent;
  if (!empty || block.type !== schema.nodes.block || block.content.size > 0)
    return null;
  const text = words.placeholder(
    format,
    String(block.attrs.type),
    block.attrs.kind,
  );
  if (text === null) return null;
  const at = $head.before();
  return { at, to: at + block.nodeSize, text };
}

function next(
  state: EditorState,
  format: FormatId,
  words: EditorWords,
  old: Shown,
): Shown {
  const now = shownIn(state, format, words);
  if (now === null) return old.at === null ? old : NONE;
  if (now.at === old.at && now.text === old.text) return old;
  return {
    at: now.at,
    text: now.text,
    decorations: DecorationSet.create(state.doc, [
      Decoration.node(now.at, now.to, {
        class: "mn-empty",
        "data-placeholder": now.text,
      }),
    ]),
  };
}

/** A placeholder on the empty block that holds a collapsed caret; its decorations change only when that block or its sentence does. */
export function placeholderPlugin(options: {
  format(): FormatId;
  words: EditorWords;
}): Plugin {
  return new Plugin<Shown>({
    state: {
      init: (_config, state) =>
        next(state, options.format(), options.words, NONE),
      apply: (_tr, old, _before, state) =>
        next(state, options.format(), options.words, old),
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? null;
      },
    },
  });
}
