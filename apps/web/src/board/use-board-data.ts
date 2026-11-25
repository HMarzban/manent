// Live state for the Board screen: project lookup, seasons, episodes, storylines, cards and server-enforced edit access.
import { readEpisodes, readSeasons } from "@manent/crdt";
import type {
  CrdtDoc,
  EpisodeEntry,
  JsonMapView,
  SeasonEntry,
} from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { CODE, DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import { createValue, useSubscribable } from "@manent/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectIndex } from "../project/project-index.ts";
import {
  createDocRequestDeduper,
  storageOfServices,
} from "../services/api-cache.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ProjectItem } from "../services/ports.ts";
import { createDeviceMemory } from "../services/sync/device-memory.ts";
import { liveMap } from "../services/sync/private-index.ts";
import { readPerson } from "../session.ts";
import { readBoard } from "./model.ts";
import type { BoardCard, BoardStoryline } from "./model.ts";

type ServerAccess =
  "pending" | "edit" | "read_only" | "forbidden" | "not_found" | "offline";

export type ProjectLookup =
  | { readonly status: "loading" }
  | { readonly status: "not_series" }
  | { readonly status: "ready"; readonly project: ProjectItem };

export interface BoardData {
  readonly lookup: ProjectLookup;
  readonly boardLoaded: boolean;
  readonly index: ProjectIndex;
  readonly seasons: readonly SeasonEntry[];
  readonly activeSeason: SeasonEntry | null;
  readonly episodes: readonly EpisodeEntry[];
  readonly storylines: readonly BoardStoryline[];
  readonly cards: readonly BoardCard[];
  readonly canEdit: boolean;
  readonly accessReady: boolean;
  readonly accessRemoved: boolean;
  /** Opens the `board` map only when `canEdit` holds; returns null for read-only or forbidden roles. */
  readonly writableBoardMap: () => Promise<JsonMapView | null>;
}

const NO_PROJECTS = createValue<readonly ProjectItem[]>(Object.freeze([]));
const dedupeBoardDescribe =
  createDocRequestDeduper<Exclude<ServerAccess, "pending">>();

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

const isDocRole = (value: unknown): value is DocRole =>
  DOC_ROLES.some((known) => known === value);
const isRemovedSide = (side: readonly string[]): boolean =>
  side.includes("access_removed") || side.includes("deleted");
const byNum = <T extends { number: number }>(xs: Iterable<T>): T[] =>
  [...xs].toSorted((a, b) => a.number - b.number);
type CachedBoardRole = "edit" | "read_only";
type ServiceStorage = ReturnType<typeof storageOfServices>;
function cachedBoardRole(
  storage: ServiceStorage,
  userId: string,
  projectId: string,
  write?: CachedBoardRole,
): CachedBoardRole | null {
  const key = `manent.board.role.${userId}.${projectId}`;
  try {
    if (write !== undefined) {
      storage?.setItem(key, write);
      return write;
    }
    const raw = storage?.getItem(key);
    return raw === "edit" || raw === "read_only" ? raw : null;
  } catch {
    return null;
  }
}

async function askIndexAccess(
  docId: string,
  token: string | null,
): Promise<Exclude<ServerAccess, "pending">> {
  if (token === null) return "offline";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const answer = await fetch("/api/docs/describe", {
    method: "POST",
    headers,
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null) return "offline";
  if (answer.status === 401 || answer.status === 403) return "forbidden";
  if (answer.status === 404) return "not_found";
  if (answer.status !== 200) return "read_only";
  const role = field(await answer.json().catch(() => null), "role");
  return isDocRole(role) && (role === "owner" || role === "edit")
    ? "edit"
    : "read_only";
}

async function waitWorkspaceSynced(
  openHandle: (docId: string) => Promise<DocHandle>,
  workspaceId: string,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<void> {
  const handle = await openHandle(indexDocId("workspace", workspaceId)).catch(
    () => null,
  );
  if (handle === null) return;
  const settled = (): boolean => {
    const { synced, side, link } = handle.status.get();
    return synced || side.length > 0 || link === "offline";
  };
  try {
    if (!settled())
      await new Promise<void>((resolve) => {
        const done = (): void => (stop(), cancel(), resolve());
        const stop = handle.status.subscribe(() => settled() && done());
        const cancel = schedule(done, 3_000);
      });
  } finally {
    await handle.close();
  }
}

function useBoardProject(projectId: string): ProjectLookup {
  const services = useServices();
  const { api, library, openHandle, userId } = services;
  const { online, schedule } = useEnvironment();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    const watched = new Set<string>();
    let found: string | null = null;
    setChecked(false);
    setWorkspaceId(null);
    const claimIfFound = (id: string, items: readonly ProjectItem[]): void => {
      if (shown && items.some((p) => p.projectId === projectId)) {
        found = id;
        setWorkspaceId(id);
      }
    };
    const watch = (id: string): void => {
      if (watched.has(id)) return;
      watched.add(id);
      const listed = library.projects(id);
      const look = (): void => claimIfFound(id, listed.get());
      stops.push(listed.subscribe(look));
      look();
    };
    const cached =
      createDeviceMemory({
        local: storageOfServices(services),
        session: null,
      }).workspaces(userId) ?? [];
    for (const id of new Set([...cached.map((w) => w.id), userId])) watch(id);
    void api
      .me()
      .then(async (me) => {
        if (!shown) return;
        const ids = [
          ...new Set([
            ...(me.ok ? me.me.workspaces.map(({ id }) => id) : []),
            userId,
          ]),
        ];
        for (const id of ids) watch(id);
        if (found === null)
          await Promise.all(
            ids.map((id) =>
              library
                .readProjects(id)
                .then((items) => claimIfFound(id, items))
                .catch(() => {}),
            ),
          );
        if (shown && found === null && online())
          await Promise.all(
            ids.map((id) => waitWorkspaceSynced(openHandle, id, schedule)),
          );
      })
      .catch(() => {})
      .finally(() => shown && setChecked(true));
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [services, api, library, openHandle, online, schedule, userId, projectId]);

  const projects = useMemo(
    () => (workspaceId === null ? NO_PROJECTS : library.projects(workspaceId)),
    [library, workspaceId],
  );
  const project = useSubscribable(projects).find(
    (item) => item.projectId === projectId,
  );
  if (project !== undefined)
    return project.kind === "series"
      ? { status: "ready", project }
      : { status: "not_series" };
  return checked ? { status: "not_series" } : { status: "loading" };
}

type IndexState = {
  loaded: boolean;
  writable: boolean;
  neverSynced: boolean;
  removed: boolean;
  pushForbidden: boolean;
};
const INITIAL_INDEX_STATE: Readonly<IndexState> = Object.freeze({
  loaded: false,
  writable: true,
  neverSynced: false,
  removed: false,
  pushForbidden: false,
});

export function useBoardData(
  projectId: string,
  seasonParam: string | null,
): BoardData {
  const services = useServices();
  const { projectIndex, userId } = services;
  const { tabStorage, online } = useEnvironment();
  const lookup = useBoardProject(projectId);
  const index = useMemo(
    () => projectIndex(projectId),
    [projectIndex, projectId],
  );
  useEffect(() => () => void index.close(), [index]);

  const [data, setData] = useState<{
    seasons: readonly SeasonEntry[];
    episodes: readonly EpisodeEntry[];
    storylines: readonly BoardStoryline[];
    cards: readonly BoardCard[];
  }>({ seasons: [], episodes: [], storylines: [], cards: [] });
  const [indexState, setIndexState] = useState<IndexState>(INITIAL_INDEX_STATE);
  const [serverAccess, setServerAccess] = useState<ServerAccess>("pending");

  const isReady = lookup.status === "ready";
  useEffect(() => {
    if (!isReady) return setIndexState((s) => ({ ...s, loaded: false }));
    let shown = true;
    const stops: (() => void)[] = [];
    setIndexState(INITIAL_INDEX_STATE);
    const readSeasonsAndEpisodes = (doc: CrdtDoc): void => {
      if (shown)
        setData((d) => ({
          ...d,
          seasons: byNum(readSeasons(doc).values()),
          episodes: byNum(readEpisodes(doc).values()),
        }));
    };
    void index.handle().then(
      (handle) => {
        if (!shown) return;
        const boardView = liveMap(handle, "board");
        const readBoardNow = (): void => {
          if (shown) setData((d) => ({ ...d, ...readBoard(boardView) }));
        };
        let observedDoc = handle.doc();
        const updateStatus = (): void => {
          if (!shown) return;
          const { side, neverSynced } = handle.status.get();
          const removed = isRemovedSide(side);
          const writable =
            !removed &&
            !side.includes("read_only") &&
            !side.includes("view_only");
          setIndexState((s) => ({
            ...s,
            loaded: true,
            writable,
            neverSynced,
            removed,
          }));
          if (handle.doc() !== observedDoc) {
            observedDoc = handle.doc();
            readSeasonsAndEpisodes(observedDoc);
            readBoardNow();
          }
        };
        updateStatus();
        readSeasonsAndEpisodes(handle.doc());
        readBoardNow();
        stops.push(
          handle.status.subscribe(updateStatus),
          handle.on((event) => {
            if (
              shown &&
              event.type === "rejected" &&
              event.code === CODE.FORBIDDEN
            )
              setIndexState((s) => ({ ...s, pushForbidden: true }));
          }),
          boardView.subscribe(readBoardNow),
          ...(["seasons", "episodes"] as const).map((name) =>
            liveMap(handle, name).subscribe(() =>
              readSeasonsAndEpisodes(handle.doc()),
            ),
          ),
        );
      },
      () =>
        shown &&
        setIndexState((s) => ({ ...s, loaded: true, writable: false })),
    );
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [index, isReady]);

  const notSeries = lookup.status === "not_series";
  const storage = storageOfServices(services);
  const { neverSynced } = indexState;
  useEffect(() => {
    if (notSeries) return;
    let shown = true;
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    if (token === null || !online()) return setServerAccess("offline");
    setServerAccess("pending");
    const docId = indexDocId("project", projectId);
    void dedupeBoardDescribe(
      `board-describe:${docId}`,
      token,
      () => askIndexAccess(docId, token),
      (result) => result === "edit" || result === "read_only",
    ).then((result) => {
      if (result === "edit" || result === "read_only")
        cachedBoardRole(storage, userId, projectId, result);
      if (shown) setServerAccess(result);
    });
    return () => {
      shown = false;
    };
  }, [notSeries, projectId, tabStorage, userId, online, neverSynced, storage]);

  const { seasons, episodes: allEpisodes, storylines, cards } = data;
  const activeSeason = useMemo(
    () =>
      (seasonParam !== null
        ? seasons.find((s) => s.id === seasonParam)
        : undefined) ??
      seasons.at(-1) ??
      null,
    [seasons, seasonParam],
  );
  const episodes = useMemo(
    () =>
      activeSeason === null
        ? []
        : allEpisodes.filter((ep) => ep.seasonId === activeSeason.id),
    [allEpisodes, activeSeason],
  );
  const accessDenied = indexState.removed || serverAccess === "forbidden";
  const canEdit =
    !accessDenied &&
    !indexState.pushForbidden &&
    indexState.writable &&
    (serverAccess === "edit" ||
      (serverAccess === "offline" &&
        (neverSynced ||
          cachedBoardRole(storage, userId, projectId) === "edit")) ||
      (serverAccess === "not_found" && neverSynced));
  const writableBoardMap = useCallback(
    async (): Promise<JsonMapView | null> =>
      canEdit ? index.map("board").catch(() => null) : null,
    [canEdit, index],
  );
  return {
    lookup,
    boardLoaded: indexState.loaded,
    index,
    seasons,
    activeSeason,
    episodes,
    storylines,
    cards,
    canEdit,
    accessReady: serverAccess !== "pending",
    accessRemoved: accessDenied,
    writableBoardMap,
  };
}
