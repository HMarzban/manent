// Automatic prompter sends: 2 s quiet debounce outside the air window, row state sync and window-end flush.
import {
  readRundown,
  readRundownWrites,
  writePrompterState,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { RundownJSON } from "@manent/schema";
import type { Storage } from "@manent/storage";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { AirWindows } from "../rundown/air-window.ts";
import { createStoryLinks } from "../rundown/story-links.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";
import {
  isRowChanged,
  isValidStoryInHome,
  readRundownSnapshot,
  readStoryHeadBlocks,
} from "./projection.ts";
import type { PrompterSender } from "./send.ts";
import type { PrompterFeedHub } from "./subscribe.ts";

/** How long a story must stay quiet before an automatic send fires outside the air window. */
const AUTO_SEND_QUIET_MS = 2_000;

const rowKey = (rundownId: string, rowId: string): string =>
  `${rundownId}:${rowId}`;

function readChangedLinks(
  doc: CrdtDoc,
  update: Uint8Array,
  rundown: RundownJSON,
): { linked: string[]; removed: string[] } {
  let writes;
  try {
    writes = readRundownWrites(doc, update);
  } catch {
    // non-rundown or unreadable updates carry no row-link changes
    return { linked: [], removed: [] };
  }
  const byId = new Map(rundown.rows.map((row) => [row.id, row]));
  const linked: string[] = [];
  const removed: string[] = [];
  for (const rowWrite of writes.rows) {
    if (rowWrite.removed) {
      removed.push(rowWrite.rowId);
      continue;
    }
    const linkTouched =
      rowWrite.keys.includes("id") ||
      rowWrite.keys.includes("docId") ||
      rowWrite.keys.includes("blockId") ||
      rowWrite.keys.includes("kind");
    if (!linkTouched) continue;
    const live = byId.get(rowWrite.rowId);
    if (live !== undefined && live.kind === "script" && live.docId !== null)
      linked.push(live.id);
  }
  return { linked, removed };
}

export interface AutoSender {
  cancelRow(rundownId: string, rowId: string): void;
  onStoryCommitted(room: Room): void;
  onRundownCommitted(room: Room, update: Uint8Array): void;
  onSubscribed(docId: string): void;
  onForgotten(room: Room): void;
  stop(): void;
}

export function createAutoSender(options: {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  airWindows: Pick<AirWindows, "windowOf" | "isInside">;
  feed: PrompterFeedHub;
  sender: () => PrompterSender;
}): AutoSender {
  const { storage, sync, clock, airWindows, feed, sender } = options;
  const storyLinks = createStoryLinks(storage);
  const liveScripts = new Map<string, Room>();
  const autoTimers = new Map<string, () => void>();
  const windowEndTimers = new Map<string, () => void>();
  const insideWindow = new Set<string>();

  const liveDocOf = (storyId: string): CrdtDoc | null =>
    liveScripts.get(storyId)?.doc ?? null;

  function cancelRow(rundownId: string, rowId: string): void {
    const key = rowKey(rundownId, rowId);
    autoTimers.get(key)?.();
    autoTimers.delete(key);
  }

  function cancelAllRows(rundownId: string): void {
    const prefix = `${rundownId}:`;
    for (const [key, cancel] of autoTimers) {
      if (!key.startsWith(prefix)) continue;
      cancel();
      autoTimers.delete(key);
    }
  }

  function runAutoSend(
    rundownId: string,
    rowId: string,
    storyId: string | null,
    isRetry: boolean,
  ): void {
    const liveDoc = storyId === null ? null : liveDocOf(storyId);
    void sender()
      .sendAutomatic(rundownId, rowId, liveDoc)
      .then((outcome) => {
        if (outcome === "inside_window") syncWindowEnd(rundownId);
        else if (outcome === "retry" && !isRetry)
          scheduleAutoSend(rundownId, rowId, storyId, true);
      })
      .catch(() => {
        // the rundown was removed before the automatic send ran
      });
  }

  function flushChangedRows(rundownId: string): void {
    if (airWindows.isInside(rundownId, clock.now())) {
      syncWindowEnd(rundownId);
      return;
    }
    const snap = readRundownSnapshot(storage, rundownId, null);
    if (snap === null) return;
    const file = storage.open(snap.home);
    for (const row of snap.rundown.rows) {
      if (row.kind !== "script" || row.docId === null) continue;
      const headBlocks = readStoryHeadBlocks(
        storage,
        snap.home,
        row.docId,
        liveDocOf(row.docId),
      );
      if (headBlocks === null) continue;
      if (!isRowChanged(storage, snap.home, file, rundownId, row, headBlocks))
        continue;
      cancelRow(rundownId, row.id);
      runAutoSend(rundownId, row.id, row.docId, false);
    }
  }

  function syncWindowEnd(rundownId: string): void {
    const now = clock.now();
    const win = airWindows.windowOf(rundownId);
    if (win !== null && airWindows.isInside(rundownId, now)) {
      insideWindow.add(rundownId);
      cancelAllRows(rundownId);
      windowEndTimers.get(rundownId)?.();
      const delayMs = Math.max(1, win.endsAt - now + 1);
      windowEndTimers.set(
        rundownId,
        clock.schedule(() => {
          windowEndTimers.delete(rundownId);
          const firedAt = clock.now();
          if (airWindows.isInside(rundownId, firedAt)) {
            syncWindowEnd(rundownId);
            return;
          }
          const currentWin = airWindows.windowOf(rundownId);
          if (currentWin !== null && firedAt < currentWin.startsAt) {
            insideWindow.delete(rundownId);
            return;
          }
          insideWindow.delete(rundownId);
          flushChangedRows(rundownId);
        }, delayMs),
      );
      return;
    }
    windowEndTimers.get(rundownId)?.();
    windowEndTimers.delete(rundownId);
    if (insideWindow.delete(rundownId)) flushChangedRows(rundownId);
  }

  function scheduleAutoSend(
    rundownId: string,
    rowId: string,
    storyId: string | null,
    isRetry: boolean,
  ): void {
    if (airWindows.isInside(rundownId, clock.now())) {
      cancelRow(rundownId, rowId);
      syncWindowEnd(rundownId);
      return;
    }
    cancelRow(rundownId, rowId);
    const key = rowKey(rundownId, rowId);
    autoTimers.set(
      key,
      clock.schedule(() => {
        autoTimers.delete(key);
        if (airWindows.isInside(rundownId, clock.now())) {
          syncWindowEnd(rundownId);
          return;
        }
        runAutoSend(rundownId, rowId, storyId, isRetry);
      }, AUTO_SEND_QUIET_MS),
    );
  }

  function syncRowStates(rundownId: string, rowIds: readonly string[]): void {
    void sender()
      .inChain(rundownId, async () => {
        const snap = readRundownSnapshot(storage, rundownId, null);
        if (snap === null) return;
        const file = storage.open(snap.home);
        const byId = new Map(snap.rundown.rows.map((row) => [row.id, row]));
        const wanted = new Map<string, "on" | "changed">();
        for (const rowId of rowIds) {
          const row = byId.get(rowId);
          if (row === undefined || row.kind !== "script" || row.docId === null)
            continue;
          if (row.prompter === null) continue;
          const headBlocks = readStoryHeadBlocks(
            storage,
            snap.home,
            row.docId,
            liveDocOf(row.docId),
          );
          if (headBlocks === null) continue;
          const nextState = isRowChanged(
            storage,
            snap.home,
            file,
            rundownId,
            row,
            headBlocks,
          )
            ? "changed"
            : "on";
          if (row.prompter.state !== nextState) wanted.set(rowId, nextState);
        }
        if (wanted.size === 0) return;
        await sync().authorityWrite(rundownId, {
          userId: SYSTEM_USER_ID,
          origin: "system",
          edit(doc) {
            const liveRows = new Map(
              readRundown(doc).rows.map((row) => [row.id, row]),
            );
            for (const [rowId, nextState] of wanted) {
              const live = liveRows.get(rowId);
              if (live === undefined || live.prompter === null) continue;
              if (live.prompter.state === nextState) continue;
              writePrompterState(doc, rowId, {
                ...live.prompter,
                state: nextState,
              });
            }
            return { ok: true };
          },
          inTransaction() {},
        });
      })
      .catch(() => {
        // the rundown was removed before the state update ran
      });
  }

  return {
    cancelRow,
    onStoryCommitted(room) {
      if (room.mode !== "authority") return;
      liveScripts.set(room.docId, room);
      const links = storyLinks
        .linksOf(room.docId)
        .filter((link) => link.kind === "script");
      if (links.length === 0) return;
      const byRundown = new Map<string, string[]>();
      for (const link of links)
        byRundown.set(link.rundownId, [
          ...(byRundown.get(link.rundownId) ?? []),
          link.rowId,
        ]);
      for (const [rundownId, rowIds] of byRundown) {
        const snap = readRundownSnapshot(storage, rundownId, null);
        if (snap === null) continue;
        const file = storage.open(snap.home);
        const headBlocks = readStoryHeadBlocks(
          storage,
          snap.home,
          room.docId,
          room.doc,
        );
        if (headBlocks === null) continue;
        const rowsById = new Map(snap.rundown.rows.map((row) => [row.id, row]));
        const changedIds: string[] = [];
        for (const rowId of rowIds) {
          const row = rowsById.get(rowId);
          if (row === undefined) continue;
          if (
            isRowChanged(storage, snap.home, file, rundownId, row, headBlocks)
          )
            changedIds.push(rowId);
          else cancelRow(rundownId, rowId);
        }
        syncRowStates(rundownId, rowIds);
        if (airWindows.isInside(rundownId, clock.now())) {
          for (const rowId of rowIds) cancelRow(rundownId, rowId);
          syncWindowEnd(rundownId);
        } else {
          for (const rowId of changedIds)
            scheduleAutoSend(rundownId, rowId, room.docId, false);
        }
      }
    },
    onRundownCommitted(room, update) {
      if (room.doc === null) return;
      const rundown = readRundown(room.doc);
      storyLinks.refreshRundown(room.home, room.docId, rundown);
      feed.publish(room.docId, room.doc);
      if (room.mode !== "authority") return;
      syncWindowEnd(room.docId);
      const { linked, removed } = readChangedLinks(room.doc, update, rundown);
      for (const rowId of removed) {
        cancelRow(room.docId, rowId);
        sender().dropRow(room.docId, rowId);
      }
      if (linked.length === 0) return;
      const byId = new Map(rundown.rows.map((row) => [row.id, row]));
      const changed: { rowId: string; storyId: string }[] = [];
      for (const rowId of linked) {
        const row = byId.get(rowId);
        if (row === undefined || row.docId === null) continue;
        if (!isValidStoryInHome(storage, room.home, row.docId)) continue;
        const headBlocks = readStoryHeadBlocks(
          storage,
          room.home,
          row.docId,
          liveDocOf(row.docId),
        );
        if (headBlocks === null) continue;
        if (
          isRowChanged(
            storage,
            room.home,
            room.file,
            room.docId,
            row,
            headBlocks,
          )
        )
          changed.push({ rowId, storyId: row.docId });
      }
      if (changed.length === 0) return;
      syncRowStates(
        room.docId,
        changed.map((c) => c.rowId),
      );
      if (airWindows.isInside(room.docId, clock.now())) {
        syncWindowEnd(room.docId);
        return;
      }
      for (const item of changed)
        scheduleAutoSend(room.docId, item.rowId, item.storyId, false);
    },
    onSubscribed(docId) {
      if (storage.directory.placeOf(docId)?.kind === "rundown")
        syncWindowEnd(docId);
    },
    onForgotten(room) {
      liveScripts.delete(room.docId);
    },
    stop() {
      for (const cancel of autoTimers.values()) cancel();
      autoTimers.clear();
      for (const cancel of windowEndTimers.values()) cancel();
      windowEndTimers.clear();
      insideWindow.clear();
      liveScripts.clear();
    },
  };
}
