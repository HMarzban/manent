// The page-shaped placeholder shown until a document's editor is ready.

import type { EditorMount } from "./mount.ts";

// copies of LOADING_QUIET_MS and DOCUMENT_WORDS.opening, which @manent/ui does not export yet
const LOADING_QUIET_MS = 150;
const OPENING = "Opening…";

/** The page's own size at 100 % zoom. */
const SHEET_WIDTH_PX = 816;
const SHEET_HEIGHT_PX = 1056;

/** One empty sheet among the pages, as the editor draws it, then the word "Opening…" after `LOADING_QUIET_MS`; it publishes no fact. */
export const placeholderMount: EditorMount = {
  mount({ element }) {
    const { ownerDocument } = element;
    // the pages carry the sheet's colour scheme, which White page in dark theme makes light
    const pages = ownerDocument.createElement("div");
    pages.className = "mn-pages";
    const sheet = ownerDocument.createElement("div");
    sheet.className = "mn-sheet";
    sheet.style.width = `${SHEET_WIDTH_PX}px`;
    sheet.style.height = `${SHEET_HEIGHT_PX}px`;
    sheet.setAttribute("aria-hidden", "true");
    sheet.setAttribute("data-placeholder", "");
    const status = ownerDocument.createElement("p");
    status.setAttribute("role", "status");
    pages.append(sheet);
    element.append(pages, status);
    const timer = setTimeout(() => {
      status.textContent = OPENING;
    }, LOADING_QUIET_MS);
    return () => {
      clearTimeout(timer);
      pages.remove();
      status.remove();
    };
  },
};
