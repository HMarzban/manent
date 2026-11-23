// What a page furniture entry is given for a sheet, and how it draws there.
import type { LineKind, PageProfile } from "@manent/pagination";

/** What a sheet shows of a revision: its colour, its header and an asterisk per marked line (`y` in units). */
export interface SheetRevision {
  rev: string;
  head: string;
  marks: readonly { y: number; text: string }[];
}

/**
 * One sheet as every entry is given it. A null field is one the page does not supply yet; `header`, `footer` and
 * `dateFormat` are the resolved settings, which no setting carries yet, so they are always null.
 */
export interface PageFurnitureInput {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageLabel: string | null;
  readonly profile: PageProfile;
  readonly title: string | null;
  readonly revision: SheetRevision | null;
  readonly watermark: string | null;
  readonly header: unknown;
  readonly footer: unknown;
  readonly dateFormat: unknown;
  readonly section: string | null;
  readonly revisionLabel: string | null;
  readonly day: string | null;
}

export interface PageFurniture {
  /** The kinds of the engine's furniture lines this entry draws in their place. */
  readonly replaces: readonly LineKind[];
  /** Draws on `sheet`, which holds no furniture when it is called: furniture is its `data-` attributes and its children. */
  draw(sheet: HTMLElement, input: PageFurnitureInput): void;
}
