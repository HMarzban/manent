// A speech's alternates on the page: a marker at the end of each dialogue block that has some, and the dialogue
// block the caret is in, told to the host.
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

export interface MaterialOptions {
  /**
   * Starts following the alternates of `view`'s document: `changed` is called after each change of `counts`. The
   * returned function stops.
   */
  follow(view: EditorView, changed: () => void): () => void;
  /** How many alternates each dialogue block has, by its id; a block it does not name has none. */
  counts(): ReadonlyMap<string, number>;
  /** The marker's text and accessible name for a speech with `count` alternates. */
  marker(count: number): { text: string; name: string };
  /** The marker of the dialogue block `blockId` was activated. */
  onOpen(blockId: string): void;
  /** The dialogue block the caret is in, null outside one; told from the view's update, each time it changes. */
  onCaretSpeech(blockId: string | null): void;
}

const markersKey = new PluginKey<DecorationSet>("material_markers");
const REDRAW = "redraw";

type Marker = (pos: number, blockId: string, count: number) => Decoration;

/** The id of `node` when it is a dialogue block; null otherwise. */
function speechId(node: Node): string | null {
  const id: unknown = node.attrs.id;
  return node.type.name === "block" &&
    node.attrs.type === "dialogue" &&
    typeof id === "string"
    ? id
    : null;
}

/** The markers of the blocks between `from` and `to` of `doc`, one per dialogue block with alternates. */
function markersIn(
  doc: Node,
  from: number,
  to: number,
  counts: ReadonlyMap<string, number>,
  marker: Marker,
): Decoration[] {
  const found: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "block") return true;
    const id = speechId(node);
    const count = id === null ? 0 : (counts.get(id) ?? 0);
    // after the block's text
    if (id !== null && count > 0)
      found.push(marker(pos + node.nodeSize - 1, id, count));
    return false;
  });
  return found;
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

/**
 * The start of the block `pos` is in, or of the block that ends at it; or the end of the block `pos` is in, or of the
 * one that starts at it. `pos` itself between sections.
 */
function blockEdge(doc: Node, pos: number, edge: "start" | "end"): number {
  const at = doc.resolve(Math.min(pos, doc.content.size));
  if (at.depth >= 2) return edge === "start" ? at.before(2) : at.after(2);
  if (at.depth === 0) return at.pos;
  return edge === "start"
    ? at.pos - (at.nodeBefore?.nodeSize ?? 0)
    : at.pos + (at.nodeAfter?.nodeSize ?? 0);
}

/** The markers after `tr`: mapped, and drawn again for the whole blocks its steps touched. */
function markersAfter(
  tr: Transaction,
  set: DecorationSet,
  state: EditorState,
  options: MaterialOptions,
  marker: Marker,
): DecorationSet {
  const mapped = set.map(tr.mapping, tr.doc);
  const span = changedSpan(tr);
  if (span === null) return mapped;
  const { doc } = state;
  const start = blockEdge(doc, span.from, "start");
  const end = blockEdge(doc, span.to, "end");
  return mapped
    .remove(mapped.find(start, end))
    .add(doc, markersIn(doc, start, end, options.counts(), marker));
}

function markerOf(options: MaterialOptions): Marker {
  return (pos, blockId, count) => {
    const { text, name } = options.marker(count);
    return Decoration.widget(
      pos,
      () => {
        // a zero-width holder, so the marker takes no room on the line the engine laid out
        const holder = document.createElement("span");
        holder.style.position = "relative";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mn-tag";
        button.contentEditable = "false";
        button.textContent = text;
        button.setAttribute("aria-label", name);
        button.dataset.tour = "alternates";
        Object.assign(button.style, {
          position: "absolute",
          insetInlineStart: "0.5rem",
          bottom: "0",
          fontFamily: "var(--face-ui)",
          backgroundColor: "var(--bg-overlay)",
          cursor: "pointer",
          userSelect: "none",
        });
        // the caret stays where it is: the press is the marker's
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", (event) => {
          event.preventDefault();
          options.onOpen(blockId);
        });
        holder.append(button);
        return holder;
      },
      {
        key: `alternates:${blockId}:${count}`,
        side: 1,
        ignoreSelection: true,
        stopEvent: () => true,
      },
    );
  };
}

/** The dialogue block the selection's head is in; null outside one. */
const caretSpeech = (state: EditorState): string | null =>
  speechId(state.selection.$head.parent);

/**
 * The material plugin: a marker after the text of each dialogue block with alternates, which opens them; drawn again
 * for the whole script only when the counts change, and otherwise for the blocks a change touched.
 */
export function materialPlugin(options: MaterialOptions): Plugin {
  const marker = markerOf(options);
  const all = (doc: Node): DecorationSet =>
    DecorationSet.create(
      doc,
      markersIn(doc, 0, doc.content.size, options.counts(), marker),
    );
  return new Plugin<DecorationSet>({
    key: markersKey,
    state: {
      init: (_config, state) => all(state.doc),
      apply(tr, set, _old, state) {
        if (tr.getMeta(markersKey) === REDRAW) return all(state.doc);
        if (!tr.docChanged) return set;
        return markersAfter(tr, set, state, options, marker);
      },
    },
    props: {
      decorations: (state) => markersKey.getState(state),
    },
    view(view) {
      let speech = caretSpeech(view.state);
      options.onCaretSpeech(speech);
      const stop = options.follow(view, () =>
        view.dispatch(
          view.state.tr
            .setMeta(markersKey, REDRAW)
            .setMeta("addToHistory", false),
        ),
      );
      return {
        update() {
          const next = caretSpeech(view.state);
          if (next === speech) return;
          speech = next;
          options.onCaretSpeech(next);
        },
        destroy: stop,
      };
    },
  });
}

/** Where the dialogue block `blockId` is drawn, px of the window; null when `view` draws no such block. */
export function speechPlace(
  view: EditorView,
  blockId: string,
): { left: number; top: number; bottom: number } | null {
  const element = view.dom.querySelector(`[data-id="${blockId}"]`);
  if (element === null) return null;
  const { left, top, bottom } = element.getBoundingClientRect();
  return { left, top, bottom };
}
