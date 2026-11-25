// Read-only rundown ViewHandle adapter and session helpers (handle attachment, project title, on-device story check, publish, undo and cell write).
import {
  createRundownUndo,
  observeRundown,
  readRundown,
  setCell,
} from "@manent/crdt";
import type { CrdtDoc, RundownUndo } from "@manent/crdt";
import type { RundownColumnId, RundownJSON } from "@manent/schema";
import type { DocHandle, ViewHandle } from "@manent/sync-client";
import { RUNDOWN_WORDS } from "@manent/ui";
import type { GridCellCoord, StatusFacts } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { rundownActions } from "../state/rundown.store.ts";
import { registerRundownUndo, registerUndoRecorder } from "./handlers.ts";
import type { RundownUndoEntry } from "./handlers.ts";
import {
  accessFromStatus,
  buildRundownClock,
  findProjectTitle,
  isLoadedRundown,
} from "./rundown-access.ts";
import type { RundownAccess, RundownPerson } from "./rundown-access.ts";
import { setRundownView } from "./rundown-view-store.ts";

export interface ReadOnlyRundownSnapshot {
  readonly ready: boolean;
  readonly rundown: RundownJSON | null;
}

/**
 * Subscribes to a `ViewHandle`'s server-projected `rundown`, `airWindow` and `status`, calling `onUpdate`
 * immediately and on every update. Never touches a CRDT document.
 */
export function attachReadOnlyRundownView(
  view: ViewHandle,
  onUpdate: (snapshot: ReadOnlyRundownSnapshot) => void,
): () => void {
  const emit = (): void => {
    const rundown = view.rundown?.get() ?? null;
    const status = view.status.get();
    const ready = rundown !== null || status.live || status.link === "offline";
    onUpdate({ ready, rundown });
  };
  const stops: (() => void)[] = [];
  if (view.rundown !== undefined) stops.push(view.rundown.subscribe(emit));
  if (view.airWindow !== undefined) stops.push(view.airWindow.subscribe(emit));
  stops.push(view.status.subscribe(emit));
  emit();
  return () => {
    for (const stop of stops) stop();
  };
}

/** Publishes the current rundown view snapshot and updates rundown command context. */
export function publishRundownSnapshot(options: {
  readonly docId: string;
  readonly ready: boolean;
  readonly rundown: RundownJSON | null;
  readonly status: StatusFacts;
  readonly described: RundownAccess | null;
  readonly liveDuration: (rowId: string) => number | null;
  readonly onDevice: ReadonlySet<string>;
  readonly people: readonly RundownPerson[];
  readonly projectTitle: string | null;
  readonly activeCell: GridCellCoord | null;
  readonly selectedRowIds: ReadonlySet<string>;
  readonly editingCell: boolean;
}): void {
  const { docId, ready, rundown, status, described, liveDuration } = options;
  const clock =
    rundown === null ? null : buildRundownClock(rundown, liveDuration);
  const access = accessFromStatus(status, described);
  setRundownView(docId, {
    ready,
    rundown,
    clock,
    onDevice: options.onDevice,
    access,
    people: options.people,
    projectTitle: options.projectTitle,
    activeCell: options.activeCell,
    selectedRowIds: options.selectedRowIds,
    editingCell: options.editingCell,
  });
  const activeRowId = options.activeCell?.rowId ?? null;
  const scriptRowSelected =
    rundown !== null &&
    rundown.rows.some(
      (row) =>
        row.kind === "script" &&
        (options.selectedRowIds.size > 0
          ? options.selectedRowIds.has(row.id)
          : row.id === activeRowId),
    );
  rundownActions.setContext(docId, {
    canEdit: access === "edit",
    selectedRows: options.selectedRowIds.size,
    scriptRowSelected,
    editingCell: options.editingCell,
  });
}

/** Tracks which script docIds linked in a rundown are currently held on this device. */
export function createOnDeviceTracker(options: {
  readonly services: PersonServices;
  readonly isLive: () => boolean;
  readonly onChange: (held: ReadonlySet<string>) => void;
}): (data: RundownJSON) => void {
  const { services, isLive, onChange } = options;
  let lastKey = "";
  return (data) => {
    const ids = data.rows.flatMap((row) =>
      row.kind === "script" && row.docId !== null ? [row.docId] : [],
    );
    const key = ids.join(",");
    if (key === lastKey) return;
    lastKey = key;
    if (ids.length === 0) {
      onChange(new Set());
      return;
    }
    void services
      .onDevice(ids)
      .then((held) => {
        if (isLive()) onChange(held);
      })
      .catch(() => {
        // sync could not start: keep the last known device set
      });
  };
}

/** Watches the workspace and personal project lists for `docId`'s project title. */
export function watchProjectTitle(options: {
  readonly services: PersonServices;
  readonly docId: string;
  readonly isLive: () => boolean;
  readonly onTitle: (title: string) => void;
}): () => void {
  const { services, docId, isLive, onTitle } = options;
  const projectIdSource = services.library.documentProject(docId);
  const stops: (() => void)[] = [];
  let current: string | null = null;
  const lookup = (): void => {
    const projectId = projectIdSource.get();
    if (projectId === null) return;
    void services.api.me().then((me) => {
      if (!isLive()) return;
      const workspaces = me.ok ? me.me.workspaces.map(({ id }) => id) : [];
      for (const ws of [...workspaces, services.userId]) {
        const list = services.library.projects(ws);
        const check = (): void => {
          const title = findProjectTitle(list.get(), projectId);
          if (title !== null && title !== current) {
            current = title;
            onTitle(title);
          }
        };
        stops.push(list.subscribe(check));
        check();
      }
    });
  };
  stops.push(projectIdSource.subscribe(lookup));
  lookup();
  return () => {
    for (const stop of stops) stop();
  };
}

/** Registers the rundown undo recorder and undo/redo command handlers for `docId`. */
export function bindRundownSessionUndo(options: {
  readonly docId: string;
  readonly services: PersonServices;
  readonly getUndo: () => RundownUndo | null;
  readonly undoLabels: { current: RundownUndoEntry[] };
  readonly redoLabels: { current: RundownUndoEntry[] };
}): () => void {
  const { docId, services, getUndo, undoLabels, redoLabels } = options;
  const stopRecorder = registerUndoRecorder(docId, (entry) => {
    undoLabels.current.push(entry);
    redoLabels.current = [];
  });
  const stopUndo = registerRundownUndo({
    undo() {
      const manager = getUndo();
      if (manager === null) return;
      const entry = undoLabels.current.pop();
      for (let i = 0; i < (entry?.steps ?? 1); i++) manager.undo();
      if (entry === undefined) return;
      redoLabels.current.push(entry);
      entry.onUndo?.();
      if (entry.message !== null) {
        services.messages.withdraw("rundown.action");
        services.messages.withdraw("rundown.undo");
        services.messages.push({
          id: "rundown.undo",
          text: entry.message,
          lifetime: "brief",
          ownWork: false,
          actions: [],
        });
      }
    },
    redo() {
      const manager = getUndo();
      if (manager === null) return;
      const entry = redoLabels.current.pop();
      for (let i = 0; i < (entry?.steps ?? 1); i++) manager.redo();
      if (entry === undefined) return;
      undoLabels.current.push(entry);
      entry.onRedo?.();
    },
  });
  return () => {
    stopRecorder();
    stopUndo();
  };
}

/** Writes one rundown cell to the active CRDT handle and returns its undo entry. */
export function writeRundownCell(options: {
  readonly handle: DocHandle;
  readonly userId: string;
  readonly now: () => number;
  readonly rowId: string;
  readonly columnId: RundownColumnId;
  readonly value: string | number | null;
  readonly columnLabel: string;
  readonly rowNumber: number | null;
}): RundownUndoEntry {
  const {
    handle,
    userId,
    now,
    rowId,
    columnId,
    value,
    columnLabel,
    rowNumber,
  } = options;
  setCell(handle.doc(), rowId, columnId, value, { userId, now });
  const displayNumber =
    rowNumber ??
    (() => {
      const idx = readRundown(handle.doc()).rows.findIndex(
        (row) => row.id === rowId,
      );
      return idx >= 0 ? idx + 1 : null;
    })();
  return {
    message:
      displayNumber !== null
        ? RUNDOWN_WORDS.undidCellChange(columnLabel, displayNumber)
        : null,
  };
}

const noop = (): void => {};

/**
 * Opens `docId`'s sync handle and switches cleanly between the writable CRDT doc and a read-only
 * server-projected `ViewHandle` (`handle.readOnly`). Returns `{ readNow, stop }`.
 */
export function openRundownSessionHandle(options: {
  readonly docId: string;
  readonly services: PersonServices;
  readonly onHandle: (handle: DocHandle | null) => void;
  readonly onUndo: (undo: RundownUndo | null) => void;
  readonly onOnDevice: (data: RundownJSON) => void;
  readonly onSnapshot: (ready: boolean, rundown: RundownJSON | null) => void;
}): { readonly readNow: () => void; readonly stop: () => void } {
  const { docId, services, onHandle, onUndo, onOnDevice, onSnapshot } = options;
  let live = true;
  let opened: DocHandle | null = null;
  let readOnlyView: ViewHandle | null = null;
  let readOnlyReady = false;
  let readOnlyData: RundownJSON | null = null;
  let undo: RundownUndo | null = null;
  let stopDoc: () => void = noop;
  let stopReadOnlyView: () => void = noop;
  let stopReadOnlyWatch: () => void = noop;
  let stopReplaced: () => void = noop;
  let stopHandleStatus: () => void = noop;

  const readNow = (): void => {
    if (!live) return;
    if (readOnlyView !== null) {
      onSnapshot(readOnlyReady, readOnlyData);
      return;
    }
    if (opened === null) {
      onSnapshot(false, null);
      return;
    }
    const data = readRundown(opened.doc());
    onOnDevice(data);
    onSnapshot(isLoadedRundown(data, opened), data);
  };

  const detachCrdt = (): void => {
    stopDoc();
    stopDoc = noop;
    undo?.destroy();
    undo = null;
    onUndo(null);
  };

  const attachDoc = (crdtDoc: CrdtDoc): void => {
    detachCrdt();
    undo = createRundownUndo(crdtDoc, { trackedOrigins: [null] });
    onUndo(undo);
    stopDoc = observeRundown(crdtDoc, () => readNow());
  };

  const syncReadOnlyMode = (handle: DocHandle): void => {
    const next = handle.readOnly.get();
    if (next !== null) {
      if (readOnlyView === next) return;
      detachCrdt();
      onHandle(null);
      stopReadOnlyView();
      readOnlyView = next;
      stopReadOnlyView = attachReadOnlyRundownView(
        next,
        ({ ready, rundown }) => {
          readOnlyReady = ready;
          readOnlyData = rundown;
          if (rundown !== null) onOnDevice(rundown);
          if (live) onSnapshot(ready, rundown);
        },
      );
      return;
    }
    if (readOnlyView !== null) {
      stopReadOnlyView();
      stopReadOnlyView = noop;
      readOnlyView = null;
      readOnlyReady = false;
      readOnlyData = null;
    }
    onHandle(handle);
    attachDoc(handle.doc());
    readNow();
  };

  void services
    .openHandle(docId)
    .then((handle) => {
      if (!live) {
        void handle.close();
        return;
      }
      opened = handle;
      stopReadOnlyWatch = handle.readOnly.subscribe(() =>
        syncReadOnlyMode(handle),
      );
      stopReplaced = handle.on((event) => {
        if (event.type !== "replaced" || readOnlyView !== null) return;
        attachDoc(handle.doc());
        readNow();
      });
      stopHandleStatus = handle.status.subscribe(() => {
        if (readOnlyView === null) readNow();
      });
      syncReadOnlyMode(handle);
    })
    .catch(() => {
      if (live) onSnapshot(true, null);
    });

  return {
    readNow,
    stop() {
      live = false;
      stopReadOnlyWatch();
      stopReadOnlyView();
      detachCrdt();
      stopReplaced();
      stopHandleStatus();
      onHandle(null);
      if (opened !== null) void opened.close();
    },
  };
}
