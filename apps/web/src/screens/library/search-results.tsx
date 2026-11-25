// Library search results view: full-text server search, Filter ▾ menu, offline title fallback, and keyboard navigation.
import {
  SEARCH_QUERY_MAX_LEN,
  SEARCH_RESULT_LIMIT,
} from "@manent/sync-protocol";
import type { SearchResult } from "@manent/sync-protocol";
import {
  LIBRARY_WORDS,
  Row,
  SEARCH_WORDS,
  createValue,
  formatWhen,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { SearchFilterMenu } from "../../search/filter-menu.tsx";
import { offlineSearchWorkspace } from "../../search/offline-search.ts";
import {
  highlightExcerpt,
  parseClientQuery,
} from "../../search/search-query.ts";
import { fetchSearch } from "../../search/search-requests.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { FolderEntry } from "../../services/sync/folders.ts";
import type { DocumentEntry } from "../../services/sync/index-entries.ts";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import { readPerson } from "../../session.ts";
import { libraryHref, useLibraryAddress } from "./library-address.ts";
import type { LibraryViewProps } from "./views.ts";

const NO_FOLDERS: Subscribable<readonly FolderEntry[]> = createValue([]);
const NO_PROJECT_FOLDERS: Subscribable<ReadonlyMap<string, string | null>> =
  createValue(new Map());
const NO_DOCS: Subscribable<ReadonlyMap<string, DocumentEntry>> = createValue(
  new Map(),
);

function kindWord(kind: SearchResult["kind"]): string {
  const known = SEARCH_WORDS.docKinds as Readonly<Record<string, string>>;
  return known[kind] ?? SEARCH_WORDS.docKinds.script;
}

/** Keeps the order of already-shown results stable for the same `(workspaceId, query)`. */
function useStableOrder(
  key: string,
  results: readonly SearchResult[],
): readonly SearchResult[] {
  const shown = useRef<{ key: string; ids: readonly string[] }>({
    key: "",
    ids: [],
  });
  return useMemo(() => {
    if (shown.current.key !== key) {
      shown.current = { key, ids: results.map((r) => r.docId) };
      return results;
    }
    if (shown.current.ids.length === 0) {
      shown.current = { key, ids: results.map((r) => r.docId) };
      return results;
    }
    const order = new Map(shown.current.ids.map((id, index) => [id, index]));
    const before = results
      .filter((item) => order.has(item.docId))
      .toSorted(
        (a, b) => (order.get(a.docId) ?? 0) - (order.get(b.docId) ?? 0),
      );
    const added = results.filter((item) => !order.has(item.docId));
    const combined = [...before, ...added];
    shown.current = { key, ids: combined.map((r) => r.docId) };
    return combined;
  }, [key, results]);
}

function ExcerptText(props: {
  readonly excerpt: string;
  readonly words: readonly string[];
  readonly phrases: readonly string[];
}): ReactNode {
  const runs = useMemo(
    () => highlightExcerpt(props.excerpt, props.words, props.phrases),
    [props.excerpt, props.words, props.phrases],
  );
  return (
    <span className="line-clamp-2 text-meta text-fg-muted">
      {runs.map((run, index) =>
        run.matched ? (
          <mark
            key={index}
            className="rounded-xs bg-subtle px-0.5 font-semibold text-fg"
          >
            {run.text}
          </mark>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </span>
  );
}

/** Workspace search results: server FTS online, local title fallback offline or on refusal, with Filter ▾. */
export function SearchResults(props: LibraryViewProps): ReactNode {
  const { workspaceId, projects } = props;
  const services = useServices();
  const environment = useEnvironment();
  const navigate = useNavigate();
  const address = useLibraryAddress();
  const rawQuery = address.q ?? "";
  const query = rawQuery.trim();
  const parsed = useMemo(() => parseClientQuery(query), [query]);

  const token = readPerson(environment.tabStorage)?.token ?? null;
  const online = environment.online();
  const workspaces = useWorkspaces(
    services.api,
    services.userId,
    token !== null,
  ).data;
  const workspaceName =
    workspaces?.find((ref) => ref.id === workspaceId)?.name ??
    LIBRARY_WORDS.yourDesk;

  const folders = useSubscribable(
    workspaceId === null ? NO_FOLDERS : services.folders.list(workspaceId),
  );
  const projectFolders = useSubscribable(
    workspaceId === null
      ? NO_PROJECT_FOLDERS
      : services.folders.projectFolders(workspaceId),
  );
  const documents = useSubscribable(
    workspaceId === null ? NO_DOCS : services.folders.documents(workspaceId),
  );

  const tooLong = rawQuery.length > SEARCH_QUERY_MAX_LEN;
  const canQueryServer =
    online &&
    token !== null &&
    !tooLong &&
    workspaceId !== null &&
    query !== "";

  const remote = useQuery({
    queryKey: ["search", services.userId, workspaceId, query],
    enabled: canQueryServer,
    queryFn: () =>
      fetchSearch({
        fetch: globalThis.fetch,
        token: () => readPerson(environment.tabStorage)?.token ?? null,
        q: query,
        workspaceId,
      }),
    retry: false,
  });

  const serverTooLong =
    tooLong ||
    (remote.data !== undefined &&
      !remote.data.ok &&
      remote.data.reason === "too_long");
  const serverRefused =
    canQueryServer &&
    (remote.isError ||
      (remote.data !== undefined &&
        !remote.data.ok &&
        remote.data.reason === "refused"));
  const offlineMode = !online || token === null;
  const useFallback = offlineMode || serverRefused;

  const offlineHits = useMemo(
    () =>
      useFallback && !serverTooLong && query !== ""
        ? offlineSearchWorkspace({
            workspaceId,
            query,
            projects,
            documents,
            folders,
            projectFolders,
          })
        : [],
    [
      useFallback,
      serverTooLong,
      workspaceId,
      query,
      projects,
      documents,
      folders,
      projectFolders,
    ],
  );

  const rawResults = serverTooLong
    ? []
    : useFallback
      ? offlineHits
      : remote.data !== undefined && remote.data.ok
        ? remote.data.results
        : [];
  const waiting = canQueryServer && remote.isPending && !serverTooLong;
  const stableResults = useStableOrder(
    `${workspaceId ?? ""}:${query}`,
    rawResults,
  );

  const listRef = useRef<HTMLDivElement>(null);
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = [
      ...(listRef.current?.querySelectorAll<HTMLElement>(
        '[role="listitem"] [role="button"], [role="listitem"] button',
      ) ?? []),
    ];
    if (rows.length === 0) return;
    const active = document.activeElement;
    const index = rows.findIndex(
      (item) => item === active || item.contains(active),
    );
    if (event.key === "ArrowDown") {
      event.preventDefault();
      rows[Math.min(rows.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index <= 0) {
        document
          .querySelector<HTMLInputElement>('[data-search-field="library"]')
          ?.focus();
      } else {
        rows[index - 1]?.focus();
      }
    }
  };

  // Keep filter updates in sync with `?q=` immediately.
  const updateQuery = (next: string): void => {
    void navigate({
      href: libraryHref({ ...address, q: next }),
      replace: true,
    });
  };

  // Focus safety when results clear.
  useEffect(() => {
    if (query === "") return;
  }, [query]);

  const nowMs = environment.now();
  const atLimit = !serverTooLong && stableResults.length >= SEARCH_RESULT_LIMIT;
  const emptySentence = parsed.hasFilterOperator
    ? SEARCH_WORDS.emptyFiltered(workspaceName, query)
    : SEARCH_WORDS.empty(workspaceName, query);

  return (
    <section
      aria-label={SEARCH_WORDS.fieldLabel}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {serverTooLong ? null : (
            <p
              role="status"
              aria-live="polite"
              className="text-ui font-semibold text-fg tabular-nums"
            >
              {waiting ? "" : SEARCH_WORDS.count(stableResults.length)}
            </p>
          )}
          {atLimit ? (
            <p className="text-meta text-fg-muted">
              {SEARCH_WORDS.limitNotice(SEARCH_RESULT_LIMIT)}
            </p>
          ) : null}
        </div>
        <SearchFilterMenu
          query={rawQuery}
          folders={folders}
          now={environment.now}
          onChangeQuery={updateQuery}
        />
      </div>

      {serverTooLong ? (
        <p role="alert" className="text-ui text-fg-muted">
          {SEARCH_WORDS.tooLong}
        </p>
      ) : (
        <>
          {offlineMode ? (
            <p role="status" className="text-meta text-fg-muted">
              {SEARCH_WORDS.offlineNotice}
            </p>
          ) : serverRefused ? (
            <p role="status" className="text-meta text-fg-muted">
              {SEARCH_WORDS.requestRefused}
            </p>
          ) : null}

          {!waiting && stableResults.length === 0 ? (
            <p className="text-ui text-fg-muted">{emptySentence}</p>
          ) : null}

          {stableResults.length === 0 ? null : (
            <div
              ref={listRef}
              role="list"
              data-search-results=""
              onKeyDown={onListKeyDown}
              className="mn-table flex min-h-0 flex-col divide-y divide-line overflow-y-auto"
            >
              {stableResults.map((hit) => (
                <div key={hit.docId} role="listitem">
                  <Row
                    onActivate={() =>
                      void navigate({ href: `/s/${hit.docId}` })
                    }
                  >
                    <span className="flex min-w-0 flex-col gap-0.5 py-2">
                      <span className="truncate font-semibold text-fg">
                        {hit.title}
                      </span>
                      <span className="truncate text-meta text-fg-muted tabular-nums">
                        {SEARCH_WORDS.resultMeta(
                          hit.projectTitle,
                          kindWord(hit.kind),
                          formatWhen(hit.changedAt, nowMs),
                        )}
                      </span>
                      {hit.excerpt === null ? null : (
                        <ExcerptText
                          excerpt={hit.excerpt}
                          words={parsed.words}
                          phrases={parsed.phrases}
                        />
                      )}
                    </span>
                  </Row>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
