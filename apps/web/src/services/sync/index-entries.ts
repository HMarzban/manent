// The entries of the index documents' maps as the Library reads them: each value's shape checked, and the rows built from them.
import type { JsonMapView } from "@manent/crdt";
import { demoPersonName } from "@manent/demo";
import type { DocSummary } from "@manent/sync-client";
import { isDocKind } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";
import { NEW_PROJECT_CARDS } from "@manent/ui";
import { isFields } from "./device-memory.ts";
import type {
  ContinueItem,
  ProjectItem,
  ProjectKind,
  RowPlace,
} from "../ports.ts";

/** A person's full name, as an avatar names them ("Dana Reyes"); their id for one the demo does not know. */
export function fullNameOf(userId: string): string {
  return demoPersonName(userId) ?? userId;
}

/** What a sentence calls a person: the first of their names ("Dana"); their id for one the demo does not know. */
export function nameOf(userId: string): string {
  return fullNameOf(userId).split(" ")[0] ?? userId;
}

/** At most this many entries are shown in Continue. */
const CONTINUE_LIMIT = 20;

export interface ProjectEntry {
  title: string;
  kind: ProjectKind;
  createdAt: number;
  createdByUserId: string;
  /** The folder the project is in; null at the workspace's top. */
  folderId: string | null;
}

export interface DocumentEntry {
  projectId: string;
  title: string;
  kind: DocKind;
  createdAt: number;
  editedAt: number | null;
  editedByUserId: string | null;
  /** A rundown's local date of broadcast, `YYYY-MM-DD`; null for any other document. */
  airDate: string | null;
  /** The rundown a story belongs to; null for any other document. */
  rundownId: string | null;
  /** When the document was put in Trash; null while it is not there. */
  trashedAt: number | null;
  trashedByUserId: string | null;
}

export interface ContinueEntry {
  workspaceId: string;
  openedAt: number;
}

const isProjectKind = (value: unknown): value is ProjectKind =>
  NEW_PROJECT_CARDS.some((card) => card.kind === value);

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isText = (value: unknown): value is string => typeof value === "string";

/** A field an older entry lacks: absent reads as null; "refused" when it holds anything `is` does not accept. */
function optional<T>(
  value: unknown,
  is: (value: unknown) => value is T,
): T | null | "refused" {
  if (value === undefined || value === null) return null;
  return is(value) ? value : "refused";
}

function readProject(value: unknown): ProjectEntry | null {
  if (!isFields(value)) return null;
  const { title, kind, createdAt, createdByUserId } = value;
  if (typeof title !== "string" || !isProjectKind(kind)) return null;
  if (!isInstant(createdAt) || typeof createdByUserId !== "string") return null;
  const folderId = optional(value.folderId, isText);
  if (folderId === "refused") return null;
  return { title, kind, createdAt, createdByUserId, folderId };
}

function readDocument(value: unknown): DocumentEntry | null {
  if (!isFields(value)) return null;
  const { projectId, title, kind, createdAt, editedAt, editedByUserId } = value;
  if (typeof projectId !== "string" || typeof title !== "string") return null;
  if (!isDocKind(kind) || !isInstant(createdAt)) return null;
  if (editedAt !== null && !isInstant(editedAt)) return null;
  if (editedByUserId !== null && typeof editedByUserId !== "string")
    return null;
  const airDate = optional(value.airDate, isText);
  const rundownId = optional(value.rundownId, isText);
  const trashedAt = optional(value.trashedAt, isInstant);
  const trashedByUserId = optional(value.trashedByUserId, isText);
  if (airDate === "refused" || rundownId === "refused") return null;
  if (trashedAt === "refused" || trashedByUserId === "refused") return null;
  return {
    projectId,
    title,
    kind,
    createdAt,
    editedAt,
    editedByUserId,
    airDate,
    rundownId,
    trashedAt,
    trashedByUserId,
  };
}

function readContinue(value: unknown): ContinueEntry | null {
  if (!isFields(value)) return null;
  const { workspaceId, openedAt } = value;
  return typeof workspaceId === "string" && isInstant(openedAt)
    ? { workspaceId, openedAt }
    : null;
}

/** Every entry whose value `read` accepts; the others are skipped and stay in the map. */
function entriesOf<T>(
  map: JsonMapView,
  read: (value: unknown) => T | null,
): Map<string, T> {
  const entries = new Map<string, T>();
  for (const [key, value] of Object.entries(map.entries())) {
    const entry = read(value);
    if (entry !== null) entries.set(key, entry);
  }
  return entries;
}

/** One workspace index, read. */
export interface WorkspaceEntries {
  projects: Map<string, ProjectEntry>;
  documents: Map<string, DocumentEntry>;
}

export function readWorkspace(maps: {
  projects: JsonMapView;
  documents: JsonMapView;
}): WorkspaceEntries {
  return {
    projects: entriesOf(maps.projects, readProject),
    documents: entriesOf(maps.documents, readDocument),
  };
}

export const readContinueMap = (map: JsonMapView): Map<string, ContinueEntry> =>
  entriesOf(map, readContinue);

/**
 * Where `docId` is, from what the device's store holds of it. A record a signed-in person never synced, with nothing
 * waiting, holds none of the document yet: what a fetch leaves until the server's copy arrives. Only someone without a
 * session is told it was never synced. Null when the server refused the person: the row is not listed.
 */
function placeOf(docId: string, facts: RowFacts): RowPlace | null {
  if (facts.refused.has(docId)) return null;
  const summary = facts.summaries.get(docId);
  const empty =
    summary === undefined ||
    (summary.neverSynced && summary.waiting === 0 && facts.signedIn);
  if (empty && !facts.online) return { kind: "not_on_device" };
  if (empty)
    return { kind: facts.fetched.has(docId) ? "on_server" : "fetching" };
  if (summary.neverSynced && !facts.signedIn) return { kind: "never_synced" };
  if (summary.waiting > 0) return { kind: "waiting", count: summary.waiting };
  return { kind: "synced" };
}

/** What the rows are read with besides the index. */
export interface RowFacts {
  userId: string;
  /** The person has a session. */
  signedIn: boolean;
  /** The link is online, so a document the device does not hold is fetched. */
  online: boolean;
  summaries: ReadonlyMap<string, DocSummary>;
  /** Documents whose fetch has ended. */
  fetched: ReadonlySet<string>;
  /** Documents whose fetch the server refused: the person has no access to them, or they were deleted. */
  refused: ReadonlySet<string>;
  continued: ReadonlyMap<string, ContinueEntry>;
  nameOf: (userId: string) => string;
}

const byCreation = (
  a: [string, { createdAt: number }],
  b: [string, { createdAt: number }],
): number => a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]);

/**
 * The latest edit of the project's `documents`, its creation while nobody has edited one, or that someone else changed
 * one since this person opened it.
 */
function lastEditedOf(
  project: ProjectEntry,
  documents: readonly [string, DocumentEntry][],
  facts: RowFacts,
): ProjectItem["lastEdited"] {
  const changed = documents.some(([docId, d]) => {
    const openedAt = facts.continued.get(docId)?.openedAt;
    return (
      d.editedAt !== null &&
      d.editedByUserId !== facts.userId &&
      openedAt !== undefined &&
      d.editedAt > openedAt
    );
  });
  if (changed) return { changedSinceOpened: true };
  const latest = documents
    .flatMap(([, d]) =>
      d.editedAt === null || d.editedByUserId === null
        ? []
        : [{ at: d.editedAt, by: d.editedByUserId }],
    )
    .toSorted((a, b) => b.at - a.at)[0] ?? {
    at: project.createdAt,
    by: project.createdByUserId,
  };
  return { byName: facts.nameOf(latest.by), at: latest.at };
}

/** The workspace's projects, newest first, each with its oldest document; one whose document the server refused is left out. */
export function projectItems(
  index: WorkspaceEntries,
  facts: RowFacts,
): ProjectItem[] {
  const documents = [...index.documents].toSorted(byCreation);
  return [...index.projects]
    .toSorted(byCreation)
    .toReversed()
    .flatMap(([projectId, project]) => {
      const own = documents.filter(([, d]) => d.projectId === projectId);
      const firstDocId = own[0]?.[0] ?? null;
      const place: RowPlace | null =
        firstDocId === null
          ? { kind: "not_on_device" }
          : placeOf(firstDocId, facts);
      if (place === null) return [];
      return [
        {
          projectId,
          title: project.title,
          kind: project.kind,
          firstDocId,
          lastEdited: lastEditedOf(project, own, facts),
          place,
        },
      ];
    });
}

/** The person's Continue entries of `workspaceId`, newest first, at most CONTINUE_LIMIT; a document the index does not hold, or the server refused, is left out. */
export function continueItems(
  workspaceId: string,
  index: WorkspaceEntries,
  facts: RowFacts,
): ContinueItem[] {
  return [...facts.continued]
    .filter(([, entry]) => entry.workspaceId === workspaceId)
    .toSorted((a, b) => b[1].openedAt - a[1].openedAt)
    .flatMap(([docId]) => {
      const document = index.documents.get(docId);
      const project =
        document === undefined
          ? undefined
          : index.projects.get(document.projectId);
      const place = placeOf(docId, facts);
      if (document === undefined || project === undefined || place === null)
        return [];
      return [
        {
          docId,
          title: document.title,
          projectTitle: project.title,
          kind: project.kind,
          place,
        },
      ];
    })
    .slice(0, CONTINUE_LIMIT);
}
