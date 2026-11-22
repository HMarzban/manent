// The one frame every Send form draws: the way back, the title, the rows, the pages and the action that sends them.
import {
  Button,
  CANCEL_AFTER_MS,
  DIALOG_WORDS,
  PROGRESS_AFTER_MS,
  SEND_WORDS,
  SPINNER_AFTER_MS,
  STILL_WORKING_MS,
  useTiming,
} from "@manent/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

/** In the order the frame draws them, whatever order a form gives them in. */
export const SEND_ROW_IDS = [
  "checks",
  "name",
  "what",
  "as",
  "to",
  "colour",
  "memo",
] as const;
export type SendRowId = (typeof SEND_ROW_IDS)[number];

export interface SendRow {
  readonly id: SendRowId;
  readonly content: ReactNode;
}

export interface SendAction {
  readonly label: string;
  /** The verb in "-ing" with its object and "…" ("Issuing Pink…"), shown while `busy`. */
  readonly busyLabel: string;
  readonly busy: boolean;
  /** The reason clause of an action that cannot run now ("needs a connection"), never a sentence. */
  readonly disabledReason: string | null;
  /** A refusal ("Couldn't …", then what to do); it takes focus when it appears. */
  readonly problem: string | null;
  /** The work's progress in words ("Page 37 of 120"), shown beside the busy button after a while. */
  readonly progress: string | null;
  /** Offered as Cancel beside a long-running busy button; null when the work cannot be cancelled. */
  readonly cancel: (() => void) | null;
  /** Null while what it sends is still opening: the button is disabled, with no line above it. */
  readonly run: (() => void) | null;
}

/** The place the Send screen was opened from, as its Back names it, and the way there. */
export interface SendPlace {
  readonly name: string;
  back(): void;
}

export const SendPlaceContext = createContext<SendPlace | null>(null);

/** Throws a TypeError outside a SendPlaceContext. */
function useSendPlace(): SendPlace {
  const place = useContext(SendPlaceContext);
  if (place === null)
    throw new TypeError("a Send frame was drawn outside the Send screen");
  return place;
}

// each one shows once the work has been busy for that long: the spinner, the progress, Still working…, then Cancel
const BUSY_STEPS = [
  SPINNER_AFTER_MS,
  PROGRESS_AFTER_MS,
  STILL_WORKING_MS,
  CANCEL_AFTER_MS,
] as const;

/** How many of BUSY_STEPS have passed since `busy` became true; 0 while idle. */
function useBusyStep(busy: boolean): number {
  const { schedule } = useTiming();
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    setStep(0);
    if (!busy) return undefined;
    const cancels = BUSY_STEPS.map((afterMs, index) =>
      schedule(() => setStep(index + 1), afterMs),
    );
    return () => {
      for (const cancel of cancels) cancel();
    };
  }, [busy, schedule]);
  return step;
}

function Rows(props: { rows: readonly SendRow[] }): ReactNode {
  const { rows } = props;
  const given = SEND_ROW_IDS.flatMap((id) =>
    rows.filter((row) => row.id === id),
  );
  return (
    <dl className="flex flex-col divide-y divide-line">
      {given.map((row) => (
        <div key={row.id} className="flex gap-4">
          <dt className="mn-group-label w-key shrink-0 px-0!">
            {SEND_WORDS[row.id]}
          </dt>
          <dd className="min-w-0 flex-1 py-4 text-ui break-words">
            {row.content}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The line above the button: the refusal, which takes focus when it appears, else why the button is disabled. */
function ActionLine(props: {
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
        className="text-ui outline-none"
      >
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

// the busy button's spinner: the circle the consequence dialog draws, from an icon library this workspace does not depend on
function Spinner(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// the form and its pages side by side, centred, once the screen holds both (1,100 px); the pages under the form before then
const PAIR =
  "mx-auto flex w-fit max-w-full flex-col gap-8 p-6 @min-[68.75rem]:flex-row @min-[68.75rem]:items-start";

/** The one primary button; while busy it keeps the width it had with `label`. */
function ActionButton(props: {
  action: SendAction;
  step: number;
  describedBy: string | undefined;
}): ReactNode {
  const { action, step, describedBy } = props;
  const { label, busy } = action;
  const [idleWidthPx, setIdleWidthPx] = useState<number | null>(null);
  const measure = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node !== null && !busy) setIdleWidthPx(node.offsetWidth);
    },
    [busy, label],
  );
  return (
    <Button
      ref={measure}
      size="lg"
      disabled={busy || action.disabledReason !== null || action.run === null}
      focusableWhenDisabled
      aria-describedby={describedBy}
      style={busy && idleWidthPx !== null ? { width: idleWidthPx } : undefined}
      onClick={() => action.run?.()}
    >
      {busy ? action.busyLabel : label}
      {busy && step >= 1 ? <Spinner /> : null}
    </Button>
  );
}

/** What long work shows beside its busy button: its progress, Still working…, and Cancel when it can be cancelled. */
function BusyAside(props: { action: SendAction; step: number }): ReactNode {
  const { action, step } = props;
  const { progress, cancel } = action;
  if (!action.busy) return null;
  return (
    <>
      {progress !== null && step >= 2 ? (
        <span className="text-ui text-fg-muted">{progress}</span>
      ) : null}
      {step >= 3 ? (
        <span className="text-ui text-fg-muted">
          {DIALOG_WORDS.stillWorking}
        </span>
      ) : null}
      {cancel !== null && step >= 4 ? (
        <Button variant="outline" size="lg" onClick={cancel}>
          {DIALOG_WORDS.cancel}
        </Button>
      ) : null}
    </>
  );
}

/**
 * The Send screen's frame: Back to the place it was opened from, the title (focused on arrival) and `aside`; the rows in
 * the order of SEND_ROW_IDS beside the pages, which stack below them when the frame is narrower than both; then the line
 * above the button and the button. Throws a TypeError outside the Send screen.
 */
export function SendFrame(props: {
  title: string;
  aside: string | null;
  rows: readonly SendRow[];
  pages: ReactNode;
  action: SendAction;
}): ReactNode {
  const { title, aside, rows, pages, action } = props;
  const place = useSendPlace();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lineId = useId();
  const step = useBusyStep(action.busy);
  useEffect(() => headingRef.current?.focus(), []);
  const disabledLine =
    action.disabledReason === null
      ? null
      : DIALOG_WORDS.disabledLine(action.label, action.disabledReason);
  const describing = action.problem === null && disabledLine !== null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-titlebar shrink-0 items-center gap-2 border-b border-line px-2">
        <Button variant="ghost" className="text-fg-muted" onClick={place.back}>
          {SEND_WORDS.back(place.name)}
        </Button>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="truncate text-heading outline-none"
        >
          {title}
        </h1>
        {aside === null ? null : (
          <p className="ms-auto truncate text-meta text-fg-muted">{aside}</p>
        )}
      </header>
      <div className="@container min-h-0 flex-1 overflow-auto">
        <div className={PAIR}>
          <div className="flex w-content max-w-full min-w-0 flex-col">
            <Rows rows={rows} />
            <div className="flex flex-col items-end gap-3 border-t border-line pt-4">
              <ActionLine
                problem={action.problem}
                disabledLine={disabledLine}
                lineId={lineId}
              />
              <div className="flex flex-wrap items-center justify-end gap-3">
                <BusyAside action={action} step={step} />
                <ActionButton
                  action={action}
                  step={step}
                  describedBy={describing ? lineId : undefined}
                />
              </div>
            </div>
          </div>
          <section
            aria-label={SEND_WORDS.pagesRegion}
            className="w-preview max-w-full shrink-0 rounded-surface border border-line bg-desk p-4"
          >
            {pages}
          </section>
        </div>
      </div>
    </div>
  );
}
