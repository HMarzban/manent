// Where focus goes back to when a surface closes.

export interface FocusOrigin {
  push(element: Element | null): void;
  pop(): void;
  restore(fallback: () => void): void;
}

const isFocusable = (element: Element): element is Element & HTMLOrSVGElement =>
  "focus" in element;

/** A stack of openers. `restore` takes the latest: it focuses it without scrolling, or calls `fallback` when the opener is gone or cannot take focus, so focus never stays on the body. */
export function createFocusOrigin(): FocusOrigin {
  const openers: (Element | null)[] = [];
  return {
    push(element) {
      openers.push(element);
    },
    pop() {
      openers.pop();
    },
    restore(fallback) {
      const opener = openers.pop() ?? null;
      if (opener === null || !opener.isConnected || !isFocusable(opener)) {
        fallback();
        return;
      }
      opener.focus({ preventScroll: true });
      if (opener.ownerDocument.activeElement !== opener) fallback();
    },
  };
}
