// Workspace administration HTTP client and in-session cache for Workspace settings.
import { DOC_ROLES } from "@manent/sync-protocol";
import type {
  DocRole,
  WorkspacePeopleResponse,
  WorkspacePerson,
  WorkspaceRoleResponse,
  WorkspaceSettingsResponse,
} from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { createHistoryHttp, readBody } from "../../history/requests.ts";
import { readPerson, tabStorage } from "../../session.ts";

export type WorkspaceApiFailure =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "unreachable"
  | "refused";

export type WorkspaceApiAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: WorkspaceApiFailure };

export interface WorkspaceApi {
  people(
    workspaceId: string,
  ): Promise<WorkspaceApiAnswer<WorkspacePeopleResponse>>;
  changeRole(
    workspaceId: string,
    userId: string,
    role: DocRole,
  ): Promise<WorkspaceApiAnswer<WorkspaceRoleResponse>>;
  settings(
    workspaceId: string,
  ): Promise<WorkspaceApiAnswer<WorkspaceSettingsResponse>>;
}

const KNOWN_FAILURES: readonly WorkspaceApiFailure[] = Object.freeze([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "invalid",
  "not_found",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDocRole = (value: unknown): value is DocRole =>
  typeof value === "string" && DOC_ROLES.some((role) => role === value);

function isPerson(value: unknown): value is WorkspacePerson {
  return (
    isObject(value) &&
    typeof value.userId === "string" &&
    typeof value.name === "string" &&
    isDocRole(value.role)
  );
}

function isPeopleResponse(value: unknown): value is WorkspacePeopleResponse {
  return (
    isObject(value) &&
    Array.isArray(value.people) &&
    value.people.every(isPerson)
  );
}

function isRoleResponse(value: unknown): value is WorkspaceRoleResponse {
  return isObject(value) && value.ok === true;
}

function isSettingsResponse(
  value: unknown,
): value is WorkspaceSettingsResponse {
  return (
    isObject(value) &&
    Array.isArray(value.settings) &&
    value.settings.every(
      (item) =>
        isObject(item) &&
        typeof item.key === "string" &&
        typeof item.on === "boolean" &&
        (item.value === null || typeof item.value === "string"),
    )
  );
}

async function refusalOf(response: Response): Promise<WorkspaceApiFailure> {
  const parsed = await readBody(
    response,
    (value): value is { error: string } =>
      isObject(value) && typeof value.error === "string",
  );
  const code = parsed?.value.error;
  if (code !== undefined) {
    const known = KNOWN_FAILURES.find((entry) => entry === code);
    if (known !== undefined) return known;
  }
  if (response.status === 401) return "unauthenticated";
  if (response.status === 403) return "forbidden";
  if (response.status === 404) return "not_found";
  return "refused";
}

async function ask<T>(
  send: () => Promise<Response>,
  is: (value: unknown) => value is T,
): Promise<WorkspaceApiAnswer<T>> {
  let response: Response;
  try {
    response = await send();
  } catch {
    // network refusal or offline link
    return { ok: false, code: "unreachable" };
  }
  if (!response.ok) return { ok: false, code: await refusalOf(response) };
  const parsed = await readBody(response, is);
  return parsed === null
    ? { ok: false, code: "refused" }
    : { ok: true, value: parsed.value };
}

/** Creates the HTTP client for `/api/workspace/*` over injected `fetch` and Bearer session token. */
export function createWorkspaceApi(options: {
  readonly fetch: typeof fetch;
  readonly token: () => string | null;
}): WorkspaceApi {
  const http = createHistoryHttp(options);
  return {
    people: (workspaceId) =>
      ask(
        () => http.get("/api/workspace/people", { workspaceId }),
        isPeopleResponse,
      ),
    changeRole: (workspaceId, userId, role) =>
      ask(
        () =>
          http.post("/api/workspace/people/role", {
            workspaceId,
            userId,
            role,
          }),
        isRoleResponse,
      ),
    settings: (workspaceId) =>
      ask(
        () => http.get("/api/workspace/settings", { workspaceId }),
        isSettingsResponse,
      ),
  };
}

/** Reads the current tab's Bearer token while the tab is signed in as `userId`. */
export function sessionTokenOf(userId: string): string | null {
  const person = readPerson(tabStorage());
  return person?.userId === userId ? person.token : null;
}

export interface WorkspacePeopleCacheEntry {
  readonly people: readonly WorkspacePerson[] | null;
  readonly loadError: boolean;
}

export interface WorkspacePeopleHolder {
  readonly state: Subscribable<WorkspacePeopleCacheEntry>;
  set(next: WorkspacePeopleCacheEntry): void;
}

const holders = new Map<string, WorkspacePeopleHolder>();

/** Per-session cached people list shared between the Workspace settings shell and People group. */
export function workspacePeopleHolder(
  userId: string,
  workspaceId: string,
): WorkspacePeopleHolder {
  const key = `${userId}:${workspaceId}`;
  const existing = holders.get(key);
  if (existing !== undefined) return existing;
  const value = createValue<WorkspacePeopleCacheEntry>({
    people: null,
    loadError: false,
  });
  const holder: WorkspacePeopleHolder = {
    state: value,
    set: (next) => value.set(next),
  };
  holders.set(key, holder);
  return holder;
}
