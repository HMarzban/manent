// The main window: hidden until the page has drawn, placed where it was left, and closed once the page agrees.
import { MIN_FRAME, frameToRestore, initialFrame } from "../frames.ts";
import type { Frame } from "../frames.ts";
import { mainWindowChrome } from "../window-chrome.ts";
import type { WindowRecord } from "../window-state.ts";
import { BrowserWindow, Screen } from "./sdk.ts";

/** The window is shown after the page's first frame, or after this. */
const SHOW_AFTER_MS = 2_000;
/** The window closes anyway when the page has not answered `close_requested` by then. */
const CLOSE_ANSWER_MS = 2_000;

/** The SDK types each event's argument as unknown; an event that can be held has a `response` to set. */
function isHoldable(event: unknown): event is { response: { allow: boolean } } {
  return typeof event === "object" && event !== null && "response" in event;
}

/** Refuses what `event` asks (a close, a quit), synchronously, as the SDK requires. */
export function hold(event: unknown): void {
  if (isHoldable(event)) event.response = { allow: false };
}

export interface WindowChromeState {
  readonly maximised: boolean;
  readonly fullScreen: boolean;
  readonly focused: boolean;
}

export interface MainWindow {
  /** Shows the window and stops the wait for the first frame; once. */
  show(): void;
  /** Shows it and brings it to the front. */
  focus(): void;
  /** Navigates the main window's webview to `url`. */
  navigate(url: string): void;
  /** Keeps the native OS window title in sync with the active page or script. */
  setTitle(title: string): void;
  /** The page's answer to `close_requested`: true closes the window, false keeps it and stops waiting. */
  answerClose(close: boolean): void;
  /** Minimises the window to the taskbar or Dock. */
  minimize(): void;
  /** Toggles between maximised and restored frame state. */
  toggleMaximize(): void;
  /** Asks the window to close through the same `will-close` close guard as the OS button. */
  requestClose(): void;
  /** Current window chrome state for the custom desktop title bar. */
  state(): WindowChromeState;
}

export interface MainWindowOptions {
  url: string;
  platform: NodeJS.Platform;
  /** What the window was when it was last moved or resized; null for a first launch. */
  saved: WindowRecord | null;
  onPlaced(
    patch: Pick<WindowRecord, "frame" | "maximised" | "fullScreen">,
  ): void;
  /** Fires whenever maximised, fullScreen or focus state changes. */
  onStateChange?(state: WindowChromeState): void;
  /** The window wants to close and is held until `answerClose`, or `CLOSE_ANSWER_MS`. */
  onCloseRequested(): void;
  /** The window has been shown, once. */
  onShown(): void;
}

const setFrame = (win: BrowserWindow, frame: Frame): void =>
  win.setFrame(frame.x, frame.y, frame.width, frame.height);

/** Moves the window to its saved frame when the system leaves it there; otherwise it stays centred. */
function place(win: BrowserWindow, saved: WindowRecord): void {
  const centred = win.getFrame();
  const kept = frameToRestore(saved.frame, (frame) => {
    setFrame(win, frame);
    return win.getFrame();
  });
  if (kept === null && saved.frame !== null) setFrame(win, centred);
  if (saved.maximised) win.maximize();
  if (saved.fullScreen) win.setFullScreen(true);
}

/** Primary display's usable work area (excluding menu bar, Dock and taskbar), or null when unavailable. */
export function primaryWorkArea(): Pick<Frame, "width" | "height"> | null {
  try {
    const area = Screen.getPrimaryDisplay().workArea;
    return area.width > 0 && area.height > 0
      ? { width: area.width, height: area.height }
      : null;
  } catch {
    return null;
  }
}

/** Opens the hidden main window on `url`, shown at the latest `SHOW_AFTER_MS` later. */
export function openMainWindow(options: MainWindowOptions): MainWindow {
  const chrome = mainWindowChrome(options.platform);
  const frame = initialFrame(primaryWorkArea());
  const win = new BrowserWindow({
    title: "Manent",
    url: options.url,
    hidden: true,
    titleBarStyle: chrome.titleBarStyle,
    ...(chrome.trafficLightOffset === undefined
      ? {}
      : { trafficLightOffset: { ...chrome.trafficLightOffset } }),
    frame,
    renderer: "cef",
  });
  if (options.saved !== null) place(win, options.saved);
  let focused = true;
  const readState = (): WindowChromeState => ({
    maximised: win.isMaximized(),
    fullScreen: win.isFullScreen(),
    focused,
  });
  const notifyState = (): void => {
    options.onStateChange?.(readState());
  };
  let shown = false;
  const show = (): void => {
    if (shown) return;
    shown = true;
    clearTimeout(showing);
    win.show();
    notifyState();
    options.onShown();
  };
  const showing = setTimeout(show, SHOW_AFTER_MS);
  const placed = (): void => {
    options.onPlaced({
      frame: win.getFrame(),
      maximised: win.isMaximized(),
      fullScreen: win.isFullScreen(),
    });
    notifyState();
  };
  let clamping = false;
  const onResize = (): void => {
    if (clamping) return;
    if (!win.isMinimized() && !win.isFullScreen()) {
      const current = win.getFrame();
      if (
        current.width < MIN_FRAME.width ||
        current.height < MIN_FRAME.height
      ) {
        clamping = true;
        try {
          setFrame(win, {
            x: current.x,
            y: current.y,
            width: Math.max(current.width, MIN_FRAME.width),
            height: Math.max(current.height, MIN_FRAME.height),
          });
        } finally {
          clamping = false;
        }
      }
    }
    placed();
  };
  win.on("move", placed);
  win.on("resize", onResize);
  win.on("focus", () => {
    focused = true;
    notifyState();
  });
  win.on("blur", () => {
    focused = false;
    notifyState();
  });
  let closing = false;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  const close = (): void => {
    if (waiting !== null) clearTimeout(waiting);
    waiting = null;
    closing = true;
    win.close();
  };
  win.on("will-close", (event) => {
    if (closing) return;
    hold(event);
    if (waiting !== null) return;
    waiting = setTimeout(close, CLOSE_ANSWER_MS);
    options.onCloseRequested();
  });
  return {
    show,
    focus() {
      show();
      win.activate();
    },
    navigate(url) {
      win.webview.loadURL(url);
    },
    setTitle(title) {
      win.setTitle(title);
    },
    answerClose(answer) {
      if (answer) return close();
      if (waiting !== null) clearTimeout(waiting);
      waiting = null;
    },
    minimize() {
      win.minimize();
    },
    toggleMaximize() {
      if (win.isFullScreen()) {
        win.setFullScreen(false);
      } else if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      notifyState();
    },
    requestClose() {
      win.requestClose();
    },
    state: readState,
  };
}
