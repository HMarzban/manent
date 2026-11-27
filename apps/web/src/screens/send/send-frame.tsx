// The one frame every Send form draws: the way back, the title, the rows, the pages and the action that sends them.
import {
  BusyButton,
  Button,
  CANCEL_AFTER_MS,
  DIALOG_WORDS,
  PROGRESS_AFTER_MS,
  SEND_WORDS,
  STILL_WORKING_MS,
  Skeleton,
  useTiming,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BackButton,
  TitleBarAccount,
  TitleBarDivider,
} from "../../shell/title-bar-pieces.tsx";

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

/** Where a frame draws: the place its Back names, and the title bar across the screen that it fills. */
interface SendHost {
  readonly place: SendPlace;
  readonly titleBar: HTMLElement;
}

const SendHostContext = createContext<SendHost | null>(null);

/** Throws a TypeError outside a SendLayout. */
function useSendHost(): SendHost {
  const host = useContext(SendHostContext);
  if (host === null)
    throw new TypeError("a Send frame was drawn outside the Send screen");
  return host;
}

/**
 * The Send screen's layout: the title bar across its full width, which the frame inside `children` fills, over the
 * frame and `side`, as the document screen draws its title bar over its panels.
 */
export function SendLayout(props: {
  place: SendPlace;
  side: ReactNode;
  children: ReactNode;
}): ReactNode {
  const { place, side, children } = props;
  const [titleBar, setTitleBar] = useState<HTMLElement | null>(null);
  const host = useMemo(
    () => (titleBar === null ? null : { place, titleBar }),
    [place, titleBar],
  );
  return (
    <>
      <header className="flex min-h-titlebar shrink-0 items-center gap-2 border-b border-line bg-chrome px-2.5 py-1">
        <div
          ref={setTitleBar}
          className="flex min-w-0 flex-1 items-center gap-2"
        />
        <TitleBarAccount />
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {host === null ? null : (
            <SendHostContext value={host}>{children}</SendHostContext>
          )}
        </div>
        {side}
      </div>
    </>
  );
}

const BUSY_STEPS = [
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
    return () => cancels.forEach((cancel) => cancel());
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
        <div
          key={row.id}
          // the Tour points at the checks, and at no other row
          data-tour={row.id === "checks" ? "send:checks" : undefined}
          className="flex gap-4"
        >
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
        className="flex items-start gap-2 text-ui outline-none"
      >
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-attention"
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

// the form and its pages side by side, centred, once the screen holds both (1,100 px); the pages under the form before then
const PAIR =
  "mx-auto flex w-fit max-w-full flex-col gap-8 p-6 @min-[68.75rem]:flex-row @min-[68.75rem]:items-start";
const SKELETON_TILES = 4;
const TILE_SCALE = 0.085;
// US Letter proportions (612 × 792 pt) scaled to tile size
const PLACEHOLDER_FRAME: CSSProperties = Object.freeze({
  width: `${612 * TILE_SCALE}pt`,
  height: `${792 * TILE_SCALE}pt`,
});

/** Realistic page-aspect skeleton tiles while the script's pagination is still loading. */
export function PageTilesSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-wrap gap-x-2 gap-y-3">
      {Array.from({ length: SKELETON_TILES }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex flex-col items-center gap-1"
        >
          <Skeleton className="rounded-none" style={PLACEHOLDER_FRAME} />
          <Skeleton className="h-3 w-4" />
        </div>
      ))}
    </div>
  );
}

/** Structured form placeholder matching SendFrame's layout while a Send form or its access check loads. */
export function SendFormSkeleton(props: { rows?: number }): ReactNode {
  const rowCount = props.rows ?? 3;
  return (
    <div aria-busy="true" className="@container min-h-0 flex-1 overflow-auto">
      <div className={PAIR}>
        <div
          aria-hidden="true"
          className="flex w-content max-w-full min-w-0 flex-col divide-y divide-line"
        >
          {Array.from({ length: rowCount }, (_, index) => (
            <div key={index} className="flex items-center gap-4 py-4">
              <Skeleton className="h-3.5 w-key shrink-0" />
              <Skeleton className="h-control flex-1" />
            </div>
          ))}
          <div className="flex justify-end pt-4">
            <Skeleton className="h-control-lg w-32" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="w-preview max-w-full shrink-0 rounded-surface border border-line bg-desk p-4"
        >
          <div className="flex flex-wrap gap-x-2 gap-y-3">
            {Array.from({ length: SKELETON_TILES }, (_, index) => (
              <Skeleton key={index} className="h-24 w-16 rounded-none" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** What long work shows beside its busy button: its progress, Still working…, and Cancel when it can be cancelled. */
function BusyAside(props: { action: SendAction; step: number }): ReactNode {
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
          <span className="text-ui text-fg-muted">{progress}</span>
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

/**
 * The Send screen's frame: in the layout's title bar, Back to the place it was opened from, the title (focused on arrival)
 * and `aside`; under it, the rows in the order of SEND_ROW_IDS beside the pages, which stack below them when the frame is
 * narrower than both; then the line above the button and the button. Throws a TypeError outside a SendLayout.
 */
export function SendFrame(props: {
  title: string;
  aside: string | null;
  rows: readonly SendRow[];
  checksPending?: boolean;
  pages: ReactNode;
  hidePages?: boolean;
  notice?: ReactNode;
  action: SendAction;
}): ReactNode {
  const { title, aside, rows, pages, action } = props;
  const { place, titleBar } = useSendHost();
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
    <>
      {createPortal(
        <>
          <BackButton
            label={SEND_WORDS.back(place.name)}
            onClick={place.back}
          />
          <TitleBarDivider />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="truncate text-title font-semibold text-fg outline-none"
          >
            {title}
          </h1>
          {aside === null ? null : (
            <p className="ms-auto truncate text-meta text-fg-muted">{aside}</p>
          )}
        </>,
        titleBar,
      )}
      <div className="@container min-h-0 flex-1 overflow-auto">
        <div className={PAIR}>
          <div className="flex w-content max-w-full min-w-0 flex-col">
            {props.checksPending ? (
              <div
                aria-busy="true"
                className="flex items-center gap-4 border-b border-line py-4"
              >
                <Skeleton aria-hidden="true" className="h-3.5 w-key shrink-0" />
                <Skeleton aria-hidden="true" className="h-4 w-48" />
              </div>
            ) : null}
            <Rows rows={rows} />
            <div className="flex flex-col items-end gap-3 border-t border-line pt-4">
              {props.notice ?? null}
              <ActionLine
                problem={action.problem}
                disabledLine={disabledLine}
                lineId={lineId}
              />
              <div className="flex flex-wrap items-center justify-end gap-3">
                <BusyAside action={action} step={step} />
                <BusyButton
                  size="lg"
                  label={action.label}
                  busyLabel={action.busy ? action.busyLabel : null}
                  disabled={
                    action.disabledReason !== null || action.run === null
                  }
                  aria-describedby={describing ? lineId : undefined}
                  data-tour="send:confirm"
                  onClick={() => action.run?.()}
                />
              </div>
            </div>
          </div>
          {props.hidePages ? null : (
            <section
              aria-label={SEND_WORDS.pagesRegion}
              className="w-preview max-w-full shrink-0 rounded-surface border border-line bg-desk p-4"
            >
              {pages}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
