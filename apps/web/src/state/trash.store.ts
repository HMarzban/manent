// Whether each document is in Trash, whether the person may delete it, and the active Move to Trash confirmation.
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

export interface TrashDocState {
  readonly inTrash: boolean;
  readonly canDelete: boolean;
}

export interface TrashConfirmRequest {
  readonly docId: string;
  readonly title: string;
  readonly workspaceId: string | null;
  readonly otherNames: readonly string[];
  readonly navigateToLibrary: boolean;
  readonly busy: boolean;
  readonly refusal: string | null;
}

export interface TrashedTarget {
  readonly docId: string;
  readonly title: string;
}

const DEFAULT_DOC: TrashDocState = Object.freeze({
  inTrash: false,
  canDelete: false,
});

const store = createStore<{
  byDoc: Readonly<Record<string, TrashDocState>>;
  confirm: TrashConfirmRequest | null;
  lastTrashed: TrashedTarget | null;
  revision: number;
}>()(() => ({
  byDoc: {},
  confirm: null,
  lastTrashed: null,
  revision: 0,
}));

const readDoc = (docId: string): TrashDocState =>
  store.getState().byDoc[docId] ?? DEFAULT_DOC;

export function useTrashConfirm(): TrashConfirmRequest | null {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState().confirm,
    () => store.getState().confirm,
  );
}

export function useTrashRevision(): number {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState().revision,
    () => store.getState().revision,
  );
}

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const trashActions: {
  get(docId: string): TrashDocState;
  set(docId: string, value: Partial<TrashDocState>): void;
  clear(docId: string): void;
  openConfirm(request: Omit<TrashConfirmRequest, "busy" | "refusal">): void;
  setConfirmBusy(busy: boolean): void;
  setConfirmRefusal(refusal: string | null): void;
  closeConfirm(): void;
  rememberTrashed(target: TrashedTarget | null): void;
  lastTrashed(): TrashedTarget | null;
  bumpRevision(): void;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: readDoc,
  set(docId, patch) {
    guardWrite("trash");
    const prev = readDoc(docId);
    const next: TrashDocState = {
      inTrash: patch.inTrash ?? prev.inTrash,
      canDelete: patch.canDelete ?? prev.canDelete,
    };
    if (next.inTrash === prev.inTrash && next.canDelete === prev.canDelete)
      return;
    store.setState((state) => ({
      byDoc: { ...state.byDoc, [docId]: next },
    }));
  },
  clear(docId) {
    guardWrite("trash");
    if (!(docId in store.getState().byDoc)) return;
    const entries = Object.entries(store.getState().byDoc).filter(
      ([id]) => id !== docId,
    );
    store.setState({ byDoc: Object.fromEntries(entries) });
  },
  openConfirm(request) {
    guardWrite("trash");
    store.setState({
      confirm: { ...request, busy: false, refusal: null },
    });
  },
  setConfirmBusy(busy) {
    guardWrite("trash");
    const current = store.getState().confirm;
    if (current === null) return;
    store.setState({ confirm: { ...current, busy } });
  },
  setConfirmRefusal(refusal) {
    guardWrite("trash");
    const current = store.getState().confirm;
    if (current === null) return;
    store.setState({ confirm: { ...current, busy: false, refusal } });
  },
  closeConfirm() {
    guardWrite("trash");
    if (store.getState().confirm === null) return;
    store.setState({ confirm: null });
  },
  rememberTrashed(target) {
    guardWrite("trash");
    store.setState({ lastTrashed: target });
  },
  lastTrashed: () => store.getState().lastTrashed,
  bumpRevision() {
    guardWrite("trash");
    store.setState((state) => ({ revision: state.revision + 1 }));
  },
  subscribe: (listener) => store.subscribe(() => listener()),
});
