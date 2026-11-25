// Per-rundown prompter runtime: capability lookup, story sync/format tracking, control listening and remote operator control.
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
import {
  INITIAL_PROMPTER_SNAPSHOT,
  createPrompterRuntimeState,
  executePrompterSend,
  tokenOf,
  trackPrompterStory,
} from "./prompter-send.ts";
import type {
  PrompterRuntimeState,
  PrompterSnapshot,
} from "./prompter-send.ts";
import { createPrompterControlRuntime } from "./remote-scroll.ts";
import type { PrompterControlRuntime } from "./remote-scroll.ts";

export type { PrompterSnapshot } from "./prompter-send.ts";

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
  const target = resolveTargetRow(
    state.latestView,
    state.latestBeside,
    state.overrideRowId,
  );
  const activeRowSent =
    target !== null &&
    (target.prompter !== null || state.knownSentRows.has(target.id));
  const hasSentRow =
    state.knownSentRows.size > 0 ||
    (state.latestView?.rundown?.rows.some((row) => row.prompter !== null) ??
      false);
  state.snapshot = Object.freeze({
    online: state.online,
    canSend: state.canSend,
    synced: state.synced,
    inFlightRows: new Set(state.inFlight),
    waitingByDocId: new Map(state.waitingByDocId),
    operator: state.operator,
    scroll: state.scroll,
    takingControl: state.takingControl,
    isOperator: state.isOperator,
    hasSentRow,
    activeRowId: target?.id ?? null,
    activeRowSent,
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
    controlling: state.isOperator,
  });
}

function attachControlListener(
  state: PrompterRuntimeState,
  control: PrompterControlRuntime,
): () => void {
  let openedHandle: DocHandle | null = null;
  let stopControl: (() => void) | null = null;
  void state.services
    .openHandle(state.rundownId)
    .then((handle) => {
      if (state.disposed) return void handle.close();
      openedHandle = handle;
      stopControl = handle.on((event) => {
        if (event.type !== "control") return;
        if (event.kind === "sent_to_prompter") {
          const sent = parseSentControl(event.data);
          if (sent === null) return;
          state.knownSentRows.add(sent.rowId);
          recordTrailEntry(state.trails, sent.rowId, {
            sentAt: sent.sentAt,
            versionId: sent.versionId,
          });
          emitSnapshot(state);
          publishContext(state);
          return;
        }
        control.handleControlFrame(event.kind, event.data);
      });
    })
    .catch(() => {});
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
  const st0 = rundownDoc.status.get();
  const state = createPrompterRuntimeState(
    key,
    rundownId,
    services,
    env,
    st0.network === "online" && env.online(),
    !st0.neverSynced,
  );
  const hooks = {
    emit: () => emitSnapshot(state),
    publish: () => publishContext(state),
  };
  const control = createPrompterControlRuntime(state, hooks);
  emitSnapshot(state);

  const refreshCanSend = (): void => {
    if (state.disposed || !state.online) return;
    void fetchCanSendPrompter(state.rundownId, tokenOf(state)).then((ok) => {
      if (state.disposed || ok === null || ok === state.canSend) return;
      state.canSend = ok;
      emitSnapshot(state);
      publishContext(state);
      if (ok) control.refreshStatus();
    });
  };

  const stopStatus = rundownDoc.status.subscribe((st) => {
    const nextOnline = st.network === "online" && env.online();
    const nextSynced = !st.neverSynced;
    const cameOnline = !state.online && nextOnline;
    const changed = nextOnline !== state.online;
    if (changed || nextSynced !== state.synced) {
      state.online = nextOnline;
      state.synced = nextSynced;
      emitSnapshot(state);
      publishContext(state);
    }
    if (changed) control.onConnectivityChange(nextOnline);
    if (cameOnline) refreshCanSend();
  });

  const stopHandle = attachControlListener(state, control);
  const runTarget = (kind: "send" | "sendPrevious"): void => {
    const target = resolveTargetRow(
      state.latestView,
      state.latestBeside,
      state.overrideRowId,
    );
    if (target !== null)
      void executePrompterSend(state, kind, target.id, hooks);
  };

  prompterActions.bind(rundownId, {
    send: () => runTarget("send"),
    sendPrevious: () => runTarget("sendPrevious"),
    sendRow(rowId: string) {
      state.overrideRowId = rowId;
      trackPrompterStory(
        state,
        resolveTargetRow(state.latestView, state.latestBeside, rowId)?.docId ??
          null,
        hooks,
      );
      void executePrompterSend(state, "send", rowId, hooks);
    },
    takeControl: control.takeControl,
    takeOver: control.takeOver,
    stopControlling: control.stopControlling,
    jumpHere: control.jumpHere,
    sendControl: control.sendCommand,
  });

  refreshCanSend();
  control.refreshStatus();
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
      const row = resolveTargetRow(view, beside, state.overrideRowId);
      trackPrompterStory(state, row?.docId ?? null, hooks);
      emitSnapshot(state);
      publishContext(state);
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      control.dispose();
      stopStatus();
      state.stopTrackedStory?.();
      stopHandle();
      services.documents.close(rundownId);
      prompterActions.bind(rundownId, null);
      prompterActions.setContext(rundownId, null);
    },
  };
}

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
    if (rundownId === null || key === null) return undefined;
    let runtime = runtimes.get(key);
    if (runtime === undefined) {
      runtime = createPrompterRuntime(key, rundownId, services, env);
      runtimes.set(key, runtime);
      notifyKey(key);
    }
    runtime.refs += 1;
    if (sync !== undefined) runtime.syncView(sync.view, sync.beside);
    return () => {
      runtime.refs -= 1;
      if (runtime.refs > 0) return;
      if (runtimes.get(key) === runtime) runtimes.delete(key);
      runtime.dispose();
      notifyKey(key);
    };
  }, [rundownId, key, services, env]);

  useEffect(() => {
    if (key === null || sync === undefined) return;
    runtimes.get(key)?.syncView(sync.view, sync.beside);
  }, [key, sync?.view, sync?.beside]);

  return useSyncExternalStore(
    (onStoreChange) =>
      key === null ? () => () => {} : subscribeKey(key, onStoreChange),
    () =>
      key === null
        ? INITIAL_PROMPTER_SNAPSHOT
        : (runtimes.get(key)?.getSnapshot() ?? INITIAL_PROMPTER_SNAPSHOT),
  );
}
