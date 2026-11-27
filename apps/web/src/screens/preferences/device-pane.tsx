// Preferences → This device (This browser on the web): Interface size, what comes from the system, what is stored here, and About.
import { Button, PREFERENCES_WORDS, SettingRow, Skeleton } from "@manent/ui";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";
import { DesktopGroups } from "./desktop-device.tsx";
import { About } from "./device-about.tsx";
import { Fact, Group } from "./device-group.tsx";

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

/** Whether the browser has agreed to keep Manent's data, with the request that asks it to. */
function StoredHere(): ReactNode {
  const [kept, setKept] = useState<boolean | null>(() => {
    const manager = storageManager();
    return typeof manager?.persisted !== "function" ? false : null;
  });
  useEffect(() => {
    const manager = storageManager();
    if (typeof manager?.persisted !== "function") {
      setKept(false);
      return undefined;
    }
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
    </Group>
  );
}

export function DevicePane(props: {
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { desktop } = useEnvironment();
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
          <StoredHere />
          <About desktop={null} />
        </>
      ) : (
        <DesktopGroups host={desktop} />
      )}
    </>
  );
}
