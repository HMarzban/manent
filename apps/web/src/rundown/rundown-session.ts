// Live per-rundown session: opens the CRDT handle, tracks timing, access, project people, selection and undo.
import {
  createRundownUndo,
  observeRundown,
  readRundown,
  setCell,
} from "@manent/crdt";
import type { CrdtDoc, RundownUndo } from "@manent/crdt";
import type { RundownColumnId, RundownJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { RUNDOWN_WORDS } from "@manent/ui";
import type { GridCellCoord, StatusFacts } from "@manent/ui";
import { useEffect, useRef } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { readPerson } from "../session.ts";
import { rundownActions } from "../state/rundown.store.ts";
import { registerRundownUndo } from "./handlers.ts";
import {
  EMPTY_PEOPLE,
  accessFromStatus,
  buildRundownClock,
  fetchRundownMeta,
  findProjectTitle,
  isLoadedRundown,
} from "./rundown-access.ts";
import type { RundownAccess, RundownPerson } from "./rundown-access.ts";
import {
  getRundownView,
  setRundownView,
  useRundownView,
} from "./rundown-view-store.ts";
import type { RundownViewState } from "./rundown-view-store.ts";

export { useRundownView } from "./rundown-view-store.ts";
export type { RundownViewState } from "./rundown-view-store.ts";

interface UndoEntry {
  readonly columnLabel: string;
  readonly rowNumber: number | null;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export interface RundownSessionControls {
  readonly view: RundownViewState;
  readonly online: boolean;
  setActiveCell(cell: GridCellCoord | null): void;
  setSelection(rowIds: readonly string[]): void;
  setEditingCell(editing: boolean): void;
  writeCell(
    rowId: string,
    columnId: RundownColumnId,
    value: string | number | null,
    columnLabel: string,
    rowNumber: number | null,
  ): void;
}

/**
 * Opens the rundown CRDT handle, tracks timing, access, project people, offline story availability, selection and
 * rundown undo/redo, publishing the live snapshot for `state-facts.ts`, `row-readout.tsx` and `rundown.store.ts`.
 */
export function useRundownSession(
  docId: string,
  doc: DocumentServices,
  liveDuration: (rowId: string) => number | null,
): RundownSessionControls {
  const services = useServices();
  const { now, tabStorage } = useEnvironment();
  const liveDurationRef = useRef(liveDuration);
  liveDurationRef.current = liveDuration;

  const handleRef = useRef<DocHandle | null>(null);
  const undoRef = useRef<RundownUndo | null>(null);
  const undoLabelsRef = useRef<UndoEntry[]>([]);
  const redoLabelsRef = useRef<UndoEntry[]>([]);
  const describedRef = useRef<RundownAccess | null>(null);
  const activeRef = useRef<GridCellCoord | null>(null);
  const selectedRef = useRef<ReadonlySet<string>>(EMPTY_SET);
  const editingRef = useRef(false);
  const projectTitleRef = useRef<string | null>(null);
  const peopleRef = useRef<readonly RundownPerson[]>(EMPTY_PEOPLE);
  const onDeviceRef = useRef<ReadonlySet<string>>(EMPTY_SET);
  const storyKeyRef = useRef("");

  const view =
    useRundownView(docId) ??
    ({
      ready: false,
      rundown: null,
      clock: null,
      onDevice: EMPTY_SET,
      access: accessFromStatus(doc.status.get(), null),
      people: EMPTY_PEOPLE,
      projectTitle: null,
      activeCell: null,
      selectedRowIds: EMPTY_SET,
      editingCell: false,
    } satisfies RundownViewState);

  const publish = (
    ready: boolean,
    rundown: RundownJSON | null,
    status: StatusFacts,
  ): void => {
    const clock =
      rundown === null
        ? null
        : buildRundownClock(rundown, liveDurationRef.current);
    const access = accessFromStatus(status, describedRef.current);
    setRundownView(docId, {
      ready,
      rundown,
      clock,
      onDevice: onDeviceRef.current,
      access,
      people: peopleRef.current,
      projectTitle: projectTitleRef.current,
      activeCell: activeRef.current,
      selectedRowIds: selectedRef.current,
      editingCell: editingRef.current,
    });
    const selectedIds = selectedRef.current;
    const activeRowId = activeRef.current?.rowId ?? null;
    const scriptRowSelected =
      rundown !== null &&
      rundown.rows.some(
        (row) =>
          row.kind === "script" &&
          (selectedIds.size > 0
            ? selectedIds.has(row.id)
            : row.id === activeRowId),
      );
    rundownActions.setContext(docId, {
      canEdit: access === "edit",
      selectedRows: selectedIds.size,
      scriptRowSelected,
      editingCell: editingRef.current,
    });
  };

  useEffect(() => {
    let live = true;
    let stopDoc = (): void => {};
    let stopReplaced = (): void => {};
    let stopHandleStatus = (): void => {};
    let opened: DocHandle | null = null;
    describedRef.current = null;
    activeRef.current = null;
    selectedRef.current = EMPTY_SET;
    editingRef.current = false;
    storyKeyRef.current = "";
    undoLabelsRef.current = [];
    redoLabelsRef.current = [];

    const checkOnDevice = (data: RundownJSON): void => {
      const ids = data.rows.flatMap((row) =>
        row.kind === "script" && row.docId !== null ? [row.docId] : [],
      );
      const key = ids.join(",");
      if (key === storyKeyRef.current) return;
      storyKeyRef.current = key;
      if (ids.length === 0) {
        onDeviceRef.current = EMPTY_SET;
        return;
      }
      void services
        .onDevice(ids)
        .then((held) => {
          if (!live) return;
          onDeviceRef.current = held;
          if (opened !== null) {
            const latest = readRundown(opened.doc());
            publish(isLoadedRundown(latest, opened), latest, doc.status.get());
          }
        })
        .catch(() => {
          // sync could not start: keep the last known device set
        });
    };

    const readNow = (): void => {
      if (!live || opened === null) return;
      const data = readRundown(opened.doc());
      checkOnDevice(data);
      publish(isLoadedRundown(data, opened), data, doc.status.get());
    };

    const attachDoc = (crdtDoc: CrdtDoc): void => {
      stopDoc();
      undoRef.current?.destroy();
      undoRef.current = createRundownUndo(crdtDoc, { trackedOrigins: [null] });
      stopDoc = observeRundown(crdtDoc, readNow);
    };

    const stopUndo = registerRundownUndo({
      undo() {
        const manager = undoRef.current;
        if (manager === null) return;
        manager.undo();
        const entry = undoLabelsRef.current.pop();
        if (entry === undefined) return;
        redoLabelsRef.current.push(entry);
        if (entry.rowNumber !== null) {
          services.messages.push({
            id: `rundown.undo.${now()}`,
            text: RUNDOWN_WORDS.undidCellChange(
              entry.columnLabel,
              entry.rowNumber,
            ),
            lifetime: "brief",
            ownWork: false,
            actions: [],
          });
        }
      },
      redo() {
        const manager = undoRef.current;
        if (manager === null) return;
        manager.redo();
        const entry = redoLabelsRef.current.pop();
        if (entry !== undefined) undoLabelsRef.current.push(entry);
      },
    });

    const stopStatus = doc.status.subscribe((st) => {
      if (!live) return;
      if (opened !== null) {
        const data = readRundown(opened.doc());
        publish(isLoadedRundown(data, opened), data, st);
      } else {
        publish(false, null, st);
      }
    });

    void services
      .openHandle(docId)
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        opened = handle;
        handleRef.current = handle;
        attachDoc(handle.doc());
        stopReplaced = handle.on((event) => {
          if (event.type !== "replaced") return;
          attachDoc(handle.doc());
          readNow();
        });
        stopHandleStatus = handle.status.subscribe(readNow);
        readNow();
      })
      .catch(() => {
        if (live) publish(true, null, doc.status.get());
      });

    const person = readPerson(tabStorage);
    const token = person?.userId === services.userId ? person.token : null;
    void fetchRundownMeta(docId, token).then((meta) => {
      if (!live) return;
      describedRef.current = meta.access;
      peopleRef.current = meta.people;
      if (opened !== null) readNow();
      else publish(false, null, doc.status.get());
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
            if (title !== null && title !== projectTitleRef.current) {
              projectTitleRef.current = title;
              if (opened !== null) readNow();
              else publish(false, null, doc.status.get());
            }
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
      stopUndo();
      stopStatus();
      stopDoc();
      stopReplaced();
      stopHandleStatus();
      for (const stop of projectStops) stop();
      undoRef.current?.destroy();
      undoRef.current = null;
      handleRef.current = null;
      if (opened !== null) void opened.close();
      rundownActions.setContext(docId, null);
      setRundownView(docId, null);
    };
  }, [docId, doc, services, tabStorage, now]);

  const liveKey =
    view.rundown === null
      ? ""
      : view.rundown.rows
          .map((row) => `${row.id}:${liveDuration(row.id) ?? ""}`)
          .join(",");
  const prevLiveKey = useRef(liveKey);
  useEffect(() => {
    if (prevLiveKey.current === liveKey) return;
    prevLiveKey.current = liveKey;
    const current = getRundownView(docId);
    if (current === undefined || current.rundown === null) return;
    publish(current.ready, current.rundown, doc.status.get());
  }, [docId, doc, liveKey]);

  return {
    view,
    online: doc.status.get().network === "online",
    setActiveCell(cell) {
      activeRef.current = cell;
      const current = getRundownView(docId);
      if (current !== undefined)
        publish(current.ready, current.rundown, doc.status.get());
    },
    setSelection(rowIds) {
      selectedRef.current = new Set(rowIds);
      const current = getRundownView(docId);
      if (current !== undefined)
        publish(current.ready, current.rundown, doc.status.get());
    },
    setEditingCell(editing) {
      editingRef.current = editing;
      const current = getRundownView(docId);
      if (current !== undefined)
        publish(current.ready, current.rundown, doc.status.get());
    },
    writeCell(rowId, columnId, value, columnLabel, rowNumber) {
      const handle = handleRef.current;
      if (handle === null) return;
      setCell(handle.doc(), rowId, columnId, value, {
        userId: services.userId,
        now,
      });
      undoLabelsRef.current.push({ columnLabel, rowNumber });
      redoLabelsRef.current = [];
    },
  };
}
