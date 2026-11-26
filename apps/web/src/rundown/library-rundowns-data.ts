// Live state hook for a Show or News project's rundowns and nested stories in the Library.
import { observeRundown, readRundown } from "@manent/crdt";
import type { RundownJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { useEffect, useMemo, useState } from "react";
import { useLibraryAddress } from "../screens/library/library-address.ts";
import {
  askProjectApi,
  computeLastEdited,
  placeFromStatus,
  readCanEdit,
  readPeopleList,
} from "../screens/library/series/series-facts.ts";
import type {
  EpisodeLastEdited,
  SeriesPerson,
} from "../screens/library/series/series-facts.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { RowPlace } from "../services/ports.ts";
import {
  readContinueMap,
  readWorkspace,
} from "../services/sync/index-entries.ts";
import type {
  ContinueEntry,
  DocumentEntry,
} from "../services/sync/index-entries.ts";
import { liveMap } from "../services/sync/private-index.ts";
import { readPerson } from "../session.ts";
import { parseIsoDate, storiesForRundown } from "./create-rundown.ts";

export interface StoryViewItem {
  readonly docId: string;
  readonly title: string;
  readonly rowNumber: number | null;
  readonly lastEdited: EpisodeLastEdited;
  readonly place: RowPlace;
}

export interface RundownViewItem {
  readonly docId: string;
  readonly airDate: string;
  readonly airAt: number | null;
  readonly targetMs: number | null;
  readonly rowCount: number | null;
  readonly createdAt: number;
  readonly fallbackTitle: string;
  readonly lastEdited: EpisodeLastEdited;
  readonly place: RowPlace;
  readonly stories: readonly StoryViewItem[];
}

export interface RundownsData {
  readonly workspaceId: string | null;
  readonly loaded: boolean;
  readonly rundowns: readonly RundownViewItem[];
  readonly canEdit: boolean;
}

function compareRundownsByDate(a: RundownViewItem, b: RundownViewItem): number {
  const aValid = parseIsoDate(a.airDate) !== null;
  const bValid = parseIsoDate(b.airDate) !== null;
  if (aValid && bValid && a.airDate !== b.airDate)
    return b.airDate.localeCompare(a.airDate);
  if (aValid !== bValid) return aValid ? -1 : 1;
  return b.createdAt - a.createdAt || a.docId.localeCompare(b.docId);
}

function useProjectWorkspace(projectId: string): {
  readonly workspaceId: string | null;
  readonly settled: boolean;
} {
  const { api, library, userId } = useServices();
  const address = useLibraryAddress();
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    address.workspaceId,
  );
  const [settled, setSettled] = useState(address.workspaceId !== null);
  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    setSettled(address.workspaceId !== null);
    const check = (candidates: readonly string[]): void => {
      for (const id of candidates) {
        const listed = library.projects(id);
        const look = (): void => {
          if (
            shown &&
            listed.get().some((project) => project.projectId === projectId)
          ) {
            setWorkspaceId(id);
            setSettled(true);
          }
        };
        stops.push(listed.subscribe(look));
        look();
      }
    };
    if (address.workspaceId !== null) check([address.workspaceId]);
    void api.me().then(
      (me) => {
        if (!shown) return;
        const ids = me.ok ? me.me.workspaces.map((w) => w.id) : [];
        check([...ids, userId]);
        setSettled(true);
      },
      () => {
        if (shown) setSettled(true);
      },
    );
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [api, library, userId, projectId, address.workspaceId]);
  const resolved = workspaceId ?? address.workspaceId;
  return { workspaceId: resolved, settled: settled || resolved !== null };
}

/** Subscribes to a Show or News project's rundowns, their CRDT timing/rows, nested stories and device state. */
export function useRundownsData(projectId: string): RundownsData {
  const { openHandle, onDevice, userId } = useServices();
  const { tabStorage, online } = useEnvironment();
  const { workspaceId, settled: workspaceSettled } =
    useProjectWorkspace(projectId);
  const [loaded, setLoaded] = useState(false);
  const [documents, setDocuments] = useState<
    ReadonlyMap<string, DocumentEntry>
  >(() => new Map());
  const [continued, setContinued] = useState<
    ReadonlyMap<string, ContinueEntry>
  >(() => new Map());
  const [people, setPeople] = useState<readonly SeriesPerson[]>([]);
  const [serverAccess, setServerAccess] = useState<boolean | null>(null);
  const [rundownByDoc, setRundownByDoc] = useState<
    ReadonlyMap<string, RundownJSON>
  >(() => new Map());
  const [placeByDoc, setPlaceByDoc] = useState<ReadonlyMap<string, RowPlace>>(
    () => new Map(),
  );
  const [storyOnDevice, setStoryOnDevice] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (workspaceId === null) {
      setLoaded(workspaceSettled);
      return;
    }
    let shown = true;
    setLoaded(false);
    const stops: (() => void)[] = [];
    const opened: DocHandle[] = [];
    void openHandle(indexDocId("workspace", workspaceId)).then(
      (handle) => {
        if (!shown) return void handle.close();
        opened.push(handle);
        const maps = {
          projects: liveMap(handle, "projects"),
          documents: liveMap(handle, "documents"),
        };
        const update = (): void => {
          if (!shown) return;
          setDocuments(readWorkspace(maps).documents);
          setLoaded(true);
        };
        update();
        stops.push(maps.documents.subscribe(update));
      },
      () => {
        if (shown) setLoaded(true);
      },
    );
    void openHandle(indexDocId("user", userId)).then(
      (handle) => {
        if (!shown) return void handle.close();
        opened.push(handle);
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
      for (const handle of opened) void handle.close();
    };
  }, [workspaceId, workspaceSettled, userId, openHandle]);

  const rundownEntries = useMemo(
    () =>
      [...documents.entries()].filter(
        ([, entry]) =>
          entry.projectId === projectId &&
          entry.kind === "rundown" &&
          entry.trashedAt === null,
      ),
    [documents, projectId],
  );
  const rundownIdsKey = rundownEntries
    .map(([docId]) => docId)
    .toSorted()
    .join(",");

  const accessDocId =
    rundownIdsKey !== ""
      ? (rundownIdsKey.split(",")[0] ?? null)
      : loaded && workspaceId !== null && workspaceId !== userId
        ? indexDocId("workspace", workspaceId)
        : null;

  useEffect(() => {
    if (accessDocId === null) {
      if (loaded && workspaceId === userId) {
        setServerAccess(true);
        setPeople([]);
      }
      return;
    }
    let shown = true;
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    void askProjectApi("/api/docs/describe", accessDocId, token).then(
      async (described) => {
        if (!shown) return;
        setServerAccess(readCanEdit(described));
        if (described === null) return setPeople([]);
        const listed = await askProjectApi(
          "/api/docs/people",
          accessDocId,
          token,
        );
        if (shown) setPeople(readPeopleList(listed));
      },
    );
    return () => {
      shown = false;
    };
  }, [tabStorage, userId, accessDocId, loaded, workspaceId]);

  useEffect(() => {
    const rundownIds = rundownIdsKey === "" ? [] : rundownIdsKey.split(",");
    if (rundownIds.length === 0) {
      setRundownByDoc(new Map());
      setPlaceByDoc(new Map());
      return;
    }
    let shown = true;
    const stops: (() => void)[] = [];
    const opened: DocHandle[] = [];
    const person = readPerson(tabStorage);
    const signedIn = person?.userId === userId && person.token !== null;
    const isOnline = online();
    void onDevice(rundownIds)
      .then(async (held) => {
        if (!shown) return;
        const places = new Map<string, RowPlace>();
        const data = new Map<string, RundownJSON>();
        for (const docId of rundownIds) {
          if (!held.has(docId)) {
            places.set(
              docId,
              isOnline ? { kind: "on_server" } : { kind: "not_on_device" },
            );
          }
        }
        setPlaceByDoc(new Map(places));
        const toOpen = isOnline ? rundownIds : [...held];
        await Promise.all(
          toOpen.map(async (docId) => {
            try {
              const handle = await openHandle(docId);
              if (!shown) return void handle.close();
              opened.push(handle);
              const syncDoc = (): void => {
                if (!shown) return;
                data.set(docId, readRundown(handle.doc()));
                setRundownByDoc(new Map(data));
              };
              const syncPlace = (): void => {
                if (!shown) return;
                places.set(
                  docId,
                  placeFromStatus(handle.status.get(), signedIn, online()),
                );
                setPlaceByDoc(new Map(places));
              };
              syncDoc();
              syncPlace();
              stops.push(observeRundown(handle.doc(), syncDoc));
              stops.push(handle.status.subscribe(syncPlace));
            } catch {
              // keep last known place if the handle cannot open
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
  }, [rundownIdsKey, onDevice, openHandle, online, tabStorage, userId]);

  const storyIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const [docId] of rundownEntries) {
      for (const story of storiesForRundown(
        docId,
        rundownByDoc.get(docId) ?? null,
        documents,
      ))
        ids.add(story.docId);
    }
    return [...ids].toSorted().join(",");
  }, [rundownEntries, rundownByDoc, documents]);

  useEffect(() => {
    const ids = storyIdsKey === "" ? [] : storyIdsKey.split(",");
    if (ids.length === 0) {
      setStoryOnDevice(new Set());
      return;
    }
    let shown = true;
    void onDevice(ids)
      .then((held) => {
        if (shown) setStoryOnDevice(held);
      })
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [storyIdsKey, onDevice]);

  const rundowns = useMemo<readonly RundownViewItem[]>(() => {
    const person = readPerson(tabStorage);
    const signedIn = person?.userId === userId && person.token !== null;
    const isOnline = online();
    const fallbackPlace: RowPlace = isOnline
      ? { kind: "on_server" }
      : { kind: "not_on_device" };
    const storyPlace = (docId: string): RowPlace =>
      storyOnDevice.has(docId)
        ? { kind: signedIn ? "synced" : "never_synced" }
        : fallbackPlace;
    const editedOf = (id: string) =>
      computeLastEdited(id, documents, continued, userId, people);
    return rundownEntries
      .map(([docId, entry]): RundownViewItem => {
        const crdt = rundownByDoc.get(docId) ?? null;
        const stories = storiesForRundown(docId, crdt, documents).map(
          (story): StoryViewItem => ({
            ...story,
            lastEdited: editedOf(story.docId),
            place: storyPlace(story.docId),
          }),
        );
        return {
          docId,
          airDate: crdt?.rundown.airDate || entry.airDate || "",
          airAt: crdt?.rundown.airAt ?? null,
          targetMs: crdt?.rundown.targetMs ?? null,
          rowCount: crdt === null ? null : crdt.rows.length,
          createdAt: entry.createdAt,
          fallbackTitle: entry.title,
          lastEdited: editedOf(docId),
          place: placeByDoc.get(docId) ?? fallbackPlace,
          stories,
        };
      })
      .toSorted(compareRundownsByDate);
  }, [
    rundownEntries,
    rundownByDoc,
    documents,
    continued,
    userId,
    people,
    placeByDoc,
    storyOnDevice,
    tabStorage,
    online,
  ]);

  return { workspaceId, loaded, rundowns, canEdit: serverAccess ?? true };
}
