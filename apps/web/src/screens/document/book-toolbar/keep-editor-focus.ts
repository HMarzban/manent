// Shared pointer/focus helper for the floating Book format bar so clicking controls never blurs ProseMirror or drops selection.
import type { MouseEvent } from "react";

/** Prevents mousedown from stealing focus out of ProseMirror unless the pointer hit a text input inside a popover. */
export function keepEditorFocus(event: MouseEvent): void {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  event.preventDefault();
}
