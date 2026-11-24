// Live state hook for the Library's series view: seasons, episodes, target length, people, last edited and place.
import { readEpisodes, readSeasons } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry, SeasonEntry } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { useEffect, useMemo, useState } from "react";
import type { ProjectIndex } from "../../../project/project-index.ts";
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
import { useLibraryAddress } from "../library-address.ts";
import {
  askProjectApi,
  computeLastEdited,
  placeFromStatus,
  readCanEdit,
  readPeopleList,
  readTargetPages,
} from "./series-facts.ts";
import type { EpisodeLastEdited, SeriesPerson } from "./series-facts.ts";

export interface SeriesState {
  readonly index: ProjectIndex;
  readonly workspaceId: string | null;
  readonly seasons: readonly SeasonEntry[];
  readonly episodes: readonly EpisodeEntry[];
  readonly targetPages: number | null;
  readonly canEdit: boolean;
  readonly people: readonly SeriesPerson[];
  readonly lastEditedByDoc: ReadonlyMap<string, EpisodeLastEdited>;
  readonly placeByDoc: ReadonlyMap<string, RowPlace>;
}

function useProjectWorkspace(projectId: string): string | null {
  const { api, library, userId } = useServices();
  const address = useLibraryAddress();
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    address.workspaceId,
  );
  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    const check = (candidates: readonly string[]): void => {
      for (const id of candidates) {
        const listed = library.projects(id);
        const look = (): void => {
          if (
            shown &&
            listed.get().some((project) => project.projectId === projectId)
          )
            setWorkspaceId(id);
        };
        stops.push(listed.subscribe(look));
        look();
      }
    };
    if (address.workspaceId !== null) check([address.workspaceId]);
    void api.me().then((me) => {
      if (!shown) return;
      const ids = me.ok ? me.me.workspaces.map((w) => w.id) : [];
      check([...ids, userId]);
    });
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [api, library, userId, projectId, address.workspaceId]);
  return workspaceId ?? address.workspaceId;
}

export function useSeriesData(
  projectId: string,
  firstDocId: string | null,
): SeriesState {
  const { projectIndex, openHandle, onDevice, userId } = useServices();
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
  const [indexWritable, setIndexWritable] = useState<boolean>(true);
  const [serverAccess, setServerAccess] = useState<boolean | null>(null);
  const [people, setPeople] = useState<readonly SeriesPerson[]>([]);
  const [documents, setDocuments] = useState<
    ReadonlyMap<string, DocumentEntry>
  >(() => new Map());
  const [continued, setContinued] = useState<
    ReadonlyMap<string, ContinueEntry>
  >(() => new Map());
  const [placeByDoc, setPlaceByDoc] = useState<ReadonlyMap<string, RowPlace>>(
    () => new Map(),
  );

  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    const readAll = (doc: CrdtDoc): void => {
      if (!shown) return;
      setSeasons(
        [...readSeasons(doc).values()].toSorted((a, b) => a.number - b.number),
      );
      setEpisodes(
        [...readEpisodes(doc).values()].toSorted((a, b) => a.number - b.number),
      );
      setTargetPages(readTargetPages(doc));
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
        for (const mapName of ["seasons", "episodes", "template"] as const) {
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
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    const docId = indexDocId("project", projectId);
    void Promise.all([
      askProjectApi("/api/docs/describe", docId, token),
      askProjectApi("/api/docs/people", docId, token),
    ]).then(([described, listed]) => {
      if (!shown) return;
      setServerAccess(readCanEdit(described));
      setPeople(readPeopleList(listed));
    });
    return () => {
      shown = false;
    };
  }, [tabStorage, userId, projectId]);

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

  const docIdsKey = episodes
    .map((e) => e.docIds.script ?? e.docIds.outline ?? "")
    .filter((id) => id !== "")
    .join(",");
  useEffect(() => {
    const docIds = docIdsKey === "" ? [] : docIdsKey.split(",");
    if (docIds.length === 0) {
      setPlaceByDoc(new Map());
      return;
    }
    let shown = true;
    const stops: (() => void)[] = [];
    const opened: DocHandle[] = [];
    const isOnline = online();
    const person = readPerson(tabStorage);
    const signedIn = person?.userId === userId && person.token !== null;
    void onDevice(docIds)
      .then(async (held) => {
        if (!shown) return;
        const map = new Map<string, RowPlace>();
        for (const docId of docIds) {
          if (!held.has(docId)) {
            map.set(
              docId,
              isOnline ? { kind: "on_server" } : { kind: "not_on_device" },
            );
          }
        }
        setPlaceByDoc(new Map(map));
        await Promise.all(
          [...held].map(async (docId) => {
            try {
              const handle = await openHandle(docId);
              if (!shown) return void handle.close();
              opened.push(handle);
              const syncPlace = (): void => {
                if (!shown) return;
                map.set(
                  docId,
                  placeFromStatus(handle.status.get(), signedIn, online()),
                );
                setPlaceByDoc(new Map(map));
              };
              syncPlace();
              stops.push(handle.status.subscribe(syncPlace));
            } catch {
              // leave unavailable if handle cannot open
            }
          }),
        );
      })
      .catch(() => {});
    return () => {
      shown = false;
      for (const stop of stops) stop();
      for (const handle of opened) void handle.close();
    };
  }, [docIdsKey, firstDocId, onDevice, openHandle, online, tabStorage, userId]);

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

  return {
    index,
    workspaceId,
    seasons,
    episodes,
    targetPages,
    canEdit: indexWritable && (serverAccess ?? true),
    people: resolvedPeople,
    lastEditedByDoc,
    placeByDoc,
  };
}
