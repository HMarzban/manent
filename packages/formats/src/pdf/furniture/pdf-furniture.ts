// What a PDF furniture entry is given for a page, and what it draws there.
import type { LineKind, PageProfile, PositionedLine } from "@manent/pagination";

/** A revision's furniture for a page, as `PdfOptions.decor` gives it. Each tint channel is 0–255. */
export interface PdfRevision {
  readonly header: string;
  readonly marks: readonly { y: number; text: string }[];
  readonly tint: readonly [number, number, number] | null;
}

/**
 * One page as every entry is given it. `pageIndex` counts the document's pages, front pages left out. A null field
 * is one this build does not supply yet; `header`, `footer` and `dateFormat` are the resolved settings, which no
 * setting carries yet, so they are always null.
 */
export interface PdfFurnitureInput {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageLabel: string;
  readonly profile: PageProfile;
  readonly title: string | null;
  readonly revision: PdfRevision | null;
  readonly watermark: string | null;
  readonly header: unknown;
  readonly footer: unknown;
  readonly dateFormat: unknown;
  readonly section: string | null;
  readonly revisionLabel: string | null;
  readonly day: string | null;
}

/** A line placed as the engine places its lines: cells from the text edge, units from the top of the text area. */
export type FurnitureLine = Pick<PositionedLine, "x" | "y" | "runs">;

/** What an entry draws on one page: a paper colour filled under the text (null: none), and lines over it. */
export interface PdfFurnitureDrawing {
  readonly paper: readonly [number, number, number] | null;
  readonly lines: readonly FurnitureLine[];
}

export interface PdfFurniture {
  /** The kinds of the engine's furniture lines this entry draws in their place; those lines are left out. */
  readonly replaces: readonly LineKind[];
  draw(input: PdfFurnitureInput): PdfFurnitureDrawing;
}
