// Compact live broadcast timing summary card for Details → Rundown (no heading elements so Details h2 structure stays intact).
import type { RundownClock } from "@manent/pagination";
import type { RundownFieldsJSON, RundownRowJSON } from "@manent/schema";
import {
  RUNDOWN_WORDS as RW,
  cn,
  formatDuration,
  formatTime,
} from "@manent/ui";
import type { ReactNode } from "react";
import { formatSignedOver, prompterTally } from "./section-timing.ts";

export function DetailsTimingCard(props: {
  readonly clock: RundownClock | null;
  readonly fields: RundownFieldsJSON;
  readonly rows: readonly RundownRowJSON[];
  readonly nowMs: number;
}): ReactNode {
  const { clock, fields, rows, nowMs } = props;
  if (clock === null) return null;

  const overText =
    clock.overMs === null ? null : formatSignedOver(clock.overMs);
  const isOver = overText !== null && !overText.startsWith("-");
  const overLabel = overText === null ? null : RW.overUnderText(overText);
  const activeAirWindow =
    clock.airWindow !== null &&
    nowMs >= clock.airWindow.startsAt &&
    nowMs <= clock.airWindow.endsAt;
  const airWindowRange =
    clock.airWindow !== null && fields.windowLeadMs > 0
      ? RW.airWindowRange(
          formatTime(clock.airWindow.startsAt),
          formatTime(clock.airWindow.endsAt),
        )
      : null;
  const tally = prompterTally(rows);

  return (
    <div
      data-rundown-timing-summary=""
      className="flex flex-col gap-2 rounded-surface border border-line bg-subtle p-3 text-meta"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold tracking-[0.04em] text-fg-muted uppercase">
          {RW.timingSummary}
        </span>
        {activeAirWindow ? (
          <span className="inline-flex items-center gap-1 rounded-micro bg-raised px-1.5 py-0.5 text-micro font-medium text-attention">
            <span
              aria-hidden="true"
              className="mn-status-dot"
              data-tone="attention"
            />
            <span>{RW.inAirWindow}</span>
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 tabular-nums">
        <div className="flex flex-col">
          <dt className="text-micro text-fg-muted">{RW.totalLabel}</dt>
          <dd className="text-ui font-medium text-fg">
            {formatDuration(clock.totalMs)}
          </dd>
        </div>
        {overLabel !== null ? (
          <div className="flex flex-col">
            <dt className="text-micro text-fg-muted">{RW.targetLabel}</dt>
            <dd
              className={cn(
                "text-ui font-medium",
                isOver ? "text-attention" : "text-ok",
              )}
            >
              {overLabel}
            </dd>
          </div>
        ) : null}
        {airWindowRange !== null ? (
          <div className="flex flex-col">
            <dt className="text-micro text-fg-muted">
              {RW.airWindowStartsLabel}
            </dt>
            <dd className="text-ui text-fg">{airWindowRange}</dd>
          </div>
        ) : null}
        {tally.total > 0 ? (
          <div className="flex flex-col">
            <dt className="text-micro text-fg-muted">{RW.columns.prompter}</dt>
            <dd className="text-ui text-fg">
              <span>{RW.prompterSentSummary(tally.sent, tally.total)}</span>
              {tally.changed > 0 ? (
                <span className="ms-1 text-attention">
                  · {RW.prompterChangedCount(tally.changed)}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
