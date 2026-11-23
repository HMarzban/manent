import type {
  PrompterStateJSON,
  RowKind,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
} from "@manent/schema";
import type { CrdtDoc, Unsubscribe } from "../doc.ts";

export interface NewRow {
  id: string;
  kind: RowKind;
  docId: string | null;
  blockId: string | null;
}

export function initRundown(
  _doc: CrdtDoc,
  _fields: RundownFieldsJSON,
  _columns: readonly RundownColumnId[],
): void {}

export function insertRows(
  _doc: CrdtDoc,
  _rows: readonly NewRow[],
  _after: string | null,
): void {}

export function moveRows(
  _doc: CrdtDoc,
  _rowIds: readonly string[],
  _after: string | null,
): void {}

export function removeRows(_doc: CrdtDoc, _rowIds: readonly string[]): void {}

export function setCell(
  _doc: CrdtDoc,
  _rowId: string,
  _columnId: RundownColumnId,
  _value: string | number | null,
  _by: { userId: string; now: () => number },
): void {}

export function restoreCell(
  _doc: CrdtDoc,
  _rowId: string,
  _columnId: RundownColumnId,
  _by: { userId: string; now: () => number },
): void {}

export function setRundownFields(
  _doc: CrdtDoc,
  _fields: Partial<RundownFieldsJSON>,
): void {}

export function writeDurations(
  _doc: CrdtDoc,
  _durations: ReadonlyMap<string, number | null>,
): void {}

export function writePrompterState(
  _doc: CrdtDoc,
  _rowId: string,
  _state: PrompterStateJSON | null,
): void {}

export function readRundown(_doc: CrdtDoc): RundownJSON {
  return {
    rundown: {
      airDate: "",
      airAt: null,
      windowLeadMs: 3600000,
      targetMs: null,
    },
    columns: [],
    rows: [],
  };
}

export function observeRundown(
  _doc: CrdtDoc,
  _listener: (change: {
    rowIds: string[];
    fields: boolean;
    columns: boolean;
  }) => void,
): Unsubscribe {
  return () => {};
}
