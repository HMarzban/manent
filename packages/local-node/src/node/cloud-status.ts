// Live cloud reachability and offline-mode gate for the desktop local node.
import { ConnectError } from "@manent/sync-client";
import type { Clock } from "@manent/sync-client";
import type { CloudApi } from "./ports.ts";

export type ConnectionMode = "online" | "offline" | "slow";

export interface LocalCloudStatus {
  readonly online: boolean;
  readonly mode: ConnectionMode;
}

export interface CloudStatusController {
  /** CloudApi wrapper that blocks HTTP calls in offline mode and updates reachability on outcomes. */
  readonly cloud: CloudApi;
  status(): LocalCloudStatus;
  setMode(mode: ConnectionMode): void;
  reportReachable(): void;
  reportUnreachable(): void;
  /** Non-blocking reachability check via cloud.demo(); safe to call at launch or reconnect. */
  probe(): Promise<boolean>;
  stop(): void;
}

const PROBE_INITIAL_MS = 5_000;
const PROBE_CAP_MS = 30_000;

/**
 * Tracks whether the cloud server is currently reachable and whether the user/demo has forced offline mode.
 * Notifies `onOnlineChange` on every `online` transition and `onRecovered` whenever connectivity returns.
 */
export function createCloudStatus(options: {
  cloud: CloudApi;
  clock: Clock;
  onOnlineChange(online: boolean): void;
  onRecovered(): void;
}): CloudStatusController {
  const { clock } = options;
  let mode: ConnectionMode = "online";
  let reachable = true;
  let lastOnline = true;
  let stopped = false;
  let probing: Promise<boolean> | null = null;
  let probeDelayMs = PROBE_INITIAL_MS;
  let cancelProbe: (() => void) | null = null;

  const currentOnline = (): boolean => mode !== "offline" && reachable;

  function clearRetry(): void {
    cancelProbe?.();
    cancelProbe = null;
  }

  function scheduleProbe(): void {
    if (stopped || mode === "offline" || cancelProbe !== null) return;
    const wait = probeDelayMs;
    probeDelayMs = Math.min(probeDelayMs * 2, PROBE_CAP_MS);
    cancelProbe = clock.schedule(() => {
      cancelProbe = null;
      void probe();
    }, wait);
  }

  function emitIfChanged(): boolean {
    const next = currentOnline();
    if (next === lastOnline) return false;
    lastOnline = next;
    if (!stopped) options.onOnlineChange(next);
    return true;
  }

  function reportReachable(): void {
    if (stopped) return;
    clearRetry();
    probeDelayMs = PROBE_INITIAL_MS;
    reachable = true;
    if (mode === "offline") return;
    const changed = emitIfChanged();
    if (changed) options.onRecovered();
  }

  function reportUnreachable(): void {
    if (stopped) return;
    reachable = false;
    emitIfChanged();
    scheduleProbe();
  }

  async function observe<T>(run: () => Promise<T>): Promise<T> {
    if (mode === "offline") throw new ConnectError("unreachable");
    try {
      const result = await run();
      reportReachable();
      return result;
    } catch (error) {
      if (error instanceof ConnectError && error.code === "unreachable")
        reportUnreachable();
      throw error;
    }
  }

  function probe(): Promise<boolean> {
    if (stopped || mode === "offline") return Promise.resolve(false);
    if (probing !== null) return probing;
    const run = options.cloud
      .demo()
      .then(
        () => {
          reportReachable();
          return true;
        },
        (error: unknown) => {
          if (error instanceof ConnectError && error.code === "unreachable")
            reportUnreachable();
          return false;
        },
      )
      .finally(() => {
        if (probing === run) probing = null;
      });
    probing = run;
    return run;
  }

  const cloud: CloudApi = {
    signIn: (userId) => observe(() => options.cloud.signIn(userId)),
    demo: () => observe(() => options.cloud.demo()),
    describe: (token, request) =>
      observe(() => options.cloud.describe(token, request)),
    adopt: (token, request) =>
      observe(() => options.cloud.adopt(token, request)),
    forward: (token, request) =>
      observe(() => options.cloud.forward(token, request)),
  };

  return {
    cloud,
    status: () => ({ online: currentOnline(), mode }),
    setMode(next) {
      const wasOffline = mode === "offline";
      mode = next;
      if (next === "offline") {
        clearRetry();
        emitIfChanged();
        return;
      }
      clearRetry();
      probeDelayMs = PROBE_INITIAL_MS;
      const changed = emitIfChanged();
      if (changed || wasOffline) options.onRecovered();
      void probe();
    },
    reportReachable,
    reportUnreachable,
    probe,
    stop() {
      stopped = true;
      clearRetry();
    },
  };
}
