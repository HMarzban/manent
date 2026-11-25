// Workspace API keys HTTP client and in-memory metadata cache (never caches plaintext keys).
import type {
  ApiKeyCreateResponse,
  ApiKeyRevokeResponse,
  ApiKeyView,
  ApiKeysListResponse,
} from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { createHistoryHttp, readBody } from "../history/requests.ts";

export type ApiKeysFailure =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "rate_limited"
  | "unreachable"
  | "refused";

export type ApiKeysAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ApiKeysFailure };

export interface ApiKeysApi {
  list(workspaceId: string): Promise<ApiKeysAnswer<ApiKeysListResponse>>;
  create(
    workspaceId: string,
    name: string,
  ): Promise<ApiKeysAnswer<ApiKeyCreateResponse>>;
  revoke(
    workspaceId: string,
    id: string,
  ): Promise<ApiKeysAnswer<ApiKeyRevokeResponse>>;
}

const KNOWN_FAILURES: readonly ApiKeysFailure[] = Object.freeze([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "invalid",
  "not_found",
  "rate_limited",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isApiKeyView(value: unknown): value is ApiKeyView {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "number" &&
    (value.lastUsedAt === null || typeof value.lastUsedAt === "number") &&
    (value.revokedAt === null || typeof value.revokedAt === "number")
  );
}

function isApiKeysListResponse(value: unknown): value is ApiKeysListResponse {
  return (
    isObject(value) &&
    Array.isArray(value.keys) &&
    value.keys.every(isApiKeyView)
  );
}

function isApiKeyCreateResponse(value: unknown): value is ApiKeyCreateResponse {
  return (
    isObject(value) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    isApiKeyView(value.row)
  );
}

function isApiKeyRevokeResponse(value: unknown): value is ApiKeyRevokeResponse {
  return isObject(value) && value.ok === true;
}

async function refusalOf(response: Response): Promise<ApiKeysFailure> {
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
  if (response.status === 422) return "invalid";
  if (response.status === 429) return "rate_limited";
  return "refused";
}

async function ask<T>(
  send: () => Promise<Response>,
  is: (value: unknown) => value is T,
): Promise<ApiKeysAnswer<T>> {
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

/** Creates the HTTP client for `/api/workspace/api-keys*` over injected `fetch` and Bearer session token. */
export function createApiKeysApi(options: {
  readonly fetch: typeof fetch;
  readonly token: () => string | null;
}): ApiKeysApi {
  const http = createHistoryHttp(options);
  return {
    list: (workspaceId) =>
      ask(
        () => http.get("/api/workspace/api-keys", { workspaceId }),
        isApiKeysListResponse,
      ),
    create: (workspaceId, name) =>
      ask(
        () =>
          http.post("/api/workspace/api-keys/create", { workspaceId, name }),
        isApiKeyCreateResponse,
      ),
    revoke: (workspaceId, id) =>
      ask(
        () => http.post("/api/workspace/api-keys/revoke", { workspaceId, id }),
        isApiKeyRevokeResponse,
      ),
  };
}

export interface WorkspaceApiKeysCacheEntry {
  /** Metadata rows only; plaintext API keys are never stored in this cache. */
  readonly keys: readonly ApiKeyView[] | null;
  readonly loadError: boolean;
}

export interface WorkspaceApiKeysHolder {
  readonly state: Subscribable<WorkspaceApiKeysCacheEntry>;
  set(next: WorkspaceApiKeysCacheEntry): void;
}

const holders = new Map<string, WorkspaceApiKeysHolder>();

/** Per-page-load metadata cache for a workspace's API keys; never stores secrets. */
export function workspaceApiKeysHolder(
  userId: string,
  workspaceId: string,
): WorkspaceApiKeysHolder {
  const key = `${userId}:${workspaceId}`;
  const existing = holders.get(key);
  if (existing !== undefined) return existing;
  const value = createValue<WorkspaceApiKeysCacheEntry>({
    keys: null,
    loadError: false,
  });
  const holder: WorkspaceApiKeysHolder = {
    state: value,
    set: (next) => value.set(next),
  };
  holders.set(key, holder);
  return holder;
}
