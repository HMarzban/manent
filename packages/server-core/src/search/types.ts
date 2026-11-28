// Types for the full-text search service.
import type { SearchIndex, Storage } from "@manent/storage";
import type { HttpErrorCode, SearchResponse } from "@manent/sync-protocol";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";

export type SearchRefusal = Extract<HttpErrorCode, "bad_request" | "forbidden">;

export type SearchOutcome<T> =
  { ok: true; value: T } | { ok: false; code: SearchRefusal };

export interface SearchRequest {
  readonly q: string;
  /** Workspace slug (e.g. `"heavy"`), or null for cross-workspace palette search. */
  readonly workspaceId: string | null;
  readonly tz?: string | null;
  /** Workspace slugs the caller belongs to (from server directory) for mapping index ids back to slugs. */
  readonly knownWorkspaces?: readonly string[];
}

export interface SearchService {
  readonly hooks: SyncHooks;
  search(userId: string, request: SearchRequest): SearchOutcome<SearchResponse>;
  /** Indexes or refreshes every placed searchable document whose head or metadata changed, removing gone/tombstoned entries. */
  catchUpNow(): void;
  /** Cancels background catch-up and closes the derived search index. */
  stop(): void;
}

export interface SearchServiceOptions {
  readonly storage: Storage;
  readonly sync: () => SyncService;
  readonly clock: Clock;
  readonly searchIndex: SearchIndex;
  /** When true, runs incremental startup catch-up via `clock.schedule` one document per yield. */
  readonly scheduleCatchUp?: boolean;
  /** Debounce window before starting post-commit catch-up; defaults to 0 so test clocks run immediately. */
  readonly catchUpDebounceMs?: number;
}
