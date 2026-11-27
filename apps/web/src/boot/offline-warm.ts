// Idle offline tool warming: warms heavy on-demand chunks via the service worker once the page is idle and visible.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

export type OfflineReadinessStatus =
  "shell_only" | "warming" | "ready" | "paused_save_data";

export interface OfflineReadinessState {
  readonly status: OfflineReadinessStatus;
  readonly cached: number;
  readonly total: number;
}

export type OfflineReadinessPort = Subscribable<OfflineReadinessState> & {
  warmNow(): void;
};

export interface NetworkConnectionLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

export interface OfflineWarmOptions {
  readonly container: ServiceWorkerContainer | null;
  readonly now: () => number;
  readonly schedule: (fn: () => void, delayMs: number) => () => void;
  readonly frame: (fn: () => void) => () => void;
  readonly lastKeyAt: () => number | null;
  readonly connection?: () => NetworkConnectionLike | null;
  readonly win?: Pick<
    Window,
    "addEventListener" | "removeEventListener"
  > | null;
  readonly doc?: Pick<
    Document,
    | "readyState"
    | "visibilityState"
    | "addEventListener"
    | "removeEventListener"
  > | null;
}

const TYPING_IDLE_MS = 2_000;
const INITIAL_STATE: OfflineReadinessState = Object.freeze({
  status: "shell_only",
  cached: 0,
  total: 0,
});

/** True when the browser asks to save data or reports a 2G/slow-2G link. */
export function isConstrainedConnection(
  connection: NetworkConnectionLike | null | undefined,
): boolean {
  if (connection === null || connection === undefined) return false;
  return (
    connection.saveData === true ||
    connection.effectiveType === "2g" ||
    connection.effectiveType === "slow-2g"
  );
}

function readNavigatorConnection(): NetworkConnectionLike | null {
  if (typeof navigator === "undefined") return null;
  const conn: unknown = Reflect.get(navigator, "connection");
  if (typeof conn !== "object" || conn === null) return null;
  return conn as NetworkConnectionLike;
}

function parseReadinessMessage(data: unknown): OfflineReadinessState | null {
  if (typeof data !== "object" || data === null) return null;
  if (Reflect.get(data, "type") !== "OFFLINE_READINESS_STATE") return null;
  const status: unknown = Reflect.get(data, "status");
  const cached: unknown = Reflect.get(data, "cached");
  const total: unknown = Reflect.get(data, "total");
  if (status !== "ready" && status !== "warming" && status !== "shell_only")
    return null;
  if (typeof cached !== "number" || typeof total !== "number") return null;
  return { status, cached, total };
}

/**
 * Coordinates background offline tool warming after first frame, window load, SW readiness, page visibility,
 * and typing idle (> 2s). Pauses automatically on saveData / 2g links unless `warmNow()` is called explicitly.
 */
export function createOfflineWarm(options: OfflineWarmOptions): {
  readonly readiness: OfflineReadinessPort;
  dispose(): void;
} {
  const state = createValue<OfflineReadinessState>(INITIAL_STATE);
  const { container, now, schedule, frame, lastKeyAt } = options;
  const readConnection = options.connection ?? readNavigatorConnection;
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
    return {
      readiness: {
        get: state.get,
        subscribe: state.subscribe,
        warmNow: () => {},
      },
      dispose: () => {},
    };
  }

  let disposed = false;
  let manualRequested = false;
  let cancelFrame: (() => void) | null = null;
  let cancelTimer: (() => void) | null = null;
  const cleanups: (() => void)[] = [];

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (disposed) return;
    const parsed = parseReadinessMessage(event.data);
    if (parsed === null) return;
    if (
      !manualRequested &&
      parsed.status === "shell_only" &&
      state.get().status === "paused_save_data"
    ) {
      state.set({
        status: "paused_save_data",
        cached: parsed.cached,
        total: parsed.total,
      });
      return;
    }
    state.set(parsed);
  };
  container.addEventListener("message", onMessage);
  cleanups.push(() => container.removeEventListener("message", onMessage));

  const postToWorker = (
    type: "WARM_OFFLINE_TOOLS" | "OFFLINE_READINESS",
  ): void => {
    void container.ready.then((registration) => {
      if (disposed) return;
      const target = registration.active ?? container.controller;
      // ServiceWorker.postMessage takes no targetOrigin
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      target?.postMessage({ type });
    });
  };

  const triggerWhenIdle = (): void => {
    if (disposed || manualRequested) return;
    if (doc !== null && doc.visibilityState !== "visible") {
      const onVisible = (): void => {
        if (doc.visibilityState !== "visible") return;
        doc.removeEventListener("visibilitychange", onVisible);
        triggerWhenIdle();
      };
      doc.addEventListener("visibilitychange", onVisible);
      cleanups.push(() =>
        doc.removeEventListener("visibilitychange", onVisible),
      );
      return;
    }
    const keyed = lastKeyAt();
    if (keyed !== null) {
      const elapsed = now() - keyed;
      if (elapsed <= TYPING_IDLE_MS) {
        cancelTimer?.();
        cancelTimer = schedule(
          () => {
            cancelTimer = null;
            triggerWhenIdle();
          },
          TYPING_IDLE_MS - elapsed + 1,
        );
        return;
      }
    }
    if (isConstrainedConnection(readConnection())) {
      const current = state.get();
      if (current.status !== "ready")
        state.set({ ...current, status: "paused_save_data" });
      postToWorker("OFFLINE_READINESS");
      return;
    }
    postToWorker("WARM_OFFLINE_TOOLS");
  };

  const afterLoadAndReady = (): void => {
    void container.ready.then(() => {
      if (!disposed) triggerWhenIdle();
    });
  };

  cancelFrame = frame(() => {
    cancelFrame = null;
    if (disposed) return;
    if (doc === null || doc.readyState === "complete" || win === null) {
      afterLoadAndReady();
      return;
    }
    const onLoad = (): void => {
      win.removeEventListener("load", onLoad);
      afterLoadAndReady();
    };
    win.addEventListener("load", onLoad);
    cleanups.push(() => win.removeEventListener("load", onLoad));
  });

  return {
    readiness: {
      get: state.get,
      subscribe: state.subscribe,
      warmNow() {
        if (disposed) return;
        manualRequested = true;
        postToWorker("WARM_OFFLINE_TOOLS");
      },
    },
    dispose() {
      disposed = true;
      cancelFrame?.();
      cancelFrame = null;
      cancelTimer?.();
      cancelTimer = null;
      for (const stop of cleanups.splice(0)) stop();
    },
  };
}
