// The status beside the title: two slots of fixed width, written without React, that open the Sync centre.
import { Button, Popover, PopoverContent, PopoverTrigger } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import {
  CloudCheckIcon,
  CloudExclamationPointIcon,
  CloudOffIcon,
  CloudUploadIcon,
  EyeIcon,
  MonitorDotIcon,
  SaveCheckIcon,
  SaveOffIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { dialogActions, useOpenDialog } from "../../state/dialog.store.ts";
import { createStatusWriter } from "./status-writer.ts";
import type { DeviceShape, ServerShape } from "./status-writer.ts";
import { SyncCentre } from "./sync-centre.tsx";

const SYNC_CENTRE = "sync_centre";

// each slot draws the icon of the shape the writer names on the root; each class is written whole for the stylesheet
const DEVICE_ICONS: Readonly<Record<DeviceShape, [LucideIcon, string]>> =
  Object.freeze({
    saved: [SaveCheckIcon, "group-data-[device-shape=saved]:block"],
    "not-saved": [SaveOffIcon, "group-data-[device-shape=not-saved]:block"],
  });
const SERVER_ICONS: Readonly<Record<ServerShape, [LucideIcon, string]>> =
  Object.freeze({
    "not-saved": [SaveOffIcon, "group-data-[server-shape=not-saved]:block"],
    "view-only": [EyeIcon, "group-data-[server-shape=view-only]:block"],
    synced: [CloudCheckIcon, "group-data-[server-shape=synced]:block"],
    waiting: [CloudUploadIcon, "group-data-[server-shape=waiting]:block"],
    offline: [CloudOffIcon, "group-data-[server-shape=offline]:block"],
    unreachable: [
      CloudExclamationPointIcon,
      "group-data-[server-shape=unreachable]:block",
    ],
    "browser-only": [
      MonitorDotIcon,
      "group-data-[server-shape=browser-only]:block",
    ],
    attention: [
      TriangleExclamationPointIcon,
      "group-data-[server-shape=attention]:block",
    ],
  });

function SlotIcons(props: {
  icons: readonly [LucideIcon, string][];
}): ReactNode {
  return props.icons.map(([Icon, shown]) => (
    <Icon
      key={shown}
      aria-hidden="true"
      className={`hidden size-icon-lg shrink-0 ${shown}`}
    />
  ));
}

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
  const { dom } = useEnvironment();
  const open = useOpenDialog() === SYNC_CENTRE;
  const { root, deviceSlot, serverSlot } = useStatusSlots(doc.status);
  const popup = useRef<HTMLDivElement>(null);
  const onOpenChange = (next: boolean): void => {
    if (next) {
      commands.run("app.syncCentre", "control");
      return;
    }
    dialogActions.close();
    dom.restoreFocus();
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
              className="h-auto min-h-control max-w-full flex-wrap justify-start gap-0 text-start text-ui font-normal whitespace-normal tabular-nums group-data-[tone=alert]:font-medium"
            />
          }
        >
          {/* the two slots wrap as one: "Saved · Synced" is never split across lines */}
          <span className="flex max-w-full items-center">
            <span className="flex max-w-full shrink-0 items-center gap-1 group-data-spans:hidden">
              <SlotIcons icons={Object.values(DEVICE_ICONS)} />
              <span ref={deviceSlot} />
            </span>
            <span className="whitespace-pre text-fg-muted group-data-spans:hidden">
              {" · "}
            </span>
            <span className="flex max-w-full items-center gap-1 w-(--status-server-w) group-data-spans:w-auto group-data-[tone=alert]:w-auto">
              <SlotIcons icons={Object.values(SERVER_ICONS)} />
              <span ref={serverSlot} className="min-w-0" />
            </span>
          </span>
        </PopoverTrigger>
      </span>
      {/* focus goes back to whatever opened it, which may have been before the palette */}
      <PopoverContent
        ref={popup}
        finalFocus={false}
        align="start"
        initialFocus={focusOnOpen(popup)}
        className="w-popover max-w-(--available-width) gap-0 overflow-hidden p-0 text-ui"
      >
        <div className="contents" onClickCapture={onClickCapture}>
          <SyncCentre doc={doc} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
