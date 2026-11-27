// Subscribable store for the browser's install prompt (beforeinstallprompt + appinstalled) and web shell PWA helpers.
import { PREFERENCES_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { isStandalone } from "../platform.ts";
import { registerLaunchQueue } from "./launch-queue.ts";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    readonly outcome: "accepted" | "dismissed";
  }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface InstallStore {
  /** True while the browser has offered an install prompt and Manent is not already standalone. */
  canInstall(): boolean;
  /** Runs the captured install prompt, returning the person's choice or "unavailable". */
  promptInstall(): Promise<InstallOutcome>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function isBeforeInstallPromptEvent(
  event: Event,
): event is BeforeInstallPromptEvent {
  return (
    typeof Reflect.get(event, "prompt") === "function" && "userChoice" in event
  );
}

/** Captures Chromium's beforeinstallprompt and appinstalled events on `target`, staying hidden when standalone. */
export function createInstallStore(options?: {
  readonly target?: EventTarget | null;
  readonly isStandalone?: () => boolean;
}): InstallStore {
  const target =
    options && "target" in options
      ? options.target
      : typeof window !== "undefined"
        ? window
        : null;
  const standalone = options?.isStandalone ?? isStandalone;
  const listeners = new Set<() => void>();
  let deferred: BeforeInstallPromptEvent | null = null;
  let installed = false;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const onBeforeInstallPrompt = (event: Event): void => {
    if (!isBeforeInstallPromptEvent(event)) return;
    if (standalone()) return;
    event.preventDefault();
    deferred = event;
    installed = false;
    notify();
  };

  const onAppInstalled = (): void => {
    deferred = null;
    installed = true;
    notify();
  };

  target?.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  target?.addEventListener("appinstalled", onAppInstalled);

  return {
    canInstall(): boolean {
      return !installed && !standalone() && deferred !== null;
    },
    async promptInstall(): Promise<InstallOutcome> {
      if (installed || standalone() || deferred === null) return "unavailable";
      const promptEvent = deferred;
      deferred = null;
      notify();
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          installed = true;
          notify();
        }
        return choice.outcome;
      } catch {
        return "unavailable";
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose(): void {
      target?.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      target?.removeEventListener("appinstalled", onAppInstalled);
      listeners.clear();
      deferred = null;
    },
  };
}

let sharedStore: InstallStore | null = null;

/** Lazily created browser-wide install store; importing this module does nothing until called. */
export function browserInstallStore(): InstallStore {
  if (sharedStore === null) sharedStore = createInstallStore();
  return sharedStore;
}

/** Disposes and clears the shared browser store (for tests). */
export function resetBrowserInstallStore(): void {
  sharedStore?.dispose();
  sharedStore = null;
}

const WEB_UPDATE_MESSAGE_ID = "web_update_ready";

/** Starts web-only PWA listeners (install prompt capture + file-handling launchQueue) once the shell mounts. */
export function startWebPwa(): void {
  browserInstallStore();
  registerLaunchQueue();
}

/** Pushes or withdraws the calm, non-modal MessageSlot update notice when web `updateState` changes. */
export function syncWebUpdateNotice(options: {
  readonly ready: boolean;
  readonly notified: { current: boolean };
  readonly messages: MessageQueue;
}): void {
  const { ready, notified, messages } = options;
  if (ready) {
    if (notified.current) return;
    notified.current = true;
    messages.push({
      id: WEB_UPDATE_MESSAGE_ID,
      text: PREFERENCES_WORDS.webUpdateReadyMessage,
      actions: [
        {
          label: PREFERENCES_WORDS.reloadToUpdate,
          commandId: "app.reloadToUpdate",
        },
      ],
      lifetime: "until_dismissed",
      ownWork: false,
    });
    return;
  }
  notified.current = false;
  messages.withdraw(WEB_UPDATE_MESSAGE_ID);
}
