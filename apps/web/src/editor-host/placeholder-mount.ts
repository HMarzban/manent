// The page-shaped placeholder shown until a document's editor is ready.

import type { EditorMount } from "./mount.ts";

// copies of LOADING_QUIET_MS and DOCUMENT_WORDS.opening, which @manent/ui does not export yet
const LOADING_QUIET_MS = 150;
const OPENING = "Opening…";

/** The page's own size at 100 % zoom. */
const SHEET_WIDTH_PX = 816;
const SHEET_HEIGHT_PX = 1056;
const PLACEHOLDER_BARS = [
  "35%",
  "90%",
  "84%",
  "72%",
  "42%",
  "88%",
  "64%",
] as const;

/** One empty sheet among the pages, as the editor draws it, then the word "Opening…" after `LOADING_QUIET_MS`; it publishes no fact. */
export const placeholderMount: EditorMount = {
  mount({ element }) {
    const { ownerDocument } = element;
    // the pages carry the sheet's colour scheme, which White page in dark theme makes light
    const pages = ownerDocument.createElement("div");
    pages.className = "mn-pages";
    pages.setAttribute("aria-busy", "true");
    const sheet = ownerDocument.createElement("div");
    sheet.className = "mn-sheet";
    sheet.style.width = `${SHEET_WIDTH_PX}px`;
    sheet.style.height = `${SHEET_HEIGHT_PX}px`;
    sheet.setAttribute("aria-hidden", "true");
    sheet.setAttribute("data-placeholder", "");
    const lines = ownerDocument.createElement("div");
    lines.setAttribute("aria-hidden", "true");
    lines.className = "flex flex-col gap-3.5 px-24 pt-24";
    for (const width of PLACEHOLDER_BARS) {
      const bar = ownerDocument.createElement("div");
      bar.setAttribute("aria-hidden", "true");
      bar.setAttribute("data-slot", "skeleton");
      bar.className = "h-3 animate-pulse rounded-md bg-muted";
      bar.style.width = width;
      lines.append(bar);
    }
    sheet.append(lines);
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
