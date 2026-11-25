// What a PDF furniture entry is given for a page, and what it draws there.
import type { LineKind, PageProfile, PositionedLine } from "@manent/pagination";

/** A revision's furniture for a page, as `PdfOptions.decor` gives it. Each tint channel is 0–255. */
export interface PdfRevision {
  readonly header: string;
  readonly marks: readonly { y: number; text: string }[];
  readonly tint: readonly [number, number, number] | null;
}

/** A slot in a page's header or footer, matching `@manent/settings`'s HeaderSlot. */
export type PdfHeaderSlotKind =
  | "none"
  | "page_number"
  | "page_of_total"
  | "date"
  | "title"
  | "section"
  | "duration"
  | "revision_label";

export type PdfHeaderSlot =
  | { readonly kind: PdfHeaderSlotKind }
  | { readonly kind: "custom"; readonly text: string };

export interface PdfHeaderSlots {
  readonly left: PdfHeaderSlot;
  readonly center: PdfHeaderSlot;
  readonly right: PdfHeaderSlot;
  readonly firstPage: boolean;
  readonly rule: boolean;
}

export type PdfDateFormat = "day_month_year" | "month_day_year" | "iso";

/**
 * One page as every entry is given it. `pageIndex` counts the document's pages, front pages left out.
 */
export interface PdfFurnitureInput {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageLabel: string;
  readonly profile: PageProfile;
  readonly title: string | null;
  readonly revision: PdfRevision | null;
  readonly watermark: string | null;
  readonly header: PdfHeaderSlots | null;
  readonly footer: PdfHeaderSlots | null;
  readonly dateFormat: PdfDateFormat | null;
  readonly section: string | null;
  readonly revisionLabel: string | null;
  readonly day: string | null;
  readonly durationMs: number | null;
}

/** A line placed as the engine places its lines: cells from the text edge, units from the top of the text area. */
export type FurnitureLine = Pick<PositionedLine, "x" | "y" | "runs">;

/** A horizontal hairline rule on the grid: `x` in cells from the text edge, `y` in units from the text top, `cells` wide. */
export interface FurnitureRule {
  readonly x: number;
  readonly y: number;
  readonly cells: number;
}

/** What an entry draws on one page: a paper colour filled under the text (null: none), and lines and rules over it. */
export interface PdfFurnitureDrawing {
  readonly paper: readonly [number, number, number] | null;
  readonly lines: readonly FurnitureLine[];
  readonly rules?: readonly FurnitureRule[];
}

export interface PdfFurniture {
  /** The kinds of the engine's furniture lines this entry draws in their place; those lines are left out. */
  readonly replaces: readonly LineKind[];
  draw(input: PdfFurnitureInput): PdfFurnitureDrawing;
}
