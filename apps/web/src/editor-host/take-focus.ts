// Where focus goes when a page's editor is built.
import type { ScriptEditor } from "@manent/editor";

const noop = (): void => {};

/**
 * Focus goes to the page at the caret once it is shown, so no keystroke is lost, unless something other than the page's
 * region holds it by then. A page is hidden until its fonts are ready. Returns the disposer.
 */
export function takeFocus(
  editor: ScriptEditor,
  element: HTMLElement,
): () => void {
  const { view } = editor;
  const focus = (): void => {
    const active = element.ownerDocument.activeElement;
    if (active !== null && !active.contains(element)) return;
    // the view focuses itself only while it is editable, so a read-only page is focused as a text box
    if (view.editable) view.focus();
    else view.dom.focus({ preventScroll: true });
  };
  const pages = editor.scaffold?.pages;
  if (pages === undefined || pages.dataset["fonts"] !== "loading") {
    focus();
    return noop;
  }
  const shown = new MutationObserver(() => {
    shown.disconnect();
    focus();
  });
  shown.observe(pages, { attributeFilter: ["data-fonts"] });
  return () => shown.disconnect();
}
