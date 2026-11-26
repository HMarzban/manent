// Personal rundown column visibility and widths stored in the private index (`rundown_columns`), and the Columns menu.
import type { JsonMapView } from "@manent/crdt";
import type { RundownColumnId } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  RUNDOWN_WORDS,
} from "@manent/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { liveMap } from "../services/sync/private-index.ts";
import { registerColumnsAction } from "./handlers.ts";

export const COLUMN_MIN_WIDTH_PX = 48;
export const COLUMN_MAX_WIDTH_PX = 480;

export interface RundownColumnPrefs {
  readonly hidden: readonly string[];
  readonly widthsPx: Readonly<Record<string, number>>;
}

export const EMPTY_COLUMN_PREFS: RundownColumnPrefs = Object.freeze({
  hidden: Object.freeze([]),
  widthsPx: Object.freeze({}),
});

/** Default widths in pixels matching the rundown grid layout before any personal resize. */
export const DEFAULT_COLUMN_WIDTHS_PX: Readonly<
  Record<RundownColumnId, number>
> = Object.freeze({
  number: 48,
  segment: 260,
  story: 228,
  writer: 128,
  presenter: 120,
  type: 88,
  dur: 68,
  cume: 68,
  start: 82,
  back: 82,
  prompter: 228,
});

export function clampColumnWidthPx(widthPx: number): number {
  return Math.min(
    COLUMN_MAX_WIDTH_PX,
    Math.max(COLUMN_MIN_WIDTH_PX, Math.round(widthPx)),
  );
}

/** Validates a raw JSON entry from the private index's `rundown_columns` map into safe column preferences. */
export function parseColumnPrefs(raw: unknown): RundownColumnPrefs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return EMPTY_COLUMN_PREFS;
  const rawHidden = Reflect.get(raw, "hidden");
  const hidden: string[] = [];
  if (Array.isArray(rawHidden)) {
    for (const entry of rawHidden)
      if (typeof entry === "string" && !hidden.includes(entry))
        hidden.push(entry);
  }
  const rawWidths = Reflect.get(raw, "widthsPx");
  const widthsPx: Record<string, number> = {};
  if (
    typeof rawWidths === "object" &&
    rawWidths !== null &&
    !Array.isArray(rawWidths)
  ) {
    for (const [key, value] of Object.entries(rawWidths)) {
      if (typeof value === "number" && Number.isFinite(value))
        widthsPx[key] = clampColumnWidthPx(value);
    }
  }
  return { hidden, widthsPx };
}

/** Accessible label for a column in the Columns menu and resize handles (`Row number` for `#`). */
export function columnMenuLabel(columnId: RundownColumnId): string {
  return columnId === "number"
    ? RUNDOWN_WORDS.rowNumber
    : RUNDOWN_WORDS.columns[columnId];
}

export interface RundownColumnsState {
  readonly prefs: RundownColumnPrefs;
  toggleColumn(columnId: RundownColumnId): void;
  resizeColumn(columnId: RundownColumnId, widthPx: number): void;
}

/**
 * Reads and persists personal column visibility and widths for `docId` under `rundown_columns` in the person's private
 * index, surviving reloads and syncing across devices.
 */
export function useRundownColumns(
  docId: string,
  allColumns: readonly RundownColumnId[],
): RundownColumnsState {
  const services = useServices();
  const [prefs, setPrefs] = useState<RundownColumnPrefs>(EMPTY_COLUMN_PREFS);
  const mapRef = useRef<JsonMapView | null>(null);
  const prefsRef = useRef<RundownColumnPrefs>(EMPTY_COLUMN_PREFS);
  prefsRef.current = prefs;

  useEffect(() => {
    let live = true;
    let stopMap = (): void => {};
    let handleToClose: { close(): Promise<void> } | null = null;
    mapRef.current = null;
    setPrefs(EMPTY_COLUMN_PREFS);

    void services
      .openHandle(indexDocId("user", services.userId))
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        handleToClose = handle;
        const map = liveMap(handle, "rundown_columns");
        mapRef.current = map;
        const sync = (): void => {
          if (!live) return;
          const next = parseColumnPrefs(map.get(docId));
          prefsRef.current = next;
          setPrefs(next);
        };
        stopMap = map.subscribe((keys) => {
          if (keys.includes(docId)) sync();
        });
        sync();
      })
      .catch(() => {
        // private index unavailable: keep in-memory preferences for this session
      });

    return () => {
      live = false;
      stopMap();
      mapRef.current = null;
      if (handleToClose !== null) void handleToClose.close();
    };
  }, [docId, services]);

  const write = useCallback(
    (next: RundownColumnPrefs): void => {
      prefsRef.current = next;
      setPrefs(next);
      mapRef.current?.set(docId, {
        hidden: [...next.hidden],
        widthsPx: { ...next.widthsPx },
      });
    },
    [docId],
  );

  const toggleColumn = useCallback(
    (columnId: RundownColumnId): void => {
      const current = prefsRef.current;
      const hidden = new Set(current.hidden);
      if (hidden.has(columnId)) {
        hidden.delete(columnId);
      } else {
        const visibleCount = allColumns.filter((id) => !hidden.has(id)).length;
        // never hide the last visible column
        if (visibleCount <= 1) return;
        hidden.add(columnId);
      }
      write({ hidden: [...hidden], widthsPx: current.widthsPx });
    },
    [allColumns, write],
  );

  const resizeColumn = useCallback(
    (columnId: RundownColumnId, widthPx: number): void => {
      const current = prefsRef.current;
      const clamped = clampColumnWidthPx(widthPx);
      if (current.widthsPx[columnId] === clamped) return;
      write({
        hidden: current.hidden,
        widthsPx: { ...current.widthsPx, [columnId]: clamped },
      });
    },
    [write],
  );

  return { prefs, toggleColumn, resizeColumn };
}

/**
 * Checkbox menu of this rundown's columns, headed "Yours, on this rundown" and opened by `rundown.columns`
 * (reusing the `view_menu` surface).
 */
export function RundownColumnsMenu(props: {
  readonly columns: readonly RundownColumnId[];
  readonly hidden: readonly string[];
  onToggle(columnId: RundownColumnId): void;
}): ReactNode {
  const { columns, hidden, onToggle } = props;
  const { dom } = useEnvironment();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return registerColumnsAction(() => {
      dom.rememberFocus();
      setOpen(true);
    });
  }, [dom]);

  const hiddenSet = new Set(hidden);
  const visibleCount = columns.filter((id) => !hiddenSet.has(id)).length;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) dom.restoreFocus();
      }}
    >
      <DropdownMenuTrigger
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none fixed end-4 bottom-8 size-0 opacity-0"
      />
      <DropdownMenuContent
        side="top"
        align="end"
        aria-label={RUNDOWN_WORDS.columnsHeading}
        className="min-w-menu-min max-w-menu-max"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="mn-group-label pt-1">
            {RUNDOWN_WORDS.columnsHeading}
          </DropdownMenuLabel>
          {columns.map((columnId) => {
            const checked = !hiddenSet.has(columnId);
            const locked = checked && visibleCount <= 1;
            return (
              <DropdownMenuCheckboxItem
                key={columnId}
                checked={checked}
                disabled={locked}
                closeOnClick={false}
                className={locked ? "cursor-not-allowed" : "cursor-pointer"}
                onCheckedChange={() => onToggle(columnId)}
              >
                {columnMenuLabel(columnId)}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
