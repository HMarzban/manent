// `[[` starts a note: the second `[` is never typed, the first is deleted, and the host opens its composer.
import type { EditorView } from "prosemirror-view";
import type { AnnotationsOptions } from "./annotations-options.ts";

/**
 * A key down of `[` right after a `[` in the same line, with nothing selected, deletes that `[` and runs `onTyped`
 * at the caret, unless `enabled()` says no; false leaves the key to the page. A key, not typed text, because the
 * page's typing plugin takes every text input before this one.
 */
export function handleNoteTrigger(
  view: EditorView,
  event: KeyboardEvent,
  trigger: AnnotationsOptions["noteTrigger"],
): boolean {
  // Option and AltGr type a bracket on some layouts; Command, or Control alone, makes a shortcut
  if (event.key !== "[" || event.metaKey || (event.ctrlKey && !event.altKey))
    return false;
  if (view.composing || !view.editable) return false;
  const { selection } = view.state;
  if (
    !selection.empty ||
    selection.$from.nodeBefore?.text?.endsWith("[") !== true
  )
    return false;
  if (!trigger.enabled()) return false;
  const at = selection.from - 1;
  view.dispatch(view.state.tr.delete(at, selection.from).scrollIntoView());
  trigger.onTyped(at);
  return true;
}
