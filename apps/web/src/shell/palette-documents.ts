// Palette document source: immediate cross-workspace title matches plus asynchronous cross-workspace body matches.
import type { SearchResult, WorkspaceRef } from "@manent/sync-protocol";
import { SEARCH_WORDS, matchesQuery } from "@manent/ui";
import type { PaletteRow, PaletteSource } from "@manent/ui";
import { fetchSearch } from "../search/search-requests.ts";
import type { LibraryIndex } from "../services/ports.ts";

const DOCUMENT = "document:";

function docRow(id: string, label: string, home: string | null): PaletteRow {
  return {
    id,
    kind: "document",
    label,
    value: null,
    scopeWord: null,
    home,
    keys: null,
    checked: null,
    enabled: true,
    whyNot: null,
  };
}

export interface DocumentSourceOptions {
  readonly userId: string;
  readonly library: LibraryIndex;
  /** Known workspaces (from the server's /me list) plus the person's own desk. */
  readonly workspaces: () => readonly WorkspaceRef[];
  /** The workspace currently shown (null when outside the Library or unknown). */
  readonly currentWorkspaceId: () => string | null;
  readonly online: () => boolean;
  readonly token: () => string | null;
  readonly fetchFn?: typeof fetch;
  /** Triggered when asynchronous body search hits arrive so the palette re-renders. */
  readonly onUpdate: () => void;
}

/**
 * Answers immediately with title matches across every workspace the person belongs to,
 * then appends cross-workspace body matches from `GET /api/search` (no `workspaceId`) below them.
 */
export function createDocumentSource(
  options: DocumentSourceOptions,
): PaletteSource {
  const {
    userId,
    library,
    workspaces,
    currentWorkspaceId,
    online,
    token,
    fetchFn = globalThis.fetch,
    onUpdate,
  } = options;

  const cache = new Map<string, readonly SearchResult[]>();
  const inflight = new Set<string>();
  let latestQuery = "";

  const requestBodyMatches = (trimmed: string): void => {
    if (trimmed === "" || !online() || token() === null) return;
    if (cache.has(trimmed) || inflight.has(trimmed)) return;
    inflight.add(trimmed);
    latestQuery = trimmed;
    void fetchSearch({
      fetch: fetchFn,
      token,
      q: trimmed,
      workspaceId: null,
    }).then((outcome) => {
      inflight.delete(trimmed);
      cache.set(trimmed, outcome.ok ? outcome.results : []);
      if (latestQuery === trimmed && outcome.ok && outcome.results.length > 0)
        onUpdate();
    });
  };

  return {
    kind: "document",
    rows(query) {
      const listed = workspaces();
      const wsNames = new Map(listed.map((w) => [w.id, w.name]));
      const wsIds = [...new Set([...listed.map((w) => w.id), userId])];
      const currentWs = currentWorkspaceId() ?? listed[0]?.id ?? userId;

      const titleRows: PaletteRow[] = [];
      const seenDocIds = new Set<string>();

      for (const wsId of wsIds) {
        const otherWs = wsId === currentWs ? null : (wsNames.get(wsId) ?? null);
        for (const script of library.continueList(wsId).get()) {
          if (seenDocIds.has(script.docId)) continue;
          seenDocIds.add(script.docId);
          const home =
            otherWs === null
              ? script.projectTitle
              : SEARCH_WORDS.paletteOtherWorkspace(
                  script.projectTitle,
                  otherWs,
                );
          titleRows.push(
            docRow(`${DOCUMENT}${script.docId}`, script.title, home),
          );
        }
        for (const project of library.projects(wsId).get()) {
          if (project.firstDocId === null || seenDocIds.has(project.firstDocId))
            continue;
          seenDocIds.add(project.firstDocId);
          const home =
            otherWs === null
              ? null
              : SEARCH_WORDS.paletteOtherWorkspace(project.title, otherWs);
          titleRows.push(
            docRow(`${DOCUMENT}${project.firstDocId}`, project.title, home),
          );
        }
      }

      const matchedTitles = titleRows.filter((item) =>
        matchesQuery(query, [item.label]),
      );

      const trimmed = query.trim();
      if (trimmed === "") return matchedTitles;

      requestBodyMatches(trimmed);

      const cachedBody = cache.get(trimmed);
      if (cachedBody === undefined || cachedBody.length === 0)
        return matchedTitles;

      const shownIds = new Set(matchedTitles.map((item) => item.id));
      const bodyRows: PaletteRow[] = [];
      for (const hit of cachedBody) {
        const id = `${DOCUMENT}${hit.docId}`;
        if (shownIds.has(id)) continue;
        shownIds.add(id);
        const otherWs =
          hit.workspaceId !== null && hit.workspaceId !== currentWs
            ? (wsNames.get(hit.workspaceId) ?? null)
            : null;
        bodyRows.push(
          docRow(
            id,
            hit.title,
            SEARCH_WORDS.paletteBodyHome(hit.projectTitle, otherWs),
          ),
        );
      }

      return [...matchedTitles, ...bodyRows];
    },
  };
}
