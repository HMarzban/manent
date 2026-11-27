// Pure rAF remote prompter scroll interpolator (0 React renders/sec) and Follow/Free mode controller.
import type { PrompterScrollState } from "@manent/sync-protocol";

/** Remote scroll anchor plus smoothed `serverTime - localNow` offset in milliseconds. */
export interface PrompterRemoteScroll {
  readonly state: PrompterScrollState | null;
  readonly clockOffsetMs: number;
}

/** Eye-line reading position as a fraction of viewport height (30% down from top). */
export const PROMPTER_EYE_LINE_RATIO = 0.3;

export type PrompterFollowMode = "follow" | "free";

export interface RemoteScrollContainer {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  querySelector<T extends Element = HTMLElement>(selector: string): T | null;
  getBoundingClientRect(): DOMRect;
}

/** Pure target `scrollTop` (px) aligning `rowId` + `lineOffset` + elapsed play lines to the 30% eye-line guide. */
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
  const elapsedSec = anchor.playing
    ? Math.max(0, (nowMs + clockOffsetMs - anchor.updatedAt) / 1000)
    : 0;
  const totalLines = anchor.lineOffset + elapsedSec * anchor.linesPerSecond;
  return Math.max(0, Math.min(maxScroll, storyBaseTop + totalLines * linePx));
}

export interface RemoteScrollController {
  setAnchor(anchor: PrompterScrollState | null, clockOffsetMs: number): void;
  setFeedLive(live: boolean): void;
  setMode(mode: PrompterFollowMode): void;
  notifyOwnMove(): void;
  isWritingScroll(): boolean;
  lastWrittenScrollTop(): number | null;
  getMode(): PrompterFollowMode;
  dispose(): void;
}

/** Drives `container.scrollTop` in `requestFrame` with 0 React re-renders; halts on feed loss or local override. */
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
  let lastWrittenTop: number | null = null;
  let disposed = false;

  const stopLoop = (): void => {
    cancelFrame?.();
    cancelFrame = null;
  };
  const halt = (): void => {
    stopLoop();
    lastWrittenTop = null;
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
      lastWrittenTop = container.scrollTop;
    } finally {
      writing = false;
    }
    if (
      anchor.playing &&
      target < container.scrollHeight - container.clientHeight
    )
      cancelFrame = options.requestFrame(step);
  };
  const sync = (): void => {
    stopLoop();
    if (!disposed && mode === "follow" && feedLive && anchor !== null)
      cancelFrame = options.requestFrame(step);
  };

  return {
    setAnchor(nextAnchor, nextOffsetMs) {
      anchor = nextAnchor;
      clockOffsetMs = nextOffsetMs;
      if (nextAnchor === null) lastWrittenTop = null;
      sync();
    },
    setFeedLive(live) {
      if (feedLive === live) return;
      feedLive = live;
      if (!feedLive) halt();
      else sync();
    },
    setMode(nextMode) {
      if (mode === nextMode) return;
      mode = nextMode;
      if (mode === "free") halt();
      else sync();
      options.onModeChange?.(mode);
    },
    notifyOwnMove() {
      if (writing || mode !== "follow") return;
      mode = "free";
      halt();
      options.onModeChange?.("free");
    },
    isWritingScroll: () => writing,
    lastWrittenScrollTop: () => lastWrittenTop,
    getMode: () => mode,
    dispose() {
      disposed = true;
      stopLoop();
    },
  };
}
