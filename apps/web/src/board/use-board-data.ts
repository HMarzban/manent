// Live state for the Board screen: project lookup, seasons, episodes, storylines, cards, writer directory and access.
import { readEpisodes, readSeasons } from "@manent/crdt";
import type {
  CrdtDoc,
  EpisodeEntry,
  JsonMapView,
  SeasonEntry,
} from "@manent/crdt";
import { CODE, indexDocId } from "@manent/sync-protocol";
import { useCallback, useEffect, useMemo, useState } from "react";
import { demoPeopleList } from "../demo/demo-bridge.ts";
import type { ProjectIndex } from "../project/project-index.ts";
import {
  askProjectApi,
  readPeopleList,
  readTargetPages,
} from "../screens/library/series/series-facts.ts";
import type { SeriesPerson } from "../screens/library/series/series-facts.ts";
import {
  createDocRequestDeduper,
  storageOfServices,
} from "../services/api-cache.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { liveMap } from "../services/sync/private-index.ts";
import { readPerson } from "../session.ts";
import {
  askIndexAccess,
  cachedBoardRole,
  useBoardProject,
} from "./board-access.ts";
import type { ProjectLookup, ServerAccess } from "./board-access.ts";
import { readBoard } from "./model.ts";
import type { BoardCard, BoardStoryline } from "./model.ts";

export type { ProjectLookup };

export interface BoardData {
  readonly lookup: ProjectLookup;
  readonly boardLoaded: boolean;
  readonly index: ProjectIndex;
  readonly seasons: readonly SeasonEntry[];
  readonly activeSeason: SeasonEntry | null;
  readonly focusedEpisodeId: string | null;
  readonly episodes: readonly EpisodeEntry[];
  readonly storylines: readonly BoardStoryline[];
  readonly cards: readonly BoardCard[];
  readonly targetPages: number | null;
  readonly people: readonly SeriesPerson[];
  readonly canEdit: boolean;
  readonly accessReady: boolean;
  readonly accessRemoved: boolean;
  /** Opens the `board` map only when `canEdit` holds; returns null for read-only or forbidden roles. */
  readonly writableBoardMap: () => Promise<JsonMapView | null>;
}

const FALLBACK_PEOPLE: readonly SeriesPerson[] = demoPeopleList();
const dedupeBoardDescribe =
  createDocRequestDeduper<Exclude<ServerAccess, "pending">>();
const dedupeBoardPeople = createDocRequestDeduper<readonly SeriesPerson[]>();

const isRemovedSide = (side: readonly string[]): boolean =>
  side.includes("access_removed") || side.includes("deleted");
const byNum = <T extends { number: number }>(xs: Iterable<T>): T[] =>
  [...xs].toSorted((a, b) => a.number - b.number);

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
  epParam: string | null = null,
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
    targetPages: number | null;
  }>({
    seasons: [],
    episodes: [],
    storylines: [],
    cards: [],
    targetPages: null,
  });
  const [people, setPeople] =
    useState<readonly SeriesPerson[]>(FALLBACK_PEOPLE);
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
          targetPages: readTargetPages(doc),
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
          ...(["seasons", "episodes", "template"] as const).map((name) =>
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
      if (result === "edit" || result === "read_only") {
        cachedBoardRole(storage, userId, projectId, result);
        void dedupeBoardPeople(
          `board-people:${docId}`,
          token,
          async () =>
            readPeopleList(
              await askProjectApi("/api/docs/people", docId, token),
            ),
          (list) => list.length > 0,
        ).then((listed) => {
          if (shown && listed.length > 0) setPeople(listed);
        });
      }
      if (shown) setServerAccess(result);
    });
    return () => {
      shown = false;
    };
  }, [notSeries, projectId, tabStorage, userId, online, neverSynced, storage]);

  const {
    seasons,
    episodes: allEpisodes,
    storylines,
    cards,
    targetPages,
  } = data;
  const focusedEpisode = useMemo(
    () =>
      epParam === null
        ? null
        : (allEpisodes.find(
            (ep) =>
              ep.id === epParam ||
              ep.docIds.script === epParam ||
              ep.docIds.outline === epParam ||
              ep.docIds.roomLog === epParam,
          ) ?? null),
    [allEpisodes, epParam],
  );
  const activeSeason = useMemo(
    () =>
      (seasonParam !== null
        ? seasons.find((s) => s.id === seasonParam)
        : undefined) ??
      (focusedEpisode !== null
        ? seasons.find((s) => s.id === focusedEpisode.seasonId)
        : undefined) ??
      seasons.at(-1) ??
      null,
    [seasons, seasonParam, focusedEpisode],
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
    focusedEpisodeId:
      focusedEpisode !== null &&
      activeSeason !== null &&
      focusedEpisode.seasonId === activeSeason.id
        ? focusedEpisode.id
        : null,
    episodes,
    storylines,
    cards,
    targetPages,
    people,
    canEdit,
    accessReady: serverAccess !== "pending",
    accessRemoved: accessDenied,
    writableBoardMap,
  };
}
