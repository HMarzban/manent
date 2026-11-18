// The page-shaped placeholder shown until a document's editor is ready.

import type { EditorMount } from "./mount.ts";

// copies of LOADING_QUIET_MS and DOCUMENT_WORDS.opening, which @manent/ui does not export yet
const LOADING_QUIET_MS = 150;
const OPENING = "Opening…";

/** The page's own size at 100 % zoom. */
const SHEET_WIDTH_PX = 816;
const SHEET_HEIGHT_PX = 1056;

/** One empty sheet, then the word "Opening…" after `LOADING_QUIET_MS`; it publishes no fact. */
export const placeholderMount: EditorMount = {
  mount({ element }) {
    const { ownerDocument } = element;
    const sheet = ownerDocument.createElement("div");
    sheet.className = "mn-sheet";
    sheet.style.width = `${SHEET_WIDTH_PX}px`;
    sheet.style.height = `${SHEET_HEIGHT_PX}px`;
    sheet.setAttribute("aria-hidden", "true");
    sheet.setAttribute("data-placeholder", "");
    const status = ownerDocument.createElement("p");
    status.setAttribute("role", "status");
    element.append(sheet, status);
    const timer = setTimeout(() => {
      status.textContent = OPENING;
    }, LOADING_QUIET_MS);
    return () => {
      clearTimeout(timer);
      sheet.remove();
      status.remove();
    };
  },
};
