// The comments, rounds, flags and writer notes of the open script, opened alongside it and kept offline-first.
import type { CommentOutcome } from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_UI,
  createCommentsEntry,
  disposeCommentsEntry,
  emitComments,
  emitCommentsUi,
  emptyCommentsState,
  noop,
} from "../comments/comments-session.ts";
import type { CommentsEntry, Opener } from "../comments/comments-session.ts";
import type {
  CommentsUiState,
  PopoverTrigger,
  SceneBlockInfo,
  ScriptCommentsState,
} from "../comments/comments-types.ts";
import {
  writeNewComment,
  writeRenameRound,
  writeReopen,
  writeReply,
  writeResolve,
  writeScriptNote,
} from "../comments/comments-writes.ts";
import type { CommentsWriteTarget } from "../comments/comments-writes.ts";
import { fetchDocPeople } from "../comments/people-request.ts";
import type { PersonServices } from "../services/ports.ts";

export type {
  CommentsRole,
  CommentsUiState,
  PopoverTrigger,
  ScriptCommentsState,
  StoredNote,
} from "../comments/comments-types.ts";

const entries = new Map<string, CommentsEntry>();
const fallbackStates = new Map<string, ScriptCommentsState>();
const pendingListeners = new Map<string, Set<() => void>>();
const pendingUiListeners = new Map<string, Set<() => void>>();

function snapshotOf(docId: string | null): ScriptCommentsState {
  if (docId === null) return emptyCommentsState("");
  const held = entries.get(docId);
  if (held !== undefined) return held.state;
  const cached = fallbackStates.get(docId) ?? emptyCommentsState(docId);
  fallbackStates.set(docId, cached);
  return cached;
}

const targetOf = (docId: string): CommentsWriteTarget => {
  const entry = entries.get(docId);
  if (entry === undefined)
    return { docId, closed: true, state: snapshotOf(docId), doc: null };
  return {
    docId,
    closed: entry.closed,
    state: entry.state,
    doc: entry.handle?.doc() ?? null,
  };
};

export function useComments(docId: string | null): ScriptCommentsState {
  const subscribe = useCallback(
    (listener: () => void) =>
      docId === null ? noop : commentsActions.subscribe(docId, listener),
    [docId],
  );
  return useSyncExternalStore(
    subscribe,
    () => snapshotOf(docId),
    () => snapshotOf(docId),
  );
}

export function useCommentsUi(docId: string | null): CommentsUiState {
  const subscribe = useCallback(
    (listener: () => void) =>
      docId === null ? noop : commentsActions.subscribeUi(docId, listener),
    [docId],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      docId === null ? DEFAULT_UI : (entries.get(docId)?.ui ?? DEFAULT_UI),
    () => DEFAULT_UI,
  );
}

export function useRetainComments(
  docId: string | null,
  services: PersonServices,
): void {
  useEffect(() => {
    if (docId === null) return undefined;
    return commentsActions.retain(docId, services);
  }, [docId, services]);
}

export const commentsActions = {
  retain(docId: string, services: PersonServices): () => void {
    let entry = entries.get(docId);
    if (entry === undefined) {
      entry = createCommentsEntry(docId, services);
      const waiting = pendingListeners.get(docId);
      if (waiting !== undefined) {
        for (const listener of waiting) entry.listeners.add(listener);
        pendingListeners.delete(docId);
      }
      const waitingUi = pendingUiListeners.get(docId);
      if (waitingUi !== undefined) {
        for (const listener of waitingUi) entry.uiListeners.add(listener);
        pendingUiListeners.delete(docId);
      }
      entries.set(docId, entry);
      if (waiting !== undefined) emitComments(entry);
      if (waitingUi !== undefined) emitCommentsUi(entry);
    }
    entry.refs += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = entries.get(docId);
      if (current === undefined) return;
      current.refs -= 1;
      if (current.refs <= 0) {
        disposeCommentsEntry(current);
        entries.delete(docId);
      }
    };
  },
  get: (docId: string): ScriptCommentsState => snapshotOf(docId),
  subscribe(docId: string, listener: () => void): () => void {
    const entry = entries.get(docId);
    if (entry !== undefined) {
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    }
    const set = pendingListeners.get(docId) ?? new Set();
    set.add(listener);
    pendingListeners.set(docId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) pendingListeners.delete(docId);
      entries.get(docId)?.listeners.delete(listener);
    };
  },
  subscribeUi(docId: string, listener: () => void): () => void {
    const entry = entries.get(docId);
    if (entry !== undefined) {
      entry.uiListeners.add(listener);
      return () => {
        entry.uiListeners.delete(listener);
      };
    }
    const set = pendingUiListeners.get(docId) ?? new Set();
    set.add(listener);
    pendingUiListeners.set(docId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) pendingUiListeners.delete(docId);
      entries.get(docId)?.uiListeners.delete(listener);
    };
  },
  setFilter(docId: string, filter: string): void {
    const entry = entries.get(docId);
    if (entry === undefined || entry.ui.filter === filter) return;
    if (filter === "writers" && !entry.state.canEdit) return;
    entry.ui = { ...entry.ui, filter };
    emitCommentsUi(entry);
  },
  setActive(docId: string, activeId: string | null): void {
    const entry = entries.get(docId);
    if (entry === undefined || entry.ui.activeId === activeId) return;
    entry.ui = { ...entry.ui, activeId };
    emitCommentsUi(entry);
  },
  bindOpener(docId: string, opener: Opener): () => void {
    const entry = entries.get(docId);
    if (entry === undefined) return noop;
    entry.opener = opener;
    return () => {
      if (entry.opener === opener) entry.opener = null;
    };
  },
  openPopover: (docId: string, trigger: PopoverTrigger): boolean =>
    entries.get(docId)?.opener?.(trigger) ?? false,
  syncRemoved(docId: string, ids: readonly string[]): void {
    const entry = entries.get(docId);
    if (entry === undefined || ids.length === 0) return;
    const next = new Set(entry.state.removedIds);
    let added = false;
    for (const id of ids) {
      if (!next.has(id)) {
        next.add(id);
        added = true;
      }
    }
    if (!added) return;
    entry.state = { ...entry.state, removedIds: next };
    emitComments(entry);
  },
  setBlockScenes(
    docId: string,
    blockScenes: ReadonlyMap<string, SceneBlockInfo>,
  ): void {
    const entry = entries.get(docId);
    if (entry === undefined) return;
    entry.state = { ...entry.state, blockScenes };
    emitComments(entry);
  },
  loadPeople(docId: string, userId: string): Promise<void> {
    const entry = entries.get(docId);
    if (entry === undefined || entry.state.peopleState === "loaded")
      return Promise.resolve();
    if (entry.loadingPeople !== null) return entry.loadingPeople;
    const task = fetchDocPeople(docId, userId).then((people) => {
      entry.loadingPeople = null;
      if (entry.closed) return;
      if (people === null) {
        if (entry.state.peopleState === "idle") {
          entry.state = { ...entry.state, peopleState: "offline" };
          emitComments(entry);
        }
        return;
      }
      entry.state = { ...entry.state, people, peopleState: "loaded" };
      emitComments(entry);
    });
    entry.loadingPeople = task;
    return task;
  },
  startComment: (
    docId: string,
    services: PersonServices,
    input: {
      anchor: TextAnchor | null;
      roundId: string | null;
      body: string;
      mentionedUserIds: readonly string[];
    },
    now: () => number,
  ): string | null => writeNewComment(targetOf(docId), services, input, now),
  reply: (
    docId: string,
    services: PersonServices,
    input: {
      threadId: string;
      body: string;
      mentionedUserIds: readonly string[];
    },
    now: () => number,
  ): boolean => writeReply(targetOf(docId), services, input, now),
  resolve: (
    docId: string,
    services: PersonServices,
    input: {
      threadId: string;
      outcome: CommentOutcome | null;
      reason: string | null;
    },
    now: () => number,
  ): boolean =>
    writeResolve(targetOf(docId), () => targetOf(docId), services, input, now),
  reopen: (
    docId: string,
    services: PersonServices,
    threadId: string,
  ): boolean => writeReopen(targetOf(docId), services, threadId),
  renameRound: (
    docId: string,
    services: PersonServices,
    roundId: string,
    name: string,
  ): boolean => writeRenameRound(targetOf(docId), services, roundId, name),
  addNote: (
    docId: string,
    writerName: string,
    input: { anchor: TextAnchor; text: string },
    now: () => number,
  ): string | null => writeScriptNote(targetOf(docId), writerName, input, now),
};
