// Unified Live Connection & Speed Proof instrument: always active offline so local speed stays provable.
import {
  markEnd,
  markStart,
  marksEnabled,
  readMarks,
  setMarksEnabled,
} from "@manent/perf";
import type { DocHandle } from "@manent/sync-client";
import {
  Button,
  DEMO_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSubscribable,
} from "@manent/ui";
import { ChevronDownIcon, GaugeIcon } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { afterNextPaint } from "../next-paint.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ConnectionMode } from "../services/sync/device-memory.ts";
import type { ConnectionControl } from "./connection-transport.ts";
import { ConnectionChoice } from "./connection.tsx";
import {
  TIMINGS_REFRESH_MS,
  createTimingsSource,
  readKeystrokeP50,
} from "./timings-source.ts";

const TOUR = "demo:timings";
const FRAME_BUDGET_MS = 16.6;
const PASSIVE_POLL_MS = 2_000;

/** Each key pressed in the page, timed from the press to the paint of the next frame. */
function markKeystroke(event: KeyboardEvent): void {
  const { target } = event;
  if (!(target instanceof Element) || !target.closest("[data-editor-host]"))
    return;
  const token = markStart();
  if (token !== -1) afterNextPaint(() => markEnd("editor.keystroke", token));
}

/** Keeps live keystroke marks enabled while mounted and exposes the latest p50 latency for passive pill display. */
export function useLiveKeystrokeP50(): number | null {
  const { schedule } = useEnvironment();
  const [p50, setP50] = useState<number | null>(() =>
    readKeystrokeP50(readMarks()),
  );
  useEffect(() => {
    const before = marksEnabled();
    setMarksEnabled(true);
    document.addEventListener("keydown", markKeystroke, { capture: true });
    let cancel = schedule(function tick() {
      const next = readKeystrokeP50(readMarks());
      setP50((prev) => (prev === next ? prev : next));
      cancel = schedule(tick, PASSIVE_POLL_MS);
    }, PASSIVE_POLL_MS);
    return () => {
      cancel();
      document.removeEventListener("keydown", markKeystroke, { capture: true });
      setMarksEnabled(before);
    };
  }, [schedule]);
  return p50;
}

/**
 * Unified Live Status & Speed Proof instrument. Stays active even when offline so local keystroke,
 * pagination and document-size metrics remain provable while network sync is paused.
 */
export function LiveInstrument(props: {
  docId: string | null;
  connection: ConnectionControl | null;
  mode: ConnectionMode;
  serverStopped: boolean;
  keystrokeP50: number | null;
  missionShowsReconnect?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const {
    docId,
    connection,
    mode,
    serverStopped,
    keystrokeP50,
    missionShowsReconnect = false,
    open,
    onOpenChange,
  } = props;
  const offline = mode === "offline";
  const slow = mode === "slow";
  const speedText =
    keystrokeP50 === null
      ? DEMO_WORDS.timings
      : DEMO_WORDS.msShort(keystrokeP50);

  const trigger = (
    <PopoverTrigger
      render={
        <button
          type="button"
          data-tour={TOUR}
          data-tone={offline || slow ? "attention" : undefined}
          aria-label={DEMO_WORDS.timings}
          className="mn-demo-pill cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-focus"
        />
      }
    >
      <span
        aria-hidden="true"
        className="mn-demo-dot"
        data-tone={offline || slow ? "attention" : "ok"}
      />
      <span>
        {offline
          ? DEMO_WORDS.offline
          : slow
            ? DEMO_WORDS.slow
            : DEMO_WORDS.live}
      </span>
      <span
        aria-hidden="true"
        className="hidden items-center gap-1 text-fg-muted tabular-nums sm:inline-flex"
      >
        <GaugeIcon aria-hidden="true" className="size-3.5" />
        <span>
          {offline && keystrokeP50 !== null
            ? `${speedText} ${DEMO_WORDS.localLabel}`
            : speedText}
        </span>
      </span>
      <ChevronDownIcon
        aria-hidden="true"
        className="size-3 shrink-0 text-fg-muted"
      />
    </PopoverTrigger>
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={onOpenChange}>
        <Tooltip disabled={open}>
          <TooltipTrigger render={trigger} />
          <TooltipContent className="data-closed:hidden">
            {DEMO_WORDS.timingsHint}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          data-surface="demo"
          align="start"
          className="w-80 max-w-[calc(100vw-1.5rem)] p-4 data-closed:hidden"
        >
          <div className="flex flex-col gap-3.5 text-ui">
            {connection !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">
                    {DEMO_WORDS.connectionHeading}
                  </span>
                  <span className="text-micro text-fg-muted">
                    {DEMO_WORDS.scopeWindowHint}
                  </span>
                </div>
                <ConnectionChoice control={connection} tour fullWidth />
                {offline ? (
                  <div className="mn-demo-banner">
                    <span>{DEMO_WORDS.offlineBanner}</span>
                  </div>
                ) : slow ? (
                  <div className="mn-demo-banner">
                    <span>{DEMO_WORDS.slowBanner}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              className={
                connection !== null
                  ? "flex flex-col gap-2.5 border-t border-line pt-3"
                  : "flex flex-col gap-2.5"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-fg">
                  {DEMO_WORDS.speedHeading}
                </span>
                <span className="text-micro font-medium text-ok tabular-nums">
                  {DEMO_WORDS.speedBudget}
                </span>
              </div>
              <TimingRows
                docId={docId}
                offline={offline}
                serverStopped={serverStopped}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {connection !== null && (slow || (offline && !missionShowsReconnect)) ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 rounded-full px-2 text-micro font-semibold"
          onClick={() => connection.set("online")}
        >
          {offline ? DEMO_WORDS.reconnect : DEMO_WORDS.backToNormal}
        </Button>
      ) : null}
    </div>
  );
}

/** The open script's handle, once it has opened; null without a script. */
function useOpenHandle(docId: string | null): DocHandle | null {
  const { openHandle } = useServices();
  const [opened, setOpened] = useState<DocHandle | null>(null);
  useEffect(() => {
    if (docId === null) return undefined;
    let current = true;
    openHandle(docId).then(
      (handle) => {
        if (current) setOpened(handle);
      },
      () => {
        // a script this person's sync cannot open has no size to show
      },
    );
    return () => {
      current = false;
    };
  }, [docId, openHandle]);
  return opened?.docId === docId ? opened : null;
}

/** Drawn while the popover is open: the marks are read again every TIMINGS_REFRESH_MS. */
function TimingRows(props: {
  docId: string | null;
  offline: boolean;
  serverStopped: boolean;
}): ReactNode {
  const { schedule } = useEnvironment();
  const handle = useOpenHandle(props.docId);
  const source = useMemo(
    () =>
      createTimingsSource({
        read: readMarks,
        // read through the handle each time: a reorganised script is another document
        doc: () =>
          handle === null
            ? null
            : { liveBytes: handle.doc().encodeState().byteLength },
        now: () => performance.now(),
      }),
    [handle],
  );
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let cancel = schedule(function tick() {
      redraw();
      cancel = schedule(tick, TIMINGS_REFRESH_MS);
    }, TIMINGS_REFRESH_MS);
    return () => cancel();
  }, [schedule]);
  const rows = useSubscribable(source);
  const [keystroke, pagination, sync, size] = rows;
  const syncLabel = props.serverStopped
    ? DEMO_WORDS.pausedServer
    : props.offline
      ? DEMO_WORDS.pausedOffline
      : (sync?.stats ?? DEMO_WORDS.nothingMeasured);
  const sizeLabel =
    props.docId === null
      ? DEMO_WORDS.openScriptPrompt
      : (size?.stats ?? DEMO_WORDS.nothingMeasured);

  const meterRows = [keystroke, pagination].filter(
    (row): row is NonNullable<typeof row> => row !== undefined,
  );

  return (
    <div className="flex flex-col gap-2.5 text-meta">
      <div className="flex flex-col gap-2">
        {meterRows.map((row) => {
          const ratio =
            row.p50Ms === null
              ? 0
              : Math.min(1, Math.max(0.04, row.p50Ms / FRAME_BUDGET_MS));
          return (
            <div key={row.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-fg-muted">{row.label}</span>
                <span className="font-medium text-fg tabular-nums">
                  {row.p50Ms === null
                    ? row.stats
                    : DEMO_WORDS.msShort(row.p50Ms)}
                </span>
              </div>
              <div aria-hidden="true" className="mn-demo-meter-track">
                <div
                  className="mn-demo-meter-fill"
                  style={{ transform: `scaleX(${ratio})` }}
                />
              </div>
              {row.p50Ms !== null ? (
                <span className="text-micro text-fg-muted tabular-nums">
                  {row.stats}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-2">
        {sync ? (
          <div className="contents">
            <dt className="text-fg-muted">{sync.label}</dt>
            <dd
              className={
                props.offline || props.serverStopped
                  ? "text-end font-medium text-attention tabular-nums"
                  : "text-end font-medium text-fg tabular-nums"
              }
            >
              {syncLabel}
            </dd>
          </div>
        ) : null}
        {size ? (
          <div className="contents">
            <dt className="text-fg-muted">{size.label}</dt>
            <dd className="text-end font-medium text-fg tabular-nums">
              {sizeLabel}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="text-micro leading-snug text-fg-muted">
        {DEMO_WORDS.speedNote}
      </p>
    </div>
  );
}
