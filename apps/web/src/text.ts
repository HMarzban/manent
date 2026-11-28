// Every sentence the web app shows, in one place.

import { BRAND_WORDS, DEMO_WORDS } from "@manent/ui";
import type { ControlState } from "./api.ts";
import { isCleanWorkspace } from "./demo/demo-mode.ts";

export const TEXT = {
  appName: "Manent demo",
  chooseTitle: "Choose who you are",
  chooseHint:
    "Pick anyone. You can switch at any time, and each browser tab can be a different person.",
  chooseUnreachable: "Can't reach Manent. Start the server, then choose again.",
  chosen: "Chosen",
  back: "‹ Library",
  person: "Person",
  libraryTitle: "Library",
  stopServer: "Stop the server",
  startServer: "Start the server",
  serverRunning: "Server running",
  serverStopped: "Server stopped. Start it before reloading this tab.",
  serverStarting: "Starting the server…",
  serverFailed: "Couldn't start the server. See the terminal.",
  demoUnreachable: "The demo is not running. Run make demo again.",
  screenProblem: "Couldn't load this screen. Your work is unaffected.",
  reload: "Reload",
  notFoundTitle: "This page isn't here",
  notFoundBody: "Check the address, or go back to the Library.",
  backToLibrary: "Back to Library",
} as const satisfies Readonly<Record<string, string>>;

const STATUS_TEXT: Record<ControlState, string> = {
  running: TEXT.serverRunning,
  stopped: TEXT.serverStopped,
  starting: TEXT.serverStarting,
  failed: TEXT.serverFailed,
  unreachable: TEXT.demoUnreachable,
  resetting: DEMO_WORDS.resetting,
};

export function serverStatusText(state: ControlState): string {
  return STATUS_TEXT[state];
}

const CHOOSE_HINT_DESKTOP =
  "Pick anyone. You can switch at any time, and your work stays saved on this device.";

/** The chooser's subtitle for the desktop app or the browser. */
export function chooseHintFor(desktop: boolean): string {
  return desktop ? CHOOSE_HINT_DESKTOP : TEXT.chooseHint;
}

/** The tab title: the screen, the person when there is one, and the app. */
export function pageTitle(screen: string, personName: string | null): string {
  const appName = isCleanWorkspace() ? BRAND_WORDS.name : TEXT.appName;
  return [screen, personName, appName]
    .filter((part) => part !== null)
    .join(" — ");
}
