// About: the version, the layout engine, no usage data and the AI pledge.
import { ENGINE_VERSION } from "@manent/pagination";
import type { UpdateState } from "@manent/sync-protocol";
import {
  BusyButton,
  Button,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DesktopDevice } from "./desktop-device.tsx";
import { Fact, Group } from "./device-group.tsx";

// the build's define; absent outside a build
declare const MANENT_VERSION: string | undefined;
// every manifest in the repository starts at this version
const UNVERSIONED = "0.0.0";

const WEB_UPDATE_LINES: Readonly<Record<UpdateState, string | null>> =
  Object.freeze({
    checking: null,
    up_to_date: PREFERENCES_WORDS.upToDate,
    ready: PREFERENCES_WORDS.webUpdateReady,
    check_failed: PREFERENCES_WORDS.updateCheckFailed,
  });

/** Checks the registered service worker for an update on the web, returning the resulting update state. */
async function checkWebUpdate(): Promise<UpdateState> {
  if (
    !("serviceWorker" in navigator) ||
    typeof navigator.serviceWorker?.getRegistration !== "function"
  )
    return "up_to_date";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "up_to_date";
    if (registration.waiting) return "ready";
    await registration.update();
    if (registration.waiting) return "ready";
    const installing = registration.installing;
    if (installing) {
      return await new Promise<UpdateState>((resolve) => {
        const onStateChange = (): void => {
          if (installing.state === "installed") {
            installing.removeEventListener("statechange", onStateChange);
            resolve(
              navigator.serviceWorker.controller ? "ready" : "up_to_date",
            );
          } else if (installing.state === "redundant") {
            installing.removeEventListener("statechange", onStateChange);
            resolve("check_failed");
          }
        };
        installing.addEventListener("statechange", onStateChange);
      });
    }
    return "up_to_date";
  } catch {
    return "check_failed";
  }
}

/** The web build's version and Check for updates, with a calm Reload to update action once ready. */
function WebVersion(props: { versionLine: string }): ReactNode {
  const { dom, updateState, webUpdate } = useEnvironment();
  const { commands } = useServices();
  const update = useSubscribable(updateState);
  const line = update === null ? null : WEB_UPDATE_LINES[update];
  const said = useRef(line);
  useEffect(() => {
    if (line !== null && line !== said.current) dom.announce(line);
    said.current = line;
  }, [line, dom]);
  const checkForUpdates = useCallback(() => {
    if (webUpdate !== undefined) {
      void webUpdate.check();
      return;
    }
    updateState.set("checking");
    void checkWebUpdate().then((result) => updateState.set(result));
  }, [updateState, webUpdate]);
  const reload = useCallback(() => {
    void commands.run("app.reloadToUpdate", "control");
  }, [commands]);
  return (
    <>
      <p className="text-ui">{props.versionLine}</p>
      <div>
        <BusyButton
          variant="outline"
          size="sm"
          label={PREFERENCES_WORDS.checkForUpdates}
          busyLabel={
            update === "checking" ? PREFERENCES_WORDS.checkingForUpdates : null
          }
          onClick={checkForUpdates}
        />
      </div>
      {line === null ? null : <p className="text-ui">{line}</p>}
      {update === "ready" ? (
        <div>
          <Button variant="outline" size="sm" onClick={reload}>
            {PREFERENCES_WORDS.reloadToUpdate}
          </Button>
        </div>
      ) : null}
    </>
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
          variant="outline"
          size="sm"
          label={PREFERENCES_WORDS.checkForUpdates}
          busyLabel={
            rows.update.busy ? PREFERENCES_WORDS.checkingForUpdates : null
          }
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
export function About(props: { desktop: DesktopDevice | null }): ReactNode {
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const pledgeId = useId();
  const version =
    typeof MANENT_VERSION === "undefined" ? UNVERSIONED : MANENT_VERSION;
  const versionLine =
    version === UNVERSIONED
      ? PREFERENCES_WORDS.unversioned
      : PREFERENCES_WORDS.version(version);
  return (
    <Group heading={PREFERENCES_WORDS.about}>
      {props.desktop === null ? (
        <WebVersion versionLine={versionLine} />
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
