// Server-held access checks for a project's facts map: distinguishes editors, read-only roles, no access and offline.
import type { DocHandle, SideState } from "@manent/sync-client";
import { DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import { readPerson } from "../session.ts";
import type { TabStorage } from "../session.ts";

/** What the server says this person may do on the project's index. */
export type FactsAccess =
  "loading" | "editor" | "read_only" | "no_access" | "unreachable";

const BLOCKED_SIDES: readonly SideState[] = Object.freeze([
  "read_only",
  "view_only",
  "access_removed",
  "deleted",
]);

const REVOKED_SIDES: readonly SideState[] = Object.freeze([
  "access_removed",
  "deleted",
]);

/** Whether the handle's side state or read-only viewer forbids writing to the index. */
export function isHandleWriteBlocked(handle: DocHandle): boolean {
  if (handle.readOnly.get() !== null) return true;
  const { side } = handle.status.get();
  return side.some((entry) => BLOCKED_SIDES.includes(entry));
}

/** Whether the handle's side state reports revoked access or deletion. */
export function isHandleRevoked(handle: DocHandle): boolean {
  const { side } = handle.status.get();
  return side.some((entry) => REVOKED_SIDES.includes(entry));
}

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

/**
 * Asks the server for the person's role on `projectId`'s index.
 * Returns `editor` for owner/edit, `read_only` for comment/view, `no_access` on 401/403/404, and `unreachable` offline.
 */
export async function checkFactsAccess(options: {
  projectId: string;
  userId: string;
  tabStorage: TabStorage | null;
  fetch?: typeof globalThis.fetch;
}): Promise<Exclude<FactsAccess, "loading">> {
  const person = readPerson(options.tabStorage);
  const token = person?.userId === options.userId ? person.token : null;
  const docId = indexDocId("project", options.projectId);
  const send = options.fetch ?? fetch;
  const answer = await send("/api/docs/describe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null) return "unreachable";
  if (
    answer.status === 401 ||
    answer.status === 403 ||
    answer.status === 404 ||
    answer.status === 410
  )
    return "no_access";
  if (answer.status !== 200) return "unreachable";
  const body = await answer.json().catch(() => null);
  const role = field(body, "role");
  if (!DOC_ROLES.some((known) => known === role)) return "unreachable";
  return role === "owner" || role === "edit" ? "editor" : "read_only";
}
