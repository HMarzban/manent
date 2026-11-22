// The front pages laid out on the body's grid: the title page's centred stack and its bottom block, then a page each
// for the cast of characters, the setting and the summary. Units are half-lines.
import type {
  Alignment,
  TitlePageField,
  TitlePageFields,
} from "@manent/schema";
import type {
  FrontField,
  FrontPage,
  FrontPageOptions,
} from "../../front-pages.ts";
import type { PageProfile } from "../../page-profile.ts";
import type { PositionedLine } from "../../positioned-lines.ts";
import { UNIT_PT, UNITS_PER_LINE } from "../../units.ts";
import { clusterCells } from "./cells.ts";
import { wrap } from "./wrap.ts";

const TITLE_STACK: readonly TitlePageField[] = Object.freeze([
  "title",
  "credit",
  "authors",
  "source",
]);
/** The pages after the title page, each holding one field. */
const FIELD_PAGES: readonly TitlePageField[] = Object.freeze([
  "cast",
  "setting",
  "summary",
]);
const ROMAN: readonly (readonly [number, string])[] = Object.freeze([
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
]);

/** A field placed `row` rows down a page that may run past its foot. */
interface Placed {
  readonly field: TitlePageField;
  readonly row: number;
  readonly x: number;
  readonly width: number;
  readonly align: Alignment;
  /** Each row's text. */
  readonly rows: readonly string[];
}

/** A page as laid out before it is cut to the page's length. */
type Sheet = readonly Placed[];

function romanOf(n: number): string {
  let rest = n;
  let text = "";
  for (const [value, numeral] of ROMAN)
    for (; rest >= value; rest -= value) text += numeral;
  return text;
}

// The field's text in rows of `width` cells, line breaks kept; none for an empty field in print, one in the editor.
function rowsOf(text: string, width: number, printed: boolean): string[] {
  if (text === "") return printed ? [] : [""];
  const starts = wrap(text, width);
  return [...starts].map((start, k) =>
    text.slice(start, starts[k + 1] ?? text.length).replace(/\s+$/, ""),
  );
}

function titleSheet(
  fields: TitlePageFields,
  profile: PageProfile,
  printed: boolean,
): Sheet {
  const { columnCells, linesPerPage } = profile;
  const placed: Placed[] = [];
  let row = Math.floor(linesPerPage / 3);
  for (const field of TITLE_STACK) {
    const rows = rowsOf(fields[field], columnCells, printed);
    if (rows.length === 0) continue;
    if (placed.length > 0) row += 1;
    placed.push({
      field,
      row,
      x: 0,
      width: columnCells,
      align: "center",
      rows,
    });
    row += rows.length;
  }
  const half = Math.floor(columnCells / 2);
  const contact = rowsOf(fields.contact, half, printed);
  const draft = rowsOf(fields.draft, columnCells - half, printed);
  const height = Math.max(contact.length, draft.length);
  const bottom = Math.max(
    linesPerPage - height,
    placed.length > 0 ? row + 1 : 0,
  );
  if (contact.length > 0)
    placed.push({
      field: "contact",
      row: bottom,
      x: 0,
      width: half,
      align: "left",
      rows: contact,
    });
  if (draft.length > 0)
    placed.push({
      field: "draft",
      row: bottom,
      x: half,
      width: columnCells - half,
      align: "right",
      rows: draft,
    });
  return placed;
}

function fieldSheet(
  field: TitlePageField,
  fields: TitlePageFields,
  profile: PageProfile,
  printed: boolean,
): Sheet {
  const rows = rowsOf(fields[field], profile.columnCells, printed);
  return rows.length === 0
    ? []
    : [
        {
          field,
          row: 0,
          x: 0,
          width: profile.columnCells,
          align: "left",
          rows,
        },
      ];
}

/** The sheets in order: the title page always, then a stage play's cast and setting, and any field page holding text. */
function sheetsOf(
  fields: TitlePageFields,
  profile: PageProfile,
  printed: boolean,
): Sheet[] {
  const stage = profile.format === "stage_play";
  const sheets = [titleSheet(fields, profile, printed)];
  for (const field of FIELD_PAGES) {
    const always = stage && field !== "summary";
    if (always || fields[field] !== "")
      sheets.push(fieldSheet(field, fields, profile, printed));
  }
  return printed ? sheets.filter((sheet) => sheet.length > 0) : sheets;
}

// A sheet in page-long pieces for print, or whole for the editor, which lets its sheet grow.
function cut(sheet: Sheet, linesPerPage: number, printed: boolean): Sheet[] {
  if (!printed) return [sheet];
  const pieces: Placed[][] = [];
  for (const placed of sheet)
    placed.rows.forEach((text, k) => {
      const row = placed.row + k;
      const page = Math.floor(row / linesPerPage);
      while (pieces.length <= page) pieces.push([]);
      const on = pieces[page]!;
      const last = on.at(-1);
      if (last?.field === placed.field)
        on[on.length - 1] = { ...last, rows: [...last.rows, text] };
      else on.push({ ...placed, row: row % linesPerPage, rows: [text] });
    });
  return pieces;
}

function textLine(placed: Placed, k: number): PositionedLine {
  const text = placed.rows[k]!;
  const cells = clusterCells(text, 0, text.length, false);
  const offset =
    placed.align === "left"
      ? 0
      : placed.align === "center"
        ? (placed.width - cells) / 2
        : placed.width - cells;
  return {
    kind: "text",
    x: placed.x + offset,
    y: (placed.row + k) * UNITS_PER_LINE + UNITS_PER_LINE - 1,
    cells,
    runs: [{ text, style: 0 }],
    blockId: null,
    blockLine: -1,
  };
}

function frontPage(
  sheet: Sheet,
  index: number,
  profile: PageProfile,
): FrontPage {
  const label = romanOf(index + 1);
  const numberText = index === 0 ? null : `${label}.`;
  const lines = sheet.flatMap((placed) =>
    placed.rows.flatMap((text, k) =>
      text === "" ? [] : [textLine(placed, k)],
    ),
  );
  if (numberText !== null) {
    const { geometry, columnCells } = profile;
    const cells = clusterCells(numberText, 0, numberText.length, false);
    lines.push({
      kind: "page_number",
      x: columnCells - cells,
      y: (geometry.pageNumberTopPt - geometry.marginTopPt) / UNIT_PT,
      cells,
      runs: [{ text: numberText, style: 0 }],
      blockId: null,
      blockLine: -1,
    });
  }
  const fields: FrontField[] = sheet.map((placed) => ({
    field: placed.field,
    x: placed.x,
    y: placed.row * UNITS_PER_LINE,
    width: placed.width,
    align: placed.align,
    lines: placed.rows.length,
  }));
  return {
    label,
    numberText,
    lines: lines.toSorted((a, b) => a.y - b.y || a.x - b.x),
    fields,
  };
}

/**
 * The pages before page 1, labelled i, ii, iii… over the pages laid out; the title page draws no number. They are
 * not pages of the pagination: the count, the labels and the locks of the body never include them. Every engine lays
 * them out alike, so they are not one of an engine's functions.
 */
export function layoutFrontPages(
  fields: TitlePageFields,
  profile: PageProfile,
  options: FrontPageOptions,
): FrontPage[] {
  const { printed } = options;
  return sheetsOf(fields, profile, printed)
    .flatMap((sheet) => cut(sheet, profile.linesPerPage, printed))
    .map((sheet, index) => frontPage(sheet, index, profile));
}
