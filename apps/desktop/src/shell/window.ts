// The main window: hidden until the page has drawn, placed where it was left, and closed once the page agrees.
import { DEFAULT_FRAME, frameToRestore } from "../frames.ts";
import type { Frame } from "../frames.ts";
import type { WindowRecord } from "../window-state.ts";
import { BrowserWindow } from "./sdk.ts";

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

export interface MainWindow {
  /** Shows the window and stops the wait for the first frame; once. */
  show(): void;
  /** Shows it and brings it to the front. */
  focus(): void;
  /** The page's answer to `close_requested`: true closes the window, false keeps it and stops waiting. */
  answerClose(close: boolean): void;
}

export interface MainWindowOptions {
  url: string;
  platform: NodeJS.Platform;
  /** What the window was when it was last moved or resized; null for a first launch. */
  saved: WindowRecord | null;
  onPlaced(
    patch: Pick<WindowRecord, "frame" | "maximised" | "fullScreen">,
  ): void;
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

/** Opens the hidden main window on `url`, shown at the latest `SHOW_AFTER_MS` later. */
export function openMainWindow(options: MainWindowOptions): MainWindow {
  const win = new BrowserWindow({
    title: "Manent",
    url: options.url,
    hidden: true,
    titleBarStyle: options.platform === "darwin" ? "hiddenInset" : "default",
    frame: { width: DEFAULT_FRAME.width, height: DEFAULT_FRAME.height },
    renderer: "cef",
  });
  if (options.saved !== null) place(win, options.saved);
  let shown = false;
  const show = (): void => {
    if (shown) return;
    shown = true;
    clearTimeout(showing);
    win.show();
    options.onShown();
  };
  const showing = setTimeout(show, SHOW_AFTER_MS);
  const placed = (): void =>
    options.onPlaced({
      frame: win.getFrame(),
      maximised: win.isMaximized(),
      fullScreen: win.isFullScreen(),
    });
  win.on("move", placed);
  win.on("resize", placed);
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
    answerClose(answer) {
      if (answer) return close();
      if (waiting !== null) clearTimeout(waiting);
      waiting = null;
    },
  };
}
