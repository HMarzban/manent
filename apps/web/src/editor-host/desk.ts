// The desk the pages lie on: the room the editor's element gives them.
import type { ScriptEditor, ScriptEditorOptions } from "@manent/editor";

/** Scrolls past any rendered front (Title) pages so page 1 opens cleanly with no bottom card edge peeking under the bar. */
export function scrollToPageOne(
  region: HTMLElement,
  scaffold: ScriptEditor["scaffold"],
): void {
  if (scaffold === null) {
    region.scrollTo({ top: 0 });
    return;
  }
  const sheets = scaffold.front.querySelectorAll(".mn-sheet");
  const lastFront = sheets.item(sheets.length - 1);
  if (lastFront === null || lastFront.getBoundingClientRect().height <= 0) {
    region.scrollTo({ top: 0 });
    return;
  }
  const regionTop = region.getBoundingClientRect().top;
  const frontBottom = lastFront.getBoundingClientRect().bottom;
  const pagesTop = scaffold.pages.getBoundingClientRect().top;
  const shift = Math.max(
    frontBottom - regionTop + 8,
    pagesTop - regionTop - 20,
  );
  if (shift > 0) region.scrollTop += shift;
}

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
