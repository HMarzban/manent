// What This device shows in the desktop app: what the node stores and where, the version and channel, and the update check.
import type { UpdateState } from "@manent/sync-protocol";
import { DESKTOP_WORDS, PREFERENCES_WORDS } from "@manent/ui";
import type { DesktopHost } from "./host.ts";

export interface DesktopDeviceRows {
  /** Null until the node answers. */
  stored: { scripts: string; folder: string } | null;
  version: string;
  channel: string;
  update: { busy: boolean; line: string | null };
}

// the line under Check for updates after each answer; none while the check runs
const UPDATE_LINES: Readonly<Record<UpdateState, string | null>> =
  Object.freeze({
    checking: null,
    up_to_date: PREFERENCES_WORDS.upToDate,
    ready: PREFERENCES_WORDS.updateReady,
    check_failed: PREFERENCES_WORDS.updateCheckFailed,
  });

/** `update` is the shell's last answer to Check for updates in this window; null before the first. */
export function desktopDeviceRows(input: {
  host: Pick<DesktopHost, "version" | "channel" | "dataDir">;
  usage: { scripts: number; bytes: number } | null;
  update: UpdateState | null;
}): DesktopDeviceRows {
  const { host, usage, update } = input;
  return {
    stored:
      usage === null
        ? null
        : {
            scripts: PREFERENCES_WORDS.scriptsStored(
              usage.scripts,
              DESKTOP_WORDS.storedSize(usage.bytes),
            ),
            folder: host.dataDir,
          },
    version: PREFERENCES_WORDS.version(host.version),
    channel:
      host.channel === "stable"
        ? PREFERENCES_WORDS.channelStable
        : PREFERENCES_WORDS.channelCanary,
    update: {
      busy: update === "checking",
      line: update === null ? null : UPDATE_LINES[update],
    },
  };
}
