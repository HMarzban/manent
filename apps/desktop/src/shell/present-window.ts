// Secondary Present windows: one BrowserWindow per (role, docId), placed from and saved to that role's record,
// never holding close, and signing in through the local node's launch and person query parameters.
import { DEFAULT_FRAME, frameToRestore } from "../frames.ts";
import type { Frame } from "../frames.ts";
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
  frame: { width: number; height: number };
  renderer: "cef";
}

export interface PresentBrowserWindow {
  show(): void;
  activate(): void;
  close(): void;
  getFrame(): Frame;
  setFrame(x: number, y: number, width: number, height: number): void;
  maximize(): void;
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
  closeAll(): void;
}

export interface PresentWindowsOptions {
  nodeUrl: string;
  launchToken: string;
  statePath: string;
  platform: NodeJS.Platform;
  windowState: ReturnType<typeof createWindowStateWriter>;
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
  const { nodeUrl, launchToken, statePath, platform, windowState, openWindow } =
    options;
  const opened = new Map<string, PresentBrowserWindow>();
  const titleBarStyle = platform === "darwin" ? "hiddenInset" : "default";

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
        titleBarStyle,
        frame: { width: DEFAULT_FRAME.width, height: DEFAULT_FRAME.height },
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
        if (opened.get(key) === win) opened.delete(key);
      });
      opened.set(key, win);
    },
    closeAll() {
      const windows = [...opened.values()];
      opened.clear();
      for (const win of windows) win.close();
    },
  };
}
