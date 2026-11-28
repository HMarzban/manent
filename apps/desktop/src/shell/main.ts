// The desktop app's entry: one local node per data directory, its cloud, and the window, menus and dialogs
// that speak to the page over the node's shell channel.
import { homedir } from "node:os";
import { join } from "node:path";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import { appDataDir, askToFocus, createDesktopNode } from "@manent/local-node";
import type {
  DesktopNode,
  DesktopNodeStart,
  NodeCore,
} from "@manent/local-node";
import {
  createPacketRenderPdf,
  readScriptFonts,
  serveWithBun,
} from "@manent/server-core";
import type {
  Clock,
  Listener,
  ManentServer,
  RenderPdf,
} from "@manent/server-core";
import type {
  DesktopGlobal,
  NativeMenu,
  PageMessage,
  ShellMessage,
} from "@manent/sync-protocol";
import { readBuildFile } from "../build-file.ts";
import type { CloudProcess } from "../cloud.ts";
import { createWindowStateWriter, readWindowState } from "../window-state.ts";
import { SHELL_WORDS } from "../words.ts";
import { ABOUT_WINDOW_KEY, createAboutWindow } from "./about-window.ts";
import type { AboutWindow } from "./about-window.ts";
import { alertNewerStore, chooseDirectory, chooseFiles } from "./dialogs.ts";
import { freePort, onServeError, startCloud } from "./local-server.ts";
import { createNativeMenu } from "./menus.ts";
import { createPresentWindows } from "./present-window.ts";
import type { PresentWindows } from "./present-window.ts";
import { BrowserWindow, Electrobun, PATHS, Updater, Utils } from "./sdk.ts";
import { createRunningUpdates, updateAtLaunch } from "./updater.ts";
import type { RunningUpdates } from "./updater.ts";
import { createUrlSchemeHandler } from "./url-scheme.ts";
import type { UrlSchemeHandler } from "./url-scheme.ts";
import { hold, openMainWindow, primaryWorkArea } from "./window.ts";
import type { MainWindow } from "./window.ts";

/** Where the build packs the script font's faces, under the app's resources. */
const FONT_FILES = "cloud/node_modules/@fontsource/courier-prime/files";

/** After the last move or resize. */
const WINDOW_STATE_SAVE_MS = 500;

const clock: Clock = {
  now: Date.now,
  schedule(fn, delayMs) {
    const timer = setTimeout(fn, delayMs);
    return () => clearTimeout(timer);
  },
};

function platformOf(platform: NodeJS.Platform): DesktopGlobal["platform"] {
  if (platform === "darwin") return "mac";
  return platform === "win32" ? "windows" : "linux";
}

/** What the page's messages act on, once the node listens and the window exists. */
interface App {
  root: string;
  cloudUrl: string;
  window: MainWindow;
  presentWindows: PresentWindows;
  aboutWindow: AboutWindow;
  menu: { draw(menus: readonly NativeMenu[] | null): void } | null;
  windowState: ReturnType<typeof createWindowStateWriter>;
  firstFrame(): void;
  updates: RunningUpdates;
  urlScheme: UrlSchemeHandler;
  send(message: ShellMessage): void;
}

function answer(app: App, message: PageMessage): void {
  switch (message.t) {
    case "menus":
      app.menu?.draw(message.menus);
      return;
    case "first_frame":
      app.window.show();
      app.firstFrame();
      app.send({ v: 1, t: "window_state", ...app.window.state() });
      app.urlScheme.markReady();
      return;
    case "first_paint":
      app.windowState.update("main", { firstPaint: message.writes });
      return;
    case "open_in_browser":
      Utils.openExternal(app.cloudUrl);
      return;
    case "open_files":
      void chooseFiles(Utils).then(({ files, refused }) =>
        app.send({ v: 1, t: "files_opened", files, refused }),
      );
      return;
    case "show_folder":
      Utils.openPath(app.root);
      return;
    case "check_for_updates":
      app.updates.check();
      return;
    case "close_answer":
      app.window.answerClose(message.close);
      return;
    case "open_window":
      app.presentWindows.open(message);
      return;
    case "choose_directory":
      void chooseDirectory(Utils).then((path) =>
        app.send({ v: 1, t: "directory_chosen", path }),
      );
      return;
    case "window_action":
      if (
        message.windowKey === ABOUT_WINDOW_KEY &&
        app.aboutWindow.handleAction(message.action)
      )
        return;
      if (
        message.windowKey !== undefined &&
        message.windowKey !== "main" &&
        app.presentWindows.handleAction(message.windowKey, message.action)
      )
        return;
      if (message.action === "minimize") app.window.minimize();
      else if (message.action === "toggle_maximize")
        app.window.toggleMaximize();
      else app.window.requestClose();
      return;
    case "window_title":
      if (message.windowKey === ABOUT_WINDOW_KEY) return;
      if (
        message.windowKey !== undefined &&
        message.windowKey !== "main" &&
        app.presentWindows.setTitle(message.windowKey, message.title)
      )
        return;
      app.window.setTitle(message.title);
      return;
    case "restart_to_update":
      void app.updates.applyNow();
      return;
    default:
      message satisfies never;
  }
}

/** What is closed at quit, in this order. */
interface Held {
  stopUpdates(): void;
  closePresentWindows(): void;
  flush(): void;
  node: DesktopNode;
  listener: Listener;
  /** Started beside the node, so the window never waits for it. */
  cloud: Promise<CloudProcess | null>;
}

/** Vetoes the first quit, closes what runs, then quits for good. Returns the deduplicated shutdown helper. */
function quitCleanly(held: Held): () => Promise<void> {
  let closed = false;
  let shutdown: Promise<void> | null = null;
  const closeAll = (): Promise<void> =>
    (shutdown ??= (async () => {
      held.stopUpdates();
      held.closePresentWindows();
      held.flush();
      await held.node.close();
      await held.listener.stop();
      await (await held.cloud)?.stop();
      closed = true;
    })());
  Electrobun.events.on("before-quit", (event: unknown) => {
    if (closed) return;
    hold(event);
    if (shutdown !== null) return;
    void closeAll().then(() => Utils.quit());
  });
  return closeAll;
}

/**
 * A node that did not start: the running one is asked to come forward, or the newer store is said.
 * Inside the app `process.exit` starts a graceful quit and returns, so each outcome returns after it.
 */
async function refuse(
  start: Extract<DesktopNodeStart, { ok: false }>,
  repository: string,
): Promise<void> {
  if (start.reason === "running") {
    if (start.running !== null) await askToFocus(start.running, fetch);
    process.exit(0);
    return;
  }
  console.error(SHELL_WORDS.newerStoreLine);
  await alertNewerStore(repository, Utils);
  process.exit(1);
}

/** Opens the window on the node's page and wires the page's messages, the menus and the focus requests to it. */
function openApp(options: {
  root: string;
  cloudUrl: string;
  node: DesktopNode;
  core: NodeCore;
  nodeUrl: string;
  statePath: string;
  urlScheme: UrlSchemeHandler;
  beforeApply(): Promise<void>;
}) {
  const { core, node } = options;
  const send = (message: ShellMessage): void => core.shell.send(message);
  const windowState = createWindowStateWriter({
    path: options.statePath,
    clock,
    delayMs: WINDOW_STATE_SAVE_MS,
  });
  const presentWindows = createPresentWindows({
    nodeUrl: options.nodeUrl,
    launchToken: node.launchToken,
    statePath: options.statePath,
    platform: process.platform,
    windowState,
    workArea: primaryWorkArea,
    openWindow: (init) => new BrowserWindow(init),
  });
  const aboutWindow = createAboutWindow({
    nodeUrl: options.nodeUrl,
    launchToken: node.launchToken,
    platform: process.platform,
    workArea: primaryWorkArea,
    openWindow: (init) => new BrowserWindow(init),
  });
  const updates = createRunningUpdates(send, options.beforeApply);
  const platform = platformOf(process.platform);
  const menu =
    platform === "linux"
      ? null
      : createNativeMenu({
          platform,
          send,
          onAbout: () => aboutWindow.open(),
        });
  const window = openMainWindow({
    url: options.urlScheme.initialUrl(options.nodeUrl, node.launchToken),
    platform: process.platform,
    saved: readWindowState(options.statePath).roles.main ?? null,
    onPlaced: (patch) => windowState.update("main", patch),
    onStateChange: (state) => send({ v: 1, t: "window_state", ...state }),
    onCloseRequested: () => send({ v: 1, t: "close_requested" }),
    onShown: () => {
      updates.check();
      updates.startPeriodic();
    },
  });
  options.urlScheme.attach(options.nodeUrl, window, send);
  let marked = false;
  const app: App = {
    root: options.root,
    cloudUrl: options.cloudUrl,
    window,
    presentWindows,
    aboutWindow,
    menu,
    windowState,
    firstFrame() {
      if (marked) return;
      marked = true;
      node.markFirstFrame();
    },
    updates,
    urlScheme: options.urlScheme,
    send,
  };
  core.shell.onMessage((message) => answer(app, message));
  core.onFocusRequest(() => window.focus());
  return { windowState, presentWindows, aboutWindow, updates };
}

async function launch(): Promise<void> {
  const urlScheme = createUrlSchemeHandler(process.platform, Electrobun.events);
  const root = appDataDir(process.platform, process.env, homedir());
  const { version, channel } = await Updater.getLocalInfo();
  // the app is quitting and the new version opens in its place
  if (await updateAtLaunch()) return;
  const resources = join(PATHS.RESOURCES_FOLDER, "app");
  const build = readBuildFile(join(resources, "build.json"));
  const statePath = join(root, "window-state.json");
  const global: DesktopGlobal = {
    v: 1,
    platform: platformOf(process.platform),
    version,
    channel: channel === "stable" ? "stable" : "canary",
    dataDir: root,
  };
  const cloudPort = process.env.MANENT_CLOUD_URL ? null : freePort();
  const cloudUrl =
    process.env.MANENT_CLOUD_URL || `http://127.0.0.1:${cloudPort}`;
  let pdfRenderer: Promise<RenderPdf> | null = null;
  const renderPdf: RenderPdf = async (input) => {
    pdfRenderer ??= readScriptFonts((key) =>
      join(resources, FONT_FILES, `courier-prime-${key}.woff`),
    ).then(createPacketRenderPdf);
    return (await pdfRenderer)(input);
  };
  const start = await createDesktopNode({
    root,
    cloudUrl,
    webDir: join(resources, "web"),
    signIn: createDemoSignIn(),
    directory: createDemoDirectory(),
    versions: build.versions,
    build: version,
    platform: process.platform,
    renderPdf,
    boot: () => ({
      global,
      boot: readWindowState(statePath).roles.main?.firstPaint ?? [],
    }),
  });
  if (!start.ok) return refuse(start, build.repository);
  const { node } = start;
  const cloud =
    cloudPort === null
      ? Promise.resolve(null)
      : startCloud(resources, root, cloudPort);
  let core: NodeCore | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    (): ManentServer => {
      if (core === null) throw new Error("the node is used before it listens");
      return core.server;
    },
    onServeError,
  );
  const nodeUrl = `http://127.0.0.1:${listener.port}`;
  core = node.listening(nodeUrl);
  let closeHeld: (() => Promise<void>) | null = null;
  const { windowState, presentWindows, aboutWindow, updates } = openApp({
    root,
    cloudUrl,
    node,
    core,
    nodeUrl,
    statePath,
    urlScheme,
    beforeApply: () => closeHeld?.() ?? Promise.resolve(),
  });
  closeHeld = quitCleanly({
    stopUpdates: () => updates.stop(),
    closePresentWindows: () => {
      aboutWindow.close();
      presentWindows.closeAll();
    },
    flush: () => windowState.flush(),
    node,
    listener,
    cloud,
  });
}

if (import.meta.main) await launch();
