// The documents the person has put in Trash, taking them out again, checking permissions and following open handles.
import type { DocEvent, DocHandle } from "@manent/sync-client";
import {
  isTrashControlData,
  isTrashListResponse,
  isTrashMoveResponse,
  isTrashRestoreResponse,
} from "@manent/sync-protocol";
import type { TrashListItem } from "@manent/sync-protocol";
import { LIBRARY_FILES_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import type { Api } from "../api.ts";
import { createHistoryHttp, readBody } from "../history/requests.ts";
import { readPerson, tabStorage } from "../session.ts";
import { trashActions } from "../state/trash.store.ts";

export interface TrashDocAccess {
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly canDelete: boolean;
}

export interface TrashDocPerson {
  readonly userId: string;
  readonly name: string;
}

export type TrashMoveResult =
  | { readonly ok: true; readonly purgeAfterAt: number }
  | { readonly ok: false; readonly reason: "forbidden" | "refused" };

export type TrashListResult =
  | { readonly ok: true; readonly items: readonly TrashListItem[] }
  | { readonly ok: false };

export interface Trash {
  move(docId: string): Promise<TrashMoveResult>;
  restore(docId: string): Promise<boolean>;
  list(workspaceId: string): Promise<TrashListResult>;
  describe(docId: string): Promise<TrashDocAccess | null>;
  people(docId: string): Promise<readonly TrashDocPerson[] | null>;
  workspaceName(workspaceId: string): Promise<string | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDescribeAccess(value: unknown): value is {
  role: string;
  capabilities: string[];
} {
  return (
    isRecord(value) &&
    typeof value.role === "string" &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every((cap) => typeof cap === "string")
  );
}

function isPeopleResponse(value: unknown): value is {
  people: { userId: string; name: string }[];
} {
  return (
    isRecord(value) &&
    Array.isArray(value.people) &&
    value.people.every(
      (person) =>
        isRecord(person) &&
        typeof person.userId === "string" &&
        typeof person.name === "string",
    )
  );
}

async function fetchDescribe(
  docId: string,
  fetchFn: typeof fetch,
  getToken: () => string | null,
): Promise<TrashDocAccess | null> {
  if (getToken() === null) return null;
  const http = createHistoryHttp({ fetch: fetchFn, token: getToken });
  let response: Response;
  try {
    response = await http.post("/api/docs/describe", { docId });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const parsed = await readBody(response, isDescribeAccess);
  if (parsed === null) return null;
  const { role, capabilities } = parsed.value;
  return {
    role,
    capabilities,
    canDelete: role === "owner" || capabilities.includes("delete"),
  };
}

/** Trash client over the server's HTTP routes, reading the active tab's bearer token on each request. */
export function createTrash(options: {
  api: Api;
  fetch?: typeof fetch;
  token?: () => string | null;
}): Trash {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const getToken =
    options.token ?? (() => readPerson(tabStorage())?.token ?? null);
  const http = createHistoryHttp({ fetch: fetchFn, token: getToken });

  return {
    async move(docId) {
      if (getToken() === null) return { ok: false, reason: "refused" };
      let response: Response;
      try {
        response = await http.post("/api/trash/move", { docId });
      } catch {
        return { ok: false, reason: "refused" };
      }
      if (response.status === 403) return { ok: false, reason: "forbidden" };
      if (!response.ok) return { ok: false, reason: "refused" };
      const parsed = await readBody(response, isTrashMoveResponse);
      if (parsed === null) return { ok: false, reason: "refused" };
      return { ok: true, purgeAfterAt: parsed.value.purgeAfterAt };
    },

    async restore(docId) {
      if (getToken() === null) return false;
      let response: Response;
      try {
        response = await http.post("/api/trash/restore", { docId });
      } catch {
        return false;
      }
      if (!response.ok) return false;
      const parsed = await readBody(response, isTrashRestoreResponse);
      return parsed !== null;
    },

    async list(workspaceId) {
      if (getToken() === null) return { ok: false };
      let response: Response;
      try {
        response = await http.post("/api/trash/list", { workspaceId });
      } catch {
        return { ok: false };
      }
      if (!response.ok) return { ok: false };
      const parsed = await readBody(response, isTrashListResponse);
      if (parsed === null) return { ok: false };
      return {
        ok: true,
        items: parsed.value.items.toSorted(
          (a, b) => b.deletedAt - a.deletedAt || a.docId.localeCompare(b.docId),
        ),
      };
    },

    describe: (docId) => fetchDescribe(docId, fetchFn, getToken),

    async people(docId) {
      if (getToken() === null) return null;
      let response: Response;
      try {
        response = await http.post("/api/docs/people", { docId });
      } catch {
        return null;
      }
      if (!response.ok) return null;
      const parsed = await readBody(response, isPeopleResponse);
      return parsed === null ? null : parsed.value.people;
    },

    async workspaceName(workspaceId) {
      const me = await options.api.me();
      if (!me.ok) return null;
      return me.me.workspaces.find((ws) => ws.id === workspaceId)?.name ?? null;
    },
  };
}

/**
 * Watches an open document handle for delete capability (`SUBSCRIBED` / describe) and Trash CONTROL frames
 * (`trashed` / `untrashed`), updating `trashActions` and pushing brief notices to other viewers/editors.
 */
export function watchTrashHandle(options: {
  readonly docId: string;
  readonly handle: DocHandle;
  readonly userId: string;
  readonly title: () => string;
  readonly messages: MessageQueue;
  readonly nameOf: (userId: string) => string;
  readonly fetch?: typeof fetch;
  readonly token?: () => string | null;
}): () => void {
  const { docId, handle, userId, title, messages, nameOf } = options;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const getToken =
    options.token ?? (() => readPerson(tabStorage())?.token ?? null);
  let stopped = false;

  const refreshAccess = (): void => {
    void fetchDescribe(docId, fetchFn, getToken).then((access) => {
      if (stopped || access === null) return;
      trashActions.set(docId, { canDelete: access.canDelete });
    });
  };

  refreshAccess();

  const stop = handle.on((event: DocEvent) => {
    if (event.type === "subscribed") {
      refreshAccess();
      return;
    }
    if (event.type !== "control") return;
    if (event.kind !== "trashed" && event.kind !== "untrashed") return;
    if (!isTrashControlData(event.data)) return;
    const isTrashed = event.kind === "trashed";
    trashActions.set(docId, { inTrash: isTrashed });
    trashActions.bumpRevision();
    if (event.data.userId === userId) return;
    const docTitle = title();
    const actor = nameOf(event.data.userId);
    if (isTrashed) {
      const { canDelete } = trashActions.get(docId);
      trashActions.rememberTrashed({ docId, title: docTitle });
      messages.push({
        id: `trash_other_moved:${docId}`,
        text: LIBRARY_FILES_WORDS.trashedByOther(actor, docTitle),
        actions: canDelete
          ? [
              {
                label: LIBRARY_FILES_WORDS.restore,
                commandId: "library.restore",
              },
            ]
          : [],
        lifetime: "brief",
        ownWork: false,
      });
    } else {
      messages.push({
        id: `trash_other_restored:${docId}`,
        text: LIBRARY_FILES_WORDS.untrashedByOther(actor, docTitle),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    }
  });

  return () => {
    stopped = true;
    stop();
  };
}
