import type { CrdtDoc } from "../doc.ts";
import type { Update } from "../updates.ts";

export interface RundownWrites {
  roots: ("rundown" | "columns" | "rows")[];
  rows: {
    rowId: string;
    keys: string[];
    cells: { columnId: string; value: unknown }[];
    removed: boolean;
  }[];
}

export function readRundownWrites(
  _doc: CrdtDoc,
  _update: Update,
): RundownWrites {
  return { roots: [], rows: [] };
}
