// Shared What controls and Checks row for RundownExport and RundownPrint.
import type { RundownColumnId } from "@manent/schema";
import {
  Input,
  RUNDOWN_SEND_WORDS,
  RUNDOWN_WORDS,
  Segmented,
} from "@manent/ui";
import type { MissingStoryRow } from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SendRow } from "../../screens/send/send-frame.tsx";
import { CheckMark } from "../../send/check-mark.tsx";
import { validateRowRange } from "./rundown-export-model.ts";
import type { RowRangeValidation } from "./rundown-export-model.ts";

export interface RundownWhatState {
  readonly rowMode: "all" | "range";
  readonly fromText: string;
  readonly toText: string;
  readonly rangeValidation: RowRangeValidation | null;
  readonly activeRange: { readonly from: number; readonly to: number } | null;
  readonly selectedColumns: readonly RundownColumnId[];
  setRowMode(mode: "all" | "range"): void;
  setFromText(value: string): void;
  setToText(value: string): void;
  toggleColumn(columnId: RundownColumnId): void;
}

/** Manages What → Rows and What → Columns state, seeding Columns from `View ▾ → Columns` until changed locally. */
export function useRundownWhatState(
  allColumns: readonly RundownColumnId[],
  defaultHiddenColumns: readonly string[],
  maxRowNumber: number,
): RundownWhatState {
  const [rowMode, setRowMode] = useState<"all" | "range">("all");
  const [fromText, setFromText] = useState("1");
  const [toText, setToText] = useState(() => String(Math.max(1, maxRowNumber)));
  const rangeTouchedRef = useRef(false);
  const [localColumns, setLocalColumns] = useState<
    readonly RundownColumnId[] | null
  >(null);

  useEffect(() => {
    if (!rangeTouchedRef.current && maxRowNumber > 0) {
      setToText(String(maxRowNumber));
    }
  }, [maxRowNumber]);

  const hiddenKey = defaultHiddenColumns.join(",");
  const defaultVisible = useMemo(() => {
    const hidden = new Set(hiddenKey === "" ? [] : hiddenKey.split(","));
    const visible = allColumns.filter((id) => !hidden.has(id));
    return visible.length > 0 ? visible : [...allColumns];
  }, [allColumns, hiddenKey]);

  const selectedColumns = useMemo(() => {
    if (localColumns === null) return defaultVisible;
    const kept = allColumns.filter((id) => localColumns.includes(id));
    return kept.length > 0 ? kept : defaultVisible;
  }, [allColumns, localColumns, defaultVisible]);

  const toggleColumn = useCallback(
    (columnId: RundownColumnId): void => {
      setLocalColumns((prev) => {
        const current = new Set(prev ?? defaultVisible);
        if (current.has(columnId)) {
          if (current.size <= 1) return [...current];
          current.delete(columnId);
        } else {
          current.add(columnId);
        }
        return allColumns.filter((id) => current.has(id));
      });
    },
    [allColumns, defaultVisible],
  );

  const rangeValidation =
    rowMode === "range"
      ? validateRowRange(fromText, toText, maxRowNumber)
      : null;

  const activeRange =
    rowMode === "all"
      ? null
      : rangeValidation !== null && rangeValidation.ok
        ? { from: rangeValidation.from, to: rangeValidation.to }
        : null;

  return {
    rowMode,
    fromText,
    toText,
    rangeValidation,
    activeRange,
    selectedColumns,
    setRowMode,
    setFromText: (value: string) => {
      rangeTouchedRef.current = true;
      setFromText(value);
    },
    setToText: (value: string) => {
      rangeTouchedRef.current = true;
      setToText(value);
    },
    toggleColumn,
  };
}

/** One accessible checkbox control with pointer cursor and subtle hover state. */
export function CheckOption(props: {
  readonly label: string;
  readonly accessibleLabel?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  onChange(checked: boolean): void;
}): ReactNode {
  const id = useId();
  const { label, accessibleLabel, checked, disabled = false, onChange } = props;
  return (
    <label
      htmlFor={id}
      className={
        disabled
          ? "inline-flex cursor-not-allowed items-center gap-2 rounded-control px-1 py-0.5 text-ui text-fg-muted"
          : "inline-flex cursor-pointer items-center gap-2 rounded-control px-1 py-0.5 text-ui text-fg hover:bg-subtle"
      }
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={accessibleLabel}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className={
          disabled
            ? "size-4 shrink-0 cursor-not-allowed rounded-micro accent-accent-solid"
            : "size-4 shrink-0 cursor-pointer rounded-micro accent-accent-solid"
        }
      />
      <span>{label}</span>
    </label>
  );
}

/** What row body: Rows (`All rows` or `Rows {from} to {to}`) and Columns (checkboxes per column). */
export function RundownWhatContent(props: {
  readonly state: RundownWhatState;
  readonly allColumns: readonly RundownColumnId[];
  readonly maxRowNumber: number;
}): ReactNode {
  const { state, allColumns, maxRowNumber } = props;
  const problemMessage =
    state.rangeValidation !== null &&
    !state.rangeValidation.ok &&
    state.rangeValidation.message !== ""
      ? state.rangeValidation.message
      : null;
  const rangeValid =
    state.rowMode === "all"
      ? validateRowRange(state.fromText, state.toText, maxRowNumber).ok
      : true;
  const shownFrom = rangeValid ? state.fromText.trim() || "1" : "1";
  const shownTo = rangeValid
    ? state.toText.trim() || String(Math.max(1, maxRowNumber))
    : String(Math.max(1, maxRowNumber));
  const selectedSet = new Set(state.selectedColumns);

  return (
    <div className="flex flex-col gap-4" data-tour="send:what">
      <div className="flex flex-col gap-2">
        <span className="text-ui font-medium text-fg">
          {RUNDOWN_SEND_WORDS.rows}
        </span>
        <Segmented
          label={RUNDOWN_SEND_WORDS.rows}
          value={state.rowMode}
          options={
            maxRowNumber > 0
              ? [
                  { value: "all", label: RUNDOWN_SEND_WORDS.allRows },
                  {
                    value: "range",
                    label: RUNDOWN_SEND_WORDS.rowsRange(shownFrom, shownTo),
                  },
                ]
              : [{ value: "all", label: RUNDOWN_SEND_WORDS.allRows }]
          }
          onChange={(value) =>
            state.setRowMode(value === "range" ? "range" : "all")
          }
        />
        {state.rowMode === "range" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={1}
              max={Math.max(1, maxRowNumber)}
              aria-label={RUNDOWN_SEND_WORDS.firstRow}
              aria-invalid={problemMessage !== null ? true : undefined}
              value={state.fromText}
              onChange={(event) => state.setFromText(event.target.value)}
              className="w-20 tabular-nums"
            />
            <Input
              type="number"
              min={1}
              max={Math.max(1, maxRowNumber)}
              aria-label={RUNDOWN_SEND_WORDS.lastRow}
              aria-invalid={problemMessage !== null ? true : undefined}
              value={state.toText}
              onChange={(event) => state.setToText(event.target.value)}
              className="w-20 tabular-nums"
            />
          </div>
        ) : null}
        {problemMessage !== null ? (
          <p role="alert" className="flex items-start gap-2 text-meta text-fg">
            <TriangleExclamationPointIcon
              aria-hidden="true"
              className="mt-0.5 size-icon shrink-0 text-attention"
            />
            <span>{problemMessage}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-ui font-medium text-fg">
          {RUNDOWN_SEND_WORDS.columns}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {allColumns.map((columnId) => {
            const checked = selectedSet.has(columnId);
            const locked = checked && selectedSet.size <= 1;
            return (
              <CheckOption
                key={columnId}
                label={RUNDOWN_WORDS.columns[columnId]}
                accessibleLabel={
                  columnId === "number" ? RUNDOWN_WORDS.rowNumber : undefined
                }
                checked={checked}
                disabled={locked}
                onChange={() => state.toggleColumn(columnId)}
              />
            );
          })}
        </div>
        <p className="text-meta text-fg-muted">
          {RUNDOWN_SEND_WORDS.columnsApply}
        </p>
      </div>
    </div>
  );
}

/** Checks row for missing offline stories and characters outside the script font; null when both are clear. */
export function buildRundownChecksRow(
  missingRows: readonly MissingStoryRow[],
  outsideFont: string | null,
): SendRow | null {
  const sentences: string[] = [];
  if (missingRows.length > 0)
    sentences.push(RUNDOWN_SEND_WORDS.missingOnDevice(missingRows));
  if (outsideFont !== null) sentences.push(outsideFont);
  if (sentences.length === 0) return null;
  return {
    id: "checks",
    content: (
      <ul className="flex flex-col gap-2">
        {sentences.map((sentence) => (
          <li key={sentence} className="flex items-start gap-2">
            <CheckMark ok={false} />
            <span>{sentence}</span>
          </li>
        ))}
      </ul>
    ),
  };
}
