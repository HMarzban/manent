// Per-rundown prompter runtime: capability lookup, story sync/format tracking, control listening and context publishing.
import type { DocHandle } from "@manent/sync-client";
import { useEffect, useSyncExternalStore } from "react";
import type { BesideOpen } from "../beside/open-beside.ts";
import type { RundownViewState } from "../rundown/rundown-view-store.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { Environment, PersonServices } from "../services/ports.ts";
import { prompterActions } from "../state/prompter.store.ts";
import { fetchCanSendPrompter, parseSentControl } from "./prompter-http.ts";
import {
  recordTrailEntry,
  resolveTargetRow,
  selectionSignature,
} from "./prompter-model.ts";
import { executePrompterSend, tokenOf } from "./prompter-send.ts";
import type {
  PrompterRuntimeState,
  PrompterSnapshot,
} from "./prompter-send.ts";

export type { PrompterSnapshot } from "./prompter-send.ts";

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP: ReadonlyMap<string, number> = new Map();

const INITIAL_SNAPSHOT: PrompterSnapshot = Object.freeze({
  online: true,
  canSend: false,
  synced: false,
  inFlightRows: EMPTY_SET,
  waitingByDocId: EMPTY_MAP,
});

interface PrompterRuntime {
  refs: number;
  getSnapshot(): PrompterSnapshot;
  syncView(view: RundownViewState | null, beside: BesideOpen | null): void;
  dispose(): void;
}

const runtimes = new Map<string, PrompterRuntime>();
const keyListeners = new Map<string, Set<() => void>>();

const runtimeKey = (services: PersonServices, rundownId: string): string =>
  `${services.userId}:${rundownId}`;

function notifyKey(key: string): void {
  const subs = keyListeners.get(key);
  if (subs === undefined) return;
  for (const listener of subs) listener();
}

function subscribeKey(key: string, listener: () => void): () => void {
  let subs = keyListeners.get(key);
  if (subs === undefined) {
    subs = new Set();
    keyListeners.set(key, subs);
  }
  subs.add(listener);
  return () => {
    subs.delete(listener);
    if (subs.size === 0) keyListeners.delete(key);
  };
}

function emitSnapshot(state: PrompterRuntimeState): void {
  state.snapshot = Object.freeze({
    online: state.online,
    canSend: state.canSend,
    synced: state.synced,
    inFlightRows: new Set(state.inFlight),
    waitingByDocId: new Map(state.waitingByDocId),
  });
  notifyKey(state.key);
}

function publishContext(state: PrompterRuntimeState): void {
  if (state.disposed) return;
  const row = resolveTargetRow(
    state.latestView,
    state.latestBeside,
    state.overrideRowId,
  );
  const storyId = row?.docId ?? null;
  const sentBefore =
    row !== null && (row.prompter !== null || state.knownSentRows.has(row.id));
  prompterActions.setContext(state.rundownId, {
    canSend: state.canSend,
    hasStory: storyId !== null,
    sentBefore,
    storyFormat:
      storyId !== null && storyId === state.trackedStoryId
        ? state.trackedStoryFormat
        : null,
    waiting: storyId !== null ? (state.waitingByDocId.get(storyId) ?? 0) : 0,
    synced: state.synced,
  });
}

function trackStory(state: PrompterRuntimeState, storyId: string | null): void {
  if (storyId === state.trackedStoryId) return;
  state.stopTrackedStory?.();
  state.stopTrackedStory = null;
  state.trackedStoryId = storyId;
  state.trackedStoryFormat = null;
  if (storyId === null) {
    publishContext(state);
    return;
  }
  const doc = state.services.documents.open(storyId);
  const store = state.services.openScriptStore(storyId);
  state.trackedStoryFormat = store.get("script.format");
  state.waitingByDocId.set(storyId, doc.status.get().waiting);
  const stopStatus = doc.status.subscribe((st) => {
    if (state.waitingByDocId.get(storyId) === st.waiting) return;
    state.waitingByDocId.set(storyId, st.waiting);
    emitSnapshot(state);
    publishContext(state);
  });
  const stopFormat = store.subscribe("script.format", () => {
    state.trackedStoryFormat = store.get("script.format");
    publishContext(state);
  });
  state.stopTrackedStory = () => {
    stopStatus();
    stopFormat();
    state.services.documents.close(storyId);
  };
  emitSnapshot(state);
  publishContext(state);
}

function syncTrackedTarget(state: PrompterRuntimeState): void {
  const row = resolveTargetRow(
    state.latestView,
    state.latestBeside,
    state.overrideRowId,
  );
  trackStory(state, row?.docId ?? null);
  publishContext(state);
}

function refreshCanSend(state: PrompterRuntimeState): void {
  if (state.disposed || !state.online) return;
  void fetchCanSendPrompter(state.rundownId, tokenOf(state)).then((allowed) => {
    if (state.disposed || allowed === null || allowed === state.canSend) return;
    state.canSend = allowed;
    emitSnapshot(state);
    publishContext(state);
  });
}

function attachControlListener(state: PrompterRuntimeState): () => void {
  let openedHandle: DocHandle | null = null;
  let stopControl: (() => void) | null = null;
  void state.services
    .openHandle(state.rundownId)
    .then((handle) => {
      if (state.disposed) {
        void handle.close();
        return;
      }
      openedHandle = handle;
      stopControl = handle.on((event) => {
        if (event.type !== "control" || event.kind !== "sent_to_prompter")
          return;
        const sent = parseSentControl(event.data);
        if (sent === null) return;
        state.knownSentRows.add(sent.rowId);
        recordTrailEntry(state.trails, sent.rowId, {
          sentAt: sent.sentAt,
          versionId: sent.versionId,
        });
        publishContext(state);
      });
    })
    .catch(() => {
      // handle unavailable: HTTP sends still work via the view snapshot
    });
  return () => {
    stopControl?.();
    if (openedHandle !== null) void openedHandle.close();
  };
}

function createPrompterRuntime(
  key: string,
  rundownId: string,
  services: PersonServices,
  env: Environment,
): PrompterRuntime {
  const rundownDoc = services.documents.open(rundownId);
  const initialStatus = rundownDoc.status.get();
  const state: PrompterRuntimeState = {
    key,
    rundownId,
    services,
    env,
    inFlight: new Set(),
    pendingKeys: new Map(),
    trails: new Map(),
    knownSentRows: new Set(),
    waitingByDocId: new Map(),
    disposed: false,
    online: initialStatus.network === "online" && env.online(),
    canSend: false,
    synced: !initialStatus.neverSynced,
    latestView: null,
    latestBeside: null,
    overrideRowId: null,
    lastSelectionSig: "",
    trackedStoryId: null,
    trackedStoryFormat: null,
    stopTrackedStory: null,
    snapshot: INITIAL_SNAPSHOT,
  };
  emitSnapshot(state);

  const hooks = {
    emit: () => emitSnapshot(state),
    publish: () => publishContext(state),
  };

  const stopStatus = rundownDoc.status.subscribe((st) => {
    const nextOnline = st.network === "online" && env.online();
    const nextSynced = !st.neverSynced;
    const cameOnline = !state.online && nextOnline;
    if (nextOnline !== state.online || nextSynced !== state.synced) {
      state.online = nextOnline;
      state.synced = nextSynced;
      emitSnapshot(state);
      publishContext(state);
    }
    if (cameOnline) refreshCanSend(state);
  });

  const stopHandle = attachControlListener(state);

  prompterActions.bind(rundownId, {
    send() {
      const target = resolveTargetRow(
        state.latestView,
        state.latestBeside,
        state.overrideRowId,
      );
      if (target !== null)
        void executePrompterSend(state, "send", target.id, hooks);
    },
    sendPrevious() {
      const target = resolveTargetRow(
        state.latestView,
        state.latestBeside,
        state.overrideRowId,
      );
      if (target !== null)
        void executePrompterSend(state, "sendPrevious", target.id, hooks);
    },
    sendRow(rowId: string) {
      state.overrideRowId = rowId;
      syncTrackedTarget(state);
      void executePrompterSend(state, "send", rowId, hooks);
    },
  });

  refreshCanSend(state);
  publishContext(state);

  return {
    refs: 0,
    getSnapshot: () => state.snapshot,
    syncView(view, beside) {
      state.latestView = view;
      state.latestBeside = beside;
      const sig = selectionSignature(view, beside);
      if (sig !== state.lastSelectionSig) {
        state.lastSelectionSig = sig;
        state.overrideRowId = null;
      }
      for (const row of view?.rundown?.rows ?? []) {
        if (row.prompter !== null) {
          state.knownSentRows.add(row.id);
          recordTrailEntry(state.trails, row.id, {
            sentAt: row.prompter.sentAt,
            versionId: row.prompter.versionId,
          });
        }
      }
      syncTrackedTarget(state);
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      stopStatus();
      state.stopTrackedStory?.();
      stopHandle();
      services.documents.close(rundownId);
      prompterActions.bind(rundownId, null);
      prompterActions.setContext(rundownId, null);
    },
  };
}

function retainRuntime(
  rundownId: string,
  services: PersonServices,
  env: Environment,
): PrompterRuntime {
  const key = runtimeKey(services, rundownId);
  let runtime = runtimes.get(key);
  if (runtime === undefined) {
    runtime = createPrompterRuntime(key, rundownId, services, env);
    runtimes.set(key, runtime);
    notifyKey(key);
  }
  runtime.refs += 1;
  return runtime;
}

function releaseRuntime(
  rundownId: string,
  services: PersonServices,
  runtime: PrompterRuntime,
): void {
  runtime.refs -= 1;
  if (runtime.refs > 0) return;
  const key = runtimeKey(services, rundownId);
  if (runtimes.get(key) === runtime) runtimes.delete(key);
  runtime.dispose();
  notifyKey(key);
}

const subscribeEmpty = (): (() => void) => () => {};
const readEmpty = (): PrompterSnapshot => INITIAL_SNAPSHOT;

/** Retains the live prompter runtime for `rundownId` (when non-null) and returns its reactive snapshot. */
export function usePrompterRuntime(
  rundownId: string | null,
  sync?: {
    readonly view: RundownViewState | null;
    readonly beside: BesideOpen | null;
  },
): PrompterSnapshot {
  const services = useServices();
  const env = useEnvironment();
  const key = rundownId === null ? null : runtimeKey(services, rundownId);

  useEffect(() => {
    if (rundownId === null) return undefined;
    const runtime = retainRuntime(rundownId, services, env);
    if (sync !== undefined) runtime.syncView(sync.view, sync.beside);
    return () => releaseRuntime(rundownId, services, runtime);
  }, [rundownId, services, env]);

  useEffect(() => {
    if (key === null || sync === undefined) return;
    runtimes.get(key)?.syncView(sync.view, sync.beside);
  }, [key, sync?.view, sync?.beside]);

  return useSyncExternalStore(
    (onStoreChange) =>
      key === null ? subscribeEmpty() : subscribeKey(key, onStoreChange),
    () =>
      key === null
        ? readEmpty()
        : (runtimes.get(key)?.getSnapshot() ?? INITIAL_SNAPSHOT),
  );
}
