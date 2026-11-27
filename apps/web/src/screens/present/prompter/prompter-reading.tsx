// The prompter window's reading area: eye-line chevron guide, stories in run order, horizontal mirror, rAF remote scroll and instant Free scroll override.
import {
  DOCUMENT_WORDS,
  PROMPTER_WINDOW_WORDS,
  SurfaceState,
} from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import {
  ChevronRightIcon,
  CircleAlertIcon,
  LockIcon,
  TvIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createRemoteScrollController } from "../../../prompter/remote-scroll.ts";
import type {
  PrompterFollowMode,
  PrompterRemoteScroll,
  RemoteScrollController,
} from "../../../prompter/remote-scroll.ts";
import type { PrompterReadingStory } from "./prompter-blocks.ts";
import {
  PROMPTER_LINE_HEIGHT,
  PrompterHero,
  PrompterLoadingBody,
  PrompterStoriesBody,
} from "./prompter-reading-states.tsx";
import type { PrompterTextSize } from "./prompter-storage.ts";

interface PrompterReadingProps {
  readonly surfaceState: SurfaceStateValue;
  readonly stories: readonly PrompterReadingStory[];
  readonly textSize: PrompterTextSize;
  readonly mirror: boolean;
  readonly remoteScroll?: PrompterRemoteScroll;
  readonly followMode?: PrompterFollowMode;
  readonly onFollowModeChange?: (mode: PrompterFollowMode) => void;
  readonly onBack?: () => void;
  readonly onReload?: () => void;
  readonly clock?: {
    readonly now: () => number;
    readonly frame: (cb: () => void) => () => void;
  };
}

const DEFAULT_CLOCK = Object.freeze({
  now: (): number => Date.now(),
  frame: (cb: () => void): (() => void) => {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  },
});

const LINE_HEIGHT = PROMPTER_LINE_HEIGHT;
const BLOCK_SELECTOR = "[data-prompter-block]";
const INTERACTIVE_SPACE_TARGET =
  'button, a, input, textarea, select, [role="switch"], [contenteditable="true"]';
const TYPING_TARGET = 'input, textarea, select, [contenteditable="true"]';
const CONTROL_NAV_TARGET =
  'header, [role="toolbar"], [role="radiogroup"], button, input, select, [data-popup-open]';
const GUIDE_STYLE: CSSProperties = Object.freeze({ top: "30%" });

interface TopAnchor {
  readonly key: string;
  readonly rowId: string;
  readonly offsetFromTop: number;
}

function readTopAnchor(container: HTMLElement): TopAnchor | null {
  const top = container.getBoundingClientRect().top;
  for (const node of container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom <= top) continue;
    const key = node.dataset.prompterBlock;
    const rowId = node.dataset.prompterRow;
    if (key !== undefined && rowId !== undefined)
      return { key, rowId, offsetFromTop: rect.top - top };
  }
  return null;
}

function findAnchorNode(
  container: HTMLElement,
  anchor: TopAnchor,
): HTMLElement | null {
  let rowFallback: HTMLElement | null = null;
  for (const node of container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    if (node.dataset.prompterBlock === anchor.key) return node;
    if (rowFallback === null && node.dataset.prompterRow === anchor.rowId)
      rowFallback = node;
  }
  return rowFallback;
}

const matchesSelector = (
  target: EventTarget | null,
  selector: string,
): boolean => target instanceof Element && target.closest(selector) !== null;

function scrollDelta(
  event: KeyboardEvent,
  container: HTMLElement,
  textSize: PrompterTextSize,
): number | "start" | "end" | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (matchesSelector(event.target, TYPING_TARGET)) return null;
  const lineStep = Math.round(textSize * LINE_HEIGHT);
  const pageStep = Math.max(lineStep, container.clientHeight - lineStep);
  const inControl = matchesSelector(event.target, CONTROL_NAV_TARGET);
  if (event.key === "ArrowDown") return inControl ? null : lineStep;
  if (event.key === "ArrowUp") return inControl ? null : -lineStep;
  if (event.key === "PageDown") return pageStep;
  if (event.key === "PageUp") return -pageStep;
  if (event.key === " ")
    return matchesSelector(event.target, INTERACTIVE_SPACE_TARGET)
      ? null
      : event.shiftKey
        ? -pageStep
        : pageStep;
  if (event.key === "Home") return inControl ? null : "start";
  if (event.key === "End") return inControl ? null : "end";
  return null;
}

export function PrompterReading(props: PrompterReadingProps): ReactNode {
  const {
    surfaceState,
    stories,
    textSize,
    mirror,
    remoteScroll,
    followMode = "follow",
    onFollowModeChange,
    onBack,
    onReload,
    clock = DEFAULT_CLOCK,
  } = props;
  const { now, frame } = clock;
  const scrollRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<TopAnchor | null>(null);
  const lastScrollTopRef = useRef(0);
  const linePxRef = useRef(textSize * LINE_HEIGHT);
  linePxRef.current = textSize * LINE_HEIGHT;
  const onModeChangeRef = useRef(onFollowModeChange);
  onModeChangeRef.current = onFollowModeChange;
  const controllerRef = useRef<RemoteScrollController | null>(null);
  const feedLive =
    surfaceState.kind === "ready" || surfaceState.kind === "read_only";
  const feedLiveRef = useRef(feedLive);
  feedLiveRef.current = feedLive;

  useEffect(() => {
    const controller = createRemoteScrollController({
      getContainer: () => scrollRef.current,
      getLinePx: () => linePxRef.current,
      now,
      requestFrame: frame,
      onModeChange: (next) => onModeChangeRef.current?.(next),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [now, frame]);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (ctrl === null) return;
    ctrl.setFeedLive(feedLive);
    ctrl.setMode(followMode);
    ctrl.setAnchor(
      remoteScroll?.state ?? null,
      remoteScroll?.clockOffsetMs ?? 0,
    );
  }, [feedLive, followMode, remoteScroll?.state, remoteScroll?.clockOffsetMs]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    lastScrollTopRef.current = container.scrollTop;
    const onScroll = (): void => {
      const ctrl = controllerRef.current;
      const top = container.scrollTop;
      if (
        ctrl !== null &&
        !ctrl.isWritingScroll() &&
        ctrl.getMode() === "follow" &&
        feedLiveRef.current
      ) {
        const expected =
          ctrl.lastWrittenScrollTop() ?? lastScrollTopRef.current;
        if (Math.abs(top - expected) > 1) ctrl.notifyOwnMove();
      }
      lastScrollTopRef.current = top;
      anchorRef.current = readTopAnchor(container);
    };
    const onOwnMove = (): void => controllerRef.current?.notifyOwnMove();
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onOwnMove, { passive: true });
    container.addEventListener("touchstart", onOwnMove, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onOwnMove);
      container.removeEventListener("touchstart", onOwnMove);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const container = scrollRef.current;
      if (container === null) return;
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !matchesSelector(event.target, TYPING_TARGET) &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        controllerRef.current?.setMode("follow");
        return;
      }
      const move = scrollDelta(event, container, textSize);
      if (move === null) return;
      event.preventDefault();
      controllerRef.current?.notifyOwnMove();
      if (move === "start") container.scrollTop = 0;
      else if (move === "end") container.scrollTop = container.scrollHeight;
      else container.scrollTop += move;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [textSize]);

  // hold the block at the top of the reading area in place across feed updates and text-size changes
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    if (stories.length === 0) {
      anchorRef.current = null;
      return;
    }
    const previous = anchorRef.current;
    if (previous !== null && controllerRef.current?.getMode() !== "follow") {
      const target = findAnchorNode(container, previous);
      if (target !== null) {
        const delta =
          target.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          previous.offsetFromTop;
        if (Math.abs(delta) >= 0.5) container.scrollTop += delta;
      }
    }
    anchorRef.current = readTopAnchor(container);
  }, [stories, textSize]);

  const backLabel =
    onBack !== undefined ? PROMPTER_WINDOW_WORDS.backToRundown : undefined;
  const renderers = useMemo<SurfaceRenderers>(() => {
    const body = (): ReactNode => (
      <PrompterStoriesBody
        stories={stories}
        textSize={textSize}
        mirror={mirror}
      />
    );
    return {
      ready: body,
      read_only: body,
      offline: body,
      empty: () => (
        <PrompterHero
          icon={<TvIcon aria-hidden="true" className="size-5" />}
          title={PROMPTER_WINDOW_WORDS.nothingSent}
          description={PROMPTER_WINDOW_WORDS.nothingSentDetail}
          actionLabel={backLabel}
          onAction={onBack}
        />
      ),
      loading: () => <PrompterLoadingBody />,
      no_access: () => (
        <PrompterHero
          icon={<LockIcon aria-hidden="true" className="size-5" />}
          title={PROMPTER_WINDOW_WORDS.linkRefused}
          description={PROMPTER_WINDOW_WORDS.linkRefusedDetail}
          actionLabel={backLabel}
          onAction={onBack}
        />
      ),
      problem: (_state, surfaceReload) => (
        <PrompterHero
          icon={<CircleAlertIcon aria-hidden="true" className="size-5" />}
          title={DOCUMENT_WORDS.panelProblem}
          actionLabel={DOCUMENT_WORDS.reloadPanel}
          onAction={onReload ?? surfaceReload}
        />
      ),
    };
  }, [stories, textSize, mirror, backLabel, onBack, onReload]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {stories.length > 0 ? (
        <div
          aria-hidden="true"
          style={GUIDE_STYLE}
          className="mn-prompter-guide pointer-events-none absolute inset-x-0 z-10 flex -translate-y-1/2 items-center px-3 text-accent"
        >
          <ChevronRightIcon className="size-5 shrink-0" />
        </div>
      ) : null}
      <main
        ref={scrollRef}
        tabIndex={0}
        aria-label={PROMPTER_WINDOW_WORDS.readingAreaLabel}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-solid"
      >
        <SurfaceState
          surface="present"
          state={surfaceState}
          render={renderers}
        />
      </main>
    </div>
  );
}
