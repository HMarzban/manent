// Preferences → This device (This browser on the web): Interface size, what comes from the system, what is stored here, and About.
import { ENGINE_VERSION } from "@manent/pagination";
import type { UpdateState } from "@manent/sync-protocol";
import {
  Button,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
  SPINNER_AFTER_MS,
  SettingRow,
  useTiming,
} from "@manent/ui";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { desktopDeviceRows } from "../../desktop/device-rows.ts";
import type { DesktopDeviceRows } from "../../desktop/device-rows.ts";
import type { DesktopHost } from "../../desktop/host.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";

// the build's define; absent outside a build
declare const MANENT_VERSION: string | undefined;
// every manifest in the repository starts at this version
const UNVERSIONED = "0.0.0";

export const FORCED_COLOURS = "(forced-colors: active)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MORE_CONTRAST = "(prefers-contrast: more)";

/** Whether the system matches `query` now, read again when it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
  );
}

function Fact(props: { label: string; value: string }): ReactNode {
  return (
    <div className="flex min-h-row items-center justify-between gap-4 text-ui">
      <span>{props.label}</span>
      <span className="text-fg-muted">{props.value}</span>
    </div>
  );
}

function Group(props: { heading: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col py-2">
      <h3 className="text-micro uppercase text-fg-muted">{props.heading}</h3>
      {props.children}
    </section>
  );
}

function FromYourSystem(): ReactNode {
  const reduced = useMediaQuery(REDUCED_MOTION);
  const more = useMediaQuery(MORE_CONTRAST);
  const forced = useMediaQuery(FORCED_COLOURS);
  const contrast = forced
    ? PREFERENCES_WORDS.contrastForced
    : more
      ? PREFERENCES_WORDS.contrastMore
      : PREFERENCES_WORDS.contrastStandard;
  return (
    <Group heading={PREFERENCES_WORDS.fromSystem}>
      <Fact
        label={PREFERENCES_WORDS.motion}
        value={
          reduced
            ? PREFERENCES_WORDS.motionReduced
            : PREFERENCES_WORDS.motionFull
        }
      />
      <Fact label={PREFERENCES_WORDS.contrast} value={contrast} />
      <p className="text-meta text-fg-muted">
        {PREFERENCES_WORDS.changeInSystem}
      </p>
    </Group>
  );
}

/** The browser's own storage manager; absent where the browser has none. */
const storageManager = (): StorageManager | null =>
  "storage" in navigator ? navigator.storage : null;

/** Whether the browser has agreed to keep Manent's data, with the request that asks it to. */
function StoredHere(): ReactNode {
  const [kept, setKept] = useState(false);
  useEffect(() => {
    let live = true;
    storageManager()
      ?.persisted()
      .then((answer) => {
        if (live) setKept(answer);
      })
      .catch(() => {
        // a browser that cannot answer keeps the first sentence and the button
      });
    return () => {
      live = false;
    };
  }, []);
  const ask = (): void => {
    storageManager()
      ?.persist()
      .then(setKept)
      .catch(() => {
        // a request that fails is a refusal: the sentence and the button stay
      });
  };
  return (
    <Group heading={PREFERENCES_WORDS.storedHere}>
      <p className="text-ui">
        {kept
          ? PREFERENCES_WORDS.browserKeeps
          : PREFERENCES_WORDS.browserMayClear}
      </p>
      {kept ? null : (
        <div>
          <Button variant="outline" size="sm" onClick={ask}>
            {PREFERENCES_WORDS.askToKeep}
          </Button>
        </div>
      )}
    </Group>
  );
}

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

/** While `busy`, the button reads `busyLabel`, is disabled and keeps the width it had; its spinner shows after a while. */
function BusyButton(props: {
  label: string;
  busyLabel: string;
  busy: boolean;
  onClick(): void;
}): ReactNode {
  const { label, busyLabel, busy } = props;
  const { schedule } = useTiming();
  const [spinning, setSpinning] = useState(false);
  const [idleWidth, setIdleWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    setSpinning(false);
    return busy
      ? schedule(() => setSpinning(true), SPINNER_AFTER_MS)
      : undefined;
  }, [busy, schedule]);
  // measured while idle; kept while the busy label shows
  const measure = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node !== null && !busy) setIdleWidth(node.offsetWidth);
    },
    [busy],
  );
  return (
    <Button
      ref={measure}
      variant="outline"
      size="sm"
      disabled={busy}
      focusableWhenDisabled
      style={
        busy && idleWidth !== null ? { width: `${idleWidth}px` } : undefined
      }
      onClick={props.onClick}
    >
      {busy ? busyLabel : label}
      {busy && spinning ? <Spinner /> : null}
    </Button>
  );
}

interface DesktopDevice {
  rows: DesktopDeviceRows;
  showLibrary(): void;
  showFolder(): void;
  checkForUpdates(): void;
}

/**
 * This device's rows in the desktop app: the node's usage, read when the pane opens and after each Show folder, and the
 * shell's last answer to Check for updates while the pane is open, each outcome said politely.
 */
function useDesktopDevice(host: DesktopHost): DesktopDevice {
  const { dom } = useEnvironment();
  const { commands } = useServices();
  const [usage, setUsage] = useState<{ scripts: number; bytes: number } | null>(
    null,
  );
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const readUsage = useCallback(() => {
    void host.storage().then(setUsage);
  }, [host]);
  useEffect(readUsage, [readUsage]);
  useEffect(
    () =>
      host.onMessage((message) => {
        if (message.t === "update_state") setUpdate(message.state);
      }),
    [host],
  );
  const rows = desktopDeviceRows({ host, usage, update });
  const { line } = rows.update;
  useEffect(() => {
    if (line !== null) dom.announce(line);
  }, [line, dom]);
  return {
    rows,
    showLibrary: () => void commands.run("app.library", "control"),
    showFolder() {
      host.send({ v: 1, t: "show_folder" });
      readUsage();
    },
    checkForUpdates() {
      setUpdate("checking");
      host.send({ v: 1, t: "check_for_updates" });
    },
  };
}

/** What the node stores, and the folder it keeps it in; nothing but the heading until the node answers. */
function DesktopStoredHere(props: { device: DesktopDevice }): ReactNode {
  const { rows, showLibrary, showFolder } = props.device;
  return (
    <Group heading={PREFERENCES_WORDS.storedHere}>
      {rows.stored === null ? null : (
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

/** The version, its channel and Check for updates, with the check's outcome under it. */
function DesktopVersion(props: { device: DesktopDevice }): ReactNode {
  const { rows, checkForUpdates } = props.device;
  return (
    <>
      <p className="text-ui">{rows.version}</p>
      <Fact label={DESKTOP_WORDS.channelRow} value={rows.channel} />
      <div>
        <BusyButton
          label={PREFERENCES_WORDS.checkForUpdates}
          busyLabel={PREFERENCES_WORDS.checkingForUpdates}
          busy={rows.update.busy}
          onClick={checkForUpdates}
        />
      </div>
      {rows.update.line === null ? null : (
        <p className="text-ui">{rows.update.line}</p>
      )}
    </>
  );
}

/** On the web the version is the build's; in the desktop app it is the app's, with its channel and update check. */
function About(props: { desktop: DesktopDevice | null }): ReactNode {
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const pledgeId = useId();
  const version =
    typeof MANENT_VERSION === "undefined" ? UNVERSIONED : MANENT_VERSION;
  return (
    <Group heading={PREFERENCES_WORDS.about}>
      {props.desktop === null ? (
        <p className="text-ui">{PREFERENCES_WORDS.version(version)}</p>
      ) : (
        <DesktopVersion device={props.desktop} />
      )}
      <p className="text-ui">
        {PREFERENCES_WORDS.layoutEngine(ENGINE_VERSION)}
      </p>
      <p className="text-ui">{PREFERENCES_WORDS.noUsageData}</p>
      <div className="flex flex-col gap-1">
        <p className="text-ui">{PREFERENCES_WORDS.aiPledge}</p>
        <div>
          <Button
            variant="link"
            size="sm"
            aria-expanded={pledgeOpen}
            aria-controls={pledgeId}
            onClick={() => setPledgeOpen((open) => !open)}
          >
            {PREFERENCES_WORDS.readAiPledge}
          </Button>
        </div>
        <div id={pledgeId}>
          {pledgeOpen ? (
            <p className="text-ui">{PREFERENCES_WORDS.aiPledgeFull}</p>
          ) : null}
        </div>
      </div>
    </Group>
  );
}

function DesktopGroups(props: { host: DesktopHost }): ReactNode {
  const device = useDesktopDevice(props.host);
  return (
    <>
      <DesktopStoredHere device={device} />
      <About desktop={device} />
    </>
  );
}

export function DevicePane(props: {
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { desktop } = useEnvironment();
  return (
    <>
      <SettingRow
        settingKey="device.interfaceSize"
        deviceName={props.deviceName}
        persisted={props.persisted}
      />
      <FromYourSystem />
      {desktop === null ? (
        <>
          <StoredHere />
          <About desktop={null} />
        </>
      ) : (
        <DesktopGroups host={desktop} />
      )}
    </>
  );
}
