// This device in the desktop app: what the node stores and the folder it keeps it in, then About with the app's version.
import {
  BusyButton,
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
import { exportEverythingOnDevice } from "../../desktop/export-everything.ts";
import type { DesktopHost } from "../../desktop/host.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readPerson } from "../../session.ts";
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

interface ExportState {
  readonly picking: boolean;
  readonly count: number | null;
}

const IDLE_EXPORT: ExportState = { picking: false, count: null };

export interface DesktopDevice {
  rows: DesktopDeviceRows;
  loadingUsage: boolean;
  exportState: ExportState;
  showLibrary(): void;
  showFolder(): void;
  exportEverything(): void;
  checkForUpdates(): void;
}

/**
 * This device's rows in the desktop app: the node's usage, read when the pane opens and after each Show folder, and the
 * window's last word on updates, each outcome said politely as it comes.
 */
function useDesktopDevice(host: DesktopHost): DesktopDevice {
  const { dom, now, tabStorage, updateState } = useEnvironment();
  const services = useServices();
  const { commands, messages } = services;
  const [usage, setUsage] = useState<
    { scripts: number; bytes: number } | null | undefined
  >(undefined);
  const [exportState, setExportState] = useState<ExportState>(IDLE_EXPORT);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      exportAbort.current?.abort();
      exportAbort.current = null;
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
  const exportEverything = useCallback(() => {
    if (exportAbort.current !== null) return;
    const controller = new AbortController();
    exportAbort.current = controller;
    setExportState({ picking: true, count: null });
    void exportEverythingOnDevice({
      host,
      services,
      token: readPerson(tabStorage)?.token ?? null,
      now,
      signal: controller.signal,
      onCount(count) {
        if (mounted.current && exportAbort.current === controller)
          setExportState({ picking: true, count });
      },
    }).then((outcome) => {
      if (exportAbort.current === controller) exportAbort.current = null;
      if (mounted.current) setExportState(IDLE_EXPORT);
      if (outcome.kind === "exported") {
        messages.push({
          id: "export_everything",
          text: PREFERENCES_WORDS.exportedProjects(
            outcome.count,
            outcome.folder,
          ),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      } else if (outcome.kind === "refused") {
        messages.push({
          id: "export_everything_refused",
          text: PREFERENCES_WORDS.exportEverythingRefused,
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      }
    });
  }, [host, messages, now, services, tabStorage]);
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
    exportState,
    showLibrary: () => void commands.run("app.library", "control"),
    showFolder() {
      host.send({ v: 1, t: "show_folder" });
      readUsage();
    },
    exportEverything,
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
  const {
    rows,
    loadingUsage,
    exportState,
    showLibrary,
    showFolder,
    exportEverything,
  } = props.device;
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
          <div className="flex min-h-row items-center">
            <BusyButton
              variant="outline"
              size="sm"
              label={PREFERENCES_WORDS.exportEverything}
              busyLabel={
                exportState.count === null
                  ? null
                  : PREFERENCES_WORDS.exportingProjects(exportState.count)
              }
              disabled={exportState.picking}
              onClick={exportEverything}
            />
          </div>
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
