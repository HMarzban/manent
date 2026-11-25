// This device in the desktop app: what the node stores and the folder it keeps it in, then About with the app's version.
import {
  Button,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
  Skeleton,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { desktopDeviceRows } from "../../desktop/device-rows.ts";
import type { DesktopDeviceRows } from "../../desktop/device-rows.ts";
import type { DesktopHost } from "../../desktop/host.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { About } from "./device-about.tsx";
import { Group } from "./device-group.tsx";

/** A row with its label, its value and the one button that acts on it. */
function ActionRow(props: {
  label: string;
  value: string;
  action: string;
  onAction(): void;
}): ReactNode {
  return (
    <div className="flex min-h-row items-center justify-between gap-4 text-ui">
      <span>{props.label}</span>
      <span className="min-w-0 grow truncate text-fg-muted">{props.value}</span>
      <Button variant="outline" size="sm" onClick={props.onAction}>
        {props.action}
      </Button>
    </div>
  );
}

export interface DesktopDevice {
  rows: DesktopDeviceRows;
  loadingUsage: boolean;
  showLibrary(): void;
  showFolder(): void;
  checkForUpdates(): void;
}

/**
 * This device's rows in the desktop app: the node's usage, read when the pane opens and after each Show folder, and the
 * window's last word on updates, each outcome said politely as it comes.
 */
function useDesktopDevice(host: DesktopHost): DesktopDevice {
  const { dom, updateState } = useEnvironment();
  const { commands } = useServices();
  const [usage, setUsage] = useState<
    { scripts: number; bytes: number } | null | undefined
  >(undefined);
  const mounted = useRef(true);
  const requestId = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const readUsage = useCallback(() => {
    const id = ++requestId.current;
    void host.storage().then(
      (result) => {
        if (mounted.current && requestId.current === id) setUsage(result);
      },
      () => {
        if (mounted.current && requestId.current === id) setUsage(null);
      },
    );
  }, [host]);
  useEffect(() => {
    setUsage(undefined);
    readUsage();
  }, [readUsage]);
  const update = useSubscribable(updateState);
  const rows = desktopDeviceRows({ host, usage: usage ?? null, update });
  const { line } = rows.update;
  // the line the pane opened with was said when it came
  const said = useRef(line);
  useEffect(() => {
    if (line !== null && line !== said.current) dom.announce(line);
    said.current = line;
  }, [line, dom]);
  return {
    rows,
    loadingUsage: usage === undefined,
    showLibrary: () => void commands.run("app.library", "control"),
    showFolder() {
      host.send({ v: 1, t: "show_folder" });
      readUsage();
    },
    checkForUpdates() {
      updateState.set("checking");
      host.send({ v: 1, t: "check_for_updates" });
    },
  };
}

const PLACEHOLDER_ROWS = 2;

function StoredRowsSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col">
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex min-h-row items-center justify-between gap-4"
        >
          <Skeleton className="h-3.5 w-16 shrink-0" />
          <Skeleton className="h-3.5 max-w-48 grow" />
          <Skeleton className="h-control-sm w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** What the node stores, and the folder it keeps it in; placeholder rows until the node answers. */
function DesktopStoredHere(props: { device: DesktopDevice }): ReactNode {
  const { rows, loadingUsage, showLibrary, showFolder } = props.device;
  return (
    <Group heading={PREFERENCES_WORDS.storedHere}>
      {rows.stored === null ? (
        loadingUsage ? (
          <StoredRowsSkeleton />
        ) : null
      ) : (
        <>
          <ActionRow
            label={DESKTOP_WORDS.scriptsRow}
            value={rows.stored.scripts}
            action={PREFERENCES_WORDS.showInLibrary}
            onAction={showLibrary}
          />
          <ActionRow
            label={DESKTOP_WORDS.folderRow}
            value={rows.stored.folder}
            action={PREFERENCES_WORDS.showFolder}
            onAction={showFolder}
          />
        </>
      )}
    </Group>
  );
}

export function DesktopGroups(props: { host: DesktopHost }): ReactNode {
  const device = useDesktopDevice(props.host);
  return (
    <>
      <DesktopStoredHere device={device} />
      <About desktop={device} />
    </>
  );
}
