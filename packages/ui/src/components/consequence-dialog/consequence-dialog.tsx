// The one dialog frame for an action other people will see and Manent cannot quietly reverse.
import { TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  SPINNER_AFTER_MS,
  STILL_WORKING_MS,
  useTiming,
} from "../../surfaces/timing.ts";
import { DIALOG_WORDS } from "../../words/dialog.ts";
import { BusyButton } from "../busy-button/busy-button.tsx";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "../stock/alert-dialog.tsx";
import { Button } from "../stock/button.tsx";

export interface ConsequenceDialogProps {
  open: boolean;
  title: string;
  /** `question` (the default): the title ends with "?" and `action` is its start. `command`: the title is the command's label. */
  titledBy?: "question" | "command";
  body: string;
  action: string;
  /** The action's busy form ("Locking page numbers…"); not null while the action runs. */
  busyLabel: string | null;
  /** What was refused and what to do; the line takes focus and the action reads Try again. */
  refusal: string | null;
  /** The reason clause ("needs a connection") of an action that cannot run now. */
  disabledReason?: string;
  destructive: boolean;
  onAction(): void;
  onCancel(): void;
  alternative?: { label: string; destructive?: boolean; onAction(): void };
  wide?: boolean;
  children?: ReactNode;
}

type BusyPhase = "idle" | "waiting" | "spinning" | "still_working";

// the stock dialog's scrim
const SCRIM_SELECTOR = "[data-slot='alert-dialog-overlay']";

const assertQuestionTitle = (title: string, action: string): void => {
  if (!title.endsWith("?")) {
    throw new RangeError(
      `a question title ends with a question mark, not "${title}"`,
    );
  }
  // a label that opens a screen ends with "…", which the title's start does not have
  const start = action.replace(/…$/, "");
  const stem = title.slice(0, -1);
  if (stem !== start && !stem.startsWith(`${start} `)) {
    throw new RangeError(
      `a dialog's action is the start of its title, not "${action}" in "${title}"`,
    );
  }
};

/** While `open`, a press on the scrim does nothing, so focus stays on the dialog's control instead of going to the body. */
function useInertScrim(open: boolean): void {
  useEffect(() => {
    if (!open) return undefined;
    const keepFocus = (event: MouseEvent): void => {
      if (
        event.target instanceof Element &&
        event.target.matches(SCRIM_SELECTOR)
      )
        event.preventDefault();
    };
    // capturing, before the dialog's own handlers see the press
    globalThis.addEventListener("mousedown", keepFocus, true);
    return () => globalThis.removeEventListener("mousedown", keepFocus, true);
  }, [open]);
}

function useBusyPhase(busy: boolean): BusyPhase {
  const { schedule } = useTiming();
  const [phase, setPhase] = useState<BusyPhase>("idle");
  useLayoutEffect(() => {
    setPhase(busy ? "waiting" : "idle");
    if (!busy) return undefined;
    const cancels = [
      schedule(() => setPhase("spinning"), SPINNER_AFTER_MS),
      schedule(() => setPhase("still_working"), STILL_WORKING_MS),
    ];
    return () => {
      for (const cancel of cancels) cancel();
    };
  }, [busy, schedule]);
  return phase;
}

interface LineProps {
  refusal: string | null;
  stillWorking: boolean;
  disabledLine: string | null;
  lineId: string;
}

// one line above the buttons: a refusal takes focus and is not a live region
function LineAboveButtons({
  refusal,
  stillWorking,
  disabledLine,
  lineId,
}: LineProps): ReactNode {
  const refusalRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (refusal !== null) refusalRef.current?.focus();
  }, [refusal]);
  if (refusal !== null) {
    return (
      <p
        ref={refusalRef}
        tabIndex={-1}
        data-arrival
        className="flex items-start gap-2 text-ui"
      >
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-attention"
        />
        {refusal}
      </p>
    );
  }
  if (stillWorking)
    return <p className="text-ui text-fg-muted">{DIALOG_WORDS.stillWorking}</p>;
  if (disabledLine === null) return null;
  return (
    <p id={lineId} className="text-ui text-fg-muted">
      {disabledLine}
    </p>
  );
}

// the close question's middle button; disabled while the action runs
function AlternativeButton({
  alternative,
  busy,
}: {
  alternative: ConsequenceDialogProps["alternative"];
  busy: boolean;
}): ReactNode {
  if (alternative === undefined) return null;
  return (
    <Button
      variant={alternative.destructive ? "destructive" : "outline"}
      disabled={busy}
      focusableWhenDisabled
      onClick={alternative.onAction}
    >
      {alternative.label}
    </Button>
  );
}

/** Throws a RangeError for a question title that does not end with "?" or does not start with `action`. Needs a `TimingProvider`. */
export function ConsequenceDialog({
  open,
  title,
  titledBy = "question",
  body,
  action,
  busyLabel,
  refusal,
  disabledReason,
  destructive,
  onAction,
  onCancel,
  alternative,
  wide = false,
  children,
}: ConsequenceDialogProps): ReactNode {
  if (titledBy === "question") assertQuestionTitle(title, action);
  const busy = busyLabel !== null;
  const phase = useBusyPhase(busy);
  useInertScrim(open);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lineId = useId();
  const stillWorking = phase === "still_working";
  const disabledLine =
    disabledReason === undefined || busy
      ? null
      : DIALOG_WORDS.disabledLine(action, disabledReason);
  const describing = refusal === null && !stillWorking && disabledLine !== null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        if (details.reason === "escape-key" && busy && !stillWorking) return;
        onCancel();
      }}
    >
      <AlertDialogContent
        initialFocus={cancelRef}
        style={{ maxWidth: wide ? "var(--dialog-w-wide)" : "var(--dialog-w)" }}
      >
        <AlertDialogTitle className="text-title">{title}</AlertDialogTitle>
        <AlertDialogDescription className="text-ui">
          {body}
        </AlertDialogDescription>
        {children}
        <LineAboveButtons
          refusal={refusal}
          stillWorking={stillWorking}
          disabledLine={disabledLine}
          lineId={lineId}
        />
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            {DIALOG_WORDS.cancel}
          </Button>
          <AlternativeButton alternative={alternative} busy={busy} />
          <BusyButton
            label={refusal === null ? action : DIALOG_WORDS.tryAgain}
            busyLabel={busyLabel}
            spinning={phase === "spinning" || phase === "still_working"}
            variant={destructive ? "destructive" : "default"}
            disabled={disabledLine !== null}
            aria-describedby={describing ? lineId : undefined}
            onClick={onAction}
          />
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
