// Details → Selection: the running time of the current selection in a Variety script.
import { durationMs } from "@manent/pagination";
import { TIMING_WORDS, formatDuration, useSubscribable } from "@manent/ui";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useServices } from "../services/context.tsx";
import { readRateOf } from "./read-rate.ts";
import { timingFactsOf } from "./timing-facts.ts";

/** Drawn in Details → Selection only when the script's format is Variety and a selection exists. */
export function SelectionTime(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const store = services.openScriptStore(docId);
  const subscribeFormat = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    store.get("script.format"),
  );
  const factsSource = useMemo(() => timingFactsOf(docId), [docId]);
  const rateSource = useMemo(() => readRateOf(docId), [docId]);
  const facts = useSubscribable(factsSource);
  const rate = useSubscribable(rateSource);
  if (format !== "variety" || facts === null || facts.selection === null)
    return null;
  const duration = formatDuration(durationMs([facts.selection], rate));
  return (
    <div className="flex min-h-row items-center justify-between gap-2">
      <span className="text-ui font-medium">{TIMING_WORDS.selectionTime}</span>
      <span className="text-ui tabular-nums">{duration}</span>
    </div>
  );
}
