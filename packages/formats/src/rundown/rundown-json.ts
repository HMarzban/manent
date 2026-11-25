// The rundown JSON export: exact key order, two-space indent, trailing newline, every column included.
import type {
  RundownExportColumn,
  RundownExportRow,
  RundownForExport,
} from "./rundown-for-export.ts";

export interface RundownJsonOptions {
  /** Local air time formatted as `hh:mm`, or `null` when unset. */
  readonly airAt: string | null;
  /** Target duration formatted as `m:ss`, or `null` when unset. */
  readonly target: string | null;
}

function cellsForRow(
  row: RundownExportRow,
  columns: readonly RundownExportColumn[],
): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const col of columns) {
    if (row.kind === "header" && col.id === "number") {
      cells[col.id] = "";
      continue;
    }
    const given = row.cells[col.id];
    if (given !== undefined) {
      cells[col.id] = given;
      continue;
    }
    cells[col.id] =
      col.id === "number" && row.number !== null ? String(row.number) : "";
  }
  return cells;
}

/**
 * The rundown as UTF-8 JSON with version 1, ordered keys, two-space indent and one trailing
 * newline. Includes every column of `rundown.columns` and omits all internal row metadata.
 */
export function writeRundownJson(
  rundown: RundownForExport,
  options: RundownJsonOptions,
): string {
  const payload = {
    v: 1,
    rundown: {
      title: rundown.title,
      airDate: rundown.airDate,
      airAt: options.airAt,
      target: options.target,
    },
    columns: rundown.columns.map((col) => ({
      id: col.id,
      label: col.label,
    })),
    rows: rundown.rows.map((row) => ({
      number: row.kind === "header" ? null : row.number,
      kind: row.kind,
      cells: cellsForRow(row, rundown.columns),
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
