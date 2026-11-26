// Shared per-project "Can also" permission controller: opens one project index, reads/writes `can_also`,
// resolves access & display names once across all person rows, and announces changes with Undo.
import { observeProjectMap, readProjectMap } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import { WORKSPACE_WORDS } from "@manent/ui";
import type { ProjectIndex } from "../project/project-index.ts";
import type { PersonServices } from "../services/ports.ts";
import { readPerson } from "../session.ts";
import type { TabStorage } from "../session.ts";
import { restoreTick, shortNameOf, writeTick } from "./can-also-model.ts";
import type { CanAlsoTickDef } from "./can-also-model.ts";

export {
  CAN_ALSO_TICKS,
  isTickChecked,
  shortNameOf,
} from "./can-also-model.ts";
export type { CanAlsoTickDef, CanAlsoTickId } from "./can-also-model.ts";

export interface CanAlsoSnapshot {
  readonly entries: Readonly<Record<string, unknown>>;
  readonly canEdit: boolean;
  readonly people: ReadonlyMap<string, string>;
  readonly projectTitle: string | null;
  readonly refusedUsers: ReadonlySet<string>;
}

const EMPTY_SNAPSHOT: CanAlsoSnapshot = Object.freeze({
  entries: Object.freeze({}),
  canEdit: false,
  people: new Map<string, string>(),
  projectTitle: null,
  refusedUsers: new Set<string>(),
});

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

async function askDoc(
  path: string,
  docId: string,
  token: string | null,
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (response === null || response.status !== 200) return null;
  return response.json().catch(() => null);
}

function canEditFromDescribe(described: unknown): boolean {
  const role = field(described, "role");
  const capabilities = field(described, "capabilities");
  if (
    !DOC_ROLES.some((known) => known === role) ||
    !Array.isArray(capabilities)
  )
    return false;
  return role === "owner" || capabilities.includes("issue_revisions");
}

function peopleMapFromList(listed: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const raw = field(listed, "people");
  if (!Array.isArray(raw)) return map;
  for (const item of raw) {
    const userId = field(item, "userId");
    const name = field(item, "name");
    if (typeof userId === "string" && typeof name === "string") {
      map.set(userId, name);
    }
  }
  return map;
}

export interface CanAlsoController {
  get(): CanAlsoSnapshot;
  subscribe(listener: () => void): () => void;
  toggle(
    userId: string,
    tick: CanAlsoTickDef,
    grant: boolean,
    fallbackProjectTitle: string | null,
  ): Promise<void>;
  release(): void;
}

interface SharedEntry {
  refs: number;
  snapshot: CanAlsoSnapshot;
  listeners: Set<() => void>;
  index: ProjectIndex;
  handle: DocHandle | null;
  lastToggledUserId: string | null;
  cleanups: (() => void)[];
  disposed: boolean;
}

const byServices = new WeakMap<PersonServices, Map<string, SharedEntry>>();

function notify(entry: SharedEntry): void {
  for (const listener of entry.listeners) listener();
}

function startEntry(
  services: PersonServices,
  tabStorage: TabStorage | null,
  projectId: string,
): SharedEntry {
  const entry: SharedEntry = {
    refs: 0,
    snapshot: EMPTY_SNAPSHOT,
    listeners: new Set(),
    index: services.projectIndex(projectId),
    handle: null,
    lastToggledUserId: null,
    cleanups: [],
    disposed: false,
  };

  const setSnapshot = (patch: Partial<CanAlsoSnapshot>): void => {
    if (entry.disposed) return;
    entry.snapshot = Object.freeze({ ...entry.snapshot, ...patch });
    notify(entry);
  };

  const readDocEntries = (doc: CrdtDoc): void => {
    setSnapshot({ entries: readProjectMap(doc, "can_also") });
  };

  const docId = indexDocId("project", projectId);
  const person = readPerson(tabStorage);
  const token = person?.userId === services.userId ? person.token : null;

  void askDoc("/api/docs/describe", docId, token).then(async (described) => {
    const canEdit = canEditFromDescribe(described);
    if (described === null) {
      setSnapshot({ canEdit, people: new Map() });
      return;
    }
    const listed = await askDoc("/api/docs/people", docId, token);
    setSnapshot({ canEdit, people: peopleMapFromList(listed) });
  });

  // Resolve project title from the Library's workspace lists.
  void services.api.me().then((me) => {
    if (entry.disposed) return;
    const workspaceIds = [
      ...(me.ok ? me.me.workspaces.map((w) => w.id) : []),
      services.userId,
    ];
    for (const wsId of workspaceIds) {
      const list = services.library.projects(wsId);
      const check = (): void => {
        const match = list.get().find((p) => p.projectId === projectId);
        if (
          match !== undefined &&
          entry.snapshot.projectTitle !== match.title
        ) {
          setSnapshot({ projectTitle: match.title });
        }
      };
      entry.cleanups.push(list.subscribe(check));
      check();
    }
  });

  void entry.index.handle().then(
    (handle) => {
      if (entry.disposed) return;
      entry.handle = handle;
      let stopMap = observeProjectMap(handle.doc(), "can_also", () =>
        readDocEntries(handle.doc()),
      );
      readDocEntries(handle.doc());
      const stopEvents = handle.on((event) => {
        if (event.type === "replaced") {
          stopMap();
          stopMap = observeProjectMap(handle.doc(), "can_also", () =>
            readDocEntries(handle.doc()),
          );
          readDocEntries(handle.doc());
        } else if (event.type === "rejected") {
          const refused = new Set(entry.snapshot.refusedUsers);
          if (entry.lastToggledUserId !== null) {
            refused.add(entry.lastToggledUserId);
          }
          setSnapshot({
            entries: readProjectMap(handle.doc(), "can_also"),
            refusedUsers: refused,
          });
        }
      });
      entry.cleanups.push(() => {
        stopMap();
        stopEvents();
      });
    },
    () => {
      // Index unavailable on device/network: keep empty read-only snapshot.
    },
  );

  return entry;
}

/** Acquires a shared ref-counted controller for `projectId`'s `can_also` map. */
export function acquireCanAlso(
  services: PersonServices,
  tabStorage: TabStorage | null,
  projectId: string,
): CanAlsoController {
  let table = byServices.get(services);
  if (table === undefined) {
    table = new Map();
    byServices.set(services, table);
  }
  let entry = table.get(projectId);
  if (entry === undefined) {
    entry = startEntry(services, tabStorage, projectId);
    table.set(projectId, entry);
  }
  entry.refs += 1;
  let released = false;

  return {
    get: () => entry.snapshot,
    subscribe(listener) {
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    async toggle(userId, tick, grant, fallbackProjectTitle) {
      if (!entry.snapshot.canEdit) return;
      const refused = new Set(entry.snapshot.refusedUsers);
      refused.delete(userId);
      entry.lastToggledUserId = userId;
      entry.snapshot = Object.freeze({
        ...entry.snapshot,
        refusedUsers: refused,
      });
      notify(entry);

      try {
        const handle = entry.handle ?? (await entry.index.handle());
        entry.handle = handle;
        const doc = handle.doc();
        const previous = writeTick(doc, tick.capabilities, userId, grant);
        const fullName = entry.snapshot.people.get(userId) ?? userId;
        const person = shortNameOf(fullName);
        const project =
          entry.snapshot.projectTitle ?? fallbackProjectTitle ?? projectId;
        const text = grant
          ? WORKSPACE_WORDS.canAlsoGranted(person, tick.grantPhrase, project)
          : WORKSPACE_WORDS.canAlsoRevoked(person, tick.revokePhrase, project);
        services.reverses.set("can_also_changed", () => {
          try {
            restoreTick(handle.doc(), previous);
          } catch {
            // Document closed before Undo was clicked.
          }
        });
        services.messages.push({
          id: "can_also_changed",
          text,
          actions: [
            { label: WORKSPACE_WORDS.undo, commandId: "settings.undo" },
          ],
          lifetime: "reverse",
          ownWork: false,
        });
      } catch {
        const nextRefused = new Set(entry.snapshot.refusedUsers);
        nextRefused.add(userId);
        entry.snapshot = Object.freeze({
          ...entry.snapshot,
          refusedUsers: nextRefused,
        });
        notify(entry);
      }
    },
    release() {
      if (released) return;
      released = true;
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs === 0) {
        entry.disposed = true;
        for (const cleanup of entry.cleanups.splice(0)) cleanup();
        table.delete(projectId);
        void entry.index.close();
      }
    },
  };
}
