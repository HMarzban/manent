// Preferences → This device (This browser on the web): Interface size, what comes from the system, what is stored here, Install and About.
import {
  BusyButton,
  Button,
  PREFERENCES_WORDS,
  SettingRow,
  Skeleton,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { installHint, isStandalone } from "../../platform.ts";
import type { InstallHint } from "../../platform.ts";
import { backupEverythingInBrowser } from "../../pwa/export-all.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { Environment } from "../../services/ports.ts";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";
import { DesktopGroups } from "./desktop-device.tsx";
import { About } from "./device-about.tsx";
import { Fact, Group } from "./device-group.tsx";
import { InstallGroup } from "./device-install.tsx";

export const FORCED_COLOURS = "(forced-colors: active)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MORE_CONTRAST = "(prefers-contrast: more)";
const NO_OFFLINE_SOURCE: Subscribable<unknown> = createValue(null);

type OfflineStatus = "ready" | "preparing" | "save_data" | "online_only";

const OFFLINE_LABELS: Readonly<Record<OfflineStatus, string>> = Object.freeze({
  ready: PREFERENCES_WORDS.offlineReady,
  preparing: PREFERENCES_WORDS.offlinePreparing,
  save_data: PREFERENCES_WORDS.offlineDataSaver,
  online_only: PREFERENCES_WORDS.offlineOnlineOnly,
});

function readEnvironmentOfflineSource(
  environment: Environment,
): Subscribable<unknown> {
  return environment.offlineReadiness ?? NO_OFFLINE_SOURCE;
}

function normaliseOfflineStatus(raw: unknown): OfflineStatus | null {
  const status =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null && "status" in raw
        ? Reflect.get(raw, "status")
        : null;
  if (typeof status !== "string" || status === "idle") return null;
  if (status === "ready") return "ready";
  if (
    status === "preparing" ||
    status === "installing" ||
    status === "warming" ||
    status === "shell_only"
  )
    return "preparing";
  if (
    status === "save_data" ||
    status === "paused_data_saver" ||
    status === "paused_save_data"
  )
    return "save_data";
  return "online_only";
}

function detectFallbackOfflineStatus(): OfflineStatus {
  if ("serviceWorker" in navigator && navigator.serviceWorker?.controller)
    return "ready";
  const connection = Reflect.get(navigator, "connection") as
    { readonly saveData?: boolean } | undefined;
  if (connection?.saveData === true) return "save_data";
  return "online_only";
}

function useOfflineStatus(): OfflineStatus {
  const environment = useEnvironment();
  const wired = useSubscribable(readEnvironmentOfflineSource(environment));
  const [fallback, setFallback] = useState<OfflineStatus>(
    detectFallbackOfflineStatus,
  );
  useEffect(() => {
    if (wired !== null) return;
    if (
      !("serviceWorker" in navigator) ||
      typeof navigator.serviceWorker?.getRegistration !== "function"
    )
      return;
    let live = true;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (!live) return;
        if (navigator.serviceWorker.controller || registration?.active)
          setFallback("ready");
        else if (registration?.installing || registration?.waiting)
          setFallback("preparing");
        else setFallback(detectFallbackOfflineStatus());
      })
      .catch(() => {
        if (live) setFallback(detectFallbackOfflineStatus());
      });
    return () => {
      live = false;
    };
  }, [wired]);
  return normaliseOfflineStatus(wired) ?? fallback;
}

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
  "storage" in navigator ? (navigator.storage ?? null) : null;

/** Whether the browser has agreed to keep Manent's data, offline readiness, space used and 1-click browser backup. */
function StoredHere(props: {
  standalone: boolean;
  hint: InstallHint;
}): ReactNode {
  const { now } = useEnvironment();
  const services = useServices();
  const offlineStatus = useOfflineStatus();
  const [kept, setKept] = useState<boolean | null>(() => {
    const manager = storageManager();
    return typeof manager?.persisted !== "function" ? false : null;
  });
  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  const [backupState, setBackupState] = useState<{
    readonly busy: boolean;
    readonly count: number | null;
  }>({ busy: false, count: null });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const manager = storageManager();
    if (typeof manager?.persisted !== "function") {
      setKept(false);
    } else {
      let live = true;
      manager
        .persisted()
        .then((answer) => {
          if (live) setKept(answer);
        })
        .catch(() => {
          // a browser that cannot answer keeps the first sentence and the button
          if (live) setKept(false);
        });
      return () => {
        live = false;
      };
    }
    return undefined;
  }, []);
  useEffect(() => {
    const manager = storageManager();
    if (typeof manager?.estimate !== "function") return;
    let live = true;
    manager
      .estimate()
      .then((estimate) => {
        if (
          live &&
          typeof estimate.usage === "number" &&
          Number.isFinite(estimate.usage)
        )
          setUsageBytes(estimate.usage);
      })
      .catch(() => {
        // leave the Space used row absent when estimate is unavailable
      });
    return () => {
      live = false;
    };
  }, []);
  const ask = (): void => {
    const manager = storageManager();
    if (typeof manager?.persist !== "function") return;
    manager
      .persist()
      .then(setKept)
      .catch(() => {
        // a request that fails is a refusal: the sentence and the button stay
      });
  };
  const runBackup = useCallback(() => {
    if (backupState.busy) return;
    setBackupState({ busy: true, count: null });
    void backupEverythingInBrowser({
      services,
      now,
      onCount(count) {
        if (mounted.current) setBackupState({ busy: true, count });
      },
    }).then((outcome) => {
      if (mounted.current) setBackupState({ busy: false, count: null });
      if (outcome.kind === "exported") {
        services.messages.push({
          id: "backup_browser",
          text: PREFERENCES_WORDS.backupBrowserDone(outcome.count),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      } else if (outcome.kind === "empty") {
        services.messages.push({
          id: "backup_browser_empty",
          text: PREFERENCES_WORDS.backupBrowserEmpty,
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      } else {
        services.messages.push({
          id: "backup_browser_refused",
          text: PREFERENCES_WORDS.exportEverythingRefused,
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      }
    });
  }, [backupState.busy, now, services]);
  const backupBusyLabel = !backupState.busy
    ? null
    : backupState.count === null
      ? PREFERENCES_WORDS.offlinePreparing
      : PREFERENCES_WORDS.exportingProjects(backupState.count);
  return (
    <Group heading={PREFERENCES_WORDS.storedHere}>
      {kept === null ? (
        <div aria-busy="true" className="flex flex-col gap-2 py-1">
          <Skeleton aria-hidden="true" className="h-4 w-64" />
          <Skeleton aria-hidden="true" className="h-control w-44" />
        </div>
      ) : (
        <>
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
        </>
      )}
      <Fact
        label={PREFERENCES_WORDS.offlineRow}
        value={OFFLINE_LABELS[offlineStatus]}
      />
      {usageBytes === null ? null : (
        <Fact
          label={PREFERENCES_WORDS.spaceUsedRow}
          value={PREFERENCES_WORDS.spaceUsedValue(usageBytes)}
        />
      )}
      {props.hint !== "none" && !props.standalone ? (
        <p className="text-meta text-fg-muted">
          {PREFERENCES_WORDS.safariEvictionNote}
        </p>
      ) : null}
      <div className="flex min-h-row items-center">
        <BusyButton
          variant="outline"
          size="sm"
          label={PREFERENCES_WORDS.backupBrowser}
          busyLabel={backupBusyLabel}
          disabled={backupState.busy}
          onClick={runBackup}
        />
      </div>
    </Group>
  );
}

export function DevicePane(props: {
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { desktop } = useEnvironment();
  const standalone = isStandalone();
  const hint = installHint();
  return (
    <>
      <SettingsCard divided>
        <SettingRow
          cardRow
          settingKey="device.interfaceSize"
          deviceName={props.deviceName}
          persisted={props.persisted}
        />
      </SettingsCard>
      <FromYourSystem />
      {desktop === null ? (
        <>
          <StoredHere standalone={standalone} hint={hint} />
          <InstallGroup standalone={standalone} hint={hint} />
          <About desktop={null} />
        </>
      ) : (
        <DesktopGroups host={desktop} />
      )}
    </>
  );
}
