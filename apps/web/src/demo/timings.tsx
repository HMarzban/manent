// Timings: this window's typing, pagination and sync measured live, with the open script's size.
import { marksEnabled, readMarks, setMarksEnabled } from "@manent/perf";
import type { DocHandle } from "@manent/sync-client";
import {
  DEMO_WORDS,
  Popover,
  PopoverContent,
  useSubscribable,
} from "@manent/ui";
import { GaugeIcon } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { TIMINGS_REFRESH_MS, createTimingsSource } from "./timings-source.ts";
import { BarButton } from "./bar-button.tsx";

const TOUR = "demo:timings";

/** Disabled without a connection. */
export function Timings(props: {
  docId: string | null;
  offline: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (props.offline)
    return (
      <BarButton
        label={DEMO_WORDS.timings}
        icon={GaugeIcon}
        drops="first"
        tour={TOUR}
        unavailable={DEMO_WORDS.needsConnection}
      />
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <BarButton
        label={DEMO_WORDS.timings}
        icon={GaugeIcon}
        drops="first"
        tour={TOUR}
        hint={DEMO_WORDS.timingsHint}
        opens
      />
      <PopoverContent data-surface="demo" align="end" className="w-auto">
        <TimingRows docId={props.docId} />
      </PopoverContent>
    </Popover>
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

/** Drawn while the popover is open: the product's marks are on for as long, and read again every TIMINGS_REFRESH_MS. */
function TimingRows(props: { docId: string | null }): ReactNode {
  const { schedule } = useEnvironment();
  const handle = useOpenHandle(props.docId);
  useEffect(() => {
    const before = marksEnabled();
    setMarksEnabled(true);
    return () => setMarksEnabled(before);
  }, []);
  const source = useMemo(
    () =>
      createTimingsSource({
        read: readMarks,
        // read through the handle each time: a reorganised script is another document
        doc: () =>
          handle === null
            ? null
            : { liveBytes: handle.doc().encodeState().byteLength },
        // the marks' own clock
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
  return (
    <div className="flex flex-col gap-2 text-ui">
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-fg-muted">{row.label}</dt>
            <dd className="tabular-nums">{row.stats}</dd>
          </div>
        ))}
      </dl>
      <p className="text-meta text-fg-muted">{DEMO_WORDS.timingsNote}</p>
    </div>
  );
}
