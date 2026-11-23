// Comments and notes on the page: the underline on each range, a marker per block in the gutter, and `[[`.
import type { ChangeHint } from "@manent/pagination";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import { toIndex, updateIndex } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { followChange, newlyRemoved, placeList } from "./anchor-places.ts";
import type { Place } from "./anchor-places.ts";
import type { Annotation, AnnotationsOptions } from "./annotations-options.ts";
import { createGutter } from "./gutter-markers.ts";
import { handleNoteTrigger } from "./note-trigger.ts";
import { underlinesOf } from "./underlines.ts";

interface AnnotationsState {
  /** The host's list the places were found for. */
  readonly list: readonly Annotation[];
  readonly index: BlockIndex;
  readonly places: readonly Place[];
  /** The block whose marker the pointer is over. */
  readonly hovered: string | null;
  readonly decorations: DecorationSet;
}

type Meta = { type: "list" } | { type: "hover"; blockId: string | null };

const annotationsKey = new PluginKey<AnnotationsState>("annotations");

function stateOf(state: EditorState): AnnotationsState {
  const value = annotationsKey.getState(state);
  if (value === undefined)
    throw new RangeError("the editor state has no annotations");
  return value;
}

/**
 * The index of `state` and the blocks replaced since `old`. With pages, theirs: they wait while a composition is
 * under way and then name everything it replaced; a state that does not follow the one before replaces every
 * block. Without pages, the plugin keeps its own.
 */
function followed(
  prev: BlockIndex,
  old: EditorState,
  state: EditorState,
): { index: BlockIndex; change: ChangeHint | null } {
  const pages = paginationKey.getState(state);
  if (pages === undefined) return updateIndex(prev, state.doc);
  if (pages.index === prev) return { index: prev, change: null };
  if (paginationKey.getState(old)?.index === prev)
    return { index: pages.index, change: pages.change };
  return {
    index: pages.index,
    change: {
      first: 0,
      oldEnd: prev.blocks.length,
      newEnd: pages.index.blocks.length,
    },
  };
}

function initial(
  options: AnnotationsOptions,
  state: EditorState,
): AnnotationsState {
  const index = paginationKey.getState(state)?.index ?? toIndex(state.doc);
  const list = options.annotations();
  const places = placeList(list, [], index);
  return {
    list,
    index,
    places,
    hovered: null,
    decorations: underlinesOf(index, places, null),
  };
}

function applied(
  options: AnnotationsOptions,
  tr: Transaction,
  prev: AnnotationsState,
  old: EditorState,
  state: EditorState,
): AnnotationsState {
  const meta: Meta | undefined = tr.getMeta(annotationsKey);
  const { index, change } = followed(prev.index, old, state);
  if (
    meta === undefined &&
    change === null &&
    !tr.docChanged &&
    index === prev.index
  )
    return prev;
  const moved =
    change === null ? prev.places : followChange(prev.places, index, change);
  const list = meta?.type === "list" ? options.annotations() : prev.list;
  const places = list === prev.list ? moved : placeList(list, moved, index);
  const hovered = meta?.type === "hover" ? meta.blockId : prev.hovered;
  const same = places === prev.places && hovered === prev.hovered;
  return {
    list,
    index,
    places,
    hovered,
    // while a composition is under way the index waits, and the underlines follow the steps
    decorations:
      same || index.doc !== state.doc
        ? prev.decorations.map(tr.mapping, tr.doc)
        : underlinesOf(index, places, hovered),
  };
}

/**
 * Draws the host's comments and notes: a 2 px dashed underline on each range, filled while open or while its
 * block's marker is hovered, and one marker per block in the gutter, with its count, that activates the first of
 * them. Ranges are found again only in the blocks a transaction replaced; a range whose text is gone is reported
 * once through `onRemoved` and drawn no more. With no annotations nothing is drawn. `[` typed right after `[` is
 * the note trigger (`handleNoteTrigger`).
 */
export function annotationsPlugin(options: AnnotationsOptions): Plugin {
  return new Plugin<AnnotationsState>({
    key: annotationsKey,
    state: {
      init: (_config, state) => initial(options, state),
      apply: (tr, prev, old, state) => applied(options, tr, prev, old, state),
    },
    props: {
      decorations: (state) => annotationsKey.getState(state)?.decorations,
      handleKeyDown: (view, event) =>
        handleNoteTrigger(view, event, options.noteTrigger),
    },
    view(view) {
      const dispatchMeta = (meta: Meta) =>
        view.dispatch(
          view.state.tr
            .setMeta(annotationsKey, meta)
            .setMeta("addToHistory", false),
        );
      const gutter = createGutter(view, () => stateOf(view.state).places, {
        label: (count) => options.label(count),
        onActivate: (id, at) => options.onActivate(id, at),
        hover: (blockId) => dispatchMeta({ type: "hover", blockId }),
      });
      const removedAtStart = newlyRemoved([], stateOf(view.state).places);
      if (removedAtStart.length > 0) options.onRemoved(removedAtStart);
      gutter.draw();
      // a change of the list reaches the plugin's state through a transaction of its own, and only a change does
      const stop = options.subscribe(() => {
        if (options.annotations() !== stateOf(view.state).list)
          dispatchMeta({ type: "list" });
      });
      return {
        update(_view, prevState) {
          const now = stateOf(view.state).places;
          const was = stateOf(prevState).places;
          const repaged =
            paginationKey.getState(view.state)?.pagination !==
            paginationKey.getState(prevState)?.pagination;
          if (now === was && !repaged) return;
          // from the states either side of the update, so a removal in a transaction followed by others is said
          const removed = newlyRemoved(was, now);
          if (removed.length > 0) options.onRemoved(removed);
          gutter.draw();
        },
        destroy() {
          stop();
          gutter.destroy();
        },
      };
    },
  });
}
