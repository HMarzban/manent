// About: the version, the layout engine, no usage data and the AI pledge.
import { ENGINE_VERSION } from "@manent/pagination";
import {
  APPEARANCE_STUDIO_WORDS,
  BusyButton,
  Button,
  DESKTOP_WORDS,
  HiddenGemIcon,
  PREFERENCES_WORDS,
  STUDIO_PALETTES,
} from "@manent/ui";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { DesktopDevice } from "./desktop-device.tsx";
import { Fact, Group } from "./device-group.tsx";

// the build's define; absent outside a build
declare const MANENT_VERSION: string | undefined;
// every manifest in the repository starts at this version
const UNVERSIONED = "0.0.0";

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
  const [creditsOpen, setCreditsOpen] = useState(false);
  const pledgeId = useId();
  const creditsId = useId();
  const version =
    typeof MANENT_VERSION === "undefined" ? UNVERSIONED : MANENT_VERSION;
  const versionLine =
    version === UNVERSIONED
      ? PREFERENCES_WORDS.unversioned
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
      <p className="text-meta text-fg-muted">
        {APPEARANCE_STUDIO_WORDS.paginationGuarantee}
      </p>
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
      <div className="flex flex-col gap-1">
        <p className="text-ui">{APPEARANCE_STUDIO_WORDS.iconCreditsLead}</p>
        <div>
          <Button
            variant="link"
            className="h-auto p-0"
            aria-expanded={creditsOpen}
            aria-controls={creditsId}
            onClick={() => setCreditsOpen((open) => !open)}
          >
            {APPEARANCE_STUDIO_WORDS.iconCreditsToggle}
          </Button>
        </div>
        <div id={creditsId}>
          {creditsOpen ? (
            <ul className="mt-1 divide-y divide-line rounded-surface border border-line bg-raised">
              {STUDIO_PALETTES.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-meta"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <HiddenGemIcon
                      palette={entry.id}
                      className="size-icon shrink-0 text-fg-accent"
                    />
                    <span className="truncate font-medium text-fg">
                      {entry.name}
                    </span>
                    <span className="truncate text-fg-muted">
                      {entry.iconName}
                    </span>
                  </span>
                  <span className="shrink-0 text-fg-muted">
                    {entry.iconAuthor}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Group>
  );
}
