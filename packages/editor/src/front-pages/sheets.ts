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
import type { LayoutView } from "../page/config.ts";
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

// The sheet's page number, none on the title page; in Reflow view, the labelled rule every page starts with.
function drawNumber(
  sheet: HTMLElement,
  page: FrontPage,
  profile: PageProfile,
  view: LayoutView,
): void {
  sheet.querySelector(".mn-front-number, .pb-rule")?.remove();
  const number = sheet.ownerDocument.createElement("div");
  if (view === "reflow") {
    number.className = "pb pb-rule";
    number.dataset["label"] = page.label;
    number.setAttribute("aria-hidden", "true");
  } else if (page.numberText !== null) {
    number.className = "mn-front-number";
    number.style.top = `${profile.geometry.pageNumberTopPt}pt`;
    number.textContent = page.numberText;
  } else return;
  sheet.prepend(number);
}

// The box on its sheet's grid; in Reflow view it keeps only its alignment and wraps to the window.
function placeBox(
  box: FieldBox,
  at: FrontField,
  profile: PageProfile,
  view: LayoutView,
): void {
  const { style } = box.element;
  style.textAlign = at.align;
  if (view === "reflow") return;
  style.left = `calc(${profile.geometry.marginLeftPt}pt + ${at.x * CELL_PX}px)`;
  style.top = `${screenPagePx(profile).top + at.y * UNIT_PX}px`;
  style.width = `${at.width * CELL_PX}px`;
}

/** What the front pages are drawn from. */
export interface FrontPagesOptions {
  scaffold: PageScaffold;
  titlePage: TitlePageSource;
  profile: PageProfile;
  editable: boolean;
  view: LayoutView;
  keys: FieldKeys;
  /** The element the page scrolls in. */
  scroller(): HTMLElement;
}

/** The drawn sheets and boxes, and the profile and labels they were last laid out with. */
interface Drawn {
  readonly options: FrontPagesOptions;
  readonly sheets: HTMLElement[];
  readonly boxes: Map<TitlePageField, FieldBox>;
  profile: PageProfile;
  labels: string[];
}

function boxOf(drawn: Drawn, field: TitlePageField): FieldBox {
  const kept = drawn.boxes.get(field);
  if (kept !== undefined) return kept;
  const { scaffold, titlePage, editable, keys } = drawn.options;
  const box = createFieldBox({
    doc: scaffold.front.ownerDocument,
    field,
    word: titlePage.words[field],
    editable,
    write: (text) => titlePage.port.set(field, text),
    keys,
  });
  drawn.boxes.set(field, box);
  return box;
}

function sheetAt(drawn: Drawn, k: number): HTMLElement {
  const { front } = drawn.options.scaffold;
  while (drawn.sheets.length <= k) {
    const sheet = front.ownerDocument.createElement("div");
    sheet.className = "mn-front-sheet";
    front.append(sheet);
    drawn.sheets.push(sheet);
  }
  return drawn.sheets[k]!;
}

// Sheets and boxes are kept and only moved when they must be, so the box being typed in keeps its focus and caret;
// returns the height they take.
function layOut(drawn: Drawn): number {
  const { titlePage, view } = drawn.options;
  const { profile } = drawn;
  const fields = titlePage.port.get();
  const pages = layoutFrontPages(fields, profile, { printed: false });
  const placed = new Set<TitlePageField>();
  let top = 0;
  pages.forEach((page, k) => {
    const sheet = sheetAt(drawn, k);
    if (view === "page") {
      const height = sheetHeight(page, profile);
      sheet.style.top = `${top}px`;
      sheet.style.height = `${height}px`;
      top += height + PAGE_GAP_PX;
    }
    drawNumber(sheet, page, profile, view);
    for (const at of page.fields) {
      const box = boxOf(drawn, at.field);
      placeBox(box, at, profile, view);
      box.show(fields[at.field]);
      if (box.element.parentElement !== sheet) sheet.append(box.element);
      placed.add(at.field);
    }
  });
  for (const sheet of drawn.sheets.splice(pages.length)) sheet.remove();
  drawn.labels = pages.map((page) => page.label);
  for (const [field, box] of drawn.boxes)
    if (!placed.has(field)) box.element.remove();
  return top;
}

// A view below the front pages keeps its place as they come, go or grow, as when they arrive under a script already
// open at page 1; the room above page 1 then shows the gap, never the foot of the sheet before it.
function draw(drawn: Drawn): void {
  const { scaffold } = drawn.options;
  const scroller = drawn.options.scroller();
  const top = (): number => scroller.getBoundingClientRect().top;
  const last = drawn.sheets.at(-1);
  const below =
    last === undefined || last.getBoundingClientRect().bottom <= top();
  const before = scaffold.pages.getBoundingClientRect().top;
  scaffold.setFrontHeight(layOut(drawn));
  if (!below) return;
  scroller.scrollTop += scaffold.pages.getBoundingClientRect().top - before;
  const foot = drawn.sheets.at(-1)?.getBoundingClientRect().bottom;
  if (foot !== undefined && foot > top()) scroller.scrollTop += foot - top();
}

function labelAt(drawn: Drawn, top: number): string | null {
  const { sheets, labels } = drawn;
  if (top >= drawn.options.scaffold.pages.getBoundingClientRect().top)
    return null;
  // a gap belongs to the sheet above it
  const k = sheets.findIndex(
    (_sheet, i) =>
      i === sheets.length - 1 ||
      top < sheets[i + 1]!.getBoundingClientRect().top,
  );
  return labels[k] ?? null;
}

/** Draws the front pages in `scaffold.front` from the title page, and tells the scaffold the height they take. */
export function createFrontPages(options: FrontPagesOptions): FrontPages {
  const { scaffold, titlePage } = options;
  const drawn: Drawn = {
    options,
    sheets: [],
    boxes: new Map(),
    profile: options.profile,
    labels: [],
  };
  const style = scaffold.front.ownerDocument.createElement("style");
  style.textContent = FRONT_CSS;
  scaffold.front.append(style);
  draw(drawn);
  const unsubscribe = titlePage.port.subscribe(() => draw(drawn));
  return {
    setProfile(next) {
      drawn.profile = next;
      draw(drawn);
    },
    show() {
      drawn.sheets[0]?.scrollIntoView({ block: "start" });
      drawn.boxes.get("title")?.focus();
    },
    printed: () =>
      layoutFrontPages(titlePage.port.get(), drawn.profile, { printed: true }),
    labelAt: (top) => labelAt(drawn, top),
    destroy() {
      unsubscribe();
      scaffold.front.replaceChildren();
      scaffold.setFrontHeight(0);
    },
  };
}
