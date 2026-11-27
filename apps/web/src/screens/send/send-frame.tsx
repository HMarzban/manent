// The one frame every Send form draws: the way back, the title, the raised archival form card, the pages and the action that sends them.
import { BusyButton, DIALOG_WORDS, SEND_WORDS, Skeleton } from "@manent/ui";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BackButton,
  TitleBarAccount,
  TitleBarDivider,
} from "../../shell/title-bar-pieces.tsx";
import { ActionLine, BusyAside, useBusyStep } from "./send-action-bar.tsx";
import { SEND_PAIR_CLASS } from "./send-skeletons.tsx";

export { PageTilesSkeleton, SendFormSkeleton } from "./send-skeletons.tsx";

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
      <div className="flex min-h-0 flex-1 bg-chrome">
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

/** Fills SendLayout's title bar with Back + h1 and renders centred notice content (e.g. unverified offline state). */
export function SendNoticeFrame(props: {
  title: string;
  children: ReactNode;
}): ReactNode {
  const { place, titleBar } = useSendHost();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
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
            {props.title}
          </h1>
        </>,
        titleBar,
      )}
      <main className="flex min-h-0 flex-1 overflow-y-auto bg-chrome p-6">
        <div className="flex min-h-full w-full flex-col items-center justify-center">
          {props.children}
        </div>
      </main>
    </>
  );
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
          className="flex flex-col gap-1 px-5 py-3.5 @[34rem]:flex-row @[34rem]:gap-4 @[34rem]:py-0"
        >
          <dt className="mn-group-label w-key shrink-0 px-0! pb-0 @[34rem]:pb-1.5">
            {SEND_WORDS[row.id]}
          </dt>
          <dd className="min-w-0 flex-1 text-ui break-words @[34rem]:py-4">
            {row.content}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Send screen's frame: in the layout's title bar, Back to the place it was opened from, the title (focused on arrival)
 * and `aside`; under it, the rows in the order of SEND_ROW_IDS framed in a raised archival card beside the pages; then
 * the line above the button and the button. Throws a TypeError outside a SendLayout.
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
      <main className="@container min-h-0 flex-1 overflow-auto bg-chrome">
        <div className={SEND_PAIR_CLASS}>
          <div className="@container flex w-content max-w-full min-w-0 flex-col rounded-surface border border-line bg-raised">
            {props.checksPending ? (
              <div
                aria-busy="true"
                className="flex items-center gap-4 border-b border-line px-5 py-4"
              >
                <Skeleton aria-hidden="true" className="h-3.5 w-key shrink-0" />
                <Skeleton aria-hidden="true" className="h-4 w-48" />
              </div>
            ) : null}
            <Rows rows={rows} />
            <div className="flex flex-col items-end gap-3 border-t border-line px-5 py-4">
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
      </main>
    </>
  );
}
