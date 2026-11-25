// Words of the Send screen for a rundown: file types, What rows and columns, Checks, buttons and messages.
import { formatCount, joinNames } from "./format.ts";

/** A story row missing on this device: numbered by its row number, or unnumbered by its title. */
export type MissingStoryRow =
  | { readonly kind: "numbered"; readonly number: number }
  | { readonly kind: "unnumbered"; readonly title: string };

const FILE_TYPE_LABELS = Object.freeze({
  rundown_pdf: "Rundown PDF",
  rundown_scripts: "All scripts as one PDF",
  variety_two_column: "Two-column PDF",
  prompter_text: "Prompter text",
  brackets_list: "Brackets list",
  rundown_json: "Rundown JSON",
});

function missingOnDevice(entries: readonly MissingStoryRow[]): string {
  const [only] = entries;
  if (only === undefined) return "";
  if (entries.length === 1) {
    const subject =
      only.kind === "numbered"
        ? `Row ${formatCount(only.number)}`
        : `'${only.title}'`;
    return `${subject} is not on this device and is left out of the files`;
  }
  const allNumbered = entries.every((entry) => entry.kind === "numbered");
  if (allNumbered) {
    const numbers = entries.map((entry) =>
      formatCount(entry.kind === "numbered" ? entry.number : 0),
    );
    return `Rows ${joinNames(numbers)} are not on this device and are left out of the files`;
  }
  const labels = entries.map((entry) =>
    entry.kind === "numbered"
      ? `Row ${formatCount(entry.number)}`
      : `'${entry.title}'`,
  );
  return `${joinNames(labels)} are not on this device and are left out of the files`;
}

export const RUNDOWN_SEND_WORDS = Object.freeze({
  /** The six rundown file types in As order. */
  types: FILE_TYPE_LABELS,
  /** Export screen title and button: "Export" at 0, "Export 1 file" at 1, "Export 3 files" at n. */
  exportTitle: (files: number): string =>
    files === 0
      ? "Export"
      : files === 1
        ? "Export 1 file"
        : `Export ${formatCount(files)} files`,
  /** Export button while busy. */
  exporting: (files: number): string =>
    files === 1
      ? "Exporting 1 file…"
      : `Exporting ${formatCount(files)} files…`,
  /** Disabled reason clause when no file type is ticked under As (composed by SendFrame). */
  needsFileType: "needs a file type ticked under As",
  /** Print title and button while page count is not yet known. */
  print: "Print",
  /** Print title and button once page count is known. */
  printTitle: (pages: number): string =>
    pages === 1 ? "Print 1 page" : `Print ${formatCount(pages)} pages`,
  /** Print button while busy. */
  preparing: (pages: number): string =>
    pages === 1
      ? "Preparing 1 page…"
      : `Preparing ${formatCount(pages)} pages…`,
  /** Refusal line above Print button. */
  printFailed: (title: string): string =>
    `Couldn't prepare '${title}' to print. Try again.`,
  /** What row sub-labels. */
  rows: "Rows",
  columns: "Columns",
  /** What → Rows choices and accessible names for the range fields. */
  allRows: "All rows",
  rowsRange: (from: string, to: string): string => `Rows ${from} to ${to}`,
  firstRow: "First row",
  lastRow: "Last row",
  /** Validation lines under What → Rows. */
  rowOutOfRange: (raw: string, total: number): string =>
    `${raw} isn't a row of this rundown — it has rows 1 to ${formatCount(total)}.`,
  firstBeforeLast: "The first row must come before the last.",
  /** Helper line under What → Columns. */
  columnsApply: "Columns apply to the rundown PDF.",
  /** Checks sentence for one or more stories not on this device. */
  missingOnDevice,
  /** Refusal line above Export button. */
  exportFailed: (title: string): string =>
    `Couldn't export '${title}'. Try again.`,
  /** Brief status-bar message after Export finishes. */
  exported: (title: string): string => `Exported '${title}'.`,
});
