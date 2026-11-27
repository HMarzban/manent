// Service worker registration, debounced update discovery, and coordinated multi-tab reloads.
import type { UpdateState } from "@manent/sync-protocol";
import type { Subscribable } from "@manent/ui";

export const SW_UPDATE_CHANNEL = "manent:sw-update";
export const UPDATE_CHECK_DEBOUNCE_MS = 60_000;
export const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1_000;
const TYPING_IDLE_MS = 2_000;

export interface WebUpdateController {
  check(): Promise<void>;
  apply(): Promise<void>;
  isReady(): boolean;
}

export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close(): void;
}

export type SwInstallPhase =
  "installing" | "activated" | "redundant" | "unavailable";

export interface SwLifecycleOptions {
  readonly container: ServiceWorkerContainer | null;
  readonly updateState: Subscribable<UpdateState | null> & {
    set(state: UpdateState | null): void;
  };
  readonly now: () => number;
  readonly schedule: (fn: () => void, delayMs: number) => () => void;
  readonly online: () => boolean;
  readonly lastKeyAt: () => number | null;
  readonly hasBlockingSave?: () => boolean;
  readonly currentBuildId?: string | null;
  readonly reload?: () => void;
  readonly onInstallPhase?: (phase: SwInstallPhase) => void;
  readonly win?: Pick<
    Window,
    "addEventListener" | "removeEventListener"
  > | null;
  readonly doc?: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > | null;
  readonly createChannel?: (name: string) => BroadcastChannelLike | null;
}

export interface SwLifecycleHandle {
  readonly controller: WebUpdateController;
  readonly ready: Promise<ServiceWorkerRegistration | null>;
  notifyBuildId(serverBuildId: string | null): void;
  dispose(): void;
}

let activeWebUpdate: WebUpdateController | null = null;

/** Registers the active web update controller for route-level stale-chunk recovery; null clears it. */
export function setActiveWebUpdate(
  controller: WebUpdateController | null,
): void {
  activeWebUpdate = controller;
}

/** The active web update controller on web; null on desktop or before lifecycle startup. */
export function getActiveWebUpdate(): WebUpdateController | null {
  return activeWebUpdate;
}

/** Reads the build id embedded in `<meta name="manent-build" content="...">`; null when absent. */
export function readMetaBuildId(
  doc: Pick<Document, "querySelector"> | null = typeof document === "undefined"
    ? null
    : document,
): string | null {
  const content = doc
    ?.querySelector('meta[name="manent-build"]')
    ?.getAttribute("content")
    ?.trim();
  return content && content.length > 0 ? content : null;
}

function defaultChannel(name: string): BroadcastChannelLike | null {
  if (typeof BroadcastChannel !== "function") return null;
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

function isApplyingMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    Reflect.get(data, "type") === "UPDATE_APPLYING"
  );
}

/**
 * Registers `/sw.js` with `updateViaCache: "none"`, tracks waiting workers in `updateState`,
 * checks for updates on visibility/pageshow/online/30m interval/build-id mismatch (debounced >= 60s),
 * and reloads on `controllerchange` ONLY when a previous controller existed AND an update was requested.
 */
export function startSwLifecycle(
  options: SwLifecycleOptions,
): SwLifecycleHandle {
  const { container, updateState, now, schedule, online, lastKeyAt } = options;
  const currentBuildId = options.currentBuildId ?? readMetaBuildId();
  const reload =
    options.reload ??
    (() => {
      if (typeof window !== "undefined") window.location.reload();
    });
  const win =
    options.win !== undefined
      ? options.win
      : typeof window !== "undefined"
        ? window
        : null;
  const doc =
    options.doc !== undefined
      ? options.doc
      : typeof document !== "undefined"
        ? document
        : null;

  if (container === null) {
    options.onInstallPhase?.("unavailable");
    const noop: WebUpdateController = {
      check: async () => {},
      apply: async () => {},
      isReady: () => false,
    };
    return {
      controller: noop,
      ready: Promise.resolve(null),
      notifyBuildId: () => {},
      dispose: () => {},
    };
  }

  // Capture BEFORE register() so first-install clientsClaim() never reloads the page;
  // once that initial claim fires controllerchange, flip hadController so a later update reloads cleanly.
  let hadController = container.controller !== null;
  let updateRequested = false;
  let reloading = false;
  let disposed = false;
  let lastCheckAt = -Infinity;
  let registration: ServiceWorkerRegistration | null = null;
  let cancelPoll: (() => void) | null = null;
  const cleanups: (() => void)[] = [];

  const isTyping = (): boolean => {
    const at = lastKeyAt();
    return at !== null && now() - at <= TYPING_IDLE_MS;
  };

  const canInterrupt = (): boolean =>
    !isTyping() && options.hasBlockingSave?.() !== true;

  const watchInstalling = (worker: ServiceWorker | null): void => {
    if (worker === null) return;
    const isInitialInstall = !hadController;
    if (isInitialInstall) options.onInstallPhase?.("installing");
    const onStateChange = (): void => {
      if (disposed) return;
      if (worker.state === "installed" && container.controller !== null) {
        updateState.set("ready");
      } else if (isInitialInstall && worker.state === "activated") {
        options.onInstallPhase?.("activated");
      } else if (isInitialInstall && worker.state === "redundant") {
        options.onInstallPhase?.("redundant");
      }
    };
    worker.addEventListener("statechange", onStateChange);
    cleanups.push(() =>
      worker.removeEventListener("statechange", onStateChange),
    );
  };

  const watchRegistration = (reg: ServiceWorkerRegistration): void => {
    if (disposed) return;
    registration = reg;
    if (reg.waiting !== null) updateState.set("ready");
    if (reg.installing !== null) watchInstalling(reg.installing);
    const onUpdateFound = (): void => {
      watchInstalling(reg.installing);
    };
    reg.addEventListener("updatefound", onUpdateFound);
    cleanups.push(() => reg.removeEventListener("updatefound", onUpdateFound));
  };

  const onControllerChange = (): void => {
    if (disposed || reloading) return;
    if (!hadController) {
      hadController = true;
      options.onInstallPhase?.("activated");
      return;
    }
    if (!updateRequested) return;
    reloading = true;
    reload();
  };
  container.addEventListener("controllerchange", onControllerChange);
  cleanups.push(() =>
    container.removeEventListener("controllerchange", onControllerChange),
  );

  const channel = (options.createChannel ?? defaultChannel)(SW_UPDATE_CHANNEL);
  if (channel !== null) {
    const onChannelMessage = (event: MessageEvent<unknown>): void => {
      if (disposed || !isApplyingMessage(event.data)) return;
      if (canInterrupt()) updateRequested = true;
    };
    channel.addEventListener("message", onChannelMessage);
    cleanups.push(() => {
      channel.removeEventListener("message", onChannelMessage);
      channel.close();
    });
  }

  const ready = container
    .register("/sw.js", { updateViaCache: "none" })
    .then((reg) => {
      watchRegistration(reg);
      return reg;
    })
    .catch(() => {
      if (!disposed) options.onInstallPhase?.("unavailable");
      return null;
    });

  const runCheck = async (manual: boolean): Promise<void> => {
    if (disposed) return;
    if (!online()) {
      if (manual && updateState.get() !== "ready")
        updateState.set("check_failed");
      return;
    }
    if (!manual && now() - lastCheckAt < UPDATE_CHECK_DEBOUNCE_MS) return;
    lastCheckAt = now();
    const reg = registration ?? (await ready);
    if (disposed) return;
    if (reg === null) {
      if (manual && updateState.get() !== "ready")
        updateState.set("check_failed");
      return;
    }
    if (manual && updateState.get() !== "ready") updateState.set("checking");
    try {
      await reg.update();
    } catch {
      if (!disposed && manual && updateState.get() !== "ready")
        updateState.set("check_failed");
      return;
    }
    if (disposed) return;
    if (reg.waiting !== null) {
      updateState.set("ready");
      return;
    }
    if (reg.installing !== null) {
      watchInstalling(reg.installing);
      return;
    }
    if (manual && updateState.get() !== "ready") updateState.set("up_to_date");
  };

  const apply = async (): Promise<void> => {
    if (disposed || options.hasBlockingSave?.() === true) return;
    const reg = registration ?? (await ready);
    if (disposed) return;
    const waiting = reg?.waiting ?? null;
    if (waiting === null) return;
    updateRequested = true;
    try {
      // BroadcastChannel.postMessage takes no targetOrigin
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      channel?.postMessage({ type: "UPDATE_APPLYING" });
    } catch {
      // ignore closed or blocked channel
    }
    // ServiceWorker.postMessage takes no targetOrigin
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  const schedulePoll = (): void => {
    if (disposed) return;
    cancelPoll = schedule(() => {
      cancelPoll = null;
      void runCheck(false);
      schedulePoll();
    }, UPDATE_POLL_INTERVAL_MS);
  };
  schedulePoll();

  if (doc !== null) {
    const onVisibility = (): void => {
      if (doc.visibilityState === "visible") void runCheck(false);
    };
    doc.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() =>
      doc.removeEventListener("visibilitychange", onVisibility),
    );
  }

  if (win !== null) {
    const onPageShow = (event: Event): void => {
      if ("persisted" in event && event.persisted === true)
        void runCheck(false);
    };
    const onOnline = (): void => {
      void runCheck(false);
    };
    win.addEventListener("pageshow", onPageShow);
    win.addEventListener("online", onOnline);
    cleanups.push(() => {
      win.removeEventListener("pageshow", onPageShow);
      win.removeEventListener("online", onOnline);
    });
  }

  const controller: WebUpdateController = {
    check: () => runCheck(true),
    apply,
    isReady: () =>
      updateState.get() === "ready" || registration?.waiting !== null,
  };

  return {
    controller,
    ready,
    notifyBuildId(serverBuildId) {
      if (
        disposed ||
        currentBuildId === null ||
        serverBuildId === null ||
        serverBuildId.length === 0 ||
        serverBuildId === currentBuildId
      )
        return;
      void runCheck(false);
    },
    dispose() {
      disposed = true;
      cancelPoll?.();
      cancelPoll = null;
      for (const stop of cleanups.splice(0)) stop();
    },
  };
}
