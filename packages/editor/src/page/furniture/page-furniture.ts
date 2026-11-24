// What a page furniture entry is given for a sheet, and how it draws there.
import type { LineKind, PageProfile } from "@manent/pagination";
import type { HeaderSlot, HeaderSlots } from "@manent/settings";

export type DateFormat = "day_month_year" | "month_day_year" | "iso";

/** What a sheet shows of a revision: its colour, its header and an asterisk per marked line (`y` in units). */
export interface SheetRevision {
  rev: string;
  head: string;
  marks: readonly { y: number; text: string }[];
}

/**
 * One sheet as every entry is given it.
 */
export interface PageFurnitureInput {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageLabel: string | null;
  readonly profile: PageProfile;
  readonly title: string | null;
  readonly revision: SheetRevision | null;
  readonly watermark: string | null;
  readonly header: HeaderSlots | null;
  readonly footer: HeaderSlots | null;
  readonly dateFormat: DateFormat | null;
  readonly section: string | null;
  readonly revisionLabel: string | null;
  readonly day: string | null;
  readonly durationMs: number | null;
}

export interface PageFurnitureOptions {
  readonly title?: string | null;
  readonly watermark?: string | null;
  readonly header?: HeaderSlots | null;
  readonly footer?: HeaderSlots | null;
  readonly dateFormat?: DateFormat | null;
  readonly section?: string | null;
  readonly sections?: readonly (string | null)[];
  readonly revisionLabel?: string | null;
  readonly day?: string | null;
  readonly durationMs?: number | null;
}

export interface PageFurniture {
  /** The kinds of the engine's furniture lines this entry draws in their place. */
  readonly replaces: readonly LineKind[];
  /** Draws on `sheet`, which holds no furniture when it is called: furniture is its `data-` attributes and its children. */
  draw(sheet: HTMLElement, input: PageFurnitureInput): void;
}

const isSameRevision = (
  a: SheetRevision | null,
  b: SheetRevision | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.rev === b.rev &&
    a.head === b.head &&
    a.marks.length === b.marks.length &&
    a.marks.every(
      (m, i) => m.y === b.marks[i]!.y && m.text === b.marks[i]!.text,
    ));

const isSameSlot = (a: HeaderSlot, b: HeaderSlot): boolean => {
  if (a.kind !== b.kind) return false;
  return a.kind === "custom" && b.kind === "custom" ? a.text === b.text : true;
};

const isSameSlots = (a: HeaderSlots | null, b: HeaderSlots | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.firstPage === b.firstPage &&
    a.rule === b.rule &&
    isSameSlot(a.left, b.left) &&
    isSameSlot(a.center, b.center) &&
    isSameSlot(a.right, b.right));

export const isSameFurniture = (
  a: PageFurnitureInput | undefined,
  b: PageFurnitureInput,
): boolean =>
  a !== undefined &&
  a.pageIndex === b.pageIndex &&
  a.pageCount === b.pageCount &&
  a.pageLabel === b.pageLabel &&
  a.profile === b.profile &&
  a.title === b.title &&
  a.watermark === b.watermark &&
  isSameSlots(a.header, b.header) &&
  isSameSlots(a.footer, b.footer) &&
  a.dateFormat === b.dateFormat &&
  a.section === b.section &&
  a.revisionLabel === b.revisionLabel &&
  a.day === b.day &&
  a.durationMs === b.durationMs &&
  isSameRevision(a.revision, b.revision);

/** Marks `pages` so every engine furniture kind named in `entries`'s `replaces` is hidden without moving any body line. */
export function applyFurnitureReplaces(
  pages: HTMLElement,
  entries: readonly PageFurniture[],
): void {
  const replaced = new Set(entries.flatMap((entry) => entry.replaces));
  for (const name of Array.from(pages.attributes, (attr) => attr.name))
    if (name.startsWith("data-hide-")) pages.removeAttribute(name);
  for (const kind of replaced) pages.setAttribute(`data-hide-${kind}`, "1");
}
