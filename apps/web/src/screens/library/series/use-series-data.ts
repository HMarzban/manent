// Live state hook for the Library's series view: seasons, episodes, target length, ladder, board card counts, people, last edited and place.
import { readEpisodes, readSeasons } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry, SeasonEntry } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { useEffect, useMemo, useState } from "react";
import type { ProjectIndex } from "../../../project/project-index.ts";
import { createDocRequestDeduper } from "../../../services/api-cache.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import type { RowPlace } from "../../../services/ports.ts";
import {
  fullNameOf,
  readContinueMap,
  readWorkspace,
} from "../../../services/sync/index-entries.ts";
import type {
  ContinueEntry,
  DocumentEntry,
} from "../../../services/sync/index-entries.ts";
import { liveMap } from "../../../services/sync/private-index.ts";
import { readPerson } from "../../../session.ts";
import {
  askProjectApi,
  computeLastEdited,
  readBoardCardsBySeason,
  readPeopleList,
  readProjectLadder,
  readTargetPages,
} from "./series-facts.ts";
import type { EpisodeLastEdited, SeriesPerson } from "./series-facts.ts";
import { useEpisodePlaces, useProjectWorkspace } from "./use-series-places.ts";

export interface SeriesState {
  readonly index: ProjectIndex;
  readonly workspaceId: string | null;
  readonly seasons: readonly SeasonEntry[];
  readonly episodes: readonly EpisodeEntry[];
  readonly targetPages: number | null;
  readonly ladder: readonly string[];
  readonly boardCardsBySeason: ReadonlyMap<string, number>;
  readonly canEdit: boolean;
  readonly people: readonly SeriesPerson[];
  readonly lastEditedByDoc: ReadonlyMap<string, EpisodeLastEdited>;
  readonly placeByDoc: ReadonlyMap<string, RowPlace>;
}

const dedupePeople = createDocRequestDeduper<unknown>();

export function useSeriesData(
  projectId: string,
  firstDocId: string | null,
): SeriesState {
  const services = useServices();
  const { api, projectIndex, openHandle, userId } = services;
  const { tabStorage, online } = useEnvironment();
  const workspaceId = useProjectWorkspace(projectId);
  const index = useMemo(
    () => projectIndex(projectId),
    [projectIndex, projectId],
  );
  useEffect(() => () => void index.close(), [index]);

  const [seasons, setSeasons] = useState<readonly SeasonEntry[]>([]);
  const [episodes, setEpisodes] = useState<readonly EpisodeEntry[]>([]);
  const [targetPages, setTargetPages] = useState<number | null>(null);
  const [ladder, setLadder] = useState<readonly string[]>([]);
  const [boardCardsBySeason, setBoardCardsBySeason] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  const [indexWritable, setIndexWritable] = useState<boolean>(true);
  const [serverAccess, setServerAccess] = useState<boolean | null>(null);
  const [people, setPeople] = useState<readonly SeriesPerson[]>([]);
  const [documents, setDocuments] = useState<
    ReadonlyMap<string, DocumentEntry>
  >(() => new Map());
  const [continued, setContinued] = useState<
    ReadonlyMap<string, ContinueEntry>
  >(() => new Map());

  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    const readAll = (doc: CrdtDoc): void => {
      if (!shown) return;
      const nextSeasons = [...readSeasons(doc).values()].toSorted(
        (a, b) => a.number - b.number,
      );
      const nextEpisodes = [...readEpisodes(doc).values()].toSorted(
        (a, b) => a.number - b.number,
      );
      setSeasons(nextSeasons);
      setEpisodes(nextEpisodes);
      setTargetPages(readTargetPages(doc));
      setLadder(readProjectLadder(doc));
      setBoardCardsBySeason(readBoardCardsBySeason(doc, nextEpisodes));
    };
    void index.handle().then(
      (handle) => {
        if (!shown) return;
        const updateAccess = (): void => {
          const { side } = handle.status.get();
          setIndexWritable(
            !side.includes("read_only") &&
              !side.includes("view_only") &&
              !side.includes("access_removed"),
          );
        };
        updateAccess();
        stops.push(handle.status.subscribe(updateAccess));
        readAll(handle.doc());
        for (const mapName of [
          "seasons",
          "episodes",
          "template",
          "ladder",
          "board",
        ] as const) {
          stops.push(
            liveMap(handle, mapName).subscribe(() => readAll(handle.doc())),
          );
        }
      },
      () => {},
    );
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [index]);

  useEffect(() => {
    let shown = true;
    setServerAccess(null);
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    const docId = indexDocId("project", projectId);
    void api.role(docId).then(async (role) => {
      if (!shown) return;
      setServerAccess(
        role === null ? null : role === "owner" || role === "edit",
      );
      if (role === null) {
        setPeople([]);
        return;
      }
      const listed = await dedupePeople(
        `people:${docId}`,
        token,
        () => askProjectApi("/api/docs/people", docId, token),
        (body) => body !== null,
      );
      if (shown) setPeople(readPeopleList(listed));
    });
    return () => {
      shown = false;
    };
  }, [api, tabStorage, userId, projectId]);

  useEffect(() => {
    if (workspaceId === null) return;
    let shown = true;
    const stops: (() => void)[] = [];
    const openedHandles: DocHandle[] = [];
    void openHandle(indexDocId("workspace", workspaceId)).then(
      (handle) => {
        if (!shown) return void handle.close();
        openedHandles.push(handle);
        const maps = {
          projects: liveMap(handle, "projects"),
          documents: liveMap(handle, "documents"),
        };
        const update = (): void => {
          if (shown) setDocuments(readWorkspace(maps).documents);
        };
        update();
        stops.push(maps.documents.subscribe(update));
      },
      () => {},
    );
    void openHandle(indexDocId("user", userId)).then(
      (handle) => {
        if (!shown) return void handle.close();
        openedHandles.push(handle);
        const map = liveMap(handle, "continue");
        const update = (): void => {
          if (shown) setContinued(readContinueMap(map));
        };
        update();
        stops.push(map.subscribe(update));
      },
      () => {},
    );
    return () => {
      shown = false;
      for (const stop of stops) stop();
      for (const handle of openedHandles) void handle.close();
    };
  }, [workspaceId, userId, openHandle]);

  const placeByDoc = useEpisodePlaces({ episodes, firstDocId, workspaceId });

  const lastEditedByDoc = useMemo(() => {
    const map = new Map<string, EpisodeLastEdited>();
    for (const ep of episodes) {
      const target = ep.docIds.script ?? ep.docIds.outline;
      if (target !== null)
        map.set(
          target,
          computeLastEdited(target, documents, continued, userId, people),
        );
    }
    return map;
  }, [episodes, documents, continued, userId, people]);

  const resolvedPeople = useMemo(() => {
    if (people.length > 0) return people;
    return [{ userId, name: fullNameOf(userId) }];
  }, [people, userId]);

  const tabPerson = readPerson(tabStorage);
  const signedIn = tabPerson?.userId === userId && tabPerson.token !== null;
  const effectiveAccess =
    online() && signedIn ? (serverAccess ?? false) : (serverAccess ?? true);

  return {
    index,
    workspaceId,
    seasons,
    episodes,
    targetPages,
    ladder,
    boardCardsBySeason,
    canEdit: indexWritable && effectiveAccess,
    people: resolvedPeople,
    lastEditedByDoc,
    placeByDoc,
  };
}
