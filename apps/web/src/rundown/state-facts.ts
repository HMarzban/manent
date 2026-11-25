// State bar facts for an open rundown: "Air · Target · Over/Under" and the air-window notice.
import { formatDuration, formatTime } from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useEffect, useReducer } from "react";
import { useEnvironment } from "../services/context.tsx";
import { useRundownView } from "./rundown-session.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);

/**
 * Emits `rundown_timing` (and `air_window` while `now` lies inside the air window) for an open rundown, scheduling a
 * timer at the next window boundary so the bar updates without polling.
 */
export function useRundownFacts(docId: string): readonly StateFact[] {
  const { now, schedule } = useEnvironment();
  const view = useRundownView(docId);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  const airWindow = view?.clock?.airWindow ?? null;
  const startsAt = airWindow?.startsAt ?? null;
  const endsAt = airWindow?.endsAt ?? null;

  useEffect(() => {
    if (startsAt === null || endsAt === null) return;
    const current = now();
    let wakeAt: number | null = null;
    if (current < startsAt) wakeAt = startsAt;
    else if (current <= endsAt) wakeAt = endsAt + 1;
    if (wakeAt === null) return;
    return schedule(tick, Math.max(0, wakeAt - current));
  }, [startsAt, endsAt, now, schedule]);

  if (view === null || view.rundown === null || view.clock === null)
    return NO_FACTS;
  const { airAt, targetMs } = view.rundown.rundown;
  const { overMs } = view.clock;
  if (airAt === null || targetMs === null || overMs === null) return NO_FACTS;

  const over =
    overMs < 0 ? `-${formatDuration(-overMs)}` : formatDuration(overMs);
  const timingFact: StateFact = {
    kind: "rundown_timing",
    air: formatTime(airAt),
    target: formatDuration(targetMs),
    over,
  };
  const current = now();
  const inAirWindow =
    airWindow !== null &&
    current >= airWindow.startsAt &&
    current <= airWindow.endsAt;
  return inAirWindow ? [timingFact, { kind: "air_window" }] : [timingFact];
}
