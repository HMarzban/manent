// The page-shaped placeholder shown until a document's editor is ready.

import type { EditorMount } from "./mount.ts";

// copies of LOADING_QUIET_MS and DOCUMENT_WORDS.opening, which @manent/ui does not export yet
const LOADING_QUIET_MS = 150;
const OPENING = "Opening…";

/** The page's own size at 100 % zoom. */
const SHEET_WIDTH_PX = 816;
const SHEET_HEIGHT_PX = 1056;

export interface ScreenplaySkeletonGroup {
  readonly className: string;
  readonly bars: readonly string[];
}

/** Screenplay rhythm for page-shaped loading skeletons: page number, scene headings, action, dialogue and transition. */
export const SCREENPLAY_SKELETON_BLOCKS: readonly ScreenplaySkeletonGroup[] = [
  { className: "contents", bars: ["ms-auto mb-8 h-2.5 w-[4%]"] },
  { className: "contents", bars: ["h-3.5 w-[34%] mb-4"] },
  {
    className: "flex flex-col gap-2.5 mb-7",
    bars: ["h-3 w-full", "h-3 w-11/12", "h-3 w-3/4"],
  },
  {
    className: "mb-6 flex flex-col gap-2",
    bars: [
      "ms-[37%] h-3 w-[20%]",
      "ms-[29%] h-2.5 w-[18%]",
      "ms-[18%] h-3 w-[56%]",
      "ms-[18%] h-3 w-[52%]",
      "ms-[18%] h-3 w-[38%]",
    ],
  },
  {
    className: "mb-7 flex flex-col gap-2",
    bars: [
      "ms-[37%] h-3 w-[18%]",
      "ms-[18%] h-3 w-[54%]",
      "ms-[18%] h-3 w-[44%]",
    ],
  },
  {
    className: "flex flex-col gap-2.5 mb-6",
    bars: ["h-3 w-full", "h-3 w-5/6"],
  },
  { className: "contents", bars: ["ms-auto mb-8 h-3 w-[18%]"] },
  { className: "contents", bars: ["h-3.5 w-[40%] mb-4"] },
  {
    className: "flex flex-col gap-2.5 mb-6",
    bars: ["h-3 w-full", "h-3 w-11/12", "h-3 w-2/3"],
  },
  {
    className: "flex flex-col gap-2",
    bars: [
      "ms-[37%] h-3 w-[22%]",
      "ms-[18%] h-3 w-[50%]",
      "ms-[18%] h-3 w-[42%]",
    ],
  },
];

function createSkeletonBar(doc: Document, className: string): HTMLDivElement {
  const bar = doc.createElement("div");
  bar.setAttribute("aria-hidden", "true");
  bar.setAttribute("data-slot", "skeleton");
  bar.className = `animate-pulse rounded-sm ${className}`;
  return bar;
}

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
    const body = ownerDocument.createElement("div");
    body.setAttribute("aria-hidden", "true");
    body.className = "flex flex-col px-24 pt-16 pb-20";
    for (const block of SCREENPLAY_SKELETON_BLOCKS) {
      if (block.className === "contents") {
        for (const bar of block.bars)
          body.append(createSkeletonBar(ownerDocument, bar));
        continue;
      }
      const group = ownerDocument.createElement("div");
      group.setAttribute("aria-hidden", "true");
      group.className = block.className;
      for (const bar of block.bars)
        group.append(createSkeletonBar(ownerDocument, bar));
      body.append(group);
    }
    sheet.append(body);
    const status = ownerDocument.createElement("p");
    status.setAttribute("role", "status");
    status.className = "mt-3 text-center text-meta text-fg-muted";
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
