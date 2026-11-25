// Private folder: personal projects and scripts kept in the person's private index, created with workspaceId: null.
import type { JsonMapView } from "@manent/crdt";
import type { SyncClient } from "@manent/sync-client";
import { indexDocId, isDocKind, projectHome } from "@manent/sync-protocol";
import { LIBRARY_WORDS, NEW_PROJECT_CARDS, createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { CreateResult, ProjectItem, ProjectKind } from "../ports.ts";
import { isFields } from "./device-memory.ts";
import { nameOf } from "./index-entries.ts";
import type { DocumentEntry, ProjectEntry } from "./index-entries.ts";
import { liveMap } from "./private-index.ts";

const isProjectKind = (value: unknown): value is ProjectKind =>
  NEW_PROJECT_CARDS.some((card) => card.kind === value);

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

function readPrivateProject(value: unknown): ProjectEntry | null {
  if (!isFields(value) || typeof value.projectId === "string") return null;
  const { title, kind, createdAt, createdByUserId } = value;
  if (typeof title !== "string" || !isProjectKind(kind)) return null;
  if (!isInstant(createdAt) || typeof createdByUserId !== "string") return null;
  return { title, kind, createdAt, createdByUserId, folderId: null };
}

function readPrivateDocument(value: unknown): DocumentEntry | null {
  if (!isFields(value)) return null;
  const { projectId, title, kind, createdAt, editedAt, editedByUserId } = value;
  if (typeof projectId !== "string" || typeof title !== "string") return null;
  if (!isDocKind(kind) || !isInstant(createdAt)) return null;
  if (editedAt !== null && !isInstant(editedAt)) return null;
  if (editedByUserId !== null && typeof editedByUserId !== "string")
    return null;
  const trashedAt =
    value.trashedAt === undefined || value.trashedAt === null
      ? null
      : isInstant(value.trashedAt)
        ? value.trashedAt
        : null;
  const trashedByUserId =
    typeof value.trashedByUserId === "string" ? value.trashedByUserId : null;
  return {
    projectId,
    title,
    kind,
    createdAt,
    editedAt,
    editedByUserId,
    airDate: typeof value.airDate === "string" ? value.airDate : null,
    rundownId: typeof value.rundownId === "string" ? value.rundownId : null,
    trashedAt,
    trashedByUserId,
  };
}

function readPrivateProjects(map: JsonMapView): ProjectItem[] {
  const projects = new Map<string, ProjectEntry>();
  const documents: [string, DocumentEntry][] = [];
  for (const [id, value] of Object.entries(map.entries())) {
    const doc = readPrivateDocument(value);
    if (doc !== null) {
      documents.push([id, doc]);
      continue;
    }
    const project = readPrivateProject(value);
    if (project !== null) projects.set(id, project);
  }
  const sortedDocuments = documents.toSorted(
    (a, b) => a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]),
  );
  return [...projects]
    .toSorted(
      (a, b) => b[1].createdAt - a[1].createdAt || a[0].localeCompare(b[0]),
    )
    .flatMap(([projectId, project]) => {
      const listed = sortedDocuments.filter(
        ([, doc]) => doc.projectId === projectId && doc.kind !== "outline",
      );
      const own = listed.filter(([, doc]) => doc.trashedAt === null);
      if (listed.length > 0 && own.length === 0) return [];
      const firstDocId = own[0]?.[0] ?? null;
      const latest = own
        .flatMap(([, doc]) =>
          doc.editedAt === null || doc.editedByUserId === null
            ? []
            : [{ at: doc.editedAt, by: doc.editedByUserId }],
        )
        .toSorted((a, b) => b.at - a.at)[0] ?? {
        at: project.createdAt,
        by: project.createdByUserId,
      };
      return [
        {
          projectId,
          title: project.title,
          kind: project.kind,
          firstDocId,
          lastEdited: { byName: nameOf(latest.by), at: latest.at },
          place:
            firstDocId === null
              ? { kind: "not_on_device" }
              : { kind: "synced" },
        },
      ];
    });
}

function freePrivateName(map: JsonMapView, kind: ProjectKind): string {
  const taken = new Set<string>();
  for (const value of Object.values(map.entries())) {
    const project = readPrivateProject(value);
    if (project !== null) taken.add(project.title);
  }
  for (let n = 1; ; n += 1) {
    const name = LIBRARY_WORDS.untitledProject(kind, n);
    if (!taken.has(name)) return name;
  }
}

const privateLists = new WeakMap<
  Promise<SyncClient>,
  Map<string, Subscribable<readonly ProjectItem[]>>
>();

/** Reactive list of the person's Private folder projects, read from `private_folder` on their private index. */
export function watchPrivateFolder(
  client: Promise<SyncClient>,
  userId: string,
): Subscribable<readonly ProjectItem[]> {
  let byUser = privateLists.get(client);
  if (byUser === undefined) {
    byUser = new Map();
    privateLists.set(client, byUser);
  }
  const existing = byUser.get(userId);
  if (existing !== undefined) return existing;
  const list = createValue<readonly ProjectItem[]>([]);
  byUser.set(userId, list);
  void client
    .then((sync) =>
      sync.open(indexDocId("user", userId), {
        create: { kind: "index", home: "user", workspaceId: null },
      }),
    )
    .then(
      (handle) => {
        const map = liveMap(handle, "private_folder");
        const refresh = (): void => list.set(readPrivateProjects(map));
        map.subscribe(refresh);
        refresh();
      },
      () => {
        // private index failed to open; Private list stays empty
      },
    );
  return list;
}

/** Creates a private project and its first document with `workspaceId: null` and records both in `private_folder`. */
export async function createPrivateProject(options: {
  readonly client: Promise<SyncClient>;
  readonly userId: string;
  readonly kind: ProjectKind;
  readonly language: string;
  readonly now: () => number;
  readonly newId: () => string;
}): Promise<CreateResult> {
  const sync = await options.client;
  const projectId = options.newId();
  const { projectStartOf } = await import("./create-script.ts");
  const start = projectStartOf(options.kind);
  const handle = await sync.create({
    kind: start.docKind,
    home: projectHome(projectId),
    workspaceId: null,
  });
  start.start(handle, options.kind, options.language);
  const docId = handle.docId;
  await handle.close();
  const privateIndex = await sync.open(indexDocId("user", options.userId), {
    create: { kind: "index", home: "user", workspaceId: null },
  });
  const map = liveMap(privateIndex, "private_folder");
  const at = options.now();
  const title = freePrivateName(map, options.kind);
  map.set(projectId, {
    title,
    kind: options.kind,
    createdAt: at,
    createdByUserId: options.userId,
    folderId: null,
  });
  map.set(docId, {
    projectId,
    title: LIBRARY_WORDS.untitledScript,
    kind: start.docKind,
    createdAt: at,
    editedAt: null,
    editedByUserId: null,
    airDate: null,
    rundownId: null,
    trashedAt: null,
    trashedByUserId: null,
  });
  return { projectId, docId };
}

const pickerOpen = createValue(false);

/** Coordinates the Private view's New project kind picker when `library.newProject` runs on `?view=private`. */
export const privateProjectPicker: {
  readonly isOpen: Subscribable<boolean>;
  open(): void;
  close(): void;
} = Object.freeze({
  isOpen: pickerOpen,
  open: () => pickerOpen.set(true),
  close: () => pickerOpen.set(false),
});
