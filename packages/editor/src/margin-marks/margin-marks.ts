// Bars in the page margin beside the blocks a person is asked to look at.
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

interface Marks {
  ids: readonly string[];
  /** Where each bar stands, in the order of `set`'s widgets. */
  at: readonly number[];
  set: DecorationSet;
}

const marksKey = new PluginKey<Marks>("margin_marks");

function barOf(
  blockId: string,
  label: string,
  onActivate: (blockId: string) => void,
): () => HTMLElement {
  return () => {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "mn-margin-mark";
    bar.contentEditable = "false";
    bar.setAttribute("aria-label", label);
    bar.dataset.block = blockId;
    bar.addEventListener("click", (event) => {
      event.preventDefault();
      onActivate(blockId);
    });
    // the page's own keys never see it, so Enter is the bar's: no click follows a key that is handled here
    bar.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onActivate(blockId);
    });
    return bar;
  };
}

/** One bar at the start of each block whose id is in `ids`; a walk of the document, so only when the ids change. */
function marksOf(
  doc: Node,
  ids: readonly string[],
  bar: (blockId: string) => () => HTMLElement,
): Marks {
  const wanted = new Set(ids);
  const at: number[] = [];
  const widgets: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "block") return true;
    const id: unknown = node.attrs.id;
    if (typeof id === "string" && wanted.has(id)) {
      at.push(pos + 1);
      widgets.push(
        Decoration.widget(pos + 1, bar(id), {
          key: `margin:${id}`,
          side: -1,
          ignoreSelection: true,
          stopEvent: () => true,
        }),
      );
    }
    return false;
  });
  return { ids, at, set: DecorationSet.create(doc, widgets) };
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a === b || (a.length === b.length && a.every((id, i) => id === b[i]));

/**
 * A bar named `label` beside each block of `blockIds()`, which runs `onActivate` with its block's id. The bars are
 * placed again only when `subscribe`'s listener is told and the ids differ; every other transaction maps them, and one
 * that moves none of them keeps the same set.
 */
export function marginMarksPlugin(options: {
  blockIds: () => readonly string[];
  subscribe: (listener: () => void) => () => void;
  label: string;
  onActivate(blockId: string): void;
}): Plugin {
  const bar = (blockId: string) =>
    barOf(blockId, options.label, (id) => options.onActivate(id));
  return new Plugin<Marks>({
    key: marksKey,
    state: {
      init: (_config, state) => marksOf(state.doc, options.blockIds(), bar),
      apply(tr, marks, _old, state) {
        const ids = options.blockIds();
        if (!sameIds(ids, marks.ids)) return marksOf(state.doc, ids, bar);
        if (!tr.docChanged) return marks;
        const at = marks.at.map((pos) => tr.mapping.map(pos, -1));
        if (at.every((pos, i) => pos === marks.at[i])) return marks;
        return { ids, at, set: marks.set.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations: (state) => marksKey.getState(state)?.set,
    },
    view(view) {
      // a change of the ids reaches the plugin's state through a transaction of its own, and only a change does
      const stop = options.subscribe(() => {
        const ids = marksKey.getState(view.state)?.ids ?? [];
        if (sameIds(options.blockIds(), ids)) return;
        view.dispatch(
          view.state.tr.setMeta(marksKey, true).setMeta("addToHistory", false),
        );
      });
      return { destroy: stop };
    },
  });
}
