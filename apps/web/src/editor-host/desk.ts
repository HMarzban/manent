// The desk the pages lie on: the room the editor's element gives them.
import type { ScriptEditorOptions } from "@manent/editor";

/** The element's inner width and horizontal padding, px, and its resizes. */
export function deskOf(element: HTMLElement): ScriptEditorOptions["desk"] {
  const padding = (): number => {
    const style = getComputedStyle(element);
    // a padding the page never set reads as no length at all
    return (
      (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0)
    );
  };
  return {
    widthPx: () => element.clientWidth - padding(),
    paddingPx: padding,
    observe(listener) {
      const observer = new ResizeObserver(() => listener());
      observer.observe(element);
      return () => observer.disconnect();
    },
  };
}
