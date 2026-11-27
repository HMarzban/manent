// Workspace resolution and live on-device place tracking for a series's episodes.
import type { EpisodeEntry } from "@manent/crdt";
import type { DocSummary } from "@manent/sync-client";
import { useEffect, useMemo, useState } from "react";
import {
  storageOfServices,
  summariesOfServices,
} from "../../../services/api-cache.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import type { RowPlace } from "../../../services/ports.ts";
import { createDeviceMemory } from "../../../services/sync/device-memory.ts";
import { useWorkspaces } from "../../../services/use-workspaces.ts";
import { readPerson } from "../../../session.ts";
import { useLibraryAddress } from "../library-address.ts";

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

export function useProjectWorkspace(projectId: string): string | null {
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

export function useEpisodePlaces(params: {
  readonly episodes: readonly EpisodeEntry[];
  readonly firstDocId: string | null;
  readonly workspaceId: string | null;
}): ReadonlyMap<string, RowPlace> {
  const { episodes, firstDocId, workspaceId } = params;
  const services = useServices();
  const { onDevice, waitingDocuments, userId } = services;
  const { tabStorage, online } = useEnvironment();
  const [placeByDoc, setPlaceByDoc] = useState<ReadonlyMap<string, RowPlace>>(
    () => new Map(),
  );
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

  return placeByDoc;
}
