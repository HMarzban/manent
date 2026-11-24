// The status bar's live running-time readout for a Variety script; activating it opens the Scenes tab.
import { durationMs } from "@manent/pagination";
import {
  Button,
  TIMING_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  formatDuration,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useId, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useServices } from "../services/context.tsx";
import { panelsActions } from "../state/panels.store.ts";
import { readRateOf } from "./read-rate.ts";
import { timingFactsOf } from "./timing-facts.ts";

/** Drawn beside the page count only when the script's format is Variety and timing facts exist. */
export function TimingReadout(props: { docId: string }): ReactNode {
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
  const tooltipId = useId();
  if (format !== "variety" || facts === null) return null;
  const duration = formatDuration(durationMs([facts.script], rate));
  const tooltip = TIMING_WORDS.readoutTooltip(rate);
  const name = TIMING_WORDS.readoutName(duration);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              data-tour="readout:timing"
              aria-label={name}
              aria-describedby={tooltipId}
              className="shrink-0 text-meta font-normal text-fg-muted tabular-nums"
              onClick={() => panelsActions.open("left", "scenes")}
            />
          }
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-accent-solid"
          />
          <span>{duration}</span>
        </TooltipTrigger>
        <TooltipContent className="data-closed:hidden">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      <span id={tooltipId} className="sr-only">
        {tooltip}
      </span>
    </>
  );
}
