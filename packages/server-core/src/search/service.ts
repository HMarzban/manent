// The search service: session-end and post-seed indexing, query parsing, strict server-side access filtering, and shutdown.
import type { CrdtDoc } from "@manent/crdt";
import type { SearchIndex, Storage } from "@manent/storage";
import {
  SEARCH_QUERY_MAX_LEN,
  SEARCH_RESULT_LIMIT,
  indexDocId,
  isDocKind,
} from "@manent/sync-protocol";
import type {
  DocKind,
  HttpErrorCode,
  SearchResponse,
  SearchResult,
} from "@manent/sync-protocol";
import { createSessions } from "../history/sessions.ts";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";
import { SEARCH_EXTRACTORS } from "./extractors.ts";
import {
  allWorkspaceIndexIds,
  collectAllMetadata,
  fallbackMeta,
  loadDocFromStorage,
  metaFingerprint,
  readPrivateFolderMetadata,
  readWorkspaceMetadata,
  resolveFolderIds,
} from "./metadata.ts";
import type { FolderInfo, IndexedDocMeta } from "./metadata.ts";
import { parseSearchQuery } from "./query-parser.ts";

const SESSION_IDLE_MS = 600_000;
const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

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
}

const refused = (code: SearchRefusal) => ({ ok: false, code }) as const;

function extractForKind(
  kind: DocKind,
  doc: CrdtDoc,
): { text: string; editorText: string } | null {
  const matching = SEARCH_EXTRACTORS.filter((e) => e.kind === kind);
  if (matching.length === 0) return null;
  const text = matching[0]!.text(doc);
  const editorText = matching
    .map((e) => e.editorText?.(doc) ?? "")
    .filter((s) => s.length > 0)
    .join("\n");
  return { text, editorText };
}

export function createSearchService(
  options: SearchServiceOptions,
): SearchService {
  const { storage, sync, clock, searchIndex } = options;
  /** Last indexed metadata fingerprint per docId so title/folder renames refresh even when body seq is unchanged. */
  const metaCache = new Map<string, string>();
  let stopped = false;
  let cancelCatchUp: (() => void) | null = null;
  let pendingQueue: string[] = [];
  let catchUpMeta: Map<string, IndexedDocMeta> | null = null;

  function indexDoc(
    docId: string,
    meta: IndexedDocMeta | null,
    liveRoom?: Room,
  ): void {
    if (stopped) return;
    if (storage.directory.tombstoneOf(docId) !== null) {
      searchIndex.remove(docId);
      metaCache.delete(docId);
      return;
    }
    const place = storage.directory.placeOf(docId);
    if (place === null || !isDocKind(place.kind)) {
      searchIndex.remove(docId);
      metaCache.delete(docId);
      return;
    }
    const kind = place.kind;
    if (!SEARCH_EXTRACTORS.some((e) => e.kind === kind)) return;
    const resolvedMeta = meta ?? fallbackMeta(docId, kind, storage);
    const fingerprint = metaFingerprint(resolvedMeta);
    const head = searchIndex.headOf(docId);
    if (liveRoom !== undefined && liveRoom.doc !== null) {
      const { generation, headSeq } = liveRoom.row;
      if (
        head !== null &&
        head.generation === generation &&
        head.seq === headSeq &&
        metaCache.get(docId) === fingerprint
      )
        return;
      const extracted = extractForKind(kind, liveRoom.doc);
      if (extracted === null) return;
      searchIndex.put({
        docId,
        workspaceId: resolvedMeta.workspaceIndexId,
        kind,
        projectKind: resolvedMeta.projectKind,
        title: resolvedMeta.title,
        folderIds: resolvedMeta.folderIds,
        changedAt: resolvedMeta.changedAt,
        generation,
        seq: headSeq,
        text: extracted.text,
        editorText: extracted.editorText,
      });
      metaCache.set(docId, fingerprint);
      return;
    }
    const logRow = storage.open(place.home).log.get(docId);
    if (logRow === null) return;
    if (
      head !== null &&
      head.generation === logRow.generation &&
      head.seq === logRow.headSeq &&
      metaCache.get(docId) === fingerprint
    )
      return;
    const loaded = loadDocFromStorage(storage, docId, place.home);
    if (loaded === null) return;
    try {
      const extracted = extractForKind(kind, loaded.doc);
      if (extracted === null) return;
      searchIndex.put({
        docId,
        workspaceId: resolvedMeta.workspaceIndexId,
        kind,
        projectKind: resolvedMeta.projectKind,
        title: resolvedMeta.title,
        folderIds: resolvedMeta.folderIds,
        changedAt: resolvedMeta.changedAt,
        generation: loaded.generation,
        seq: loaded.seq,
        text: extracted.text,
        editorText: extracted.editorText,
      });
      metaCache.set(docId, fingerprint);
    } finally {
      loaded.doc.destroy();
    }
  }

  function pruneStaleEntries(): void {
    for (const docId of searchIndex.indexedDocIds()) {
      if (
        storage.directory.tombstoneOf(docId) !== null ||
        storage.directory.placeOf(docId) === null
      ) {
        searchIndex.remove(docId);
        metaCache.delete(docId);
      }
    }
  }

  function collectSearchableIds(): string[] {
    const ids: string[] = [];
    for (const home of storage.directory.homes()) {
      for (const docId of storage.directory.documentsIn(home)) {
        if (storage.directory.tombstoneOf(docId) !== null) continue;
        const place = storage.directory.placeOf(docId);
        if (
          place !== null &&
          isDocKind(place.kind) &&
          SEARCH_EXTRACTORS.some((e) => e.kind === place.kind)
        )
          ids.push(docId);
      }
    }
    return ids;
  }

  function catchUpNow(): void {
    if (stopped) return;
    pruneStaleEntries();
    const metaByDoc = collectAllMetadata(storage);
    for (const docId of collectSearchableIds())
      indexDoc(docId, metaByDoc.get(docId) ?? null);
  }

  function stepCatchUp(): void {
    cancelCatchUp = null;
    if (stopped) return;
    const docId = pendingQueue.shift();
    if (docId === undefined) {
      catchUpMeta = null;
      return;
    }
    const metaByDoc = catchUpMeta ?? collectAllMetadata(storage);
    indexDoc(docId, metaByDoc.get(docId) ?? null);
    if (pendingQueue.length > 0 && !stopped)
      cancelCatchUp = clock.schedule(stepCatchUp, 0);
    else catchUpMeta = null;
  }

  function triggerCatchUp(): void {
    if (stopped || cancelCatchUp !== null) return;
    pruneStaleEntries();
    catchUpMeta = collectAllMetadata(storage);
    pendingQueue = collectSearchableIds();
    if (pendingQueue.length > 0) cancelCatchUp = clock.schedule(stepCatchUp, 0);
    else catchUpMeta = null;
  }

  function refreshRoom(room: Room): void {
    if (stopped) return;
    if (room.kind === "index") {
      if (options.scheduleCatchUp === true) triggerCatchUp();
      return;
    }
    if (!SEARCH_EXTRACTORS.some((e) => e.kind === room.kind)) return;
    const metaByDoc = collectAllMetadata(storage);
    indexDoc(room.docId, metaByDoc.get(room.docId) ?? null, room);
  }

  const sessions = createSessions({
    clock,
    idleMs: SESSION_IDLE_MS,
    ended: (room) => refreshRoom(room),
  });

  const hooks: SyncHooks = {
    committed(committed) {
      sessions.committed(committed);
      if (committed.room.kind === "index" && options.scheduleCatchUp === true)
        triggerCatchUp();
    },
    editorLeft: sessions.editorLeft,
    forgotten: (room) => refreshRoom(room),
  };

  function search(
    userId: string,
    request: SearchRequest,
  ): SearchOutcome<SearchResponse> {
    if (
      request.q.trim().length === 0 ||
      request.q.length > SEARCH_QUERY_MAX_LEN
    )
      return refused("bad_request");
    if (request.workspaceId !== null && !WORKSPACE_ID.test(request.workspaceId))
      return refused("bad_request");

    const parsed = parseSearchQuery(request.q, request.tz);
    const access = sync().access;
    const indexIdToSlug = new Map<string, string>();
    for (const slug of request.knownWorkspaces ?? [])
      indexIdToSlug.set(indexDocId("workspace", slug), slug);
    if (request.workspaceId !== null)
      indexIdToSlug.set(
        indexDocId("workspace", request.workspaceId),
        request.workspaceId,
      );

    const folderMaps: ReadonlyMap<string, FolderInfo>[] = [];
    const candidates = new Map<string, IndexedDocMeta>();

    if (request.workspaceId !== null) {
      const wsIndexId = indexDocId("workspace", request.workspaceId);
      if (!access.resolve(userId, wsIndexId).ok) return refused("forbidden");
      const ws = readWorkspaceMetadata(storage, wsIndexId);
      folderMaps.push(ws.folders);
      for (const [docId, meta] of ws.docs) candidates.set(docId, meta);
    } else {
      for (const wsIndexId of allWorkspaceIndexIds(storage)) {
        if (!access.resolve(userId, wsIndexId).ok) continue;
        const ws = readWorkspaceMetadata(storage, wsIndexId);
        folderMaps.push(ws.folders);
        for (const [docId, meta] of ws.docs) candidates.set(docId, meta);
      }
      for (const [docId, meta] of readPrivateFolderMetadata(storage, userId)) {
        if (!candidates.has(docId)) candidates.set(docId, meta);
      }
    }

    if (parsed.unsatisfiable) return { ok: true, value: { results: [] } };

    const folderIds = resolveFolderIds(parsed.folderNames, folderMaps);
    if (folderIds === null) return { ok: true, value: { results: [] } };

    const docIds: string[] = [];
    const editorDocIds: string[] = [];
    const resolvedKinds = new Map<string, DocKind>();
    for (const [docId, meta] of candidates) {
      if (storage.trash.get(docId) !== null) continue;
      const resolved = access.resolve(userId, docId);
      if (!resolved.ok) continue;
      if (
        !isDocKind(resolved.kind) ||
        !SEARCH_EXTRACTORS.some((e) => e.kind === resolved.kind)
      )
        continue;
      indexDoc(docId, meta);
      docIds.push(docId);
      resolvedKinds.set(docId, resolved.kind);
      if (resolved.access.role === "owner" || resolved.access.role === "edit")
        editorDocIds.push(docId);
    }

    if (docIds.length === 0) return { ok: true, value: { results: [] } };

    const hits = searchIndex.query({
      words: parsed.words,
      phrases: parsed.phrases,
      kinds: parsed.kinds,
      projectKinds: parsed.projectKinds,
      folderIds,
      afterAt: parsed.afterAt,
      beforeAt: parsed.beforeAt,
      docIds,
      editorDocIds,
      limit: SEARCH_RESULT_LIMIT,
    });

    const results: SearchResult[] = [];
    for (const hit of hits) {
      const meta = candidates.get(hit.docId);
      if (meta === undefined) continue;
      const slug =
        meta.workspaceIndexId === null
          ? null
          : (indexIdToSlug.get(meta.workspaceIndexId) ?? request.workspaceId);
      results.push({
        docId: hit.docId,
        workspaceId: slug,
        title: meta.title,
        projectTitle: meta.projectTitle,
        kind: resolvedKinds.get(hit.docId) ?? meta.kind,
        changedAt: meta.changedAt,
        excerpt: hit.excerpt,
      });
    }
    return { ok: true, value: { results } };
  }

  if (options.scheduleCatchUp === true)
    cancelCatchUp = clock.schedule(() => {
      cancelCatchUp = null;
      triggerCatchUp();
    }, 0);

  return {
    hooks,
    search,
    catchUpNow,
    stop() {
      stopped = true;
      cancelCatchUp?.();
      cancelCatchUp = null;
      pendingQueue = [];
      catchUpMeta = null;
      searchIndex.close();
    },
  };
}
