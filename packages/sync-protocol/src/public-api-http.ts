// What the public API answers, and what a client sends it.
import type { DocKind } from "./doc-id.ts";

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface PublicApiFolderEntry {
  readonly folderId: string;
  readonly name: string;
}

export interface PublicApiDocumentEntry {
  readonly docId: string;
  readonly title: string;
  readonly kind: DocKind;
}

export interface PublicApiProjectEntry {
  readonly projectId: string;
  readonly title: string;
  readonly documents: readonly PublicApiDocumentEntry[];
}

export interface PublicApiFolderResponse {
  readonly folders: readonly PublicApiFolderEntry[];
  readonly projects: readonly PublicApiProjectEntry[];
}

export interface PublicApiLine {
  readonly id: string;
  readonly type: string;
  readonly text: string;
}

export interface PublicApiLinesResponse {
  readonly docId: string;
  readonly lines: readonly PublicApiLine[];
}

/** Public view of a workspace API key; never carries the secret or its hash. */
export interface ApiKeyView {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
  readonly revokedAt: number | null;
}

export interface ApiKeysListResponse {
  readonly keys: readonly ApiKeyView[];
}

export interface ApiKeyCreateRequest {
  readonly workspaceId: string;
  readonly name: string;
}

export interface ApiKeyCreateResponse {
  readonly key: string;
  readonly row: ApiKeyView;
}

export interface ApiKeyRevokeRequest {
  readonly workspaceId: string;
  readonly id: string;
}

export interface ApiKeyRevokeResponse {
  readonly ok: true;
}

export function isApiKeyCreateRequest(
  value: unknown,
): value is ApiKeyCreateRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const workspaceId: unknown = Reflect.get(value, "workspaceId");
  const name: unknown = Reflect.get(value, "name");
  return (
    typeof workspaceId === "string" &&
    WORKSPACE_ID_PATTERN.test(workspaceId) &&
    typeof name === "string"
  );
}

export function isApiKeyRevokeRequest(
  value: unknown,
): value is ApiKeyRevokeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const workspaceId: unknown = Reflect.get(value, "workspaceId");
  const id: unknown = Reflect.get(value, "id");
  return (
    typeof workspaceId === "string" &&
    WORKSPACE_ID_PATTERN.test(workspaceId) &&
    typeof id === "string" &&
    id.length > 0
  );
}
