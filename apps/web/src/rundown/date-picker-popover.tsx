// Month-calendar date picker popover for Details → Rundown, built on stock Popover and Button.
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RUNDOWN_WORDS,
  formatCount,
} from "@manent/ui";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  formatMonthYear,
  isoDateOfInstant,
  monthCalendarDays,
  parseIsoDate,
  shiftMonth,
  toIsoDate,
  weekdayHeaders,
} from "./details-rundown-fields.ts";
import { formatAirDate } from "./dur-format.ts";

const WEEKDAYS = Object.freeze(weekdayHeaders());

const DAY_OFFSETS: Readonly<Record<string, number>> = Object.freeze({
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
});

export interface DatePickerPopoverProps {
  readonly id: string;
  readonly value: string;
  readonly formattedValue: string;
  readonly label: string;
  readonly readOnly: boolean;
  readonly describedBy: string | undefined;
  readonly nowMs: number;
  readonly isDateTaken?: (isoDate: string) => boolean;
  readonly onSelect: (isoDate: string) => void;
}

function initialMonth(
  iso: string,
  nowMs: number,
): { readonly year: number; readonly month: number } {
  const parsed = parseIsoDate(iso) ?? parseIsoDate(isoDateOfInstant(nowMs));
  return parsed === null
    ? { year: 2026, month: 11 }
    : { year: parsed.year, month: parsed.month };
}

function addDays(iso: string, delta: number): string | null {
  const parts = parseIsoDate(iso);
  if (parts === null) return null;
  const shifted = new Date(
    parts.year,
    parts.month - 1,
    parts.day + delta,
    12,
    0,
    0,
  );
  return toIsoDate(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    shifted.getDate(),
  );
}

/** Bordered Date field trigger opening a transient month-calendar popover; read-only disables opening. */
export function DatePickerPopover(props: DatePickerPopoverProps): ReactNode {
  const {
    id,
    value,
    formattedValue,
    label,
    readOnly,
    describedBy,
    nowMs,
    isDateTaken,
    onSelect,
  } = props;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => initialMonth(value, nowMs));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const todayIso = isoDateOfInstant(nowMs);

  useEffect(() => {
    const targetIso = pendingFocusRef.current;
    if (!open || targetIso === null) return;
    pendingFocusRef.current = null;
    const nextButton = gridRef.current?.querySelector(
      `[data-date="${targetIso}"]`,
    ) as HTMLElement | null;
    nextButton?.focus();
  }, [open, view]);

  const cells = useMemo(
    () => monthCalendarDays(view.year, view.month),
    [view.year, view.month],
  );
  const weeks = useMemo(() => {
    const rows: (typeof cells)[number][][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);
  const prevMonth = shiftMonth(view.year, view.month, -1);
  const nextMonth = shiftMonth(view.year, view.month, 1);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (readOnly) {
      setOpen(false);
      return;
    }
    if (nextOpen) setView(initialMonth(value, nowMs));
    setOpen(nextOpen);
  };

  const focusDate = (targetIso: string): void => {
    const targetParts = parseIsoDate(targetIso);
    if (
      targetParts !== null &&
      (targetParts.year !== view.year || targetParts.month !== view.month)
    ) {
      pendingFocusRef.current = targetIso;
      setView({ year: targetParts.year, month: targetParts.month });
      return;
    }
    const nextButton = gridRef.current?.querySelector(
      `[data-date="${targetIso}"]`,
    ) as HTMLElement | null;
    nextButton?.focus();
  };

  const handleDayKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    iso: string,
    dayIndexInWeek: number,
  ): void => {
    const delta = DAY_OFFSETS[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const targetIso = addDays(iso, delta);
      if (targetIso !== null) focusDate(targetIso);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const targetIso = addDays(iso, -dayIndexInWeek);
      if (targetIso !== null) focusDate(targetIso);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const targetIso = addDays(iso, 6 - dayIndexInWeek);
      if (targetIso !== null) focusDate(targetIso);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const parts = parseIsoDate(iso);
      if (parts === null) return;
      const shifted = shiftMonth(
        parts.year,
        parts.month,
        event.key === "PageUp" ? -1 : 1,
      );
      const lastDay = new Date(shifted.year, shifted.month, 0).getDate();
      focusDate(
        toIsoDate(shifted.year, shifted.month, Math.min(parts.day, lastDay)),
      );
    }
  };

  const triggerButton = (
    <Button
      id={id}
      type="button"
      variant="outline"
      aria-describedby={describedBy}
      aria-disabled={readOnly ? true : undefined}
      className={
        readOnly
          ? "h-control w-full cursor-not-allowed justify-between text-ui font-normal opacity-50"
          : "h-control w-full cursor-pointer justify-between text-ui font-normal"
      }
    >
      <span className="truncate tabular-nums">{formattedValue}</span>
      <ChevronDownIcon
        aria-hidden="true"
        className="size-icon shrink-0 text-fg-muted"
      />
    </Button>
  );

  if (readOnly) return triggerButton;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={triggerButton} />
      <PopoverContent align="start" className="w-auto p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label={formatMonthYear(prevMonth.year, prevMonth.month)}
              onClick={() => setView(prevMonth)}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-icon" />
            </Button>
            <span
              aria-live="polite"
              aria-atomic="true"
              className="text-ui font-medium text-fg tabular-nums"
            >
              {formatMonthYear(view.year, view.month)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label={formatMonthYear(nextMonth.year, nextMonth.month)}
              onClick={() => setView(nextMonth)}
            >
              <ChevronRightIcon aria-hidden="true" className="size-icon" />
            </Button>
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={label}
            className="flex flex-col gap-1"
          >
            <div role="row" className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((dayName) => (
                <div
                  key={dayName}
                  role="columnheader"
                  className="flex h-control-sm items-center justify-center text-micro text-fg-muted"
                >
                  {dayName}
                </div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div
                key={week[0]?.iso ?? weekIndex}
                role="row"
                className="grid grid-cols-7 gap-1"
              >
                {week.map((cell, dayIndex) => {
                  const selected = cell.iso === value;
                  const isToday = cell.iso === todayIso;
                  const taken = !selected && (isDateTaken?.(cell.iso) ?? false);
                  const dayLabel = taken
                    ? `${formatAirDate(cell.iso, nowMs)} — ${RUNDOWN_WORDS.dateHasRundown}`
                    : formatAirDate(cell.iso, nowMs);
                  const dayClass = selected
                    ? "relative h-control-sm w-8 cursor-pointer rounded-control bg-selected text-ui font-medium text-fg tabular-nums ring-1 ring-focus"
                    : cell.inMonth
                      ? isToday
                        ? "relative h-control-sm w-8 cursor-pointer rounded-control text-ui font-semibold text-fg-accent tabular-nums transition-colors hover:bg-subtle active:bg-control"
                        : "relative h-control-sm w-8 cursor-pointer rounded-control text-ui text-fg tabular-nums transition-colors hover:bg-subtle active:bg-control"
                      : "relative h-control-sm w-8 cursor-pointer rounded-control text-ui text-fg-muted tabular-nums transition-colors hover:bg-subtle active:bg-control";
                  return (
                    <div
                      key={cell.iso}
                      role="gridcell"
                      className="flex justify-center"
                    >
                      <button
                        type="button"
                        data-date={cell.iso}
                        data-taken={taken ? "true" : undefined}
                        aria-label={dayLabel}
                        title={taken ? RUNDOWN_WORDS.dateHasRundown : undefined}
                        aria-pressed={selected}
                        aria-current={isToday ? "date" : undefined}
                        className={dayClass}
                        onClick={() => {
                          setOpen(false);
                          onSelect(cell.iso);
                        }}
                        onKeyDown={(event) =>
                          handleDayKeyDown(event, cell.iso, dayIndex)
                        }
                      >
                        {formatCount(cell.day)}
                        {taken ? (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-fg-muted"
                          />
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
