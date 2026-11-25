// Ranked FTS5 and metadata query execution over search.sqlite with viewer/editor partition isolation.
import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { SearchHit, SearchQuery } from "../ports/search.ts";
import { buildFtsQuery, extractExcerpt } from "./excerpt.ts";

const MAX_BIND = 500;

interface RankedRow {
  readonly docId: string;
  readonly title: string;
  readonly body: string;
  readonly editorBody: string | null;
  readonly changedAt: number;
  readonly score: number;
}

interface SqlRankedRow {
  readonly doc_id: string;
  readonly title: string;
  readonly body: string;
  readonly editor_body: string;
  readonly changed_at: number;
  readonly score: number;
}

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => "?").join(", ");

function filterByFolders(
  db: Database,
  allowed: ReadonlySet<string>,
  folderIds: readonly string[],
): Set<string> {
  const matched = new Set<string>();
  for (let i = 0; i < folderIds.length; i += MAX_BIND) {
    const chunk = folderIds.slice(i, i + MAX_BIND);
    const rows = db
      .query<{ doc_id: string }, SQLQueryBindings[]>(
        `SELECT DISTINCT doc_id FROM search_doc_folders WHERE folder_id IN (${placeholders(chunk.length)})`,
      )
      .all(...chunk);
    for (const { doc_id } of rows) {
      if (allowed.has(doc_id)) matched.add(doc_id);
    }
  }
  return matched;
}

function appendMetadataFilters(
  clauses: string[],
  params: SQLQueryBindings[],
  query: SearchQuery,
): void {
  const kinds = query.kinds;
  if (kinds !== undefined && kinds.length > 0) {
    clauses.push(`d.kind IN (${placeholders(kinds.length)})`);
    params.push(...kinds);
  }
  const projectKinds = query.projectKinds;
  if (projectKinds !== undefined && projectKinds.length > 0) {
    clauses.push(`d.project_kind IN (${placeholders(projectKinds.length)})`);
    params.push(...projectKinds);
  }
  if (query.afterAt !== undefined && query.afterAt !== null) {
    clauses.push("d.changed_at >= ?");
    params.push(query.afterAt);
  }
  if (query.beforeAt !== undefined && query.beforeAt !== null) {
    clauses.push("d.changed_at <= ?");
    params.push(query.beforeAt);
  }
}

function queryPartition(options: {
  readonly db: Database;
  readonly table: "search_fts" | "search_editor_fts";
  readonly weights: string;
  readonly match: string;
  readonly query: SearchQuery;
  readonly allowed: ReadonlySet<string>;
  readonly includeEditorBody: boolean;
  readonly limit: number;
}): RankedRow[] {
  const {
    db,
    table,
    weights,
    match,
    query,
    allowed,
    includeEditorBody,
    limit,
  } = options;
  if (allowed.size === 0 || limit <= 0) return [];
  const clauses: string[] = [`${table} MATCH ?`];
  const params: SQLQueryBindings[] = [match];
  appendMetadataFilters(clauses, params, query);
  const inlineIds = allowed.size <= MAX_BIND;
  if (inlineIds) {
    const ids = [...allowed];
    clauses.push(`d.doc_id IN (${placeholders(ids.length)})`);
    params.push(...ids);
  }
  const limitClause = inlineIds ? " LIMIT ?" : "";
  if (inlineIds) params.push(limit);
  const sql = `SELECT d.doc_id, d.title, d.body, d.editor_body, d.changed_at, bm25(${table}, ${weights}) AS score
    FROM ${table}
    JOIN search_docs d ON d.rowid = ${table}.rowid
    WHERE ${clauses.join(" AND ")}
    ORDER BY score ASC, d.changed_at DESC, d.doc_id ASC${limitClause}`;
  const results: RankedRow[] = [];
  for (const row of db
    .query<SqlRankedRow, SQLQueryBindings[]>(sql)
    .iterate(...params)) {
    if (!inlineIds && !allowed.has(row.doc_id)) continue;
    results.push({
      docId: row.doc_id,
      title: row.title,
      body: row.body,
      editorBody: includeEditorBody ? row.editor_body : null,
      changedAt: row.changed_at,
      score: row.score,
    });
    if (results.length >= limit) break;
  }
  return results;
}

function queryWithoutText(
  db: Database,
  query: SearchQuery,
  allowed: ReadonlySet<string>,
  limit: number,
): SearchHit[] {
  if (allowed.size === 0 || limit <= 0) return [];
  const clauses: string[] = [];
  const params: SQLQueryBindings[] = [];
  appendMetadataFilters(clauses, params, query);
  const inlineIds = allowed.size <= MAX_BIND;
  if (inlineIds) {
    const ids = [...allowed];
    clauses.push(`d.doc_id IN (${placeholders(ids.length)})`);
    params.push(...ids);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limitClause = inlineIds ? " LIMIT ?" : "";
  if (inlineIds) params.push(limit);
  const sql = `SELECT d.doc_id, d.title FROM search_docs d ${where} ORDER BY d.changed_at DESC, d.doc_id ASC${limitClause}`;
  const hits: SearchHit[] = [];
  for (const row of db
    .query<{ doc_id: string; title: string }, SQLQueryBindings[]>(sql)
    .iterate(...params)) {
    if (!inlineIds && !allowed.has(row.doc_id)) continue;
    hits.push({ docId: row.doc_id, title: row.title, excerpt: null });
    if (hits.length >= limit) break;
  }
  return hits;
}

const compareRanked = (a: RankedRow, b: RankedRow): number =>
  a.score - b.score ||
  b.changedAt - a.changedAt ||
  (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0);

/** Runs a SearchQuery over db, physically isolating viewer-only documents from editor_body. */
export function runSearchQuery(db: Database, query: SearchQuery): SearchHit[] {
  const limit = Math.floor(query.limit);
  if (limit <= 0 || query.docIds.length === 0) return [];
  const plan = buildFtsQuery(query.words, query.phrases);
  if (plan.kind === "impossible") return [];

  let allowed = new Set(query.docIds);
  if (query.folderIds !== undefined && query.folderIds.length > 0) {
    allowed = filterByFolders(db, allowed, query.folderIds);
    if (allowed.size === 0) return [];
  }
  if (plan.kind === "none") return queryWithoutText(db, query, allowed, limit);

  const editorAllowed = new Set<string>();
  for (const id of query.editorDocIds ?? []) {
    if (allowed.has(id)) editorAllowed.add(id);
  }
  const viewerOnly = new Set<string>();
  for (const id of allowed) {
    if (!editorAllowed.has(id)) viewerOnly.add(id);
  }

  const viewerHits = queryPartition({
    db,
    table: "search_fts",
    weights: "10.0, 1.0",
    match: plan.match,
    query,
    allowed: viewerOnly,
    includeEditorBody: false,
    limit,
  });
  const editorHits = queryPartition({
    db,
    table: "search_editor_fts",
    weights: "10.0, 1.0, 0.8",
    match: plan.match,
    query,
    allowed: editorAllowed,
    includeEditorBody: true,
    limit,
  });

  return [...viewerHits, ...editorHits]
    .toSorted(compareRanked)
    .slice(0, limit)
    .map((row) => ({
      docId: row.docId,
      title: row.title,
      excerpt: extractExcerpt({
        body: row.body,
        editorBody: row.editorBody,
        words: query.words,
        phrases: query.phrases,
      }),
    }));
}
