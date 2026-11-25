// The search index port, kept in its own derived SQLite file beside the control file.

/** Schema version stored in search.sqlite's PRAGMA user_version; any mismatch rebuilds the file empty. */
export const SEARCH_INDEX_VERSION = 1;

/** File name of the derived search index beside control.sqlite. */
export const SEARCH_INDEX_FILE = "search.sqlite";

/** One indexed document's metadata, viewer-safe body text, and optional editor-only body text. */
export interface SearchEntry {
  readonly docId: string;
  /** Workspace holding the document; null for a Private-folder document outside any workspace index. */
  readonly workspaceId: string | null;
  readonly kind: string;
  /** Project kind holding the document; null when none applies. */
  readonly projectKind: string | null;
  readonly title: string;
  /** Every folder holding the document's project, ancestor folders included. */
  readonly folderIds: readonly string[];
  /** Last change instant in integer milliseconds since the epoch. */
  readonly changedAt: number;
  readonly generation: number;
  readonly seq: number;
  /** Body text visible to anyone with read access. */
  readonly text: string;
  /** Body text visible only to owners and editors (such as cuts); defaults to empty. */
  readonly editorText?: string;
}

/** A search request narrowed to the caller's allowed documents and optional metadata filters. */
export interface SearchQuery {
  /** Whole-word case-insensitive terms; every word must match. */
  readonly words: readonly string[];
  /** Exact phrase terms; every phrase must match. */
  readonly phrases: readonly string[];
  /** Optional filter on entry.kind; empty or omitted applies no kind filter. */
  readonly kinds?: readonly string[];
  /** Optional filter on entry.projectKind; when both kinds and projectKinds are non-empty, both must match. */
  readonly projectKinds?: readonly string[];
  /** Optional filter: entry.folderIds must intersect this set; empty or omitted applies no folder filter. */
  readonly folderIds?: readonly string[];
  /** Inclusive lower bound on changedAt in integer milliseconds since the epoch. */
  readonly afterAt?: number | null;
  /** Inclusive upper bound on changedAt in integer milliseconds since the epoch. */
  readonly beforeAt?: number | null;
  /** The caller's allowed readable document ids; an empty list always returns no hits. */
  readonly docIds: readonly string[];
  /** Subset of docIds where the caller holds owner or edit role and may search editorText; omitted or empty never searches editorText. */
  readonly editorDocIds?: readonly string[];
  /** Maximum number of hits to return. */
  readonly limit: number;
}

/** One ranked search hit. */
export interface SearchHit {
  readonly docId: string;
  readonly title: string;
  /** Body text around the first match, cut with "…" at truncated ends; null when the match is in the title only or no text terms were given. */
  readonly excerpt: string | null;
}

/** The generation and sequence last indexed for a document. */
export interface SearchHead {
  readonly generation: number;
  readonly seq: number;
}

/** Derived full-text search index over a workspace or local node's documents. */
export interface SearchIndex {
  put(entry: SearchEntry): void;
  remove(docId: string): void;
  /** The generation and sequence indexed for docId, or null when not indexed. */
  headOf(docId: string): SearchHead | null;
  /** Every document id currently held in the index. */
  indexedDocIds(): string[];
  /** Matching hits, best match first. */
  query(query: SearchQuery): SearchHit[];
  close(): void;
}
