// Pure parsing, date-calendar math and live workspace-index airDate lookup/sync for Details → Rundown.
import type { JsonMapView } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { formatDate, formatDay } from "@manent/ui";
import { useCallback, useEffect, useRef } from "react";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";
import { liveMap } from "../services/sync/private-index.ts";

export const MS_PER_MINUTE = 60_000;
export const MAX_WINDOW_MINUTES = 240;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_HM = /^(\d{1,2}):(\d{2})$/;
const WHOLE_INT = /^\d+$/;
const CALENDAR_CELLS = 42;

export interface IsoDateParts {
  readonly year: number;
  /** 1-based calendar month (1..12). */
  readonly month: number;
  readonly day: number;
}

export interface CalendarCell {
  readonly iso: string;
  readonly day: number;
  readonly inMonth: boolean;
}

const twoDigits = (n: number): string => String(n).padStart(2, "0");

/** Parses a local calendar date `YYYY-MM-DD`; returns null unless it names a real calendar day. */
export function parseIsoDate(iso: string): IsoDateParts | null {
  const match = ISO_DATE.exec(iso.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day, 12, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  )
    return null;
  return { year, month, day };
}

/** Formats a local calendar date (`month` 1..12) as `YYYY-MM-DD`. */
export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${twoDigits(month)}-${twoDigits(day)}`;
}

/** Local `YYYY-MM-DD` for an epoch millisecond instant. */
export function isoDateOfInstant(at: number): string {
  const date = new Date(at);
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Parses a 24-hour time `HH:MM` (00:00..23:59); returns null for any other string. */
export function parseAirTime(
  raw: string,
): { readonly hours: number; readonly minutes: number } | null {
  const match = CLOCK_HM.exec(raw.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** Builds a local epoch millisecond instant for `hours:minutes` on `airDate`; null when `airDate` is invalid. */
export function airAtOnDate(
  airDate: string,
  hours: number,
  minutes: number,
): number | null {
  const parts = parseIsoDate(airDate);
  if (parts === null) return null;
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    hours,
    minutes,
    0,
    0,
  ).getTime();
}

/** Moves an existing local `airAt` instant onto `nextAirDate`, keeping its local hours and minutes. */
export function moveAirAtToDate(
  airAt: number,
  nextAirDate: string,
): number | null {
  const current = new Date(airAt);
  return airAtOnDate(nextAirDate, current.getHours(), current.getMinutes());
}

/** Parses an integer air-window lead in minutes (0..240); returns null for anything else. */
export function parseWindowMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!WHOLE_INT.test(trimmed)) return null;
  const minutes = Number(trimmed);
  if (!Number.isSafeInteger(minutes) || minutes > MAX_WINDOW_MINUTES)
    return null;
  return minutes;
}

/** Adds `deltaMonths` to a 1-based `{ year, month }` pair. */
export function shiftMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { readonly year: number; readonly month: number } {
  const shifted = new Date(year, month - 1 + deltaMonths, 1, 12, 0, 0);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

/** Formats a 1-based `{ year, month }` as `"Nov 2026"` using `@manent/ui`'s month table. */
export function formatMonthYear(year: number, month: number): string {
  const dayAndMonth = formatDate(
    new Date(year, month - 1, 1, 12, 0, 0).getTime(),
  );
  const monthName = dayAndMonth.split(" ")[1] ?? "";
  return `${monthName} ${year}`;
}

/** Short weekday labels Monday through Sunday, from `@manent/ui`'s day table. */
export function weekdayHeaders(): readonly string[] {
  // 2026-11-16 is a Monday
  return Array.from({ length: 7 }, (_, offset) =>
    formatDay(new Date(2026, 10, 16 + offset, 12, 0, 0).getTime()),
  );
}

/** Six Monday-start calendar rows (42 days) covering the 1-based `{ year, month }`. */
export function monthCalendarDays(
  year: number,
  month: number,
): readonly CalendarCell[] {
  const first = new Date(year, month - 1, 1, 12, 0, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  for (let index = 0; index < CALENDAR_CELLS; index += 1) {
    const cellDate = new Date(
      year,
      month - 1,
      1 - mondayOffset + index,
      12,
      0,
      0,
    );
    const cellYear = cellDate.getFullYear();
    const cellMonth = cellDate.getMonth() + 1;
    const cellDay = cellDate.getDate();
    cells.push({
      iso: toIsoDate(cellYear, cellMonth, cellDay),
      day: cellDay,
      inMonth: cellYear === year && cellMonth === month,
    });
  }
  return cells;
}

interface WorkspaceBinding {
  readonly handle: DocHandle;
  readonly projects: JsonMapView;
  readonly documents: JsonMapView;
}

async function openRundownWorkspace(
  services: PersonServices,
  docId: string,
): Promise<WorkspaceBinding | null> {
  const me = await services.api.me();
  const listed = me.ok ? me.me.workspaces.map((ws) => ws.id) : [];
  for (const workspaceId of new Set([...listed, services.userId])) {
    const handle = await services
      .openHandle(indexDocId("workspace", workspaceId))
      .catch(() => null);
    if (handle === null) continue;
    const projects = liveMap(handle, "projects");
    const documents = liveMap(handle, "documents");
    const index = readWorkspace({ projects, documents });
    if (index.documents.has(docId)) return { handle, projects, documents };
    await handle.close();
  }
  return null;
}

export interface ProjectRundownIndex {
  isDateTaken(nextAirDate: string): boolean;
  writeIndexAirDate(nextAirDate: string): void;
}

/**
 * Keeps the workspace index holding `docId` open while Details → Rundown is mounted so date uniqueness checks and
 * `airDate` index updates run synchronously without editing `library-index.ts`.
 */
export function useProjectRundownIndex(docId: string): ProjectRundownIndex {
  const services = useServices();
  const bindingRef = useRef<WorkspaceBinding | null>(null);

  useEffect(() => {
    let live = true;
    let opened: WorkspaceBinding | null = null;
    void openRundownWorkspace(services, docId).then((found) => {
      if (!live) {
        if (found !== null) void found.handle.close();
        return;
      }
      opened = found;
      bindingRef.current = found;
    });
    return () => {
      live = false;
      bindingRef.current = null;
      if (opened !== null) void opened.handle.close();
    };
  }, [services, docId]);

  const isDateTaken = useCallback(
    (nextAirDate: string): boolean => {
      const binding = bindingRef.current;
      if (binding === null) return false;
      const index = readWorkspace({
        projects: binding.projects,
        documents: binding.documents,
      });
      const current = index.documents.get(docId);
      if (current === undefined) return false;
      for (const [otherId, entry] of index.documents) {
        if (
          otherId !== docId &&
          entry.projectId === current.projectId &&
          entry.kind === "rundown" &&
          entry.trashedAt === null &&
          entry.airDate === nextAirDate
        )
          return true;
      }
      return false;
    },
    [docId],
  );

  const writeIndexAirDate = useCallback(
    (nextAirDate: string): void => {
      const binding = bindingRef.current;
      if (binding === null) return;
      const index = readWorkspace({
        projects: binding.projects,
        documents: binding.documents,
      });
      const current = index.documents.get(docId);
      if (current === undefined || current.airDate === nextAirDate) return;
      binding.documents.set(docId, { ...current, airDate: nextAirDate });
    },
    [docId],
  );

  return { isDateTaken, writeIndexAirDate };
}
