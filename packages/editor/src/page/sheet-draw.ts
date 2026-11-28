// Sheet DOM placement and furniture diffing for the page scaffold.
import { isVersoPage } from "@manent/pagination";
import type { PageProfile } from "@manent/pagination";
import { isSameFurniture } from "./furniture/page-furniture.ts";
import type {
  PageFurniture,
  PageFurnitureInput,
  PageFurnitureOptions,
  SheetRevision,
} from "./furniture/page-furniture.ts";

/** What a sheet shows of a revision. `key` changes whenever any sheet would. */
export interface SheetDecor {
  readonly key: string;
  /** Null: the sheet shows nothing of a revision. */
  sheet(index: number): SheetRevision | null;
}

export interface SheetFrame {
  count: number;
  decor: SheetDecor | null;
  furniture: PageFurnitureOptions;
  labels: readonly string[];
  entries: readonly PageFurniture[];
}

export interface PlacedSheet {
  readonly index: number;
  readonly top: number;
  readonly height?: number;
}

function syncSide(
  sheet: HTMLElement,
  profile: PageProfile,
  index: number,
): void {
  if (profile.geometry.mirrored !== true) {
    delete sheet.dataset["side"];
    return;
  }
  const side = isVersoPage(index) ? "verso" : "recto";
  if (sheet.dataset["side"] !== side) sheet.dataset["side"] = side;
}

/** Places the sheet and redraws its furniture only when `input` differs from `drawn`. */
function drawSheet(
  sheet: HTMLElement,
  at: PlacedSheet,
  frame: SheetFrame,
  profile: PageProfile,
  drawn: WeakMap<HTMLElement, PageFurnitureInput>,
): void {
  const page = String(at.index);
  if (sheet.dataset["page"] !== page) sheet.dataset["page"] = page;
  syncSide(sheet, profile, at.index);
  const top = `${at.top}px`;
  if (sheet.style.top !== top) sheet.style.top = top;
  const height = at.height === undefined ? "" : `${at.height}px`;
  if (sheet.style.height !== height) sheet.style.height = height;
  const { furniture, labels } = frame;
  const input: PageFurnitureInput = {
    pageIndex: at.index,
    pageCount: frame.count,
    pageLabel: labels[at.index] ?? null,
    profile,
    title: furniture.title ?? null,
    revision: frame.decor?.sheet(at.index) ?? null,
    watermark: furniture.watermark ?? null,
    header: furniture.header ?? null,
    footer: furniture.footer ?? null,
    dateFormat: furniture.dateFormat ?? null,
    section: furniture.sections?.[at.index] ?? furniture.section ?? null,
    revisionLabel: furniture.revisionLabel ?? null,
    day: furniture.day ?? null,
    durationMs: furniture.durationMs ?? null,
  };
  if (isSameFurniture(drawn.get(sheet), input)) return;
  drawn.set(sheet, input);
  for (const key of Object.keys(sheet.dataset))
    if (key !== "page" && key !== "side") delete sheet.dataset[key];
  sheet.replaceChildren();
  for (const entry of frame.entries) entry.draw(sheet, input);
}

/** Draws the wanted sheets with the elements already drawn, adding or removing only the difference. */
export function drawSheets(
  pages: HTMLElement,
  sheets: HTMLElement[],
  wanted: readonly PlacedSheet[],
  frame: SheetFrame,
  profile: PageProfile,
  drawn: WeakMap<HTMLElement, PageFurnitureInput>,
): void {
  while (sheets.length > wanted.length) sheets.pop()?.remove();
  while (sheets.length < wanted.length) {
    const sheet = pages.ownerDocument.createElement("div");
    sheet.className = "mn-sheet";
    pages.prepend(sheet);
    sheets.push(sheet);
  }
  wanted.forEach((at, i) => drawSheet(sheets[i]!, at, frame, profile, drawn));
}
