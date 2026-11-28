// macOS `open-url` deep-link and file-open handler for `manent://s/...` and `file://...` URLs.
import type { ShellMessage } from "@manent/sync-protocol";
import { mainWindowUrl, parseOpenUrl, scriptWindowUrl } from "../url-scheme.ts";
import { readOpenedPaths } from "./dialogs.ts";
import type { OpenedFilesResult } from "./dialogs.ts";

export interface UrlSchemeWindow {
  focus(): void;
  navigate(url: string): void;
}

export interface OpenUrlEvents {
  on(name: "open-url", handler: (event: unknown) => void): void;
}

export interface UrlSchemeHandler {
  /** Builds the main window's initial URL, consuming any cold-launch script path received before `openApp`. */
  initialUrl(nodeUrl: string, launchToken: string): string;
  /** Binds the running main window and shell channel so subsequent `open-url` events navigate or deliver files. */
  attach(
    nodeUrl: string,
    window: UrlSchemeWindow,
    send: (message: ShellMessage) => void,
  ): void;
  /** Marks the page ready (on `first_frame`) and delivers any queued `file://` opens. */
  markReady(): void;
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
 * Registers macOS `open-url` handling on `events`; no-op on Windows and Linux.
 * Must be called before `openApp` so cold-launch links and files are captured before the window opens.
 */
export function createUrlSchemeHandler(
  platform: NodeJS.Platform,
  events: OpenUrlEvents,
  readPaths: (
    paths: readonly string[],
  ) => Promise<OpenedFilesResult> = readOpenedPaths,
): UrlSchemeHandler {
  if (platform !== "darwin") {
    return {
      initialUrl: (nodeUrl, launchToken) =>
        mainWindowUrl(nodeUrl, launchToken, null),
      attach: () => {},
      markReady: () => {},
    };
  }

  let pendingPath: string | null = null;
  const pendingFiles: string[] = [];
  let attached: {
    nodeUrl: string;
    window: UrlSchemeWindow;
    send(message: ShellMessage): void;
  } | null = null;
  let ready = false;
  let flushing = false;
  let flushScheduled = false;

  const flushFiles = async (): Promise<void> => {
    const target = attached;
    if (flushing || !ready || target === null) return;
    flushing = true;
    try {
      while (pendingFiles.length > 0) {
        const batch = pendingFiles.splice(0, pendingFiles.length);
        const { files, refused } = await readPaths(batch);
        if (files.length > 0 || refused.length > 0) {
          target.send({ v: 1, t: "files_opened", files, refused });
        }
      }
    } finally {
      flushing = false;
    }
  };

  const scheduleFlush = (): void => {
    if (flushScheduled || !ready || attached === null) return;
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      void flushFiles();
    });
  };

  events.on("open-url", (event: unknown) => {
    const raw = urlFromEvent(event);
    const target = raw === null ? null : parseOpenUrl(raw);
    if (target?.kind === "file") {
      pendingFiles.push(target.path);
      if (attached !== null) attached.window.focus();
      scheduleFlush();
      return;
    }
    if (attached === null) {
      if (target?.kind === "script") pendingPath = target.path;
      return;
    }
    if (target?.kind === "script") {
      attached.window.navigate(scriptWindowUrl(attached.nodeUrl, target.path));
    }
    attached.window.focus();
  });

  return {
    initialUrl(nodeUrl, launchToken) {
      const next = pendingPath;
      pendingPath = null;
      return mainWindowUrl(nodeUrl, launchToken, next);
    },
    attach(nodeUrl, window, send) {
      attached = { nodeUrl, window, send };
      if (pendingPath !== null) {
        const next = pendingPath;
        pendingPath = null;
        window.navigate(scriptWindowUrl(nodeUrl, next));
        window.focus();
      }
      if (ready && pendingFiles.length > 0) scheduleFlush();
    },
    markReady() {
      ready = true;
      if (pendingFiles.length > 0) scheduleFlush();
    },
  };
}
