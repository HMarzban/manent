// Secondary Present windows: one BrowserWindow per (role, docId), placed from and saved to that role's record,
// never holding close, and signing in through the local node's launch and person query parameters.
import type { WindowAction } from "@manent/sync-protocol";
import { frameToRestore, initialFrame } from "../frames.ts";
import type { Frame } from "../frames.ts";
import { presentWindowChrome } from "../window-chrome.ts";
import { readWindowState } from "../window-state.ts";
import type { WindowRecord, createWindowStateWriter } from "../window-state.ts";

export type PresentRole = "room" | "prompter";

export interface PresentWindowUrlOptions {
  nodeUrl: string;
  role: PresentRole;
  docId: string;
  launchToken: string;
  userId?: string;
}

export interface PresentWindowInit {
  title: string;
  url: string;
  hidden: boolean;
  titleBarStyle: "hiddenInset" | "default";
  trafficLightOffset?: { x: number; y: number };
  frame: { width: number; height: number };
  renderer: "cef";
}

export interface PresentBrowserWindow {
  show(): void;
  activate(): void;
  close(): void;
  minimize?(): void;
  setTitle?(title: string): void;
  getFrame(): Frame;
  setFrame(x: number, y: number, width: number, height: number): void;
  maximize(): void;
  unmaximize?(): void;
  isMaximized(): boolean;
  setFullScreen(fullScreen: boolean): void;
  isFullScreen(): boolean;
  on(name: string, handler: (event: unknown) => void): void;
}

export interface PresentWindowRequest {
  role: PresentRole;
  docId: string;
  userId?: string;
}

export interface PresentWindows {
  open(request: PresentWindowRequest): void;
  handleAction(windowKey: string, action: WindowAction): boolean;
  setTitle(windowKey: string, title: string): boolean;
  closeAll(): void;
}

export interface PresentWindowsOptions {
  nodeUrl: string;
  launchToken: string;
  statePath: string;
  platform: NodeJS.Platform;
  windowState: ReturnType<typeof createWindowStateWriter>;
  workArea?(): Pick<Frame, "width" | "height"> | null;
  openWindow(init: PresentWindowInit): PresentBrowserWindow;
}

/** Builds the local-node address for a Room or Prompter window, with launch token and optional person. */
export function presentWindowUrl(options: PresentWindowUrlOptions): string {
  const { nodeUrl, role, docId, launchToken, userId } = options;
  const route = role === "room" ? "present" : "prompter";
  const person = userId ? `&person=${encodeURIComponent(userId)}` : "";
  return `${nodeUrl}/s/${encodeURIComponent(docId)}/${route}?launch=${encodeURIComponent(launchToken)}${person}`;
}

const setFrame = (win: PresentBrowserWindow, frame: Frame): void =>
  win.setFrame(frame.x, frame.y, frame.width, frame.height);

/** Moves the window to its saved frame when the system leaves it there; otherwise it stays centred. */
function place(win: PresentBrowserWindow, saved: WindowRecord): void {
  const centred = win.getFrame();
  const kept = frameToRestore(saved.frame, (frame) => {
    setFrame(win, frame);
    return win.getFrame();
  });
  if (kept === null && saved.frame !== null) setFrame(win, centred);
  if (saved.maximised) win.maximize();
  if (saved.fullScreen) win.setFullScreen(true);
}

/** Manages open Room and Prompter windows, keyed by `${role}:${docId}`. */
export function createPresentWindows(
  options: PresentWindowsOptions,
): PresentWindows {
  const {
    nodeUrl,
    launchToken,
    statePath,
    platform,
    windowState,
    workArea,
    openWindow,
  } = options;
  const opened = new Map<string, PresentBrowserWindow>();
  const chrome = presentWindowChrome(platform);

  return {
    open({ role, docId, userId }) {
      const key = `${role}:${docId}`;
      const existing = opened.get(key);
      if (existing !== undefined) {
        existing.show();
        existing.activate();
        return;
      }
      const url = presentWindowUrl({
        nodeUrl,
        role,
        docId,
        launchToken,
        userId,
      });
      const win = openWindow({
        title: "Manent",
        url,
        hidden: false,
        titleBarStyle: chrome.titleBarStyle,
        ...(chrome.trafficLightOffset === undefined
          ? {}
          : { trafficLightOffset: { ...chrome.trafficLightOffset } }),
        frame: initialFrame(workArea?.() ?? null),
        renderer: "cef",
      });
      const saved = readWindowState(statePath).roles[role] ?? null;
      if (saved !== null) place(win, saved);
      const placed = (): void =>
        windowState.update(role, {
          frame: win.getFrame(),
          maximised: win.isMaximized(),
          fullScreen: win.isFullScreen(),
        });
      win.on("move", placed);
      win.on("resize", placed);
      win.on("close", () => {
        windowState.flush();
        if (opened.get(key) === win) opened.delete(key);
      });
      opened.set(key, win);
    },
    handleAction(windowKey, action) {
      const win = opened.get(windowKey);
      if (win === undefined) return false;
      if (action === "minimize") win.minimize?.();
      else if (action === "toggle_maximize") {
        if (win.isFullScreen()) win.setFullScreen(false);
        else if (win.isMaximized()) win.unmaximize?.();
        else win.maximize();
      } else {
        win.close();
      }
      return true;
    },
    setTitle(windowKey, title) {
      const win = opened.get(windowKey);
      if (win === undefined) return false;
      win.setTitle?.(title);
      return true;
    },
    closeAll() {
      const windows = [...opened.values()];
      opened.clear();
      for (const win of windows) win.close();
    },
  };
}
