// Bespoke About Manent window: one compact, theme-matched BrowserWindow opened from Manent → About Manent.
import type { WindowAction } from "@manent/sync-protocol";
import type { Frame } from "../frames.ts";
import { presentWindowChrome } from "../window-chrome.ts";
import type {
  PresentBrowserWindow,
  PresentWindowInit,
} from "./present-window.ts";

export const ABOUT_WINDOW_KEY = "about";

export const ABOUT_FRAME = Object.freeze({ width: 360, height: 484 });

const MARGIN = 48;

export interface AboutWindowInit extends PresentWindowInit {
  styleMask?: {
    Closable?: boolean;
    Miniaturizable?: boolean;
    Resizable?: boolean;
  };
}

export interface AboutWindow {
  open(): void;
  handleAction(action: WindowAction): boolean;
  close(): void;
}

export interface AboutWindowOptions {
  nodeUrl: string;
  launchToken: string;
  platform: NodeJS.Platform;
  workArea?(): Pick<Frame, "width" | "height"> | null;
  openWindow(init: AboutWindowInit): PresentBrowserWindow;
}

/** Local-node address of the About screen, authorised by the shell's launch token. */
export function aboutWindowUrl(nodeUrl: string, launchToken: string): string {
  return `${nodeUrl}/about?launch=${encodeURIComponent(launchToken)}`;
}

/** Fits the compact About window comfortably inside `workArea` when known. */
export function aboutFrame(workArea?: Pick<Frame, "width" | "height"> | null): {
  width: number;
  height: number;
} {
  if (
    workArea === null ||
    workArea === undefined ||
    workArea.width <= 0 ||
    workArea.height <= 0
  )
    return { ...ABOUT_FRAME };
  return {
    width: Math.min(ABOUT_FRAME.width, Math.max(320, workArea.width - MARGIN)),
    height: Math.min(
      ABOUT_FRAME.height,
      Math.max(360, workArea.height - MARGIN),
    ),
  };
}

/** Manages the single About Manent window: focuses it if already open and closes it cleanly on quit. */
export function createAboutWindow(options: AboutWindowOptions): AboutWindow {
  const { nodeUrl, launchToken, platform, workArea, openWindow } = options;
  const chrome = presentWindowChrome(platform);
  let active: PresentBrowserWindow | null = null;

  return {
    open() {
      if (active !== null) {
        active.show();
        active.activate();
        return;
      }
      const win = openWindow({
        title: "About Manent",
        url: aboutWindowUrl(nodeUrl, launchToken),
        hidden: false,
        titleBarStyle: chrome.titleBarStyle,
        ...(chrome.trafficLightOffset === undefined
          ? {}
          : { trafficLightOffset: { ...chrome.trafficLightOffset } }),
        styleMask: {
          Closable: true,
          Miniaturizable: false,
          Resizable: false,
        },
        frame: aboutFrame(workArea?.() ?? null),
        renderer: "cef",
      });
      win.on("close", () => {
        if (active === win) active = null;
      });
      active = win;
    },
    handleAction(action) {
      if (active === null) return false;
      if (action === "minimize") active.minimize?.();
      else if (action === "close") active.close();
      return true;
    },
    close() {
      if (active === null) return;
      const win = active;
      active = null;
      win.close();
    },
  };
}
