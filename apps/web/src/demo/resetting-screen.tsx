// What stands in for every screen while the demo resets, its live progress bar, and the home reload that ends it.
import { DEMO_WORDS } from "@manent/ui";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ControlState } from "../api.ts";
import { focusHeading } from "../focus.ts";
import { useEnvironment } from "../services/context.tsx";
import { reloadAtHome } from "./use-demo.ts";

export { reloadAtHome };

const TICK_MS = 250;
const BASE_PERCENT = 8;
const MAX_PENDING_PERCENT = 92;
const HALF_LIFE_MS = 12_000;

/** Eased progress percentage (8–92 while resetting, 100 once the new seed has answered). */
export function resetProgressPercent(
  elapsedMs: number,
  reseeded: boolean,
): number {
  if (reseeded) return 100;
  const elapsed = Math.max(0, elapsedMs);
  const gained =
    (MAX_PENDING_PERCENT - BASE_PERCENT) *
    (1 - Math.exp(-elapsed / HALF_LIFE_MS));
  return Math.min(MAX_PENDING_PERCENT, Math.round(BASE_PERCENT + gained));
}

/**
 * Tracks a demo reset from the server reading resetting until the demo answers with a seed other than the one the
 * reset replaces, then reloads at `/` so the new seed clears this browser's copies without keeping a stale document
 * URL. A reset that fails, or a control that stops answering, ends it and leaves the page as it was.
 */
export function useResetting(
  state: ControlState | null,
  seedId: string | null,
  onReload: () => void = () => reloadAtHome(window.location),
): { resetting: boolean; reseeded: boolean } {
  // the seed being replaced, kept from one answer to the next; null while no reset is under way. A running server is
  // no sign the reset is over: a question asked before it began may still be answered after
  const [replacing, setReplacing] = useState<string | null>(null);
  const next =
    state === "resetting"
      ? (replacing ?? seedId)
      : state === "failed" || state === "unreachable"
        ? null
        : replacing;
  if (next !== replacing) setReplacing(next);
  const reseeded = next !== null && seedId !== null && seedId !== next;
  useEffect(() => {
    if (reseeded) onReload();
  }, [reseeded, onReload]);
  return { resetting: next !== null, reseeded };
}

/** Centred hero card with focused heading and smooth progress bar while the demo reseeds. */
export function ResettingScreen(props: { reseeded?: boolean }): ReactNode {
  const { reseeded = false } = props;
  const { now, schedule } = useEnvironment();
  const [startedAt] = useState(() => now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    focusHeading(document);
  }, []);

  useEffect(() => {
    if (reseeded) return;
    let cancel: (() => void) | null = null;
    const tick = (): void => {
      setElapsedMs(now() - startedAt);
      cancel = schedule(tick, TICK_MS);
    };
    cancel = schedule(tick, TICK_MS);
    return () => cancel?.();
  }, [now, schedule, startedAt, reseeded]);

  const percent = resetProgressPercent(elapsedMs, reseeded);

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-surface border border-line bg-raised p-8 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-fg-muted"
          >
            <RotateCcwIcon className="size-5" />
          </span>
          <div className="flex flex-col items-center gap-1.5">
            <h1
              tabIndex={-1}
              className="text-section font-medium text-fg outline-none"
            >
              {DEMO_WORDS.resetting}
            </h1>
            <p className="text-ui text-fg-muted">{DEMO_WORDS.resettingBody}</p>
          </div>
          <div
            role="progressbar"
            aria-label={DEMO_WORDS.resetting}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mn-progress-track mt-1 w-full"
          >
            <div
              className="mn-progress-fill"
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
