// The pages before page 1: the title page, and the cast of characters, setting and summary pages after it.
import type { Alignment, TitlePageField } from "@manent/schema";
import type { PositionedLine } from "./positioned-lines.ts";

/** Where a field's text sits on a front page: the box the editor edits it in. */
export interface FrontField {
  readonly field: TitlePageField;
  /** Cells from the text edge. */
  readonly x: number;
  /** Units from the top of the text area. */
  readonly y: number;
  /** Cells. */
  readonly width: number;
  readonly align: Alignment;
  /** The rows its text takes on this page; 1 for an empty field the editor shows. */
  readonly lines: number;
}

export interface FrontPage {
  /** Its roman numeral, from "i". */
  readonly label: string;
  /** Null on the title page. */
  readonly numberText: string | null;
  /** Each field's text as `text` lines with no block, and the page number. */
  readonly lines: readonly PositionedLine[];
  readonly fields: readonly FrontField[];
  /** True on blank verso parity-pad front pages before Arabic Page 1. */
  readonly blank?: true;
}

/**
 * printed: true for print and PDF, where a field holding nothing takes no room and a page with nothing on it is
 * left out; false for the editor, which shows every page with each field at least one row high.
 */
export interface FrontPageOptions {
  readonly printed: boolean;
}
