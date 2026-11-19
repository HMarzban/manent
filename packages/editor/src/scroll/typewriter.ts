// Typewriter scrolling: the line being written stays at the height it had when the person started typing.
import type { EditorView } from "prosemirror-view";

/** Whether a viewport top, px, is inside the scroller's box; null is never. */
export function isInView(
  scroller: HTMLElement,
  top: number | null,
): top is number {
  if (top === null) return false;
  const box = scroller.getBoundingClientRect();
  return top >= box.top && top < box.bottom;
}

/** The line typing holds, as a viewport top in px. */
export interface HeldLine {
  /** After an update the person made by typing: the first records the caret's height, each later one scrolls back to it. */
  typed(view: EditorView): void;
  /** Lets the line go: the next update made by typing records it again. */
  release(): void;
}

/** `caretTop` is the caret's viewport top, px; null without a caret. Holding nothing to begin with, as after a remount. */
export function holdLine(
  scroller: HTMLElement,
  caretTop: (view: EditorView) => number | null,
): HeldLine {
  let held: number | null = null;
  return {
    typed(view) {
      const top = caretTop(view);
      if (held === null) {
        // with the caret out of view, the line is held at the middle of the scroller
        held = isInView(scroller, top)
          ? top
          : scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
        return;
      }
      if (top !== null && top !== held) scroller.scrollTop += top - held;
    },
    release() {
      held = null;
    },
  };
}
