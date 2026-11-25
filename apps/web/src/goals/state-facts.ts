// State bar facts contributed by an active writing sprint.
import type { StateFact } from "@manent/ui";
import { useMemo } from "react";
import { useActiveSprint } from "../state/sprint.store.ts";
import { formatMmSs } from "./goal-model.ts";

const NONE: readonly StateFact[] = Object.freeze([]);

/** Returns the active sprint countdown fact for `docId`, or an empty list when no sprint runs on it. */
export function useSprintFacts(docId: string): readonly StateFact[] {
  const active = useActiveSprint();
  const left =
    active !== null && active.docId === docId
      ? formatMmSs(Math.ceil(active.remainingMs / 1000))
      : null;
  return useMemo(
    () => (left === null ? NONE : [{ kind: "sprint", left }]),
    [left],
  );
}
