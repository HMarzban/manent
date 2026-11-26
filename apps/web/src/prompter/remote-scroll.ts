// Pure rAF remote prompter scroll interpolator (0 React renders/sec) and rundown operator-control runtime.
import {
  PROMPTER_OPERATOR_TTL_MS,
  parsePrompterOperatorChanged,
  parsePrompterScrollControl,
} from "@manent/sync-protocol";
import type {
  ControlKind,
  PrompterOperator,
  PrompterScrollCommand,
  PrompterScrollState,
} from "@manent/sync-protocol";
import { PROMPTER_CONTROL_WORDS } from "@manent/ui";
import { readDeviceId } from "../services/device-id.ts";
import type { PrompterControlInput } from "../state/prompter.store.ts";
import {
  fetchPrompterControlStatus,
  postPrompterOperatorRelease,
  postPrompterOperatorTake,
  postPrompterScrollCommand,
} from "./prompter-control-http.ts";
import { resolveTargetRow } from "./prompter-model.ts";
import { tokenOf } from "./prompter-send.ts";
import type { PrompterRuntimeState } from "./prompter-send.ts";

/** Remote scroll anchor plus smoothed `serverTime - localNow` offset in milliseconds. */
export interface PrompterRemoteScroll {
  readonly state: PrompterScrollState | null;
  readonly clockOffsetMs: number;
}

/** Eye-line reading position as a fraction of viewport height (30% down from top). */
export const PROMPTER_EYE_LINE_RATIO = 0.3;

/** Lease renewal cadence in milliseconds (half the 30 s server TTL). */
const RENEW_INTERVAL_MS = Math.floor(PROMPTER_OPERATOR_TTL_MS / 2);
const CONTROL_MESSAGE_ID = "prompter.control";

export type PrompterFollowMode = "follow" | "free";

export interface RemoteScrollContainer {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  querySelector<T extends Element = HTMLElement>(selector: string): T | null;
  getBoundingClientRect(): DOMRect;
}

/**
 * Pure computation of the target `scrollTop` (in px) for a remote scroll anchor at `nowMs`.
 * Aligns `rowId` + `lineOffset` (plus elapsed play lines) to the 30% eye-line guide.
 */
export function computeRemoteScrollTop(options: {
  readonly container: RemoteScrollContainer;
  readonly anchor: PrompterScrollState;
  readonly clockOffsetMs: number;
  readonly nowMs: number;
  readonly linePx: number;
}): number {
  const { container, anchor, clockOffsetMs, nowMs, linePx } = options;
  const maxScroll = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  const eyeLinePx = container.clientHeight * PROMPTER_EYE_LINE_RATIO;
  let storyBaseTop = 0;
  if (anchor.rowId !== null) {
    const escaped = anchor.rowId.replaceAll('"', '\\"');
    const storyEl = container.querySelector<HTMLElement>(
      `[data-prompter-story="${escaped}"]`,
    );
    if (storyEl !== null) {
      const containerRect = container.getBoundingClientRect();
      const storyRect = storyEl.getBoundingClientRect();
      const rawTop =
        storyRect.height > 0 || containerRect.height > 0
          ? storyRect.top - containerRect.top + container.scrollTop
          : storyEl.offsetTop;
      storyBaseTop = rawTop - eyeLinePx;
    }
  }
  const serverNow = nowMs + clockOffsetMs;
  const elapsedSec = anchor.playing
    ? Math.max(0, (serverNow - anchor.updatedAt) / 1000)
    : 0;
  const totalLines = anchor.lineOffset + elapsedSec * anchor.linesPerSecond;
  const rawPx = storyBaseTop + totalLines * linePx;
  return Math.max(0, Math.min(maxScroll, rawPx));
}

export interface RemoteScrollController {
  setAnchor(anchor: PrompterScrollState | null, clockOffsetMs: number): void;
  setFeedLive(live: boolean): void;
  setMode(mode: PrompterFollowMode): void;
  /** Called on local wheel/touch/key/foot-pedal scroll: drops into `free` mode immediately without revoking server lease. */
  notifyOwnMove(): void;
  isWritingScroll(): boolean;
  getMode(): PrompterFollowMode;
  dispose(): void;
}

/**
 * Drives `container.scrollTop` inside `requestFrame` at display refresh rate with zero React re-renders.
 * Immediately halts on `setFeedLive(false)` (`Feed lost` / `Offline`) and on local presenter override (`Free scroll`).
 */
export function createRemoteScrollController(options: {
  readonly getContainer: () => RemoteScrollContainer | null;
  readonly getLinePx: () => number;
  readonly now: () => number;
  readonly requestFrame: (cb: () => void) => () => void;
  readonly onModeChange?: (mode: PrompterFollowMode) => void;
}): RemoteScrollController {
  let mode: PrompterFollowMode = "follow";
  let feedLive = true;
  let anchor: PrompterScrollState | null = null;
  let clockOffsetMs = 0;
  let cancelFrame: (() => void) | null = null;
  let writing = false;
  let disposed = false;

  const stopLoop = (): void => {
    cancelFrame?.();
    cancelFrame = null;
  };

  const step = (): void => {
    cancelFrame = null;
    if (disposed || mode !== "follow" || !feedLive || anchor === null) return;
    const container = options.getContainer();
    if (container === null) return;
    const target = computeRemoteScrollTop({
      container,
      anchor,
      clockOffsetMs,
      nowMs: options.now(),
      linePx: options.getLinePx(),
    });
    writing = true;
    try {
      container.scrollTop = target;
    } finally {
      writing = false;
    }
    const maxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    if (anchor.playing && target < maxScroll) {
      cancelFrame = options.requestFrame(step);
    }
  };

  const sync = (): void => {
    stopLoop();
    if (disposed || mode !== "follow" || !feedLive || anchor === null) return;
    cancelFrame = options.requestFrame(step);
  };

  return {
    setAnchor(nextAnchor, nextOffsetMs) {
      anchor = nextAnchor;
      clockOffsetMs = nextOffsetMs;
      sync();
    },
    setFeedLive(live) {
      if (feedLive === live) return;
      feedLive = live;
      if (!feedLive) stopLoop();
      else sync();
    },
    setMode(nextMode) {
      if (mode === nextMode) return;
      mode = nextMode;
      if (mode === "free") stopLoop();
      else sync();
      options.onModeChange?.(mode);
    },
    notifyOwnMove() {
      if (writing) return;
      if (mode === "follow") {
        mode = "free";
        stopLoop();
        options.onModeChange?.("free");
      }
    },
    isWritingScroll: () => writing,
    getMode: () => mode,
    dispose() {
      disposed = true;
      stopLoop();
    },
  };
}

export interface PrompterControlRuntime {
  readonly deviceId: string;
  refreshStatus(): void;
  handleControlFrame(kind: ControlKind, data: Uint8Array): void;
  takeControl(): void;
  takeOver(): void;
  stopControlling(): void;
  sendCommand(command: PrompterControlInput): void;
  jumpHere(rowId?: string): void;
  onConnectivityChange(online: boolean): void;
  dispose(): void;
}

/** Manages server operator lease, periodic renewal, control frames and HTTP scroll commands for one rundown. */
export function createPrompterControlRuntime(
  state: PrompterRuntimeState,
  hooks: { emit(): void; publish(): void },
): PrompterControlRuntime {
  const deviceId = readDeviceId(state.env.storage, state.env.randomId);
  let cancelRenew: (() => void) | null = null;

  const isMe = (op: PrompterOperator | null): boolean =>
    op !== null &&
    op.userId === state.services.userId &&
    op.deviceId === deviceId;

  const stopRenew = (): void => {
    cancelRenew?.();
    cancelRenew = null;
  };

  const scheduleRenew = (): void => {
    stopRenew();
    if (state.disposed || !state.online || !isMe(state.operator)) return;
    cancelRenew = state.env.schedule(() => {
      cancelRenew = null;
      if (state.disposed || !state.online || !isMe(state.operator)) return;
      void postPrompterOperatorTake(
        state.rundownId,
        {
          deviceId,
          expectedUserId: state.services.userId,
          expectedDeviceId: deviceId,
        },
        tokenOf(state),
      ).then((outcome) => {
        if (state.disposed) return;
        if (outcome.ok) applyOperator(outcome.response.operator);
        else if (outcome.code === "operator_taken")
          applyOperator(outcome.operator);
      });
    }, RENEW_INTERVAL_MS);
  };

  const applyOperator = (next: PrompterOperator | null): void => {
    state.operator = next;
    state.isOperator = isMe(next);
    if (state.isOperator) scheduleRenew();
    else stopRenew();
    hooks.emit();
    hooks.publish();
  };

  const applyScroll = (next: PrompterScrollState | null): void => {
    if (next !== null && state.scroll !== null && next.seq < state.scroll.seq)
      return;
    state.scroll = next;
    hooks.emit();
  };

  const claim = (
    expectedUserId: string | null,
    expectedDeviceId?: string | null,
  ): void => {
    if (state.disposed || !state.online || state.takingControl) return;
    state.takingControl = true;
    hooks.emit();
    const body =
      expectedDeviceId !== undefined
        ? { deviceId, expectedUserId, expectedDeviceId }
        : { deviceId, expectedUserId };
    void postPrompterOperatorTake(state.rundownId, body, tokenOf(state)).then(
      (outcome) => {
        state.takingControl = false;
        if (state.disposed) return;
        if (outcome.ok) return applyOperator(outcome.response.operator);
        if (outcome.code === "operator_taken") {
          applyOperator(outcome.operator);
          state.services.messages.withdraw(CONTROL_MESSAGE_ID);
          state.services.messages.push({
            id: CONTROL_MESSAGE_ID,
            text: PROMPTER_CONTROL_WORDS.alreadyControlsPrompter(
              outcome.operator.name,
            ),
            lifetime: "brief",
            ownWork: false,
            actions: [],
          });
          return;
        }
        hooks.emit();
      },
    );
  };

  const sendCommand = (command: PrompterControlInput): void => {
    if (state.disposed || !state.online || !state.isOperator) return;
    const full = { ...command, deviceId } as PrompterScrollCommand;
    void postPrompterScrollCommand(state.rundownId, full, tokenOf(state)).then(
      (outcome) => {
        if (state.disposed) return;
        if (outcome.ok) {
          applyOperator(outcome.response.operator);
          applyScroll(outcome.response.scroll);
        } else if (outcome.code === "not_operator") {
          refreshStatus();
        }
      },
    );
  };

  const refreshStatus = (): void => {
    if (state.disposed || !state.online) return;
    void fetchPrompterControlStatus(state.rundownId, tokenOf(state)).then(
      (status) => {
        if (state.disposed || status === null) return;
        state.operator = status.operator;
        state.isOperator = isMe(status.operator);
        state.scroll = status.scroll;
        if (state.isOperator) scheduleRenew();
        else stopRenew();
        hooks.emit();
        hooks.publish();
      },
    );
  };

  const releaseNow = (): void => {
    void postPrompterOperatorRelease(
      state.rundownId,
      { deviceId },
      tokenOf(state),
    );
  };

  return {
    deviceId,
    refreshStatus,
    handleControlFrame(kind, data) {
      if (kind === "prompter_operator_changed") {
        const event = parsePrompterOperatorChanged(data);
        if (event !== null) applyOperator(event.operator);
      } else if (kind === "prompter_scroll") {
        const event = parsePrompterScrollControl(data);
        if (event !== null) applyScroll(event.scroll);
      }
    },
    takeControl: () => claim(null),
    takeOver: () =>
      claim(state.operator?.userId ?? null, state.operator?.deviceId ?? null),
    stopControlling() {
      if (state.disposed || !state.isOperator) return;
      stopRenew();
      state.operator = null;
      state.isOperator = false;
      hooks.emit();
      hooks.publish();
      releaseNow();
    },
    sendCommand,
    jumpHere(rowId) {
      if (state.disposed || !state.online || !state.isOperator) return;
      const targetRow =
        rowId !== undefined
          ? (state.latestView?.rundown?.rows.find((r) => r.id === rowId) ??
            null)
          : resolveTargetRow(
              state.latestView,
              state.latestBeside,
              state.overrideRowId,
            );
      if (
        targetRow === null ||
        (targetRow.prompter === null && !state.knownSentRows.has(targetRow.id))
      )
        return;
      sendCommand({ action: "cue", rowId: targetRow.id, lineOffset: 0 });
    },
    onConnectivityChange(online) {
      if (!online) stopRenew();
      else {
        refreshStatus();
        if (state.isOperator) scheduleRenew();
      }
    },
    dispose() {
      stopRenew();
      if (state.isOperator && state.online) releaseNow();
    },
  };
}
