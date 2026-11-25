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
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ProjectItem } from "../services/ports.ts";
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

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

const isDocRole = (value: unknown): value is DocRole =>
  DOC_ROLES.some((known) => known === value);

/** Asks the server for the person's role on the project index; distinguishes forbidden, read-only, edit and offline. */
async function askIndexAccess(
  docId: string,
  token: string | null,
): Promise<Exclude<ServerAccess, "pending">> {
  if (token === null) return "offline";
  const answer = await fetch("/api/docs/describe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null) return "offline";
  if (answer.status === 401 || answer.status === 403) return "forbidden";
  if (answer.status === 404) return "not_found";
  if (answer.status !== 200) return "read_only";
  const body: unknown = await answer.json().catch(() => null);
  const role = field(body, "role");
  if (!isDocRole(role)) return "read_only";
  return role === "owner" || role === "edit" ? "edit" : "read_only";
}

const SYNC_WAIT_MS = 3_000;

async function waitWorkspaceSynced(
  openHandle: (docId: string) => Promise<DocHandle>,
  workspaceId: string,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<void> {
  const handle = await openHandle(indexDocId("workspace", workspaceId)).catch(
    () => null,
  );
  if (handle === null) return;
  try {
    const settled = (): boolean => {
      const { synced, side, link } = handle.status.get();
      return synced || side.length > 0 || link === "offline";
    };
    if (settled()) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        stop();
        cancel();
        resolve();
      };
      const stop = handle.status.subscribe(() => {
        if (settled()) finish();
      });
      const cancel = schedule(finish, SYNC_WAIT_MS);
    });
  } finally {
    await handle.close();
  }
}

function useBoardProject(projectId: string): ProjectLookup {
  const { api, library, openHandle, userId } = useServices();
  const { online, schedule } = useEnvironment();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    setChecked(false);
    setWorkspaceId(null);

    void api
      .me()
      .then(async (me) => {
        if (!shown) return;
        const workspaces = me.ok ? me.me.workspaces.map(({ id }) => id) : [];
        const candidates = [...new Set([...workspaces, userId])];
        let found: string | null = null;
        for (const id of candidates) {
          const listed = library.projects(id);
          const look = (): void => {
            if (
              shown &&
              listed.get().some((project) => project.projectId === projectId)
            ) {
              found = id;
              setWorkspaceId(id);
            }
          };
          stops.push(listed.subscribe(look));
          look();
        }
        await Promise.all(
          candidates.map((id) =>
            library
              .readProjects(id)
              .then((items) => {
                if (shown && items.some((p) => p.projectId === projectId)) {
                  found = id;
                  setWorkspaceId(id);
                }
              })
              .catch(() => {}),
          ),
        );
        if (shown && found === null && online()) {
          await Promise.all(
            candidates.map((id) =>
              waitWorkspaceSynced(openHandle, id, schedule),
            ),
          );
        }
        if (shown) setChecked(true);
      })
      .catch(() => {
        if (shown) setChecked(true);
      });

    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [api, library, openHandle, online, schedule, userId, projectId]);

  const projects = useMemo(
    () => (workspaceId === null ? NO_PROJECTS : library.projects(workspaceId)),
    [library, workspaceId],
  );
  const project =
    useSubscribable(projects).find((item) => item.projectId === projectId) ??
    null;

  if (project !== null) {
    return project.kind === "series"
      ? { status: "ready", project }
      : { status: "not_series" };
  }
  return checked ? { status: "not_series" } : { status: "loading" };
}

export function useBoardData(
  projectId: string,
  seasonParam: string | null,
): BoardData {
  const { projectIndex, userId } = useServices();
  const { tabStorage, online } = useEnvironment();
  const lookup = useBoardProject(projectId);
  const index = useMemo(
    () => projectIndex(projectId),
    [projectIndex, projectId],
  );
  useEffect(() => () => void index.close(), [index]);

  const [seasons, setSeasons] = useState<readonly SeasonEntry[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<readonly EpisodeEntry[]>([]);
  const [storylines, setStorylines] = useState<readonly BoardStoryline[]>([]);
  const [cards, setCards] = useState<readonly BoardCard[]>([]);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [indexWritable, setIndexWritable] = useState(true);
  const [neverSynced, setNeverSynced] = useState(false);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const [pushForbidden, setPushForbidden] = useState(false);
  const [serverAccess, setServerAccess] = useState<ServerAccess>("pending");

  useEffect(() => {
    if (lookup.status !== "ready") {
      setBoardLoaded(false);
      return;
    }
    let shown = true;
    const stops: (() => void)[] = [];
    setBoardLoaded(false);
    setPushForbidden(false);
    setAccessRemoved(false);

    const readSeasonsAndEpisodes = (doc: CrdtDoc): void => {
      if (!shown) return;
      setSeasons(
        [...readSeasons(doc).values()].toSorted((a, b) => a.number - b.number),
      );
      setAllEpisodes(
        [...readEpisodes(doc).values()].toSorted((a, b) => a.number - b.number),
      );
    };

    void index.handle().then(
      (handle) => {
        if (!shown) return;
        const boardView = liveMap(handle, "board");
        const readBoardNow = (): void => {
          if (!shown) return;
          const snapshot = readBoard(boardView);
          setStorylines(snapshot.storylines);
          setCards(snapshot.cards);
        };
        let observedDoc = handle.doc();
        const updateStatus = (): void => {
          if (!shown) return;
          const { side, neverSynced: localOnly } = handle.status.get();
          const removed =
            side.includes("access_removed") || side.includes("deleted");
          setNeverSynced(localOnly);
          setAccessRemoved(removed);
          setIndexWritable(
            !removed &&
              !side.includes("read_only") &&
              !side.includes("view_only"),
          );
          if (handle.doc() !== observedDoc) {
            observedDoc = handle.doc();
            readSeasonsAndEpisodes(observedDoc);
            readBoardNow();
          }
        };
        updateStatus();
        readSeasonsAndEpisodes(handle.doc());
        readBoardNow();
        setBoardLoaded(true);
        stops.push(handle.status.subscribe(updateStatus));
        stops.push(
          handle.on((event) => {
            if (!shown) return;
            if (event.type === "rejected" && event.code === CODE.FORBIDDEN) {
              setPushForbidden(true);
            }
          }),
        );
        stops.push(boardView.subscribe(readBoardNow));
        for (const mapName of ["seasons", "episodes"] as const) {
          stops.push(
            liveMap(handle, mapName).subscribe(() =>
              readSeasonsAndEpisodes(handle.doc()),
            ),
          );
        }
      },
      () => {
        // index unavailable: leave empty and non-writable
        if (shown) {
          setIndexWritable(false);
          setBoardLoaded(true);
        }
      },
    );

    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [index, lookup.status]);

  useEffect(() => {
    if (lookup.status !== "ready") return;
    let shown = true;
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    if (token === null || !online()) {
      setServerAccess("offline");
      return;
    }
    setServerAccess("pending");
    void askIndexAccess(indexDocId("project", projectId), token).then(
      (result) => {
        if (shown) setServerAccess(result);
      },
    );
    return () => {
      shown = false;
    };
  }, [lookup.status, projectId, tabStorage, userId, online, neverSynced]);

  const activeSeason = useMemo(() => {
    if (seasons.length === 0) return null;
    if (seasonParam !== null) {
      const matched = seasons.find((s) => s.id === seasonParam);
      if (matched !== undefined) return matched;
    }
    // latest season by default
    return seasons.at(-1) ?? null;
  }, [seasons, seasonParam]);

  const episodes = useMemo(() => {
    if (activeSeason === null) return [];
    return allEpisodes.filter((ep) => ep.seasonId === activeSeason.id);
  }, [allEpisodes, activeSeason]);

  const accessDenied = accessRemoved || serverAccess === "forbidden";

  // fail-closed while server access check is in flight online, and strictly non-mutating for view/comment/forbidden
  const canEdit =
    !accessDenied &&
    !pushForbidden &&
    indexWritable &&
    (serverAccess === "edit" ||
      serverAccess === "offline" ||
      (serverAccess === "not_found" && neverSynced));

  const accessReady = serverAccess !== "pending";

  const writableBoardMap =
    useCallback(async (): Promise<JsonMapView | null> => {
      if (!canEdit) return null;
      try {
        return await index.map("board");
      } catch {
        return null;
      }
    }, [canEdit, index]);

  return {
    lookup,
    boardLoaded,
    index,
    seasons,
    activeSeason,
    episodes,
    storylines,
    cards,
    canEdit,
    accessReady,
    accessRemoved: accessDenied,
    writableBoardMap,
  };
}
