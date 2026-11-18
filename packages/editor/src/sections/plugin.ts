// Section-aware editing on the keys, paste, drop, typing and cut.
import { randomBlockId, schema } from "@manent/schema";
import type { ResolvedPos } from "prosemirror-model";
import { keydownHandler } from "prosemirror-keymap";
import { Plugin, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorProps, EditorView } from "prosemirror-view";
import { sectionBackspace, sectionDelete, sectionEnter } from "./commands.ts";
import type { SectionOptions } from "./commands.ts";
import { deleteRangeKeepingSections } from "./delete-range.ts";
import { dropSlice, pasteSlice } from "./paste.ts";

function isInOneBlock($from: ResolvedPos, $to: ResolvedPos): boolean {
  return $from.parent.isTextblock && $from.sameParent($to);
}

/**
 * Typing over `from`–`to`: the range is deleted keeping sections and `text`
 * put in with the marks at `from`. Null when the range lies in one block,
 * where ProseMirror's own typing keeps the sections.
 */
export function typeOverSelection(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  const $from = state.doc.resolve(from);
  if (isInOneBlock($from, state.doc.resolve(to))) return null;
  const tr = deleteRangeKeepingSections(state.tr, from, to);
  const at = tr.selection.from;
  return tr
    .insert(at, schema.text(text, $from.marks()))
    .setSelection(TextSelection.create(tr.doc, at + text.length));
}

/** A cut across blocks: the clipboard gets the selection and the range is deleted keeping sections. */
function cut(view: EditorView, event: ClipboardEvent): boolean {
  const { $from, $to, from, to } = view.state.selection;
  const clipboard = event.clipboardData;
  if (isInOneBlock($from, $to) || clipboard === null) return false;
  const { dom, text } = view.serializeForClipboard(
    view.state.selection.content(),
  );
  clipboard.setData("text/html", dom.innerHTML);
  clipboard.setData("text/plain", text);
  event.preventDefault();
  view.dispatch(
    deleteRangeKeepingSections(view.state.tr, from, to).scrollIntoView(),
  );
  return true;
}

/** Paste, drop, typing over a selection and cut, each keeping every block in its section. */
export function sectionEditingProps(
  options: SectionOptions = {},
): Pick<
  EditorProps,
  "handlePaste" | "handleDrop" | "handleTextInput" | "handleDOMEvents"
> {
  const ids = options.ids ?? randomBlockId;
  return {
    handlePaste: (view, _event, slice) => {
      view.dispatch(pasteSlice(view.state, slice, ids).scrollIntoView());
      return true;
    },
    handleDrop: (view, event, slice, moved) => {
      const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (at === null) return false;
      view.dispatch(
        dropSlice(
          view.state,
          slice,
          at.pos,
          moved ? "moved" : "outside",
          ids,
        ).scrollIntoView(),
      );
      return true;
    },
    handleTextInput: (view, from, to, text) => {
      const tr = typeOverSelection(view.state, from, to, text);
      if (tr === null) return false;
      view.dispatch(tr.scrollIntoView());
      return true;
    },
    handleDOMEvents: { cut },
  };
}

/** Enter, Backspace and Delete, and the props of sectionEditingProps. */
export function sectionEditingPlugin(options: SectionOptions = {}): Plugin {
  return new Plugin({
    props: {
      ...sectionEditingProps(options),
      handleKeyDown: keydownHandler({
        Enter: sectionEnter(options),
        Backspace: sectionBackspace(),
        Delete: sectionDelete(),
      }),
    },
  });
}
