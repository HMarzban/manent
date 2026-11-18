// The sections kept rendered beside the selection, so that the browser never skips the lines the caret moves into.
import type { Node, ResolvedPos } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { KEEP_NEIGHBOURS } from "../page/config.ts";

interface KeptSet {
  readonly key: string;
  readonly decorations: DecorationSet;
}

/** The sections holding either end of the selection, and `neighbours` on each side of each, as indexes, ascending. */
export function keptSections(
  state: EditorState,
  neighbours: number = KEEP_NEIGHBOURS,
): number[] {
  const last = state.doc.childCount - 1;
  const kept = new Set<number>();
  for (const $end of [state.selection.$from, state.selection.$to]) {
    const at = $end.index(0);
    for (
      let i = Math.max(0, at - neighbours);
      i <= Math.min(last, at + neighbours);
      i++
    )
      kept.add(i);
  }
  return [...kept].toSorted((a, b) => a - b);
}

/** The position before section `index`, counted from the section `$end` is in, so that only the sections between are read. */
function sectionStart(doc: Node, $end: ResolvedPos, index: number): number {
  let pos = $end.before(1);
  for (let i = $end.index(0); i > index; i--) pos -= doc.child(i - 1).nodeSize;
  for (let i = $end.index(0); i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

function keptSet(state: EditorState, kept: readonly number[]): KeptSet {
  const { $from, $to } = state.selection;
  const decorations = kept.map((index) => {
    const $end =
      Math.abs(index - $from.index(0)) <= Math.abs(index - $to.index(0))
        ? $from
        : $to;
    const from = sectionStart(state.doc, $end, index);
    return Decoration.node(from, from + state.doc.child(index).nodeSize, {
      class: "keep",
    });
  });
  return {
    key: kept.join(","),
    decorations: DecorationSet.create(state.doc, decorations),
  };
}

/** The kept sections joined by commas, and their decorations. */
export const keepKey: PluginKey<KeptSet> = new PluginKey("keep");

/** Class "keep" on the kept sections; the set is built again only when the kept sections change. */
export function keepPlugin(neighbours: number = KEEP_NEIGHBOURS): Plugin {
  return new Plugin<KeptSet>({
    key: keepKey,
    state: {
      init: (_, state) => keptSet(state, keptSections(state, neighbours)),
      apply: (tr, prev, _old, state) => {
        const kept = keptSections(state, neighbours);
        if (kept.join(",") !== prev.key) return keptSet(state, kept);
        if (!tr.docChanged) return prev;
        return {
          key: prev.key,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations: (state) => keepKey.getState(state)?.decorations ?? null,
    },
  });
}
