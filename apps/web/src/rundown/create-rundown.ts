// Creating rundowns and starting Show and News projects on their first rundown.
import { initRundown, readRundown } from "@manent/crdt";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import type {
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
} from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { LIBRARY_WORDS, RUNDOWN_WORDS } from "@manent/ui";
import type {
  CreateResult,
  PersonServices,
  ProjectKind,
} from "../services/ports.ts";
import type { ProjectStart } from "../services/sync/create-script.ts";
import type { DocumentEntry } from "../services/sync/index-entries.ts";
import { formatAirDate, rowTitleOf } from "./dur-format.ts";

/** Project kinds whose Library view lists rundowns by date. */
export type RundownProjectKind = "show" | "news";

/** Default local air hour (19:00) when a project has no earlier rundown. */
export const DEFAULT_AIR_HOUR = 19;
/** Default local air minute (19:00) when a project has no earlier rundown. */
export const DEFAULT_AIR_MINUTE = 0;
/** Default rundown target length: 30:00 in milliseconds. */
export const DEFAULT_TARGET_MS = 30 * 60 * 1000;
/** Default air-window lead before air time: 60 minutes in milliseconds. */
export const DEFAULT_WINDOW_LEAD_MS = 60 * 60 * 1000;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minimal fields of an existing rundown used to plan the next one's defaults. */
export interface ExistingRundownSummary {
  readonly airDate: string;
  readonly airAt: number | null;
  readonly targetMs: number | null;
  readonly createdAt?: number;
}

/** A story nested under its rundown in the Library. */
export interface RundownStoryRow {
  readonly docId: string;
  readonly title: string;
  readonly rowNumber: number | null;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Formats `atMs` as a local calendar date `YYYY-MM-DD`. */
export function localIsoDate(atMs: number): string {
  const date = new Date(atMs);
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parses a valid local calendar date `YYYY-MM-DD`, returning null for malformed or impossible dates. */
export function parseIsoDate(airDate: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} | null {
  const match = ISO_DATE.exec(airDate.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(year, month - 1, day, 12, 0, 0);
  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  )
    return null;
  return { year, month, day };
}

/** Today's local date, or the first later calendar day not present in `takenDates`. */
export function nextFreeAirDate(
  takenDates: ReadonlySet<string>,
  nowMs: number,
): string {
  const start = new Date(nowMs);
  const year = start.getFullYear();
  const month = start.getMonth();
  const day = start.getDate();
  for (let offset = 0; ; offset += 1) {
    const candidate = localIsoDate(
      new Date(year, month, day + offset, 12, 0, 0).getTime(),
    );
    if (!takenDates.has(candidate)) return candidate;
  }
}

/** Local epoch milliseconds for `airDate` (`YYYY-MM-DD`) at `hours:minutes:00.000`. */
export function airAtForDate(
  airDate: string,
  hours: number,
  minutes: number,
): number {
  const parsed = parseIsoDate(airDate);
  if (parsed === null)
    throw new RangeError(`airDate must be YYYY-MM-DD, not "${airDate}"`);
  return new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    hours,
    minutes,
    0,
    0,
  ).getTime();
}

function compareLatestFirst(
  a: ExistingRundownSummary,
  b: ExistingRundownSummary,
): number {
  const aValid = parseIsoDate(a.airDate) !== null;
  const bValid = parseIsoDate(b.airDate) !== null;
  if (aValid && bValid && a.airDate !== b.airDate)
    return b.airDate.localeCompare(a.airDate);
  if (aValid !== bValid) return aValid ? -1 : 1;
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

/**
 * Computes the fields for a new rundown: `airDate` is today or the first later day with none;
 * Air time is the latest rundown's local time of day (19:00 when none); Target is that rundown's
 * (30:00 when none). Both `airAt` and `targetMs` are always filled.
 */
export function planNewRundown(options: {
  readonly existing: readonly ExistingRundownSummary[];
  readonly nowMs: number;
}): RundownFieldsJSON {
  const { existing, nowMs } = options;
  const takenDates = new Set(
    existing
      .map((item) => item.airDate.trim())
      .filter((date) => parseIsoDate(date) !== null),
  );
  const airDate = nextFreeAirDate(takenDates, nowMs);
  const sorted = existing.toSorted(compareLatestFirst);
  const withAir = sorted.find((item) => item.airAt !== null) ?? null;
  const withTarget = sorted.find((item) => item.targetMs !== null) ?? null;
  let hours = DEFAULT_AIR_HOUR;
  let minutes = DEFAULT_AIR_MINUTE;
  if (withAir !== null && withAir.airAt !== null) {
    const air = new Date(withAir.airAt);
    hours = air.getHours();
    minutes = air.getMinutes();
  }
  const targetMs = withTarget?.targetMs ?? DEFAULT_TARGET_MS;
  return {
    airDate,
    airAt: airAtForDate(airDate, hours, minutes),
    windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
    targetMs,
  };
}

/** The starting column set for a Show or News rundown. */
export function columnsForProjectKind(
  kind: RundownProjectKind,
): readonly RundownColumnId[] {
  return kind === "news" ? NEWS_COLUMNS : SHOW_COLUMNS;
}

/** Initialises an empty rundown handle with `fields` and its project kind's columns; idempotent when already initialised. */
export function startRundown(
  handle: DocHandle,
  kind: RundownProjectKind,
  fields: RundownFieldsJSON,
): void {
  const current = readRundown(handle.doc());
  if (current.rundown.airDate !== "" || current.columns.length > 0) return;
  initRundown(handle.doc(), fields, columnsForProjectKind(kind));
}

/** True while a rundown holds no rows, so quiet removal treats an empty new project's rundown as untouched. */
export function isRundownUntouched(handle: DocHandle): boolean {
  return readRundown(handle.doc()).rows.length === 0;
}

const makeProjectStart = (kind: RundownProjectKind): ProjectStart => ({
  kinds: [kind],
  docKind: "rundown",
  start: (handle) =>
    startRundown(
      handle,
      kind,
      planNewRundown({ existing: [], nowMs: Date.now() }),
    ),
  isUntouched: isRundownUntouched,
});

/** A new Show project starts on today's empty rundown with Show columns. */
export const SHOW_START: ProjectStart = makeProjectStart("show");

/** A new News project starts on today's empty rundown with News columns. */
export const NEWS_START: ProjectStart = makeProjectStart("news");

/** Options for creating a new rundown inside an existing Show or News project. */
export interface CreateProjectRundownOptions {
  readonly services: Pick<PersonServices, "library" | "messages">;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly kind: RundownProjectKind;
  readonly existing: readonly ExistingRundownSummary[];
  readonly nowMs: number;
}

/**
 * Creates a new empty rundown in `projectId` with planned date, air time and target, enters it in the
 * workspace index with `airDate`, and posts the brief confirmation message.
 */
export async function createProjectRundown(
  options: CreateProjectRundownOptions,
): Promise<CreateResult & { readonly fields: RundownFieldsJSON }> {
  const { services, workspaceId, projectId, kind, existing, nowMs } = options;
  const fields = planNewRundown({ existing, nowMs });
  const dateLabel = formatAirDate(fields.airDate, nowMs) || fields.airDate;
  const created = await services.library.addCopy(
    workspaceId,
    projectId,
    kind,
    dateLabel,
    {
      docKind: "rundown",
      airDate: fields.airDate,
      rundownId: null,
      start: (handle) => startRundown(handle, kind, fields),
    },
  );
  services.messages.push({
    id: `rundown.new.${nowMs}.${created.docId}`,
    text: RUNDOWN_WORDS.newRundownFor(dateLabel),
    lifetime: "brief",
    ownWork: false,
    actions: [],
  });
  return { ...created, fields };
}

/**
 * Builds the ordered list of stories nested under one rundown, drawing row order and plain row numbers
 * from `rundown` when loaded and including any non-trashed workspace index stories linked by `rundownId`.
 */
export function storiesForRundown(
  rundownDocId: string,
  rundown: RundownJSON | null,
  documents: ReadonlyMap<string, DocumentEntry>,
): readonly RundownStoryRow[] {
  const stories: RundownStoryRow[] = [];
  const seen = new Set<string>();
  if (rundown !== null) {
    let seq = 0;
    for (let index = 0; index < rundown.rows.length; index += 1) {
      const row = rundown.rows[index]!;
      const numbered = row.kind !== "header" && !row.unnumbered;
      const rowNumber = numbered ? (seq += 1) : null;
      if (row.kind !== "script" || row.docId === null) continue;
      if (seen.has(row.docId)) continue;
      const entry = documents.get(row.docId);
      if (entry !== undefined && entry.trashedAt !== null) continue;
      seen.add(row.docId);
      const cellTitle = rowTitleOf(row);
      const indexTitle =
        entry !== undefined &&
        entry.title !== "" &&
        entry.title !== LIBRARY_WORDS.untitledScript
          ? entry.title
          : "";
      const title =
        indexTitle ||
        cellTitle ||
        entry?.title ||
        RUNDOWN_WORDS.rowFallback(rowNumber ?? index + 1);
      stories.push({ docId: row.docId, title, rowNumber });
    }
  }
  const linked = [...documents.entries()]
    .filter(
      ([docId, entry]) =>
        !seen.has(docId) &&
        entry.kind === "script" &&
        entry.rundownId === rundownDocId &&
        entry.trashedAt === null,
    )
    .toSorted(
      (a, b) => a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]),
    );
  for (const [docId, entry] of linked) {
    stories.push({
      docId,
      title: entry.title || LIBRARY_WORDS.untitledScript,
      rowNumber: null,
    });
  }
  return stories;
}

/** Narrows a project kind to Show or News, defaulting to Show when called defensively. */
export function asRundownProjectKind(kind: ProjectKind): RundownProjectKind {
  return kind === "news" ? "news" : "show";
}
