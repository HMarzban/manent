// The project's names on the page: each near match underlined, and the listed spelling offered with the caret in it.
import { wordAt } from "@manent/revisions";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { DecorationSet, EditorView } from "prosemirror-view";
import { completeKey } from "../complete/complete-plugin.ts";
import { createCompletePopover } from "../complete/popover.ts";
import type { CompletePopover } from "../complete/popover.ts";
import { markAfter, markAll, markAt } from "./near-marks.ts";
import type { MarkAt, NearMarksSource } from "./near-marks.ts";

export interface ProjectNamesOptions {
  /** The popovers' frame; null before the view exists. */
  layer(): HTMLElement | null;
  /** The listed spellings of the project's names. */
  names(): readonly string[];
  /** Whether near matches are underlined and offered: the person's Check spelling as I type. */
  checked(): boolean;
  /** Calls back when `names` or `checked` change; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** The underline's accessible description, for the listed spelling `name`. */
  describe(name: string): string;
}

/** A question asked at the caret: which of `items` to use; `choose` is told the index of the one chosen. */
interface Asking {
  readonly items: readonly string[];
  readonly at: number;
  choose(index: number): void;
}

interface NamesState {
  readonly marks: DecorationSet;
  /** The run whose offer Escape closed; it is offered again once the caret has left it. */
  readonly closed: { readonly from: number; readonly to: number } | null;
  readonly asking: Asking | null;
  /** The option chosen, an index into what is offered. */
  readonly active: number;
}

type NamesMeta =
  | { kind: "read" }
  | { kind: "ask"; asking: Asking }
  | { kind: "move"; active: number }
  | { kind: "close" };

/** What the list shows at the caret, and what choosing an option does. */
interface Offer {
  readonly items: readonly string[];
  choose(view: EditorView, index: number): void;
}

const namesKey = new PluginKey<NamesState>("project_names");

const READ: NamesMeta = Object.freeze({ kind: "read" });
const CLOSE: NamesMeta = Object.freeze({ kind: "close" });

const stateOf = (state: EditorState): NamesState => namesKey.getState(state)!;

/** The mark the caret is in, with nothing selected; null otherwise, and in an editor without this plugin. */
function caretMark(state: EditorState): MarkAt | null {
  const names = namesKey.getState(state);
  const { selection } = state;
  return names === undefined || !selection.empty
    ? null
    : markAt(names.marks, selection.head);
}

function sourceOf(options: ProjectNamesOptions): NearMarksSource {
  return {
    names: options.checked() ? options.names() : [],
    describe: options.describe,
  };
}

function applied(
  tr: Transaction,
  prev: NamesState,
  state: EditorState,
  options: ProjectNamesOptions,
): NamesState {
  const meta: NamesMeta | undefined = tr.getMeta(namesKey);
  switch (meta?.kind) {
    case "read":
      return { ...prev, marks: markAll(state.doc, sourceOf(options)) };
    case "ask":
      return { ...prev, asking: meta.asking, active: 0 };
    case "move":
      return { ...prev, active: meta.active };
    case "close": {
      if (prev.asking !== null) return { ...prev, asking: null, active: 0 };
      const mark = caretMark(state);
      return {
        ...prev,
        closed: mark === null ? null : { from: mark.from, to: mark.to },
      };
    }
    case undefined:
      break;
  }
  if (tr.docChanged)
    return {
      marks: markAfter(tr, prev.marks, sourceOf(options)),
      closed: null,
      asking: null,
      active: 0,
    };
  if (!tr.selectionSet) return prev;
  const { head } = state.selection;
  const { closed, asking } = prev;
  return {
    marks: prev.marks,
    closed:
      closed !== null && closed.from <= head && head <= closed.to
        ? closed
        : null,
    asking: asking !== null && asking.at === head ? asking : null,
    active: 0,
  };
}

/** What the list offers at the caret: a question asked, or, on an editable page, the listed spelling of the run the caret is in. */
function offerOf(state: EditorState, editable: boolean): Offer | null {
  const { asking, closed } = stateOf(state);
  if (asking !== null)
    return {
      items: asking.items,
      choose(at, index) {
        at.dispatch(at.state.tr.setMeta(namesKey, CLOSE));
        asking.choose(index);
      },
    };
  // autocomplete's list takes the caret first, and the two never show at once
  if (!editable || (completeKey.getState(state)?.open ?? null) !== null)
    return null;
  const mark = caretMark(state);
  if (
    mark === null ||
    (closed !== null && closed.from === mark.from && closed.to === mark.to)
  )
    return null;
  return { items: [mark.name], choose: (at) => writeListedSpelling(at) };
}

/** The keys of a shown list; false: the key passes. Up and Down move only between several options. */
function handled(view: EditorView, event: KeyboardEvent): boolean {
  if (view.composing || event.isComposing) return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
    return false;
  const offer = offerOf(view.state, view.editable);
  if (offer === null) return false;
  const { active } = stateOf(view.state);
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp": {
      if (offer.items.length < 2) return false;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(offer.items.length - 1, Math.max(0, active + step));
      view.dispatch(
        view.state.tr.setMeta(namesKey, { kind: "move", active: next }),
      );
      return true;
    }
    case "Enter":
      // the browser would otherwise break the line itself
      event.preventDefault();
      offer.choose(view, active);
      return true;
    case "Escape":
      event.stopPropagation();
      view.dispatch(view.state.tr.setMeta(namesKey, CLOSE));
      return true;
    default:
      return false;
  }
}

/** The index of the option a press landed on, among its list's; null when it landed on none. */
function optionPressed(event: MouseEvent): number | null {
  if (!(event.target instanceof Element)) return null;
  const option = event.target.closest('[role="option"]');
  const list = option?.parentElement ?? null;
  return option === null || list === null
    ? null
    : [...list.children].indexOf(option);
}

/** What the plugin's view and the page's attributes share: the list, once the view has a layer, and the page's state. */
interface Shared {
  popover: CompletePopover | null;
  /** The page is editable, as the view was last told; the attributes are read before the view is. */
  editable: boolean;
}

/** Reads the names again when they or Check spelling as I type change, and shows, places and hides the list. */
function namesView(
  view: EditorView,
  options: ProjectNamesOptions,
  shared: Shared,
): PluginView {
  const layer = options.layer();
  const popover = layer === null ? null : createCompletePopover({ layer });
  shared.popover = popover;
  let shown: Offer | null = null;
  const draw = () => {
    shared.editable = view.editable;
    shown = offerOf(view.state, view.editable);
    if (popover === null || layer === null) return;
    if (shown === null || view.composing) {
      popover.hide();
      return;
    }
    popover.show(shown.items, stateOf(view.state).active);
    const caret = view.coordsAtPos(view.state.selection.head);
    const box = layer.getBoundingClientRect();
    popover.place(caret.left - box.left, caret.bottom - box.top);
  };
  const press = (event: MouseEvent) => {
    const index = optionPressed(event);
    if (shown === null || index === null) return;
    // the page keeps focus
    event.preventDefault();
    shown.choose(view, index);
  };
  layer?.addEventListener("mousedown", press);
  const stop = options.subscribe(() =>
    view.dispatch(view.state.tr.setMeta(namesKey, READ)),
  );
  draw();
  return {
    update: draw,
    destroy() {
      stop();
      layer?.removeEventListener("mousedown", press);
      popover?.hide();
      shared.popover = null;
    },
  };
}

/**
 * The dotted underline (`.mn-name-match`) under each run of the page that nearly matches one of the project's names
 * (`findNearMatches`), while Check spelling as I type is on, with the listed spelling in its accessible description.
 * The whole page is read when the view starts and when the names or that preference change; a transaction reads
 * again only the text blocks it replaced. With the caret in an underlined run of an editable page, autocomplete's list
 * offers the listed spelling: Enter or a press writes it, Escape closes the offer until the caret leaves the run.
 * Its keys are heard before every plugin's, so Enter never reaches the element keys while the list is shown.
 */
export function projectNamesPlugin(options: ProjectNamesOptions): Plugin {
  const shared: Shared = { popover: null, editable: false };
  return new Plugin<NamesState>({
    key: namesKey,
    state: {
      init: (_, state) => ({
        marks: markAll(state.doc, sourceOf(options)),
        closed: null,
        asking: null,
        active: 0,
      }),
      apply: (tr, prev, _, state) => applied(tr, prev, state, options),
    },
    props: {
      decorations: (state) => stateOf(state).marks,
      attributes: (state) =>
        shared.popover?.attributes(
          offerOf(state, shared.editable) !== null,
          stateOf(state).active,
        ) ?? {},
      handleDOMEvents: { keydown: handled },
    },
    view: (view) => namesView(view, options, shared),
  });
}

/** Writes the listed spelling over the underlined run the caret is in, as one change; false when it is in none. */
export function writeListedSpelling(view: EditorView): boolean {
  const mark = caretMark(view.state);
  if (mark === null || !view.editable) return false;
  view.dispatch(
    view.state.tr.insertText(mark.name, mark.from, mark.to).scrollIntoView(),
  );
  return true;
}

/** The text selected inside one element, or else the word at the caret; null when there is neither. */
export function wordAtCaret(state: EditorState): string | null {
  const { $from, $to, empty } = state.selection;
  if (!$from.parent.isTextblock || !$from.sameParent($to)) return null;
  const text = $from.parent.textContent;
  if (!empty)
    return text.slice($from.parentOffset, $to.parentOffset).trim() || null;
  const word = wordAt(text, $from.parentOffset);
  return word === null ? null : text.slice(word.from, word.to);
}

/** Asks at the caret, in autocomplete's list, which of `items` to use; `choose` is told the index of the one chosen. */
export function askAtCaret(
  view: EditorView,
  items: readonly string[],
  choose: (index: number) => void,
): void {
  const asking: Asking = { items, at: view.state.selection.head, choose };
  view.dispatch(view.state.tr.setMeta(namesKey, { kind: "ask", asking }));
}
