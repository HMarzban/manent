// Custom Manent desktop window titlebar: keeps macOS traffic lights (left) and Windows caption
// buttons (right) clear of every screen, Demo Stage bar and title bar, with full drag support.
import type { UpdateState, WindowAction } from "@manent/sync-protocol";
import {
  BRAND_WORDS,
  DESKTOP_WORDS,
  ManentMark,
  useSubscribable,
} from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useCleanWorkspace } from "../demo/demo-mode.ts";
import { useEnvironment } from "../services/context.tsx";
import { useDesktopCloudOnline } from "./desktop-offline.ts";
import type { DesktopHost } from "./host.ts";
import { WindowsAppMenu } from "./windows-app-menu.tsx";
import { WindowsCaptionControls } from "./windows-caption-controls.tsx";

interface WindowChromeState {
  readonly maximised: boolean;
  readonly fullScreen: boolean;
  readonly focused: boolean;
}

const INITIAL_STATE: WindowChromeState = Object.freeze({
  maximised: false,
  fullScreen: false,
  focused: true,
});

const BRAND_SUFFIX = /\s+[—–·-]\s+Manent(?:\s+demo)?$/;
const WINDOW_TITLE_LIMIT = 200;

/** Strips the trailing brand suffix from `document.title` so the title bar never repeats "Manent". */
export function formatWindowContext(rawTitle: string): string | null {
  const cleaned = rawTitle.trim().replace(BRAND_SUFFIX, "").trim();
  if (
    cleaned === "" ||
    cleaned === BRAND_WORDS.name ||
    cleaned === `${BRAND_WORDS.name} demo`
  )
    return null;
  return cleaned;
}

/** Tracks `document.title` changes without coupling to route or editor stores. */
function useDocumentTitleText(): string {
  const [title, setTitle] = useState(() =>
    typeof document === "undefined" ? "" : document.title,
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = (): void => setTitle(document.title);
    sync();
    const titleEl = document.querySelector("title");
    const target = titleEl ?? document.head;
    if (target === null) return;
    const observer = new MutationObserver(sync);
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);
  return title;
}

/** Subscribes to the desktop shell's `window_state` messages for maximise, fullscreen and focus. */
function useWindowChromeState(desktop: DesktopHost | null): WindowChromeState {
  const [state, setState] = useState<WindowChromeState>(INITIAL_STATE);
  useEffect(() => {
    if (desktop === null) return;
    return desktop.onMessage((message) => {
      if (message.t !== "window_state") return;
      setState({
        maximised: message.maximised,
        fullScreen: message.fullScreen,
        focused: message.focused,
      });
    });
  }, [desktop]);
  return state;
}

function TitlebarStatusCluster(props: {
  readonly cloudOnline: boolean;
  readonly updateState: UpdateState | null;
  readonly onRestartToUpdate: () => void;
}): ReactNode {
  const { cloudOnline, updateState, onRestartToUpdate } = props;
  const showUpdate = updateState === "ready";
  if (cloudOnline && !showUpdate) return null;
  return (
    <div
      data-slot="windowbar-status"
      className="mn-windowbar-no-drag flex shrink-0 items-center gap-1.5"
    >
      {cloudOnline ? null : (
        <span
          role="status"
          className="mn-windowbar-pill"
          data-tone="offline"
          title={DESKTOP_WORDS.offlineBadge}
        >
          <span className="mn-windowbar-pill-dot" aria-hidden="true" />
          <span className="hidden sm:inline">{DESKTOP_WORDS.offlineBadge}</span>
          <span className="sm:hidden">{DESKTOP_WORDS.offlineShort}</span>
        </span>
      )}
      {showUpdate ? (
        <button
          type="button"
          className="mn-windowbar-pill"
          data-tone="update"
          onClick={onRestartToUpdate}
        >
          {DESKTOP_WORDS.restartToUpdate}
        </button>
      ) : null}
    </div>
  );
}

const PRESENT_PATH = /^\/s\/([^/]+)\/(present|prompter)$/;

/** Window key for secondary Room/Prompter/About routes; undefined for the main desktop window. */
export function windowKeyForPath(pathname: string): string | undefined {
  if (pathname === "/about") return "about";
  const match = PRESENT_PATH.exec(pathname);
  if (match === null) return undefined;
  const [, rawDocId = "", kind] = match;
  try {
    const docId = decodeURIComponent(rawDocId);
    return `${kind === "present" ? "room" : "prompter"}:${docId}`;
  } catch {
    return undefined;
  }
}

/** Custom Manent desktop window bar for macOS and Windows (main and secondary Present windows). */
export function DesktopTitleBar(props: {
  readonly bare?: boolean;
  readonly pathname?: string;
}): ReactNode {
  const { desktop, updateState: updateSource } = useEnvironment();
  const active = desktop !== null && desktop.platform !== "linux";
  const pathname =
    props.pathname ??
    (typeof window === "undefined" ? "/" : window.location.pathname);
  const windowKey = windowKeyForPath(pathname);
  const state = useWindowChromeState(active ? desktop : null);
  const rawTitle = useDocumentTitleText();
  const cleanWorkspace = useCleanWorkspace();
  const rawCloudOnline = useDesktopCloudOnline(active ? desktop : null);
  const cloudOnline = cleanWorkspace || rawCloudOnline;
  const updateState = useSubscribable(updateSource);
  const lastTitleRef = useRef<{ desktop: DesktopHost; title: string } | null>(
    null,
  );

  useEffect(() => {
    if (!active || desktop === null) {
      lastTitleRef.current = null;
      return;
    }
    const trimmed = rawTitle.trim();
    const title = (trimmed === "" ? BRAND_WORDS.name : trimmed).slice(
      0,
      WINDOW_TITLE_LIMIT,
    );
    if (
      lastTitleRef.current?.desktop === desktop &&
      lastTitleRef.current.title === title
    )
      return;
    lastTitleRef.current = { desktop, title };
    desktop.send(
      windowKey === undefined
        ? { v: 1, t: "window_title", title }
        : { v: 1, t: "window_title", title, windowKey },
    );
  }, [active, desktop, rawTitle, windowKey]);

  if (!active || desktop === null) return null;

  const isAbout = windowKey === "about";
  const context = formatWindowContext(rawTitle);
  const sendAction = (action: WindowAction): void => {
    desktop.send(
      windowKey === undefined
        ? { v: 1, t: "window_action", action }
        : { v: 1, t: "window_action", action, windowKey },
    );
  };
  const restartToUpdate = (): void => {
    desktop.send({ v: 1, t: "restart_to_update" });
  };
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (isAbout) return;
    if (
      event.target instanceof Element &&
      event.target.closest(".mn-windowbar-no-drag") !== null
    )
      return;
    sendAction("toggle_maximize");
  };

  if (isAbout) {
    return (
      <div
        data-surface="desktop-titlebar"
        data-platform={desktop.platform}
        data-focused={state.focused ? "true" : "false"}
        aria-label={DESKTOP_WORDS.windowTitlebar}
        className="mn-windowbar relative flex h-windowbar min-h-windowbar w-full shrink-0 items-center justify-end border-b-0! bg-transparent! print:hidden"
      >
        {desktop.platform === "windows" ? (
          <WindowsCaptionControls
            maximised={false}
            closeOnly
            onAction={sendAction}
          />
        ) : null}
      </div>
    );
  }

  const statusCluster = (
    <TitlebarStatusCluster
      cloudOnline={cloudOnline}
      updateState={updateState}
      onRestartToUpdate={restartToUpdate}
    />
  );

  if (desktop.platform === "mac") {
    const sideClass = state.fullScreen ? "w-3 shrink-0" : "w-20 shrink-0";
    return (
      <div
        data-surface="desktop-titlebar"
        data-platform="mac"
        data-focused={state.focused ? "true" : "false"}
        data-fullscreen={state.fullScreen ? "true" : "false"}
        aria-label={DESKTOP_WORDS.windowTitlebar}
        onDoubleClick={onDoubleClick}
        className="mn-windowbar relative grid h-windowbar min-h-windowbar w-full shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center print:hidden"
      >
        <div className="flex items-center">
          <div
            aria-hidden="true"
            data-slot="mac-traffic-lights"
            className={sideClass}
          />
        </div>
        <div className="mn-windowbar-title flex min-w-0 items-center justify-center gap-1.5 px-2 text-meta">
          <ManentMark className="size-3.5 shrink-0" decorative />
          <span className="shrink-0 font-semibold tracking-tight">
            {BRAND_WORDS.name}
          </span>
          {context === null ? null : (
            <>
              <span aria-hidden="true" className="text-fg-muted">
                ·
              </span>
              <span className="truncate text-fg-muted">{context}</span>
            </>
          )}
        </div>
        <div className="flex items-center justify-end pe-2.5">
          {cloudOnline && updateState !== "ready" ? (
            <div aria-hidden="true" className={sideClass} />
          ) : (
            statusCluster
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-surface="desktop-titlebar"
      data-platform="windows"
      data-focused={state.focused ? "true" : "false"}
      data-maximised={state.maximised ? "true" : "false"}
      aria-label={DESKTOP_WORDS.windowTitlebar}
      onDoubleClick={onDoubleClick}
      className="mn-windowbar relative flex h-windowbar min-h-windowbar w-full shrink-0 items-center print:hidden"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 ps-2 pe-2">
        {props.bare === true ? null : <WindowsAppMenu />}
        <div className="mn-windowbar-title flex min-w-0 flex-1 items-center gap-2 text-meta">
          <ManentMark className="size-4 shrink-0" decorative />
          <span className="shrink-0 font-semibold tracking-tight">
            {BRAND_WORDS.name}
          </span>
          {context === null ? null : (
            <>
              <span aria-hidden="true" className="text-fg-muted">
                ·
              </span>
              <span className="truncate text-fg-muted">{context}</span>
            </>
          )}
        </div>
      </div>
      {cloudOnline && updateState !== "ready" ? null : (
        <div className="pe-2">{statusCluster}</div>
      )}
      <WindowsCaptionControls
        maximised={state.maximised}
        onAction={sendAction}
      />
    </div>
  );
}
