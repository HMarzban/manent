// Pure readers and row-fact helpers for the Library's series view: access, people, target pages, last edited and place.
import { readProjectMap } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SETTINGS } from "@manent/settings";
import type { DocStatus } from "@manent/sync-client";
import { DOC_ROLES } from "@manent/sync-protocol";
import type { RowPlace } from "../../../services/ports.ts";
import { nameOf } from "../../../services/sync/index-entries.ts";
import type {
  ContinueEntry,
  DocumentEntry,
} from "../../../services/sync/index-entries.ts";

export interface SeriesPerson {
  readonly userId: string;
  readonly name: string;
}

export type EpisodeLastEdited =
  | { readonly changedSinceOpened: true }
  | { readonly byName: string; readonly at: number }
  | null;

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

export async function askProjectApi(
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

export function readCanEdit(described: unknown): boolean | null {
  const role = field(described, "role");
  if (!DOC_ROLES.some((known) => known === role)) return null;
  return role === "owner" || role === "edit";
}

export function readPeopleList(listed: unknown): readonly SeriesPerson[] {
  const people = field(listed, "people");
  if (!Array.isArray(people)) return [];
  return people.flatMap((person: unknown) => {
    const userId = field(person, "userId");
    const name = field(person, "name");
    return typeof userId === "string" && typeof name === "string"
      ? [{ userId, name }]
      : [];
  });
}

export function readTargetPages(doc: CrdtDoc): number | null {
  const raw = readProjectMap(doc, "template")["project.targetPages"];
  const parsed = SETTINGS.get("project.targetPages").type.parse(raw);
  return parsed.ok && typeof parsed.value === "number" ? parsed.value : null;
}

export function placeFromStatus(
  status: DocStatus,
  signedIn: boolean,
  online: boolean,
): RowPlace {
  if (status.side.includes("access_removed") || status.side.includes("deleted"))
    return { kind: "not_on_device" };
  if (status.neverSynced && status.waiting === 0) {
    if (!signedIn) return { kind: "never_synced" };
    return online ? { kind: "on_server" } : { kind: "not_on_device" };
  }
  if (status.waiting > 0) return { kind: "waiting", count: status.waiting };
  return { kind: "synced" };
}

export function computeLastEdited(
  docId: string,
  documents: ReadonlyMap<string, DocumentEntry>,
  continued: ReadonlyMap<string, ContinueEntry>,
  viewerUserId: string,
  people: readonly SeriesPerson[],
): EpisodeLastEdited {
  const entry = documents.get(docId);
  if (entry === undefined) return null;
  const openedAt = continued.get(docId)?.openedAt;
  if (
    entry.editedAt !== null &&
    entry.editedByUserId !== viewerUserId &&
    openedAt !== undefined &&
    entry.editedAt > openedAt
  ) {
    return { changedSinceOpened: true };
  }
  if (entry.editedAt !== null && entry.editedByUserId !== null) {
    const person = people.find((p) => p.userId === entry.editedByUserId);
    const byName = person?.name.split(" ")[0] ?? nameOf(entry.editedByUserId);
    return { byName, at: entry.editedAt };
  }
  return null;
}
