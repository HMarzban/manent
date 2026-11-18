// The status beside the title: two slots of fixed width, written without React, that open the Sync centre.
import { Button, Popover, PopoverContent, PopoverTrigger } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useLayoutEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { dialogActions, useOpenDialog } from "../../state/dialog.store.ts";
import { createStatusWriter } from "./status-writer.ts";
import { SyncCentre } from "./sync-centre.tsx";

const SYNC_CENTRE = "sync_centre";

/** Keeps the status of `source` written into the two slots for as long as they are drawn. */
function useStatusSlots(source: Subscribable<StatusFacts>) {
  const { now, schedule } = useEnvironment();
  const root = useRef<HTMLSpanElement>(null);
  const deviceSlot = useRef<HTMLSpanElement>(null);
  const serverSlot = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (
      root.current === null ||
      deviceSlot.current === null ||
      serverSlot.current === null
    )
      return;
    const device = root.current.ownerDocument.createTextNode("");
    const server = root.current.ownerDocument.createTextNode("");
    deviceSlot.current.append(device);
    serverSlot.current.append(server);
    const stop = createStatusWriter({
      device,
      server,
      root: root.current,
      source,
      now,
      schedule,
    });
    return () => {
      stop();
      device.remove();
      server.remove();
    };
  }, [source, now, schedule]);
  return { root, deviceSlot, serverSlot };
}

// opened by pointer, the popover itself takes focus; by key or by command, its first action does
const focusOnOpen =
  (popup: { current: HTMLElement | null }) =>
  (openType: string): HTMLElement | boolean =>
    openType === "mouse" || openType === "pen" || openType === "touch"
      ? (popup.current ?? true)
      : true;

/**
 * Its name is the whole status sentence. The slots keep their widths while the words change, so the status never moves;
 * a sentence across both slots and the device alert release them.
 */
export function StatusButton(props: { doc: DocumentServices }): ReactNode {
  const { doc } = props;
  const { commands } = useServices();
  const open = useOpenDialog() === SYNC_CENTRE;
  const { root, deviceSlot, serverSlot } = useStatusSlots(doc.status);
  const popup = useRef<HTMLDivElement>(null);
  const onOpenChange = (next: boolean): void => {
    if (next) commands.run("app.syncCentre", "control");
    else dialogActions.close();
  };
  // a command run with focus inside the popover, whose role is dialog, is passed to it; an action
  // therefore sends focus back to the status first, which also closes the popover
  const onClickCapture = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest("button"))
      root.current?.querySelector("button")?.focus({ preventScroll: true });
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <span
        ref={root}
        className="group flex max-w-full shrink-0 data-[tone=alert]:text-danger data-[tone=attention]:text-attention data-[tone=quiet]:text-fg-muted"
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto max-w-full flex-wrap justify-start text-start text-ui whitespace-normal tabular-nums"
            />
          }
        >
          <span
            ref={deviceSlot}
            className="max-w-full shrink-0 w-(--status-device-w) group-data-spans:hidden group-data-[tone=alert]:w-auto"
          />
          <span className="whitespace-pre group-data-spans:hidden">
            {" · "}
          </span>
          <span
            ref={serverSlot}
            className="max-w-full w-(--status-server-w) group-data-spans:w-auto group-data-[tone=alert]:w-auto"
          />
        </PopoverTrigger>
      </span>
      <PopoverContent
        ref={popup}
        align="start"
        initialFocus={focusOnOpen(popup)}
        className="gap-2 text-ui"
      >
        <div className="contents" onClickCapture={onClickCapture}>
          <SyncCentre doc={doc} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
