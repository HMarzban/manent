// About: the version, the layout engine, no usage data and the AI pledge.
import { ENGINE_VERSION } from "@manent/pagination";
import {
  BusyButton,
  Button,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
} from "@manent/ui";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { DesktopDevice } from "./desktop-device.tsx";
import { Fact, Group } from "./device-group.tsx";

// the build's define; absent outside a build
declare const MANENT_VERSION: string | undefined;
// every manifest in the repository starts at this version
const UNVERSIONED = "0.0.0";
const PREVIEW_VERSION = "Manent — preview";

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
      ? PREVIEW_VERSION
      : PREFERENCES_WORDS.version(version);
  return (
    <Group heading={PREFERENCES_WORDS.about}>
      {props.desktop === null ? (
        <p className="text-ui">{versionLine}</p>
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
