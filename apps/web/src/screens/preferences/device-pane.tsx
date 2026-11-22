// Preferences → This device (This browser on the web): Interface size, what comes from the system, what is stored here, and About.
import { ENGINE_VERSION } from "@manent/pagination";
import {
  BusyButton,
  Button,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
  SPINNER_AFTER_MS,
  SettingRow,
  useSubscribable,
  useTiming,
} from "@manent/ui";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
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
    <section className="flex flex-col">
      <h3 className="mn-group-label px-0!">{props.heading}</h3>
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
          <Button variant="outline" onClick={ask}>
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

/** True once `busy` has held for the spinner's wait; false again as soon as it ends. */
function useSpinnerDue(busy: boolean): boolean {
  const { schedule } = useTiming();
  const [due, setDue] = useState(false);
  useLayoutEffect(() => {
    setDue(false);
    return busy ? schedule(() => setDue(true), SPINNER_AFTER_MS) : undefined;
  }, [busy, schedule]);
  return due;
}

interface DesktopDevice {
  rows: DesktopDeviceRows;
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
  const [usage, setUsage] = useState<{ scripts: number; bytes: number } | null>(
    null,
  );
  const readUsage = useCallback(() => {
    void host.storage().then(setUsage);
  }, [host]);
  useEffect(readUsage, [readUsage]);
  const update = useSubscribable(updateState);
  const rows = desktopDeviceRows({ host, usage, update });
  const { line } = rows.update;
  // the line the pane opened with was said when it came
  const said = useRef(line);
  useEffect(() => {
    if (line !== null && line !== said.current) dom.announce(line);
    said.current = line;
  }, [line, dom]);
  return {
    rows,
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
  const spinning = useSpinnerDue(rows.update.busy);
  return (
    <>
      <p className="text-ui">{rows.version}</p>
      <Fact label={DESKTOP_WORDS.channelRow} value={rows.channel} />
      <div>
        <BusyButton
          variant="outline"
          size="sm"
          label={PREFERENCES_WORDS.checkForUpdates}
          busyLabel={
            rows.update.busy ? PREFERENCES_WORDS.checkingForUpdates : null
          }
          spinning={spinning}
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
            className="h-auto p-0"
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
