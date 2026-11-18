// Enter on an empty line, Tab and Shift+Tab: the keys that move a line between the elements of its format.
import { ACT_BREAK_KINDS, renderedType, schema } from "@manent/schema";
import type { FormatId, IdSource } from "@manent/schema";
import { keydownHandler } from "prosemirror-keymap";
import { Plugin } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { detectOnEnter, flowRow, shiftTabTarget } from "../elements/index.ts";
import type { ElementRef, FlowPrefs, FlowTarget } from "../elements/index.ts";
import type { HistoryPort } from "../script-editor/ports.ts";
import { sectionEnter } from "../sections/commands.ts";
import type { NextElement } from "../sections/commands.ts";

/** What the element keys need; each member is read when a key runs, never when the plugin is made. */
export interface ElementContext {
  format(): FormatId;
  prefs(): FlowPrefs;
  history: HistoryPort;
  ids: IdSource;
  /** Opens the element picker at the caret. */
  openPicker(view: EditorView): void;
}

/** The keys Preferences → Keyboard shows as fixed: the flow between elements and the caret's own moves. */
export const STRUCTURAL_KEYS: readonly string[] = Object.freeze([
  "Enter",
  "Tab",
  "Shift+Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Mod+ArrowUp",
  "Mod+ArrowDown",
  "Mod+Home",
  "Mod+End",
  "Control+Home",
  "Control+End",
]);

/** The element of a block's `type` and `kind` attributes: a type this build does not know is General. */
export function elementOf(type: string, kind: string | null): ElementRef {
  const element = renderedType(type);
  return {
    type: element,
    kind:
      element === "act_break"
        ? (ACT_BREAK_KINDS.find((known) => known === kind) ?? null)
        : null,
  };
}

/** Sets `type`, and `kind` (null but on an act break), on every block the selection touches, in one transaction. */
export function setElement(element: ElementRef): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    state.doc.nodesBetween(
      state.selection.from,
      state.selection.to,
      (node, pos) => {
        if (node.type !== schema.nodes.block) return true;
        tr.setNodeAttribute(pos, "type", element.type).setNodeAttribute(
          pos,
          "kind",
          element.kind,
        );
        return false;
      },
    );
    dispatch?.(tr);
    return true;
  };
}

/** setElement as an undo step of its own. */
export function convertElement(
  view: EditorView,
  history: HistoryPort,
  element: ElementRef,
): void {
  history.closeStep(view.state);
  setElement(element)(view.state, view.dispatch);
  history.closeStep(view.state);
}

/** The element Enter gives the new block: the row's Enter target, or at the block's start the block's own element. */
export function nextElementFor(context: ElementContext): NextElement {
  return (current, place) => {
    if (place === "start") return current.type;
    const { to } = flowRow(
      context.format(),
      elementOf(current.type, current.kind),
      context.prefs(),
    ).enter;
    return typeof to === "object" ? to.type : current.type;
  };
}

// An act break Enter makes has no kind, which flows and lays out as a new act, the one kind the table leads to.
function enterWith(context: ElementContext, element: string): Command {
  return sectionEnter({ ids: context.ids, nextElement: () => element });
}

function caretBlock(view: EditorView) {
  const { $head, empty } = view.state.selection;
  const block = $head.parent;
  return {
    empty,
    atEnd: $head.parentOffset === block.content.size,
    blank: block.content.size === 0,
    block,
    element: elementOf(String(block.attrs.type), block.attrs.kind),
  };
}

function enterKey(view: EditorView, context: ElementContext): boolean {
  const caret = caretBlock(view);
  if (!caret.empty) return false;
  const format = context.format();
  if (caret.blank) {
    const { to } = flowRow(format, caret.element, context.prefs()).enterEmpty;
    if (to === "picker") {
      context.openPicker(view);
      return true;
    }
    return typeof to === "object" && setElement(to)(view.state, view.dispatch);
  }
  const detected = detectOnEnter(
    format,
    caret.element,
    caret.block.textContent,
  );
  if (detected === null) return false;
  convertElement(view, context.history, detected);
  return sectionEnter({
    ids: context.ids,
    nextElement: nextElementFor(context),
  })(view.state, view.dispatch);
}

/**
 * The next part of a heading: a space after its intro, then " - " after its
 * location, then, once a time follows the dash, a new line of `enter`.
 */
function headingPart(
  view: EditorView,
  context: ElementContext,
  text: string,
  enter: FlowTarget,
): void {
  const dash = text.indexOf(" - ");
  if (dash >= 0) {
    if (text.slice(dash + 3).trim() !== "" && typeof enter.to === "object")
      enterWith(context, enter.to.type)(view.state, view.dispatch);
    return;
  }
  const space = text.indexOf(" ");
  if (space >= 0 && text.slice(space + 1).trim() === "") return;
  const part = space < 0 ? " " : " - ";
  view.dispatch(
    view.state.tr.insertText(part, view.state.selection.head).scrollIntoView(),
  );
}

// Tab is always handled, so focus never leaves the page.
function tabKey(view: EditorView, context: ElementContext): boolean {
  const caret = caretBlock(view);
  if (!caret.empty || (!caret.blank && !caret.atEnd)) return true;
  const row = flowRow(context.format(), caret.element, context.prefs());
  const { to } = caret.blank ? row.tabEmpty : row.tabAtEnd;
  if (to === "heading_part")
    headingPart(view, context, caret.block.textContent, row.enter);
  else if (typeof to === "object") {
    const set = caret.blank ? setElement(to) : enterWith(context, to.type);
    set(view.state, view.dispatch);
  }
  return true;
}

function shiftTabKey(view: EditorView, context: ElementContext): boolean {
  const caret = caretBlock(view);
  if (!caret.empty || !caret.blank) return true;
  const to = shiftTabTarget(context.format(), caret.element, context.prefs());
  if (to !== null) setElement(to)(view.state, view.dispatch);
  return true;
}

type ViewKey = (view: EditorView, context: ElementContext) => boolean;

function bind(key: ViewKey, context: ElementContext): Command {
  return (_state, _dispatch, view) => view !== undefined && key(view, context);
}

/** Enter on an empty line, Tab and Shift+Tab; Enter on a line with text is left to the section plugin unless it converts the line first. */
export function elementKeysPlugin(context: ElementContext): Plugin {
  const keys = keydownHandler({
    Enter: bind(enterKey, context),
    Tab: bind(tabKey, context),
    "Shift-Tab": bind(shiftTabKey, context),
  });
  return new Plugin({
    props: {
      handleKeyDown: (view, event) =>
        !view.composing && !event.isComposing && keys(view, event),
    },
  });
}
