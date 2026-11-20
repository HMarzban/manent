// Preferences → This device (This browser on the web): Interface size, what comes from the system, what is stored here, and About.
import { ENGINE_VERSION } from "@manent/pagination";
import { Button, PREFERENCES_WORDS, SettingRow } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";

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

function About(): ReactNode {
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const pledgeId = useId();
  const version =
    typeof MANENT_VERSION === "undefined" ? UNVERSIONED : MANENT_VERSION;
  return (
    <Group heading={PREFERENCES_WORDS.about}>
      <p className="text-ui">{PREFERENCES_WORDS.version(version)}</p>
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

export function DevicePane(props: {
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { where } = useEnvironment();
  return (
    <>
      <SettingRow
        settingKey="device.interfaceSize"
        deviceName={props.deviceName}
        persisted={props.persisted}
      />
      <FromYourSystem />
      {where.shell === "web" ? <StoredHere /> : null}
      <About />
    </>
  );
}
