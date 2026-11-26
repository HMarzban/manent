// Rundown timing clock assembly, access/capability classification and project-people loading.
import { timeRundown } from "@manent/pagination";
import type { ClockRow, RundownClock } from "@manent/pagination";
import type { RundownJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { DOC_ROLES } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import type { StatusFacts } from "@manent/ui";
import type { ProjectItem } from "../services/ports.ts";

export type RundownAccess = "edit" | "view_only" | "view_or_comment";

export interface RundownPerson {
  readonly userId: string;
  readonly name: string;
}

export const EMPTY_PEOPLE: readonly RundownPerson[] = Object.freeze([]);

/** Computes the rundown timing clock, incorporating live durations from a story open beside. */
export function buildRundownClock(
  rundown: RundownJSON,
  liveDuration: (rowId: string) => number | null,
): RundownClock {
  const rows: ClockRow[] = rundown.rows.map((row) => {
    const typed = row.cells.dur?.value;
    const typedMs = typeof typed === "number" ? typed : null;
    const liveMs = typedMs === null ? liveDuration(row.id) : null;
    return {
      id: row.id,
      kind: row.kind,
      durationMs: liveMs ?? row.durationMs,
      typedMs,
      unnumbered: row.unnumbered,
    };
  });
  return timeRundown({
    airAt: rundown.rundown.airAt,
    targetMs: rundown.rundown.targetMs,
    windowLeadMs: rundown.rundown.windowLeadMs,
    rows,
  });
}

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

async function postJson(
  path: string,
  docId: string,
  token: string | null,
): Promise<unknown> {
  const answer = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  return answer.json().catch(() => null);
}

function accessFromDescribe(body: unknown): RundownAccess | null {
  const role = field(body, "role");
  const capabilities = field(body, "capabilities");
  if (
    !DOC_ROLES.some((known): known is DocRole => known === role) ||
    !Array.isArray(capabilities)
  )
    return null;
  if (role === "view" || role === "comment") return "view_or_comment";
  if (role === "owner") return "edit";
  return capabilities.includes("edit_rundowns") ? "edit" : "view_only";
}

function peopleFromList(body: unknown): readonly RundownPerson[] {
  const people = field(body, "people");
  if (!Array.isArray(people)) return EMPTY_PEOPLE;
  return people.flatMap((person: unknown) => {
    const userId = field(person, "userId");
    const name = field(person, "name");
    return typeof userId === "string" && typeof name === "string"
      ? [{ userId, name }]
      : [];
  });
}

/** Asks the server for the person's role/capabilities on `docId` and the people holding a role on it. */
export async function fetchRundownMeta(
  docId: string,
  token: string | null,
): Promise<{
  access: RundownAccess | null;
  people: readonly RundownPerson[];
}> {
  const described = await postJson("/api/docs/describe", docId, token);
  if (described === null) return { access: null, people: EMPTY_PEOPLE };
  const listed = await postJson("/api/docs/people", docId, token);
  return {
    access: accessFromDescribe(described),
    people: peopleFromList(listed),
  };
}

/** Combines the sync status's access with the server's describe result into the rundown's effective access mode. */
export function accessFromStatus(
  status: StatusFacts,
  described: RundownAccess | null,
): RundownAccess {
  if (status.access === "view" || status.access === "comment")
    return "view_or_comment";
  if (status.access === "too_old") return "view_only";
  return described ?? "edit";
}

/** True once the rundown holds local content or its handle has settled with the server or offline store. */
export function isLoadedRundown(data: RundownJSON, handle: DocHandle): boolean {
  if (
    data.rundown.airDate !== "" ||
    data.columns.length > 0 ||
    data.rows.length > 0
  )
    return true;
  const st = handle.status.get();
  return st.docSync === "synced" || st.neverSynced || st.link === "offline";
}

export function findProjectTitle(
  projects: readonly ProjectItem[],
  projectId: string | null,
): string | null {
  if (projectId === null) return null;
  return projects.find((item) => item.projectId === projectId)?.title ?? null;
}
