// Docked prompter transport bar mounted inside RundownScreen's PAGE_AREA while this tab holds the operator lease.
import {
  PROMPTER_DEFAULT_SPEED_LPS,
  PROMPTER_MAX_SPEED_LPS,
  PROMPTER_MIN_SPEED_LPS,
} from "@manent/sync-protocol";
import { Button, PROMPTER_CONTROL_WORDS } from "@manent/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CornerDownRightIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { usePrompterRuntime } from "../prompter/prompter-session.ts";
import { useEnvironment } from "../services/context.tsx";
import { prompterActions } from "../state/prompter.store.ts";

const SPEED_STEP = 0.5;
const PRESETS = Object.freeze([
  { label: PROMPTER_CONTROL_WORDS.slow, lps: 1.5 },
  { label: PROMPTER_CONTROL_WORDS.normal, lps: PROMPTER_DEFAULT_SPEED_LPS },
  { label: PROMPTER_CONTROL_WORDS.fast, lps: 5 },
]);
const TYPING_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function clampSpeed(value: number): number {
  const rounded = Math.round(value * 2) / 2;
  return Math.max(
    PROMPTER_MIN_SPEED_LPS,
    Math.min(PROMPTER_MAX_SPEED_LPS, rounded),
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING_SELECTOR) !== null;
}

function isInsideGrid(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="grid"]') !== null;
}

function moveToolbarFocus(bar: HTMLDivElement | null, direction: -1 | 1): void {
  if (bar === null) return;
  const controls = [
    ...bar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  ];
  if (controls.length === 0) return;
  const index = controls.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    index === -1 ? 0 : (index + direction + controls.length) % controls.length;
  controls[next]?.focus();
}

/**
 * Docked remote prompter control strip (mounted inside `style={PAGE_AREA}` directly above `<SurfaceState />`
 * ONLY while the signed-in device holds the server operator lease).
 */
export function PrompterControlBar(props: {
  readonly docId: string;
}): ReactNode {
  const { docId } = props;
  const { dom } = useEnvironment();
  const snapshot = usePrompterRuntime(docId);
  const jumpReasonId = useId();
  const barRef = useRef<HTMLDivElement | null>(null);
  const hadFocusRef = useRef(false);
  const active = snapshot.isOperator;
  const online = snapshot.online;
  const playing = snapshot.scroll?.playing === true;
  const speed = snapshot.scroll?.linesPerSecond ?? PROMPTER_DEFAULT_SPEED_LPS;
  const canJump = online && snapshot.activeRowSent;

  useLayoutEffect(() => {
    if (!active) return undefined;
    return () => {
      const focusedInside =
        hadFocusRef.current ||
        (barRef.current?.contains(document.activeElement) ?? false);
      hadFocusRef.current = false;
      if (focusedInside) dom.restoreFocus();
    };
  }, [active, dom]);

  const togglePlay = (): void => {
    if (!online) return;
    prompterActions.sendControl(
      docId,
      playing ? { action: "pause" } : { action: "play", linesPerSecond: speed },
    );
  };

  const setSpeed = (next: number): void => {
    if (!online) return;
    prompterActions.sendControl(docId, {
      action: "speed",
      linesPerSecond: clampSpeed(next),
    });
  };

  const nudge = (deltaLines: number): void => {
    if (!online) return;
    prompterActions.sendControl(docId, { action: "nudge", deltaLines });
  };

  const jumpHere = (): void => {
    if (!canJump) return;
    prompterActions.jumpHere(docId);
  };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        togglePlay();
        return;
      }
      if (event.key === "ArrowUp") {
        // Leave plain Alt+ArrowUp for rundown row reorder inside the grid; require Shift there.
        if (isInsideGrid(event.target) && !event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        setSpeed(speed + SPEED_STEP);
        return;
      }
      if (event.key === "ArrowDown") {
        // Leave plain Alt+ArrowDown for rundown row reorder inside the grid; require Shift there.
        if (isInsideGrid(event.target) && !event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        setSpeed(speed - SPEED_STEP);
        return;
      }
      if (event.code === "KeyJ" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        event.stopPropagation();
        jumpHere();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, online, playing, speed, canJump, docId]);

  if (!active) return null;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={PROMPTER_CONTROL_WORDS.controlPrompter}
      className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-chrome px-3 py-1 text-ui"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveToolbarFocus(barRef.current, 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveToolbarFocus(barRef.current, -1);
        }
      }}
      onFocusCapture={() => {
        hadFocusRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          hadFocusRef.current = false;
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!online}
          aria-pressed={playing}
          data-tour="prompter:play"
          className="cursor-pointer gap-1.5"
          onClick={togglePlay}
        >
          {playing && online ? (
            <span aria-hidden="true" className="mn-status-dot" data-tone="ok" />
          ) : null}
          {playing ? (
            <PauseIcon aria-hidden="true" className="size-icon" />
          ) : (
            <PlayIcon aria-hidden="true" className="size-icon" />
          )}
          <span>
            {playing
              ? PROMPTER_CONTROL_WORDS.pause
              : PROMPTER_CONTROL_WORDS.play}
          </span>
        </Button>

        <div
          role="group"
          aria-label={PROMPTER_CONTROL_WORDS.scrollRate}
          className="flex items-center gap-1"
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={PROMPTER_CONTROL_WORDS.decreaseSpeed}
            title={PROMPTER_CONTROL_WORDS.decreaseSpeed}
            disabled={!online || speed <= PROMPTER_MIN_SPEED_LPS}
            className="cursor-pointer"
            onClick={() => setSpeed(speed - SPEED_STEP)}
          >
            <MinusIcon aria-hidden="true" className="size-icon" />
          </Button>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="min-w-12 text-center text-meta font-medium text-fg tabular-nums"
          >
            {PROMPTER_CONTROL_WORDS.linesPerSecond(speed)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={PROMPTER_CONTROL_WORDS.increaseSpeed}
            title={PROMPTER_CONTROL_WORDS.increaseSpeed}
            disabled={!online || speed >= PROMPTER_MAX_SPEED_LPS}
            className="cursor-pointer"
            onClick={() => setSpeed(speed + SPEED_STEP)}
          >
            <PlusIcon aria-hidden="true" className="size-icon" />
          </Button>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant={speed === preset.lps ? "outline" : "ghost"}
              size="sm"
              disabled={!online}
              aria-pressed={speed === preset.lps}
              className="cursor-pointer"
              onClick={() => setSpeed(preset.lps)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!online}
            aria-label={PROMPTER_CONTROL_WORDS.backLine}
            title={PROMPTER_CONTROL_WORDS.backLine}
            className="cursor-pointer gap-1"
            onClick={() => nudge(-1)}
          >
            <ArrowUpIcon aria-hidden="true" className="size-icon" />
            <span className="hidden lg:inline">
              {PROMPTER_CONTROL_WORDS.backLine}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!online}
            aria-label={PROMPTER_CONTROL_WORDS.forwardLine}
            title={PROMPTER_CONTROL_WORDS.forwardLine}
            className="cursor-pointer gap-1"
            onClick={() => nudge(1)}
          >
            <ArrowDownIcon aria-hidden="true" className="size-icon" />
            <span className="hidden lg:inline">
              {PROMPTER_CONTROL_WORDS.forwardLine}
            </span>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-disabled={!canJump ? true : undefined}
          aria-describedby={!canJump ? jumpReasonId : undefined}
          title={
            canJump
              ? PROMPTER_CONTROL_WORDS.jumpHere
              : PROMPTER_CONTROL_WORDS.jumpHereUnavailable
          }
          className={
            canJump
              ? "cursor-pointer gap-1"
              : "cursor-not-allowed gap-1 text-fg-muted opacity-50"
          }
          onClick={jumpHere}
        >
          <CornerDownRightIcon aria-hidden="true" className="size-icon" />
          <span>{PROMPTER_CONTROL_WORDS.jumpHere}</span>
        </Button>
        {!canJump ? (
          <span id={jumpReasonId} className="sr-only">
            {PROMPTER_CONTROL_WORDS.jumpHereUnavailable}
          </span>
        ) : null}

        {!online ? (
          <span
            role="status"
            aria-live="polite"
            className="flex items-center gap-1 text-meta font-medium text-attention"
          >
            <TriangleExclamationPointIcon
              aria-hidden="true"
              className="size-icon shrink-0"
            />
            <span>{PROMPTER_CONTROL_WORDS.offlinePaused}</span>
          </span>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-pointer text-fg-muted hover:text-fg"
        onClick={() => prompterActions.stopControlling(docId)}
      >
        {PROMPTER_CONTROL_WORDS.stopControlling}
      </Button>
    </div>
  );
}
