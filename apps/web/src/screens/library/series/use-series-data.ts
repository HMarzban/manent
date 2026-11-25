// Live state hook for the Library's series view: seasons, episodes, target length, people, last edited and place.
import { readEpisodes, readSeasons } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry, SeasonEntry } from "@manent/crdt";
import type { DocHandle, DocSummary } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { useEffect, useMemo, useState } from "react";
import type { ProjectIndex } from "../../../project/project-index.ts";
import {
  createDocRequestDeduper,
  storageOfServices,
  summariesOfServices,
} from "../../../services/api-cache.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import type { RowPlace } from "../../../services/ports.ts";
import { createDeviceMemory } from "../../../services/sync/device-memory.ts";
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
import { useWorkspaces } from "../../../services/use-workspaces.ts";
import { readPerson } from "../../../session.ts";
import { useLibraryAddress } from "../library-address.ts";
import {
  askProjectApi,
  computeLastEdited,
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

const dedupePeople = createDocRequestDeduper<unknown>();

function placeFromSummary(
  summary: DocSummary | undefined,
  signedIn: boolean,
  isOnline: boolean,
): RowPlace {
  if (summary === undefined)
    return isOnline ? { kind: "on_server" } : { kind: "not_on_device" };
  if (summary.parked !== null) return { kind: "not_on_device" };
  if (summary.neverSynced && summary.waiting === 0) {
    if (!signedIn) return { kind: "never_synced" };
    return isOnline ? { kind: "on_server" } : { kind: "not_on_device" };
  }
  if (summary.waiting > 0) return { kind: "waiting", count: summary.waiting };
  return { kind: "synced" };
}

function useProjectWorkspace(projectId: string): string | null {
  const services = useServices();
  const { api, library, userId } = services;
  const { tabStorage } = useEnvironment();
  const address = useLibraryAddress();
  const person = readPerson(tabStorage);
  const signedIn = person?.userId === userId && person.token !== null;
  const cached = useMemo(
    () =>
      signedIn
        ? createDeviceMemory({
            local: storageOfServices(services),
            session: null,
          }).workspaces(userId)
        : null,
    [services, userId, signedIn],
  );
  const me = useWorkspaces(api, userId, signedIn, { cached });
  const candidateKey = useMemo(() => {
    const ids = (me.data ?? []).map((w) => w.id);
    const list =
      address.workspaceId === null
        ? [...ids, userId]
        : [address.workspaceId, ...ids, userId];
    return [...new Set(list)].join(",");
  }, [me.data, address.workspaceId, userId]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    address.workspaceId,
  );
  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    const candidates = candidateKey === "" ? [] : candidateKey.split(",");
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
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [library, projectId, candidateKey]);
  return workspaceId ?? address.workspaceId;
}

export function useSeriesData(
  projectId: string,
  firstDocId: string | null,
): SeriesState {
  const services = useServices();
  const { api, projectIndex, openHandle, onDevice, waitingDocuments, userId } =
    services;
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
      api.role(docId),
      dedupePeople(
        `people:${docId}`,
        token,
        () => askProjectApi("/api/docs/people", docId, token),
        (body) => body !== null,
      ),
    ]).then(([role, listed]) => {
      if (!shown) return;
      setServerAccess(
        role === null ? null : role === "owner" || role === "edit",
      );
      setPeople(readPeopleList(listed));
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
    let loadSeq = 0;
    let connOffline = false;
    const person = readPerson(tabStorage);
    const signedIn = person?.userId === userId && person.token !== null;
    const reload = (): void => {
      const seq = ++loadSeq;
      const isOnline = online() && !connOffline;
      void (async () => {
        const summaries = await summariesOfServices(services);
        if (!shown || seq !== loadSeq) return;
        if (summaries !== null) {
          const byId = new Map(summaries.map((s) => [s.docId, s]));
          const map = new Map<string, RowPlace>();
          for (const docId of docIds)
            map.set(
              docId,
              placeFromSummary(byId.get(docId), signedIn, isOnline),
            );
          setPlaceByDoc(map);
          return;
        }
        // fallback for synthetic test services without an underlying sync client
        const [held, waiting] = await Promise.all([
          onDevice(docIds),
          waitingDocuments().catch(() => []),
        ]);
        if (!shown || seq !== loadSeq) return;
        const waitingMap = new Map(waiting.map((w) => [w.docId, w.waiting]));
        const map = new Map<string, RowPlace>();
        for (const docId of docIds) {
          if (!held.has(docId)) {
            map.set(
              docId,
              isOnline ? { kind: "on_server" } : { kind: "not_on_device" },
            );
          } else {
            const count = waitingMap.get(docId) ?? 0;
            map.set(
              docId,
              count > 0 ? { kind: "waiting", count } : { kind: "synced" },
            );
          }
        }
        setPlaceByDoc(map);
      })().catch(() => {});
    };
    const stops: (() => void)[] = [];
    void services.connection
      .then((conn) => {
        if (!shown) return;
        const onMode = (): void => {
          connOffline = conn.mode.get() === "offline";
          reload();
        };
        onMode();
        stops.push(conn.mode.subscribe(onMode));
      })
      .catch(() => {});
    if (workspaceId !== null) {
      stops.push(
        services.library.projects(workspaceId).subscribe(reload),
        services.library.continueList(workspaceId).subscribe(reload),
      );
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", reload);
      window.addEventListener("offline", reload);
      stops.push(() => {
        window.removeEventListener("online", reload);
        window.removeEventListener("offline", reload);
      });
    }
    reload();
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [
    docIdsKey,
    firstDocId,
    workspaceId,
    services,
    onDevice,
    waitingDocuments,
    online,
    tabStorage,
    userId,
  ]);

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
