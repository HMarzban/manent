// What the search route answers, and the limits a client and server share.
import { isDocId, isDocKind } from "./doc-id.ts";
import type { DocKind } from "./doc-id.ts";

/** Maximum number of results GET /api/search returns. */
export const SEARCH_RESULT_LIMIT = 50;

/** Maximum raw character length of the `q` query parameter on GET /api/search. */
export const SEARCH_QUERY_MAX_LEN = 500;

/** One search hit returned by GET /api/search; `changedAt` is epoch ms. */
export interface SearchResult {
  docId: string;
  workspaceId: string | null;
  title: string;
  projectTitle: string | null;
  kind: DocKind;
  changedAt: number;
  excerpt: string | null;
}

/** Answer to GET /api/search, best match first. */
export interface SearchResponse {
  results: SearchResult[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

export function isSearchResult(value: unknown): value is SearchResult {
  return (
    isRecord(value) &&
    isDocId(value.docId) &&
    (value.workspaceId === null || typeof value.workspaceId === "string") &&
    typeof value.title === "string" &&
    (value.projectTitle === null || typeof value.projectTitle === "string") &&
    typeof value.kind === "string" &&
    isDocKind(value.kind) &&
    isSafeInt(value.changedAt) &&
    (value.excerpt === null || typeof value.excerpt === "string")
  );
}

export function isSearchResponse(value: unknown): value is SearchResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.results) &&
    value.results.every(isSearchResult)
  );
}
