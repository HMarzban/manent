// HTTP client for GET /api/search built on createHistoryHttp and validated with isSearchResponse.
import { SEARCH_QUERY_MAX_LEN, isSearchResponse } from "@manent/sync-protocol";
import type { SearchResult } from "@manent/sync-protocol";
import { createHistoryHttp, readBody } from "../history/requests.ts";

export type SearchFetchOutcome =
  | { readonly ok: true; readonly results: readonly SearchResult[] }
  | { readonly ok: false; readonly reason: "too_long" | "refused" };

/** Local IANA time zone name for date filter boundaries; falls back to UTC. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Fetches search results from `GET /api/search`.
 * Pass `workspaceId: null` for cross-workspace palette search.
 */
export async function fetchSearch(options: {
  readonly fetch: typeof fetch;
  readonly token: () => string | null;
  readonly q: string;
  readonly workspaceId: string | null;
  readonly tz?: string;
}): Promise<SearchFetchOutcome> {
  const { q, workspaceId } = options;
  if (q.length > SEARCH_QUERY_MAX_LEN) return { ok: false, reason: "too_long" };
  const http = createHistoryHttp({
    fetch: options.fetch,
    token: options.token,
  });
  const query: Record<string, string> = {
    q,
    tz: options.tz ?? localTimeZone(),
  };
  if (workspaceId !== null) query.workspaceId = workspaceId;

  let response: Response;
  try {
    response = await http.get("/api/search", query);
  } catch {
    return { ok: false, reason: "refused" };
  }
  if (response.status === 400) return { ok: false, reason: "too_long" };
  if (!response.ok) return { ok: false, reason: "refused" };
  const parsed = await readBody(response, isSearchResponse);
  if (parsed === null) return { ok: false, reason: "refused" };
  return { ok: true, results: parsed.value.results };
}
