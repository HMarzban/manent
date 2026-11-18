// A stand-in editor for the test build: a plain editable page that publishes facts the way the bridge does.

import type { EditorMount } from "./mount.ts";

const ELEMENT_CYCLE = [
  "scene_heading",
  "action",
  "character",
  "dialogue",
] as const;
const LINES_PER_PAGE = 55;

const isNewLine = (event: Event): boolean =>
  event instanceof InputEvent &&
  (event.inputType === "insertParagraph" ||
    event.inputType === "insertLineBreak");

/** The element cycles only on Enter and the page changes only every 55 lines, so typing inside a line changes no fact. */
export const standInMount: EditorMount = {
  mount({ element, facts, guard }) {
    const page = element.ownerDocument.createElement("div");
    page.className = "mn-page-view";
    page.contentEditable = "true";
    page.setAttribute("role", "textbox");
    page.setAttribute("aria-multiline", "true");
    let lines = 0;
    const publish = (): void => {
      const pageNumber = Math.floor(lines / LINES_PER_PAGE) + 1;
      facts.publish({
        element: ELEMENT_CYCLE[lines % ELEMENT_CYCLE.length] ?? null,
        page: String(pageNumber),
        pageCount: pageNumber,
      });
    };
    const onInput = (event: Event): void => {
      guard.enter();
      try {
        if (!isNewLine(event)) return;
        lines++;
        publish();
      } finally {
        guard.leave();
      }
    };
    page.addEventListener("input", onInput);
    element.append(page);
    publish();
    return () => {
      page.removeEventListener("input", onInput);
      page.remove();
    };
  },
};
