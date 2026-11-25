// Loads a rundown and its on-device stories without an editor for the Send screen, closing every handle on leave.
import { observeRundown, readRundown } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type {
  RundownExportStory,
  RundownForExport,
  RundownLayoutOptions,
  RundownPage,
} from "@manent/formats";
import type { Paper, RundownClock } from "@manent/pagination";
import type { RundownColumnId, RundownJSON } from "@manent/schema";
import { paperForRegion } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";
import { LIBRARY_WORDS, RUNDOWN_WORDS, useSubscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useRundownColumns } from "../columns.tsx";
import {
  columnsForRundown,
  formatAirDate,
  rowTitleOf,
  titleColumnOf,
} from "../dur-format.ts";
import {
  buildRundownClock,
  findProjectTitle,
  isLoadedRundown,
} from "../rundown-access.ts";
import { settledStoryReading, storyFromHandle } from "./story-loader.ts";

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_STORIES: ReadonlyMap<string, RundownExportStory> = new Map();

export type LayoutRundownPagesFn = (
  rundown: RundownForExport,
  options: RundownLayoutOptions,
) => RundownPage[];

export interface RundownSendState {
  readonly ready: boolean;
  readonly loadingStories: boolean;
  readonly rundown: RundownJSON | null;
  readonly clock: RundownClock | null;
  readonly allColumns: readonly RundownColumnId[];
  readonly titleColumn: "segment" | "story";
  readonly defaultHiddenColumns: readonly string[];
  readonly projectTitle: string;
  readonly displayTitle: string;
  readonly paper: Paper;
  readonly stories: ReadonlyMap<string, RundownExportStory>;
  readonly missingDocIds: ReadonlySet<string>;
  readonly layoutRundownPages: LayoutRundownPagesFn | null;
  back(): void;
}

/** Opens the rundown and its stories without an editor, closing every opened handle when the Send form leaves. */
export function useRundownSend(docId: string): RundownSendState {
  const services = useServices();
  const { language, now, online: envOnline, schedule } = useEnvironment();
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [rundown, setRundown] = useState<RundownJSON | null>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [loadingStories, setLoadingStories] = useState(true);
  const [stories, setStories] =
    useState<ReadonlyMap<string, RundownExportStory>>(EMPTY_STORIES);
  const [missingDocIds, setMissingDocIds] =
    useState<ReadonlySet<string>>(EMPTY_SET);
  const [layoutFn, setLayoutFn] = useState<LayoutRundownPagesFn | null>(null);
  const [connectionOffline, setConnectionOffline] = useState(false);
  const rundownHandleRef = useRef<DocHandle | null>(null);

  const doc = useMemo(() => services.documents.open(docId), [services, docId]);
  useEffect(() => () => services.documents.close(docId), [services, docId]);
  const status = useSubscribable(doc.status);
  const online =
    envOnline() && status.network === "online" && !connectionOffline;

  useEffect(() => {
    let live = true;
    let stop = (): void => {};
    void services.connection
      .then((control) => {
        if (!live) return;
        const syncMode = (): void =>
          setConnectionOffline(control.mode.get() === "offline");
        syncMode();
        stop = control.mode.subscribe(syncMode);
      })
      .catch(() => {
        // sync connection unavailable: rely on document status and envOnline
      });
    return () => {
      live = false;
      stop();
    };
  }, [services]);

  const projectKind = useSubscribable(
    useMemo(() => services.library.documentKind(docId), [services, docId]),
  );
  const fallbackTitle =
    useSubscribable(
      useMemo(() => services.library.documentTitle(docId), [services, docId]),
    ) ?? LIBRARY_WORDS.untitledScript;

  const storedColumns = rundown?.columns ?? [];
  const allColumns = useMemo(
    () => columnsForRundown(projectKind, storedColumns),
    [projectKind, storedColumns],
  );
  const titleColumn = titleColumnOf(projectKind, storedColumns);
  const columnsState = useRundownColumns(docId, allColumns);

  // Dynamic import keeps @manent/formats out of the entry chunk (R-G G2).
  useEffect(() => {
    let live = true;
    void import("@manent/formats").then((mod) => {
      if (live) setLayoutFn(() => mod.layoutRundownPages);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    let stopDoc = (): void => {};
    let stopReplaced = (): void => {};
    let stopStatus = (): void => {};
    let opened: DocHandle | null = null;
    setReady(false);
    setRundown(null);

    const readNow = (): void => {
      if (!live || opened === null) return;
      const data = readRundown(opened.doc());
      setRundown(data);
      setReady(isLoadedRundown(data, opened));
    };

    const attach = (crdtDoc: CrdtDoc): void => {
      stopDoc();
      stopDoc = observeRundown(crdtDoc, readNow);
    };

    void services
      .openHandle(docId)
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        opened = handle;
        rundownHandleRef.current = handle;
        attach(handle.doc());
        stopReplaced = handle.on((event) => {
          if (event.type !== "replaced") return;
          attach(handle.doc());
          readNow();
        });
        stopStatus = handle.status.subscribe(readNow);
        readNow();
      })
      .catch(() => {
        if (live) setReady(true);
      });

    const projectIdSource = services.library.documentProject(docId);
    const projectStops: (() => void)[] = [];
    const lookupProjectTitle = (): void => {
      const projectId = projectIdSource.get();
      if (projectId === null) return;
      void services.api.me().then((me) => {
        if (!live) return;
        const workspaces = me.ok ? me.me.workspaces.map(({ id }) => id) : [];
        for (const ws of [...workspaces, services.userId]) {
          const list = services.library.projects(ws);
          const check = (): void => {
            const title = findProjectTitle(list.get(), projectId);
            if (title !== null) setProjectTitle(title);
          };
          projectStops.push(list.subscribe(check));
          check();
        }
      });
    };
    projectStops.push(projectIdSource.subscribe(lookupProjectTitle));
    lookupProjectTitle();

    return () => {
      live = false;
      stopDoc();
      stopReplaced();
      stopStatus();
      for (const stop of projectStops) stop();
      rundownHandleRef.current = null;
      if (opened !== null) void opened.close();
    };
  }, [docId, services]);

  const storyTargets = useMemo(() => {
    if (rundown === null) return [];
    const list: { readonly docId: string; readonly title: string }[] = [];
    const seen = new Set<string>();
    for (const row of rundown.rows) {
      if (row.kind !== "script" || row.docId === null) continue;
      if (seen.has(row.docId)) continue;
      seen.add(row.docId);
      list.push({ docId: row.docId, title: rowTitleOf(row) });
    }
    return list;
  }, [rundown]);

  const storyKey = storyTargets.map((t) => `${t.docId}:${t.title}`).join("|");
  const handlesRef = useRef<Map<string, DocHandle>>(new Map());

  useEffect(() => {
    return () => {
      for (const handle of handlesRef.current.values()) void handle.close();
      handlesRef.current.clear();
    };
  }, [docId]);

  useEffect(() => {
    if (!ready || rundown === null) return;
    let live = true;
    setLoadingStories(true);

    const activeIds = new Set(storyTargets.map((t) => t.docId));
    for (const [id, handle] of handlesRef.current) {
      if (!activeIds.has(id)) {
        void handle.close();
        handlesRef.current.delete(id);
      }
    }

    const loadAll = async (): Promise<void> => {
      if (storyTargets.length === 0) {
        if (!live) return;
        setStories(EMPTY_STORIES);
        setMissingDocIds(EMPTY_SET);
        setLoadingStories(false);
        return;
      }
      const ids = storyTargets.map((t) => t.docId);
      const [held, control] = await Promise.all([
        services.onDevice(ids).catch(() => EMPTY_SET),
        services.connection.catch(() => null),
      ]);
      if (!live) return;

      const offlineNow =
        !envOnline() ||
        control?.mode.get() === "offline" ||
        rundownHandleRef.current?.status.get().link === "offline" ||
        doc.status.get().network === "offline";

      const loaded = new Map<string, RundownExportStory>();
      const missing = new Set<string>();

      for (const target of storyTargets) {
        if (!live) return;
        if (offlineNow && !held.has(target.docId)) {
          missing.add(target.docId);
          continue;
        }
        try {
          let handle = handlesRef.current.get(target.docId);
          if (handle === undefined) {
            handle = await services.openHandle(target.docId);
            if (!live) {
              void handle.close();
              return;
            }
            handlesRef.current.set(target.docId, handle);
          }
          const reading = await settledStoryReading(handle, schedule);
          if (!live) return;
          if (reading.kind === "unreadable") {
            missing.add(target.docId);
            continue;
          }
          const story = storyFromHandle(handle, target.title, reading);
          if (story !== null) loaded.set(target.docId, story);
        } catch {
          missing.add(target.docId);
        }
      }

      if (!live) return;
      setStories(loaded);
      setMissingDocIds(missing);
      setLoadingStories(false);
    };

    void loadAll();
    return () => {
      live = false;
    };
  }, [
    ready,
    rundown === null,
    storyKey,
    online,
    envOnline,
    doc,
    services,
    schedule,
  ]);

  const clock = useMemo(
    () => (rundown === null ? null : buildRundownClock(rundown, () => null)),
    [rundown],
  );

  const rawDate = rundown?.rundown.airDate || fallbackTitle;
  const formattedDate = rawDate === "" ? "" : formatAirDate(rawDate, now());
  const dateLabel = formattedDate !== "" ? formattedDate : fallbackTitle;
  const resolvedProject = projectTitle ?? fallbackTitle;
  const displayTitle =
    projectTitle !== null && dateLabel !== ""
      ? RUNDOWN_WORDS.titleBar(projectTitle, dateLabel)
      : dateLabel;

  const back = useCallback(() => {
    void navigate({ to: "/s/$docId", params: { docId }, replace: true });
  }, [navigate, docId]);

  return {
    ready,
    loadingStories,
    rundown,
    clock,
    allColumns,
    titleColumn,
    defaultHiddenColumns: columnsState.prefs.hidden,
    projectTitle: resolvedProject,
    displayTitle,
    paper: paperForRegion(language),
    stories,
    missingDocIds,
    layoutRundownPages: layoutFn,
    back,
  };
}
