// What a document's row in the Library says on its second line; a feature adds its line with one line.

export interface DocumentRowLine {
  readonly id: string;
  /** A hook: the line for `docId`, or null when the source has nothing to say of it. */
  useLine(docId: string): string | null;
}

/** The first line that is not null takes the place of the row's project and kind. */
export const DOCUMENT_ROW_LINES: readonly DocumentRowLine[] = [];
