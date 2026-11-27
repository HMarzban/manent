// Persistent background offline-readiness prompt mounted in RootLayout across /choose -> Library -> Script.
import {
  Button,
  PREFERENCES_WORDS,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { CheckCircle2Icon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { OfflineReadinessState } from "../boot/offline-warm.ts";
import { useEnvironment } from "../services/context.tsx";

const QUIET_MS = 250;
const MIN_PREPARE_DWELL_MS = 600;
const READY_HOLD_MS = 5_000;
const HOVER_RESUME_FLOOR_MS = 2_000;
const EXIT_MS = 160;

const NO_READINESS: Subscribable<OfflineReadinessState> = createValue({
  status: "idle",
  cached: 0,
  total: 0,
});

type DisplayPhase = "hidden" | "preparing" | "ready";

function progressRatio(
  state: OfflineReadinessState,
  phase: DisplayPhase,
): number {
  if (phase === "ready") return 1;
  if (state.status === "warming" && state.total > 0) {
    const clamped = Math.max(0, Math.min(state.cached, state.total));
    return 0.2 + 0.8 * (clamped / state.total);
  }
  return 0.15;
}

/**
 * Calm floating archival card that appears on web ONLY when this tab genuinely installs or warms offline assets,
 * morphs into a brief "Ready offline" confirmation once complete, and stays silent on returning visits and desktop.
 */
export function OfflineReadinessNotice(props: {
  readonly inShell: boolean;
  readonly suppressed: boolean;
}): ReactNode {
  const { inShell, suppressed } = props;
  const { where, desktop, offlineReadiness, schedule, now, dom } =
    useEnvironment();
  const enabled =
    where.shell === "web" && desktop === null && offlineReadiness !== undefined;
  const raw = useSubscribable(offlineReadiness ?? NO_READINESS);

  const [phase, setPhase] = useState<DisplayPhase>("hidden");
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const sawWorkRef = useRef(false);
  const completedReadyRef = useRef(false);
  const shownAtRef = useRef<number | null>(null);
  const readyStartedAtRef = useRef<number | null>(null);
  const remainingHoldRef = useRef(READY_HOLD_MS);
  const cancelQuietRef = useRef<(() => void) | null>(null);
  const cancelDwellRef = useRef<(() => void) | null>(null);
  const cancelHoldRef = useRef<(() => void) | null>(null);
  const cancelExitRef = useRef<(() => void) | null>(null);

  const isPreparing = raw.status === "installing" || raw.status === "warming";
  if (isPreparing || offlineReadiness?.wasActiveInSession?.() === true) {
    sawWorkRef.current = true;
  }

  const clearTimers = useCallback(() => {
    cancelQuietRef.current?.();
    cancelQuietRef.current = null;
    cancelDwellRef.current?.();
    cancelDwellRef.current = null;
    cancelHoldRef.current?.();
    cancelHoldRef.current = null;
    cancelExitRef.current?.();
    cancelExitRef.current = null;
  }, []);

  const beginExit = useCallback(
    (userDismissed: boolean) => {
      cancelQuietRef.current?.();
      cancelQuietRef.current = null;
      cancelDwellRef.current?.();
      cancelDwellRef.current = null;
      cancelHoldRef.current?.();
      cancelHoldRef.current = null;
      if (userDismissed) setDismissed(true);
      completedReadyRef.current = true;
      setLeaving(true);
      cancelExitRef.current?.();
      cancelExitRef.current = schedule(() => {
        cancelExitRef.current = null;
        setLeaving(false);
        setPhase("hidden");
        setAnnouncement("");
      }, EXIT_MS);
    },
    [schedule],
  );

  // Sync live offlineReadiness state into calm anti-flash DisplayPhase transitions.
  useEffect(() => {
    if (!enabled || dismissed || suppressed) {
      clearTimers();
      setLeaving(false);
      setPhase("hidden");
      return;
    }

    if (isPreparing) {
      completedReadyRef.current = false;
      cancelDwellRef.current?.();
      cancelDwellRef.current = null;
      cancelHoldRef.current?.();
      cancelHoldRef.current = null;
      cancelExitRef.current?.();
      cancelExitRef.current = null;
      setLeaving(false);
      if (phase === "preparing") return;
      if (phase === "ready") {
        shownAtRef.current = now();
        setPhase("preparing");
        setAnnouncement(PREFERENCES_WORDS.offlineAnnouncePreparing);
        return;
      }
      if (cancelQuietRef.current === null) {
        cancelQuietRef.current = schedule(() => {
          cancelQuietRef.current = null;
          shownAtRef.current = now();
          setPhase("preparing");
          setAnnouncement(PREFERENCES_WORDS.offlineAnnouncePreparing);
        }, QUIET_MS);
      }
      return;
    }

    if (raw.status === "ready") {
      cancelQuietRef.current?.();
      cancelQuietRef.current = null;
      if (!sawWorkRef.current || completedReadyRef.current || phase === "ready")
        return;
      const enterReady = (): void => {
        cancelDwellRef.current = null;
        remainingHoldRef.current = READY_HOLD_MS;
        readyStartedAtRef.current = now();
        setLeaving(false);
        setPhase("ready");
        setAnnouncement(PREFERENCES_WORDS.offlineAnnounceReady);
      };
      if (phase === "preparing" && shownAtRef.current !== null) {
        const elapsed = now() - shownAtRef.current;
        if (elapsed < MIN_PREPARE_DWELL_MS) {
          cancelDwellRef.current?.();
          cancelDwellRef.current = schedule(
            enterReady,
            MIN_PREPARE_DWELL_MS - elapsed,
          );
          return;
        }
      }
      enterReady();
      return;
    }

    // Network drop mid-warm (shell_only), paused_save_data, idle, or online_only: fade out calmly.
    cancelQuietRef.current?.();
    cancelQuietRef.current = null;
    cancelDwellRef.current?.();
    cancelDwellRef.current = null;
    if (phase !== "hidden" && !leaving) beginExit(false);
  }, [
    enabled,
    dismissed,
    suppressed,
    isPreparing,
    raw.status,
    phase,
    leaving,
    now,
    schedule,
    clearTimers,
    beginExit,
  ]);

  // Auto-dismiss timer while in "ready", pausing cleanly on hover or keyboard focus.
  useEffect(() => {
    if (phase !== "ready" || leaving || dismissed || suppressed || !enabled) {
      cancelHoldRef.current?.();
      cancelHoldRef.current = null;
      return;
    }
    if (paused) {
      if (readyStartedAtRef.current !== null) {
        const elapsed = now() - readyStartedAtRef.current;
        remainingHoldRef.current = Math.max(
          HOVER_RESUME_FLOOR_MS,
          remainingHoldRef.current - elapsed,
        );
        readyStartedAtRef.current = null;
      }
      cancelHoldRef.current?.();
      cancelHoldRef.current = null;
      return;
    }
    readyStartedAtRef.current = now();
    cancelHoldRef.current?.();
    cancelHoldRef.current = schedule(() => {
      cancelHoldRef.current = null;
      beginExit(false);
    }, remainingHoldRef.current);
    return () => {
      cancelHoldRef.current?.();
      cancelHoldRef.current = null;
    };
  }, [
    phase,
    leaving,
    paused,
    dismissed,
    suppressed,
    enabled,
    now,
    schedule,
    beginExit,
  ]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!enabled) return null;

  const onDismiss = (): void => {
    beginExit(true);
    dom.restoreFocus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onDismiss();
  };

  const ratio = progressRatio(raw, phase);
  const percent = Math.round(ratio * 100);
  const showCount =
    phase === "preparing" && raw.status === "warming" && raw.total > 0;
  const title =
    phase === "ready"
      ? PREFERENCES_WORDS.offlineNoticeReadyTitle
      : PREFERENCES_WORDS.offlineNoticePreparing;
  const body =
    phase === "ready"
      ? PREFERENCES_WORDS.offlineNoticeReadyBody
      : raw.status === "warming"
        ? PREFERENCES_WORDS.offlineNoticeWarmingBody
        : PREFERENCES_WORDS.offlineNoticeInstallingBody;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
      {phase !== "hidden" && !suppressed ? (
        <aside
          aria-label={PREFERENCES_WORDS.offlineNoticeLabel}
          data-state={phase}
          data-leaving={leaving ? "true" : undefined}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setPaused(false);
          }}
          onKeyDown={onKeyDown}
          className={
            inShell
              ? "mn-offline-prompt fixed start-4 bottom-10 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-surface border border-line bg-overlay p-3 text-ui text-fg animate-in fade-in-0 slide-in-from-bottom-2 duration-(--dur-base) ease-out"
              : "mn-offline-prompt fixed start-4 bottom-4 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-surface border border-line bg-overlay p-3 text-ui text-fg animate-in fade-in-0 slide-in-from-bottom-2 duration-(--dur-base) ease-out"
          }
        >
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={
                phase === "ready"
                  ? "mn-offline-prompt-icon flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-well text-ok"
                  : "mn-offline-prompt-icon flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-well text-fg-accent"
              }
            >
              {phase === "ready" ? (
                <CheckCircle2Icon
                  key="ready"
                  className="size-icon-lg animate-in zoom-in-95 fade-in-0 duration-(--dur-fast) ease-out"
                />
              ) : (
                <LoaderCircleIcon className="size-icon-lg animate-spin" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-ui font-medium text-fg">
                  {title}
                </p>
                {showCount ? (
                  <span className="shrink-0 text-micro text-fg-muted tabular-nums">
                    {PREFERENCES_WORDS.offlineNoticeProgress(
                      raw.cached,
                      raw.total,
                    )}
                  </span>
                ) : null}
              </div>
              <p className="text-meta text-fg-muted">{body}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={PREFERENCES_WORDS.offlineNoticeDismiss}
              onClick={onDismiss}
              className="-me-1 -mt-0.5 shrink-0 text-fg-muted hover:text-fg"
            >
              <XIcon aria-hidden="true" className="size-icon" />
            </Button>
          </div>
          <div
            role="progressbar"
            aria-label={PREFERENCES_WORDS.offlineNoticeLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mn-progress-track w-full"
          >
            <div
              className="mn-progress-fill"
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>
        </aside>
      ) : null}
    </>
  );
}
