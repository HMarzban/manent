// Send form refusal/disabled line and progressive long-work busy status beside the primary action button.
import {
  Button,
  CANCEL_AFTER_MS,
  DIALOG_WORDS,
  PROGRESS_AFTER_MS,
  STILL_WORKING_MS,
  useTiming,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SendAction } from "./send-frame.tsx";

const BUSY_STEPS = [
  PROGRESS_AFTER_MS,
  STILL_WORKING_MS,
  CANCEL_AFTER_MS,
] as const;

/** How many of BUSY_STEPS have passed since `busy` became true; 0 while idle. */
export function useBusyStep(busy: boolean): number {
  const { schedule } = useTiming();
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    setStep(0);
    if (!busy) return undefined;
    const cancels = BUSY_STEPS.map((afterMs, index) =>
      schedule(() => setStep(index + 1), afterMs),
    );
    return () => cancels.forEach((cancel) => cancel());
  }, [busy, schedule]);
  return step;
}

/** The line above the button: the refusal, which takes focus when it appears, else why the button is disabled. */
export function ActionLine(props: {
  problem: string | null;
  disabledLine: string | null;
  lineId: string;
}): ReactNode {
  const { problem, disabledLine, lineId } = props;
  const problemRef = useRef<HTMLParagraphElement>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (problem !== null && shown.current === null) problemRef.current?.focus();
    shown.current = problem;
  }, [problem]);
  if (problem !== null)
    return (
      <p
        ref={problemRef}
        tabIndex={-1}
        data-arrival
        className="flex w-full items-start gap-2 rounded-control border border-line bg-subtle px-3 py-2 text-ui text-fg outline-none"
      >
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="mt-0.5 size-icon shrink-0 text-attention"
        />
        {problem}
      </p>
    );
  if (disabledLine === null) return null;
  return (
    <p id={lineId} className="text-ui text-fg-muted">
      {disabledLine}
    </p>
  );
}

/** What long work shows beside its busy button: its progress, Still working…, and Cancel when it can be cancelled. */
export function BusyAside(props: {
  action: SendAction;
  step: number;
}): ReactNode {
  const { action, step } = props;
  const { progress, cancel } = action;
  const showProgress = action.busy && progress !== null && step >= 1;
  const showStillWorking = action.busy && step >= 2;
  const hasStatus = showProgress || showStillWorking;
  return (
    <>
      <span
        role="status"
        aria-live="polite"
        className={hasStatus ? "flex flex-wrap items-center gap-3" : "sr-only"}
      >
        {showProgress ? (
          <span className="text-ui text-fg-muted tabular-nums">{progress}</span>
        ) : null}
        {showStillWorking ? (
          <span className="text-ui text-fg-muted">
            {DIALOG_WORDS.stillWorking}
          </span>
        ) : null}
      </span>
      {action.busy && cancel !== null && step >= 3 ? (
        <Button variant="outline" size="lg" onClick={cancel}>
          {DIALOG_WORDS.cancel}
        </Button>
      ) : null}
    </>
  );
}
