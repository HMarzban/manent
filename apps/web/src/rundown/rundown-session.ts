// Live per-rundown session: opens CRDT or read-only ViewHandle, tracks timing, access, people, selection and undo.
import type { RundownUndo } from "@manent/crdt";
import type { RundownColumnId, RundownJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import type { GridCellCoord, StatusFacts } from "@manent/ui";
import { useEffect, useRef } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { readPerson } from "../session.ts";
import { rundownActions } from "../state/rundown.store.ts";
import type { RundownUndoEntry } from "./handlers.ts";
import {
  EMPTY_PEOPLE,
  accessFromStatus,
  fetchRundownMeta,
} from "./rundown-access.ts";
import type { RundownAccess, RundownPerson } from "./rundown-access.ts";
import {
  bindRundownSessionUndo,
  createOnDeviceTracker,
  openRundownSessionHandle,
  publishRundownSnapshot,
  watchProjectTitle,
  writeRundownCell,
} from "./rundown-view-session.ts";
import {
  getRundownView,
  setRundownView,
  useRundownView,
} from "./rundown-view-store.ts";
import type { RundownViewState } from "./rundown-view-store.ts";

export { useRundownView } from "./rundown-view-store.ts";
export type { RundownViewState } from "./rundown-view-store.ts";
export type { RundownUndoEntry } from "./handlers.ts";

const EMPTY_SET: ReadonlySet<string> = new Set();

export interface RundownSessionControls {
  readonly view: RundownViewState;
  readonly online: boolean;
  getHandle(): DocHandle | null;
  recordUndo(entry: RundownUndoEntry): void;
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
 * Opens the rundown CRDT handle (or attaches its read-only `ViewHandle` for `Can view` / `Can comment`),
 * tracking timing, access, project people, offline story availability, selection and rundown undo/redo.
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
  const undoLabelsRef = useRef<RundownUndoEntry[]>([]);
  const redoLabelsRef = useRef<RundownUndoEntry[]>([]);
  const describedRef = useRef<RundownAccess | null>(null);
  const activeRef = useRef<GridCellCoord | null>(null);
  const selectedRef = useRef<ReadonlySet<string>>(EMPTY_SET);
  const editingRef = useRef(false);
  const projectTitleRef = useRef<string | null>(null);
  const peopleRef = useRef<readonly RundownPerson[]>(EMPTY_PEOPLE);
  const onDeviceRef = useRef<ReadonlySet<string>>(EMPTY_SET);

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
    publishRundownSnapshot({
      docId,
      ready,
      rundown,
      status,
      described: describedRef.current,
      liveDuration: liveDurationRef.current,
      onDevice: onDeviceRef.current,
      people: peopleRef.current,
      projectTitle: projectTitleRef.current,
      activeCell: activeRef.current,
      selectedRowIds: selectedRef.current,
      editingCell: editingRef.current,
    });
  };
  const republishCurrent = (): void => {
    const current = getRundownView(docId);
    if (current !== undefined)
      publish(current.ready, current.rundown, doc.status.get());
  };

  useEffect(() => {
    let live = true;
    describedRef.current = null;
    activeRef.current = null;
    selectedRef.current = EMPTY_SET;
    editingRef.current = false;
    undoLabelsRef.current = [];
    redoLabelsRef.current = [];

    let readHandle = (): void => {};
    const checkOnDevice = createOnDeviceTracker({
      services,
      isLive: () => live,
      onChange(held) {
        onDeviceRef.current = held;
        readHandle();
      },
    });

    const sessionHandle = openRundownSessionHandle({
      docId,
      services,
      onHandle(handle) {
        handleRef.current = handle;
      },
      onUndo(undo) {
        undoRef.current = undo;
      },
      onOnDevice: checkOnDevice,
      onSnapshot(ready, rundown) {
        if (live) publish(ready, rundown, doc.status.get());
      },
    });
    readHandle = sessionHandle.readNow;

    const stopUndo = bindRundownSessionUndo({
      docId,
      services,
      getUndo: () => undoRef.current,
      undoLabels: undoLabelsRef,
      redoLabels: redoLabelsRef,
    });
    const stopStatus = doc.status.subscribe(() => readHandle());

    const person = readPerson(tabStorage);
    const token = person?.userId === services.userId ? person.token : null;
    void fetchRundownMeta(docId, token).then((meta) => {
      if (!live) return;
      describedRef.current = meta.access;
      peopleRef.current = meta.people;
      readHandle();
    });

    const stopProject = watchProjectTitle({
      services,
      docId,
      isLive: () => live,
      onTitle(title) {
        projectTitleRef.current = title;
        readHandle();
      },
    });

    return () => {
      live = false;
      stopUndo();
      stopStatus();
      sessionHandle.stop();
      stopProject();
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
    getHandle: () => handleRef.current,
    recordUndo(entry) {
      undoLabelsRef.current.push(entry);
      redoLabelsRef.current = [];
    },
    setActiveCell(cell) {
      activeRef.current = cell;
      republishCurrent();
    },
    setSelection(rowIds) {
      selectedRef.current = new Set(rowIds);
      republishCurrent();
    },
    setEditingCell(editing) {
      editingRef.current = editing;
      republishCurrent();
    },
    writeCell(rowId, columnId, value, columnLabel, rowNumber) {
      const handle = handleRef.current;
      if (handle === null) return;
      undoLabelsRef.current.push(
        writeRundownCell({
          handle,
          userId: services.userId,
          now,
          rowId,
          columnId,
          value,
          columnLabel,
          rowNumber,
        }),
      );
      redoLabelsRef.current = [];
    },
  };
}
