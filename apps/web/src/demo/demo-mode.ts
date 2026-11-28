// Clean workspace mode: dismisses Demo and Tour across tabs and desktop restarts while preserving local work.
import type { SignInChoice } from "@manent/sync-protocol";
import { useSyncExternalStore } from "react";
import type { Api, SignInResult } from "../api.ts";
import type { DesktopHost } from "../desktop/host.ts";
import {
  choosePerson,
  clearDemoStorageState,
  readCleanWorkspaceFlag,
  subscribeCleanWorkspaceStorage,
  writeCleanWorkspaceFlag,
} from "../session.ts";
import type { TabPerson } from "../session.ts";
import { panelsActions } from "../state/panels.store.ts";
import { tourActions } from "../state/tour.store.ts";

const listeners = new Set<() => void>();
let cached: boolean | null = null;
let listeningStorage = false;

function ensureStorageSubscription(): void {
  if (listeningStorage) return;
  listeningStorage = true;
  subscribeCleanWorkspaceStorage(() => {
    const next = readCleanWorkspaceFlag();
    if (next === cached) return;
    cached = next;
    for (const listener of listeners) listener();
  });
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** True when the writer dismissed Demo and Tour for a clean personal workspace. */
export function isCleanWorkspace(): boolean {
  if (cached === null) cached = readCleanWorkspaceFlag();
  return cached;
}

/** Updates clean-workspace mode in storage and notifies every mounted subscriber. */
export function setCleanWorkspace(enabled: boolean): void {
  writeCleanWorkspaceFlag(enabled);
  const changed = cached !== enabled;
  cached = enabled;
  if (changed) notify();
}

/** Re-reads clean-workspace mode from storage; used by tests after clearing localStorage. */
export function resetCleanWorkspaceCache(): void {
  cached = null;
}

function subscribeCleanWorkspace(listener: () => void): () => void {
  ensureStorageSubscription();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes to clean-workspace mode reactively, including cross-tab storage updates. */
export function useCleanWorkspace(): boolean {
  return useSyncExternalStore(
    subscribeCleanWorkspace,
    isCleanWorkspace,
    isCleanWorkspace,
  );
}

/** Dismisses any active Tour step, floating bar, and open Tour side tab immediately. */
export function clearTourUiState(): void {
  tourActions.suppress();
  if (panelsActions.get().side.tab === "tour") panelsActions.close("side");
}

/**
 * Switches into the local unregistered workspace with Demo and Tour removed: respects the close guard,
 * clears Tour/demo state, persists across desktop restarts, signs in `You`, and navigates to `/`.
 */
export async function enterCleanWorkspace(options: {
  readonly choice: SignInChoice;
  readonly api: Api;
  readonly desktop: DesktopHost | null;
  readonly mayLeave: () => Promise<boolean>;
  readonly setPerson: (person: TabPerson) => void;
  readonly navigateHome: () => Promise<void>;
}): Promise<SignInResult> {
  const { choice, api, desktop, mayLeave, setPerson, navigateHome } = options;
  const result =
    desktop !== null
      ? await api.signIn(choice.userId)
      : await choosePerson(choice, api);
  if (!result.ok) return result;
  if (!(await mayLeave())) return result;
  clearTourUiState();
  clearDemoStorageState();
  setCleanWorkspace(true);
  if (desktop !== null) {
    await desktop.setDemoMode?.(true).catch(() => {});
    await desktop.setConnection("online", 0).catch(() => {});
  }
  setPerson(result.person);
  await navigateHome();
  return result;
}

/** Turns Demo and Tour back on without modifying any of the writer's local scripts. */
export function restoreDemoMode(desktop: DesktopHost | null): void {
  setCleanWorkspace(false);
  if (desktop !== null) {
    void desktop.setDemoMode?.(false).catch(() => {});
  }
}
