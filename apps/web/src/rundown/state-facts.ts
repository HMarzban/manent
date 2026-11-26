// State bar facts for an open rundown: "Air · Target · Over/Under", the air-window notice, and remote prompter control state.
import { formatDuration, formatTime } from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useEffect, useReducer } from "react";
import { usePrompterRuntime } from "../prompter/prompter-session.ts";
import { useEnvironment } from "../services/context.tsx";
import { useRundownView } from "./rundown-session.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);

/**
 * Emits `rundown_timing`, `air_window` (while inside the air window), and remote prompter control facts
 * (`prompter_ready` / `prompter_held`) for an open rundown.
 */
export function useRundownFacts(docId: string): readonly StateFact[] {
  const { now, schedule } = useEnvironment();
  const view = useRundownView(docId);
  const prompter = usePrompterRuntime(view !== null ? docId : null);
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

  const facts: StateFact[] = [];
  const { airAt, targetMs } = view.rundown.rundown;
  const { overMs } = view.clock;
  if (airAt !== null && targetMs !== null && overMs !== null) {
    const over =
      overMs < 0 ? `-${formatDuration(-overMs)}` : formatDuration(overMs);
    facts.push({
      kind: "rundown_timing",
      air: formatTime(airAt),
      target: formatDuration(targetMs),
      over,
    });
    const current = now();
    const inAirWindow =
      airWindow !== null &&
      current >= airWindow.startsAt &&
      current <= airWindow.endsAt;
    if (inAirWindow) facts.push({ kind: "air_window" });
  }

  if (!prompter.isOperator) {
    if (prompter.operator !== null) {
      facts.push({
        kind: "prompter_held",
        name: prompter.operator.name,
        canTakeOver: prompter.canSend && prompter.online,
      });
    } else if (prompter.canSend && prompter.online && prompter.hasSentRow) {
      facts.push({ kind: "prompter_ready" });
    }
  }

  return facts.length === 0 ? NO_FACTS : facts;
}
