// Words of the rundown grid, its columns, states, presence, previous value, messages, Details → Rundown and Library rows.
import { formatCount, joinNames } from "./format.ts";

/** Place of a restored cell: a numbered row, or a header row by its text. */
export type RestoredRowPlace =
  | { readonly kind: "row"; readonly number: number }
  | { readonly kind: "header"; readonly title: string };

const SHOW_COLUMN_LABELS = Object.freeze({
  number: "#",
  segment: "Segment",
  writer: "Writer",
  dur: "Dur",
  cume: "Cume",
  start: "Start",
  back: "Back",
  prompter: "Prompter",
});

const NEWS_COLUMN_LABELS = Object.freeze({
  number: "#",
  story: "Story",
  presenter: "Presenter",
  type: "Type",
  dur: "Dur",
  cume: "Cume",
  start: "Start",
  back: "Back",
  prompter: "Prompter",
});

const COLUMN_LABELS = Object.freeze({
  ...SHOW_COLUMN_LABELS,
  ...NEWS_COLUMN_LABELS,
});

function pastedRows(rows: number, scripts: number): string {
  const base = rows === 1 ? "Pasted 1 row" : `Pasted ${formatCount(rows)} rows`;
  if (scripts === 0) return `${base}.`;
  if (scripts === 1) return `${base}, with a new copy of its script.`;
  return `${base}, with new copies of ${formatCount(scripts)} scripts.`;
}

function splitIntoRows(title: string, rows: number, headers: number): string {
  const rowPart = rows === 1 ? "1 row" : `${formatCount(rows)} rows`;
  if (headers === 0) return `Split '${title}' into ${rowPart}.`;
  const headerPart =
    headers === 1 ? "1 header row" : `${formatCount(headers)} header rows`;
  return `Split '${title}' into ${rowPart} and ${headerPart}.`;
}

export const RUNDOWN_WORDS = Object.freeze({
  /** Column headers for a Show rundown, in sentence case (drawn uppercase micro by the grid). */
  showColumns: SHOW_COLUMN_LABELS,
  /** Column headers for a News rundown, in sentence case (drawn uppercase micro by the grid). */
  newsColumns: NEWS_COLUMN_LABELS,
  /** Every rundown column header keyed by column id. */
  columns: COLUMN_LABELS,
  /** Accessible name of the `#` header and its item in View ▾ → Columns. */
  rowNumber: "Row number",
  /** Heading of the View ▾ → Columns menu. */
  columnsHeading: "Yours, on this rundown",
  /** Quiet footer button opening the Columns menu. */
  columnsButton: "Columns",
  /** Menu item restoring default rundown column widths and visibility. */
  resetColumns: "Reset columns",
  /** Accessible name of a script row's Open beside button. */
  openBesideRow: (title: string): string => `Open '${title}' beside`,
  /** Footer total runtime label. */
  totalRuntime: (duration: string): string => `Total ${duration}`,
  /** Footer prompter tally for script rows. */
  prompterSentSummary: (sent: number, total: number): string =>
    `${formatCount(sent)} of ${formatCount(total)} on prompter`,
  /** Footer count of prompter rows changed since last send. */
  prompterChangedCount: (count: number): string =>
    `${formatCount(count)} changed`,
  /** Accessible label for a header row's section subtotal. */
  sectionTotal: (duration: string): string => `Section total ${duration}`,
  /** Accessible name for expanding a rundown's story rows in Library. */
  expandRundown: (date: string): string => `Show rows for ${date}`,
  /** Accessible name for collapsing a rundown's story rows in Library. */
  collapseRundown: (date: string): string => `Hide rows for ${date}`,
  /** Details → Rundown live broadcast timing summary heading (visual label, not h2). */
  timingSummary: "Timing",
  /** Details → Rundown total runtime row label. */
  totalLabel: "Total",
  /** Formats a signed over/under string (e.g. "-1:12" or "0:48") into "Under 1:12" / "Over 0:48". */
  overUnderText: (over: string): string =>
    over.startsWith("-") ? `Under ${over.slice(1)}` : `Over ${over}`,
  /** Details → Rundown air window range value. */
  airWindowRange: (start: string, end: string): string => `${start}–${end}`,
  /** Details → Rundown active air-window pill. */
  inAirWindow: "In air window",
  /** Date picker marker for a date that already has a rundown. */
  dateHasRundown: "Already has a rundown",
  /** Accessible name of the rundown grid. */
  gridLabel: (date: string): string => `Rundown for ${date}`,
  /** Accessible name of a column edge resize handle. */
  resizeColumn: (column: string): string => `Resize ${column} column`,
  /** Accessible value announced while resizing a column edge. */
  resizeValue: (px: number): string => `${formatCount(px)} px`,
  /** Accessible name of a row's handle; rows without a title use `rowFallback`. */
  rowHandle: (title: string): string => `${title} — row menu`,
  /** Fallback row label when a row has no title. */
  rowFallback: (n: number): string => `Row ${formatCount(n)}`,
  /** Polite announcement when a row is picked up for keyboard reordering. */
  pickedUp: (label: string): string =>
    `Picked up ${label}. Use the arrow keys to move it, Space to drop it and Esc to cancel.`,
  /** Polite announcement when a row moves after another row. */
  movedAfter: (label: string, after: string): string =>
    `Moved ${label} after ${after}.`,
  /** Polite announcement when a row moves to the top of the grid. */
  movedToTop: (label: string): string => `Moved ${label} to the top.`,
  /** Polite announcement when a keyboard row move is cancelled. */
  moveCancelled: (label: string): string => `${label} stays where it was.`,
  /** Placeholder inside an empty header row. */
  headerPlaceholder: "Header row — for example ACT TWO",
  /** Empty state of a rundown with no rows. */
  empty: "Add a row or drag a script here",
  /** Action button in the empty state. */
  addRow: "Add row",
  /** Loading state for a rundown not yet on this device. */
  opening: "Opening…",
  /** Shown in Dur, Cume, Start and Back for an offline story not on this device, and in Prompter for a row with no script. */
  dash: "—",
  /** Status second slot for read-only, Can view, and Can edit without edit rundowns. */
  viewOnly: "View only",
  /** Shown in Details → Rundown and briefly in the message slot when Can edit without edit rundowns types in a cell. */
  needsEditRundowns:
    "You can edit this rundown's scripts. Changing the rundown itself needs edit rundowns, under Can also.",
  /** Accessible label and tooltip of a live Dur cell timed from the story open on this device. */
  liveDuration: (duration: string): string =>
    `${duration}, timed live on this device`,
  /** Tooltip and description of a typed Dur cell overriding a story's computed duration. */
  typedOverScript: (scriptDuration: string): string =>
    `Typed over the script's ${scriptDuration}. Clear it to use the script's time.`,
  /** Inline validation line under a Dur cell for an unaccepted entry. */
  invalidDuration: (raw: string): string =>
    `${raw} isn't a duration — write minutes and two-digit seconds, as 2:07.`,
  /** Status bar readout for a numbered row; omits the title separator when the row has no title. */
  rowReadout: (n: number, total: number, title: string | null): string =>
    title !== null && title !== ""
      ? `Row ${formatCount(n)} of ${formatCount(total)} · ${title}`
      : `Row ${formatCount(n)} of ${formatCount(total)}`,
  /** Status bar readout when several rows are selected (always 2 or more). */
  rowsSelected: (count: number): string =>
    `${formatCount(count)} rows selected`,
  /** Title bar text: project title, separator, formatted air date. */
  titleBar: (project: string, date: string): string => `${project} · ${date}`,
  /** State bar left timing line (also used in exports). */
  timingLine: (air: string, target: string, over: string): string => {
    const delta = over.startsWith("-")
      ? `Under ${over.slice(1)}`
      : `Over ${over}`;
    return `Air ${air} · Target ${target} · ${delta}`;
  },
  /** State bar left air-window sentence. */
  airWindow: "In the air window — prompter text changes only when you send it.",
  /** Accessible name for cell-level presence initials. */
  editingCell: (names: readonly string[]): string =>
    names.length === 1
      ? `${names[0]} is editing this cell`
      : `${joinNames(names)} are editing this cell`,
  /** Accessible name for row-level story presence initials. */
  scriptOpen: (names: readonly string[]): string =>
    names.length === 1
      ? `${names[0]} has this script open`
      : `${joinNames(names)} have this script open`,
  /** Accessible description for a cell's recent-change corner mark. */
  changedAt: (name: string, time: string): string =>
    `${name} changed this at ${time}`,
  /** First line of the previous-value cell popover. */
  previousValue: (who: string, when: string): string =>
    `Previous value — ${who} ${when}`,
  /** Actor label in the previous-value popover for the person's own change. */
  you: "you",
  /** Action label in the previous-value popover. */
  restore: "Restore",
  /** Earlier value shown inside the previous-value popover. */
  wasValue: (value: string | null): string =>
    value === null || value === "" ? "Was empty" : `Was ${value}`,
  /** Message after deleting one or more rows. */
  deletedRows: (count: number): string =>
    count === 1 ? "Deleted 1 row." : `Deleted ${formatCount(count)} rows.`,
  /** Message after pasting one or more rows. */
  pastedRows,
  /** Message after dropping a Manent script onto the grid. */
  droppedScript: (title: string): string => `Added '${title}' as a row.`,
  /** Message after dropping an import file onto the grid. */
  droppedImport: (fileName: string): string =>
    `Imported '${fileName}' into a new row.`,
  /** Message after a drop that cannot become a rundown row. */
  cannotAddFile: (fileName: string): string =>
    `Couldn't add '${fileName}' to the rundown: only a Manent script, or a file Manent can import, can become a row.`,
  /** Message after dropping a script from another project onto the grid. */
  cannotAddOtherProject: (title: string, project: string): string =>
    `Couldn't add '${title}' to the rundown: a row's script must be in ${project}.`,
  /** Message after splitting a script into rows by slug or importing rows from a script. */
  splitIntoRows,
  /** Message after starting a script for a row. */
  startedScript: (title: string): string => `Started a script for '${title}'.`,
  /** Message after restoring a cell from the previous-value popover. */
  restoredCell: (
    column: string,
    place: RestoredRowPlace,
    value: string,
  ): string =>
    place.kind === "header"
      ? `Restored ${column} in '${place.title}' to ${value}.`
      : `Restored ${column} in row ${formatCount(place.number)} to ${value}.`,
  /** Message after leaving a row unnumbered. */
  rowUnnumbered: (title: string): string => `'${title}' has no number now.`,
  /** Message after numbering a previously unnumbered row. */
  rowNumbered: (title: string, n: number): string =>
    `'${title}' is row ${formatCount(n)} now.`,
  /** Brief undo messages for rundown operations. */
  undidAddRow: "Undid: Add row.",
  undidAddHeaderRow: "Undid: Add header row.",
  undidDelete: "Undid: Delete.",
  undidMoveRows: "Undid: Move rows.",
  undidPaste: "Undid: Paste.",
  undidSplitBySlug: "Undid: Split into rows by slug.",
  undidImportRows: "Undid: Import rows from script.",
  undidRestore: "Undid: Restore.",
  undidCellChange: (column: string, rowNumber: number): string =>
    `Undid: change to ${column} in row ${formatCount(rowNumber)}.`,
  /** Brief message after creating a new rundown or opening a new Show or News project. */
  newRundownFor: (date: string): string => `New rundown for ${date}.`,
  /** Scope heading in Details → Rundown. */
  rundownScope: "Rundown",
  /** Date field label in Details → Rundown. */
  dateLabel: "Date",
  /** Air field label and helper line in Details → Rundown. */
  airLabel: "Air",
  airHint: (date: string): string => `24-hour time on ${date}, as 23:35`,
  /** Target field label and helper line in Details → Rundown. */
  targetLabel: "Target",
  targetHint: "Minutes and seconds, as 42:00, or hours, as 1:02:07",
  /** Air window starts field label and unit in Details → Rundown. */
  airWindowStartsLabel: "Air window starts",
  airWindowUnit: "min before Air",
  airWindowStartsValue: (minutes: number): string =>
    `${formatCount(minutes)} min before Air`,
  /** Validation line under Air in Details → Rundown. */
  invalidAirTime: (raw: string): string =>
    `${raw} isn't a time — write it in 24 hours, as 23:35.`,
  /** Validation line under Target in Details → Rundown. */
  invalidTarget: (raw: string): string =>
    `${raw} isn't a length — write minutes and two-digit seconds, as 42:00, or hours, as 1:02:07.`,
  /** Validation line under Air window starts in Details → Rundown. */
  invalidAirWindow: (raw: string): string =>
    `${raw} isn't a number of minutes — write a whole number from 0 to 240.`,
  /** Validation lines under empty Air or Target in Details → Rundown. */
  airTimeRequired: "A rundown needs an air time.",
  targetRequired: "A rundown needs a target.",
  /** Validation line under Date when a rundown already exists on that date in this project. */
  dateAlreadyHasRundown: (date: string): string =>
    `${date} already has a rundown.`,
  /** Continue row second line for a rundown. */
  continueMeta: (date: string, air: string): string => `${date} · Air ${air}`,
  /** Library list column headings inside a Show or News project. */
  libraryDate: "Date",
  libraryAir: "Air",
  libraryRows: "Rows",
  libraryLastEdited: "Last edited",
  /** Row count label in a Show or News project's Library list. */
  rowCount: (count: number): string =>
    count === 1 ? "1 row" : `${formatCount(count)} rows`,
  /** Story row's trailing row label under its rundown in the Library. */
  storyRowLabel: (n: number): string => `Row ${formatCount(n)}`,
  /** Empty state inside a Show or News project with no rundown yet. */
  noRundownsYet: "No rundowns yet",
  newRundown: "New rundown",
  /** Shown in the document's place when opening a rundown with Can view or Can comment. */
  cannotOpenWithRole:
    "You can't open this rundown with Can view or Can comment yet. Present on prompter shows what was sent.",
  presentOnPrompter: "Present on prompter",
});
