// Rundown cell and open-story presence over Yjs awareness (`cell: { rowId, columnId } | null`).
import {
  CrdtUpdateError,
  decodeAwareness,
  encodeAwareness,
} from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBeside } from "../beside/open-beside.ts";
import { useServices } from "../services/context.tsx";
import { useRundownView } from "./rundown-view-store.ts";

/** Lookup column sentinel matching `rundown-cells.tsx` for row-level story presence (`columnId: null`). */
export const STORY_OPEN_COLUMN = "story_open";

const EMPTY_USERS: readonly string[] = Object.freeze([]);

export interface CellAwareness {
  readonly rowId: string;
  readonly columnId: string | null;
}

export interface RemoteCellEntry {
  readonly clientId: number;
  readonly clock: number;
  readonly userId: string;
  readonly cell: CellAwareness;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extracts a valid `{ userId, cell }` presence entry from a decoded awareness state, or null. */
export function parseCellAwareness(
  state: Record<string, unknown> | null,
): { readonly userId: string; readonly cell: CellAwareness } | null {
  if (state === null) return null;
  const user = state.user;
  const cell = state.cell;
  if (!isObjectRecord(user) || !isObjectRecord(cell)) return null;
  const userId = user.userId;
  const rowId = cell.rowId;
  const columnId = cell.columnId;
  if (typeof userId !== "string" || userId === "") return null;
  if (typeof rowId !== "string" || rowId === "") return null;
  if (columnId !== null && typeof columnId !== "string") return null;
  return { userId, cell: { rowId, columnId } };
}

/** Applies one awareness update frame to `current`, ignoring `ownClientId` and stale clocks. */
export function applyAwarenessUpdate(
  current: ReadonlyMap<number, RemoteCellEntry>,
  update: Uint8Array,
  ownClientId: number,
): Map<number, RemoteCellEntry> {
  let entries: ReturnType<typeof decodeAwareness>;
  try {
    entries = decodeAwareness(update);
  } catch (error) {
    if (error instanceof CrdtUpdateError) return new Map(current);
    throw error;
  }
  const next = new Map(current);
  for (const entry of entries) {
    if (entry.clientId === ownClientId) continue;
    const prev = next.get(entry.clientId);
    if (prev !== undefined && entry.clock <= prev.clock) continue;
    const parsed = parseCellAwareness(entry.state);
    if (parsed === null) {
      next.delete(entry.clientId);
    } else {
      next.set(entry.clientId, {
        clientId: entry.clientId,
        clock: entry.clock,
        userId: parsed.userId,
        cell: parsed.cell,
      });
    }
  }
  return next;
}

/** Builds an O(1) lookup `(rowId, columnId) => userIds` from active remote cell awareness entries. */
export function collectCellPresence(
  entries: ReadonlyMap<number, RemoteCellEntry>,
): (rowId: string, columnId: string) => readonly string[] {
  if (entries.size === 0) return () => EMPTY_USERS;
  const byKey = new Map<string, string[]>();
  for (const entry of entries.values()) {
    const colKey = entry.cell.columnId ?? STORY_OPEN_COLUMN;
    const key = `${entry.cell.rowId}\0${colKey}`;
    let list = byKey.get(key);
    if (list === undefined) {
      list = [];
      byKey.set(key, list);
    }
    if (!list.includes(entry.userId)) list.push(entry.userId);
  }
  return (rowId, columnId) => byKey.get(`${rowId}\0${columnId}`) ?? EMPTY_USERS;
}

function cellTargetKey(cell: CellAwareness | null): string {
  if (cell === null) return "";
  return `${cell.rowId}\0${cell.columnId ?? ""}`;
}

/**
 * Publishes this person's active cell edit or open-beside story onto `docId`'s awareness stream and returns a live
 * lookup of remote collaborators' user ids for every cell and story row.
 */
export function useCellPresence(
  docId: string,
): (rowId: string, columnId: string) => readonly string[] {
  const services = useServices();
  const view = useRundownView(docId);
  const beside = useBeside();

  const [remote, setRemote] = useState<ReadonlyMap<number, RemoteCellEntry>>(
    () => new Map(),
  );
  const handleRef = useRef<DocHandle | null>(null);
  const clockRef = useRef(0);
  const lastSentKeyRef = useRef<string | null>(null);

  const localCell = useMemo<CellAwareness | null>(() => {
    if (view?.editingCell && view.activeCell !== null) {
      return {
        rowId: view.activeCell.rowId,
        columnId: view.activeCell.columnId,
      };
    }
    if (beside !== null && view?.rundown !== null && view !== null) {
      const storyRow = view.rundown.rows.find(
        (row) => row.kind === "script" && row.docId === beside.docId,
      );
      if (storyRow !== undefined) {
        return { rowId: storyRow.id, columnId: null };
      }
    }
    return null;
  }, [view?.editingCell, view?.activeCell, view?.rundown, beside]);

  const localCellRef = useRef<CellAwareness | null>(localCell);
  localCellRef.current = localCell;

  const publishLocal = (
    handle: DocHandle,
    cell: CellAwareness | null,
  ): void => {
    const key = cellTargetKey(cell);
    if (lastSentKeyRef.current === key) return;
    lastSentKeyRef.current = key;
    const clientId = handle.doc().clientId;
    clockRef.current += 1;
    handle.sendAwareness(
      encodeAwareness([
        {
          clientId,
          clock: clockRef.current,
          state: {
            user: { userId: services.userId },
            cell,
          },
        },
      ]),
    );
  };

  useEffect(() => {
    let live = true;
    let opened: DocHandle | null = null;
    let stopAwareness = (): void => {};
    let stopReplaced = (): void => {};
    handleRef.current = null;
    lastSentKeyRef.current = null;
    setRemote(new Map());

    void services
      .openHandle(docId)
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        opened = handle;
        handleRef.current = handle;
        stopAwareness = handle.onAwareness((update) => {
          if (!live) return;
          const ownId = handle.doc().clientId;
          setRemote((prev) => applyAwarenessUpdate(prev, update, ownId));
        });
        stopReplaced = handle.on((event) => {
          if (!live || event.type !== "replaced") return;
          lastSentKeyRef.current = null;
          publishLocal(handle, localCellRef.current);
        });
        publishLocal(handle, localCellRef.current);
      })
      .catch(() => {
        // sync unavailable: leave presence empty for this session
      });

    return () => {
      live = false;
      stopAwareness();
      stopReplaced();
      if (opened !== null) {
        clockRef.current += 1;
        opened.sendAwareness(
          encodeAwareness([
            {
              clientId: opened.doc().clientId,
              clock: clockRef.current,
              state: null,
            },
          ]),
        );
        void opened.close();
      }
      handleRef.current = null;
      lastSentKeyRef.current = null;
    };
  }, [docId, services]);

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    publishLocal(handle, localCell);
  }, [localCell]);

  return useMemo(() => collectCellPresence(remote), [remote]);
}
