// The pages before page 1 in the editor: one sheet each above page 1, its fields edited in place, laid out again
// whenever the title page or the profile changes.
import {
  CELL_PX,
  LINE_PX,
  UNITS_PER_LINE,
  UNIT_PX,
  layoutFrontPages,
} from "@manent/pagination";
import type { FrontField, FrontPage, PageProfile } from "@manent/pagination";
import type { TitlePageField } from "@manent/schema";
import { PAGE_GAP_PX } from "../page/config.ts";
import { screenPagePx } from "../page/profile-css.ts";
import type { PageScaffold } from "../page/scaffold.ts";
import type { TitlePageSource } from "../script-editor/ports.ts";
import { createFieldBox } from "./fields.ts";
import type { FieldBox, FieldKeys } from "./fields.ts";
import { FRONT_CSS } from "./front-css.ts";

export interface FrontPages {
  setProfile(profile: PageProfile): void;
  /** Scrolls the title page into view and puts the caret at the end of its title. */
  show(): void;
  /** The pages as print and PDF draw them. */
  printed(): FrontPage[];
  /** The label of the front page at viewport height `top`, px; null at or below page 1. */
  labelAt(top: number): string | null;
  destroy(): void;
}

// A sheet's height on screen at 100 %: the page's, or more when the editor keeps a long field on one sheet.
function sheetHeight(page: FrontPage, profile: PageProfile): number {
  const screen = screenPagePx(profile);
  const rows = Math.max(
    profile.linesPerPage,
    ...page.fields.map((at) => at.y / UNITS_PER_LINE + at.lines),
  );
  return Math.max(screen.height, screen.top + rows * LINE_PX + screen.bottom);
}

// The sheet's page number, drawn again each time; null on the title page.
function drawNumber(
  sheet: HTMLElement,
  page: FrontPage,
  profile: PageProfile,
): void {
  sheet.querySelector(".mn-front-number")?.remove();
  if (page.numberText === null) return;
  const number = sheet.ownerDocument.createElement("div");
  number.className = "mn-front-number";
  number.style.top = `${profile.geometry.pageNumberTopPt}pt`;
  number.textContent = page.numberText;
  sheet.prepend(number);
}

function placeBox(box: FieldBox, at: FrontField, profile: PageProfile): void {
  const { style } = box.element;
  style.left = `calc(${profile.geometry.marginLeftPt}pt + ${at.x * CELL_PX}px)`;
  style.top = `${screenPagePx(profile).top + at.y * UNIT_PX}px`;
  style.width = `${at.width * CELL_PX}px`;
  style.textAlign = at.align;
}

/** Draws the front pages in `scaffold.front` from the title page, and tells the scaffold the height they take. */
export function createFrontPages(options: {
  scaffold: PageScaffold;
  titlePage: TitlePageSource;
  profile: PageProfile;
  editable: boolean;
  keys: FieldKeys;
  /** The element the page scrolls in. */
  scroller(): HTMLElement;
}): FrontPages {
  const { scaffold, editable, keys } = options;
  const { port, words } = options.titlePage;
  const doc = scaffold.front.ownerDocument;
  const style = doc.createElement("style");
  style.textContent = FRONT_CSS;
  const boxes = new Map<TitlePageField, FieldBox>();
  let profile = options.profile;
  const sheets: HTMLElement[] = [];
  let labels: string[] = [];

  const boxOf = (field: TitlePageField): FieldBox => {
    const kept = boxes.get(field);
    if (kept !== undefined) return kept;
    const box = createFieldBox({
      doc,
      field,
      word: words[field],
      editable,
      write: (text) => port.set(field, text),
      keys,
    });
    boxes.set(field, box);
    return box;
  };
  const sheetAt = (k: number): HTMLElement => {
    while (sheets.length <= k) {
      const sheet = doc.createElement("div");
      sheet.className = "mn-front-sheet";
      scaffold.front.append(sheet);
      sheets.push(sheet);
    }
    return sheets[k]!;
  };
  // sheets and boxes are kept and only moved when they must be, so the box being typed in keeps its focus and caret;
  // returns the height they take
  const layOut = (): number => {
    const fields = port.get();
    const pages = layoutFrontPages(fields, profile, { printed: false });
    const placed = new Set<TitlePageField>();
    let top = 0;
    pages.forEach((page, k) => {
      const sheet = sheetAt(k);
      const height = sheetHeight(page, profile);
      sheet.style.top = `${top}px`;
      sheet.style.height = `${height}px`;
      top += height + PAGE_GAP_PX;
      drawNumber(sheet, page, profile);
      for (const at of page.fields) {
        const box = boxOf(at.field);
        placeBox(box, at, profile);
        box.show(fields[at.field]);
        if (box.element.parentElement !== sheet) sheet.append(box.element);
        placed.add(at.field);
      }
    });
    for (const sheet of sheets.splice(pages.length)) sheet.remove();
    labels = pages.map((page) => page.label);
    for (const [field, box] of boxes)
      if (!placed.has(field)) box.element.remove();
    return top;
  };
  // a view below the front pages keeps its place as they come, go or grow, as when they arrive under a script already
  // open at page 1
  const draw = (): void => {
    const scroller = options.scroller();
    const last = sheets.at(-1);
    const below =
      last === undefined ||
      last.getBoundingClientRect().bottom <=
        scroller.getBoundingClientRect().top;
    const before = scaffold.pages.getBoundingClientRect().top;
    scaffold.setFrontHeight(layOut());
    if (below)
      scroller.scrollTop += scaffold.pages.getBoundingClientRect().top - before;
  };

  scaffold.front.append(style);
  draw();
  const unsubscribe = port.subscribe(draw);
  return {
    setProfile(next) {
      profile = next;
      draw();
    },
    show() {
      sheets[0]?.scrollIntoView({ block: "start" });
      boxes.get("title")?.focus();
    },
    printed: () => layoutFrontPages(port.get(), profile, { printed: true }),
    labelAt(top) {
      if (top >= scaffold.pages.getBoundingClientRect().top) return null;
      // a gap belongs to the sheet above it
      const k = sheets.findIndex(
        (_sheet, i) =>
          i === sheets.length - 1 ||
          top < sheets[i + 1]!.getBoundingClientRect().top,
      );
      return labels[k] ?? null;
    },
    destroy() {
      unsubscribe();
      scaffold.front.replaceChildren();
      scaffold.setFrontHeight(0);
    },
  };
}
