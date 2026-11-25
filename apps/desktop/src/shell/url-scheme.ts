// macOS `open-url` deep-link handler for `manent://s/...` links.
import {
  mainWindowUrl,
  parseManentUrl,
  scriptWindowUrl,
} from "../url-scheme.ts";
import { Electrobun } from "./sdk.ts";
import type { MainWindow } from "./window.ts";

export interface UrlSchemeHandler {
  /** Builds the main window's initial URL, consuming any cold-launch script path received before `openApp`. */
  initialUrl(nodeUrl: string, launchToken: string): string;
  /** Binds the running main window so subsequent `open-url` events navigate and focus it. */
  attach(nodeUrl: string, window: MainWindow): void;
}

function urlFromEvent(event: unknown): string | null {
  if (typeof event !== "object" || event === null || !("data" in event))
    return null;
  const { data } = event;
  if (typeof data !== "object" || data === null || !("url" in data))
    return null;
  return typeof data.url === "string" ? data.url : null;
}

/**
 * Registers macOS `open-url` handling on `Electrobun.events`; no-op on Windows and Linux.
 * Must be called before `openApp` so cold-launch links are captured for the first window URL.
 */
export function createUrlSchemeHandler(
  platform: NodeJS.Platform,
): UrlSchemeHandler {
  if (platform !== "darwin") {
    return {
      initialUrl: (nodeUrl, launchToken) =>
        mainWindowUrl(nodeUrl, launchToken, null),
      attach: () => {},
    };
  }

  let pendingPath: string | null = null;
  let attached: { nodeUrl: string; window: MainWindow } | null = null;

  Electrobun.events.on("open-url", (event: unknown) => {
    const raw = urlFromEvent(event);
    const path = raw === null ? null : parseManentUrl(raw);
    if (attached === null) {
      if (path !== null) pendingPath = path;
      return;
    }
    if (path !== null) {
      attached.window.navigate(scriptWindowUrl(attached.nodeUrl, path));
    }
    attached.window.focus();
  });

  return {
    initialUrl(nodeUrl, launchToken) {
      const next = pendingPath;
      pendingPath = null;
      return mainWindowUrl(nodeUrl, launchToken, next);
    },
    attach(nodeUrl, window) {
      attached = { nodeUrl, window };
      if (pendingPath !== null) {
        const next = pendingPath;
        pendingPath = null;
        window.navigate(scriptWindowUrl(nodeUrl, next));
        window.focus();
      }
    },
  };
}
