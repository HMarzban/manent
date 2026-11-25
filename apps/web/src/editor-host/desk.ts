// The desk the pages lie on: the room the editor's element gives them.
import type { ScriptEditorOptions } from "@manent/editor";

/** The element's inner width and horizontal padding, px, and its resizes, each heard in the frame after it. */
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
      // a new width rescales the pages, which resizes this element: answered inside the observer's own delivery, that
      // resize is one it cannot deliver, and the browser reports a loop
      let frame: number | null = null;
      const observer = new ResizeObserver(() => {
        frame ??= requestAnimationFrame(() => {
          frame = null;
          listener();
        });
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
      };
    },
  };
}
