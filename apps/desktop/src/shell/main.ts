// The desktop app's entry: one local node per data directory, its cloud, and the window, menus and dialogs
// that speak to the page over the node's shell channel.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import { appDataDir, askToFocus, createDesktopNode } from "@manent/local-node";
import type {
  DesktopNode,
  DesktopNodeStart,
  NodeCore,
} from "@manent/local-node";
import { serveWithBun } from "@manent/server-core";
import type { Clock, Listener, ManentServer } from "@manent/server-core";
import type {
  DesktopGlobal,
  NativeMenu,
  PageMessage,
  ServerVersions,
  ShellMessage,
} from "@manent/sync-protocol";
import { startEmbeddedCloud } from "../cloud.ts";
import type { CloudProcess } from "../cloud.ts";
import { createWindowStateWriter, readWindowState } from "../window-state.ts";
import { SHELL_WORDS } from "../words.ts";
import { alertNewerStore, chooseFiles } from "./dialogs.ts";
import { createNativeMenu } from "./menus.ts";
import { Electrobun, PATHS, Updater, Utils } from "./sdk.ts";
import { hold, openMainWindow } from "./window.ts";
import type { MainWindow } from "./window.ts";

/** After the last move or resize. */
const WINDOW_STATE_SAVE_MS = 500;

/** What the build packs beside the app: the repository its releases come from, and the versions it runs. */
interface BuildFile {
  repository: string;
  versions: ServerVersions;
}

const clock: Clock = {
  now: Date.now,
  schedule(fn, delayMs) {
    const timer = setTimeout(fn, delayMs);
    return () => clearTimeout(timer);
  },
};

const VERSION_FIELDS = ["protocol", "schema", "engine", "table"] as const;

function isVersionSet(value: unknown): value is ServerVersions["current"] {
  if (typeof value !== "object" || value === null) return false;
  const fields: Record<string, unknown> = { ...value };
  return VERSION_FIELDS.every((field) => {
    const version = fields[field];
    return Number.isSafeInteger(version) && Number(version) >= 0;
  });
}

/** Throws when the build packed no readable build.json: the app cannot run without one. */
function readBuildFile(path: string): BuildFile {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  const read =
    typeof value === "object" &&
    value !== null &&
    "repository" in value &&
    "versions" in value
      ? { repository: value.repository, versions: value.versions }
      : null;
  if (typeof read?.repository !== "string" || !isVersionSet(read.versions))
    throw new TypeError(`${path} is not a build file`);
  return {
    repository: read.repository,
    versions: { current: read.versions, min: read.versions },
  };
}

function platformOf(platform: NodeJS.Platform): DesktopGlobal["platform"] {
  if (platform === "darwin") return "mac";
  return platform === "win32" ? "windows" : "linux";
}

/** A port nothing listens on now: listened on and closed again. */
function freePort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

/** The answer to a request whose handler threw: nothing of the thrown value, which may name this machine's files. */
function onServeError(_error: unknown): Response {
  console.error("A request could not be answered.");
  return new Response("Manent could not answer that request.", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** What the page's messages act on, once the node listens and the window exists. */
interface App {
  root: string;
  cloudUrl: string;
  window: MainWindow;
  menu: { draw(menus: readonly NativeMenu[] | null): void } | null;
  windowState: ReturnType<typeof createWindowStateWriter>;
  firstFrame(): void;
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
      return;
    case "first_paint":
      app.windowState.update("main", { firstPaint: message.writes });
      return;
    case "open_in_browser":
      Utils.openExternal(app.cloudUrl);
      return;
    case "open_files":
      void chooseFiles().then(({ files, refused }) =>
        app.send({ v: 1, t: "files_opened", files, refused }),
      );
      return;
    case "show_folder":
      Utils.openPath(app.root);
      return;
    case "check_for_updates":
      return;
    case "close_answer":
      app.window.answerClose(message.close);
      return;
    default:
      message satisfies never;
  }
}

/** What is closed at quit, in this order. */
interface Held {
  flush(): void;
  node: DesktopNode;
  listener: Listener;
  /** Started beside the node, so the window never waits for it. */
  cloud: Promise<CloudProcess | null>;
}

/** Vetoes the first quit, closes what runs, then quits for good. */
function quitCleanly(held: Held): void {
  let closed = false;
  let closing = false;
  Electrobun.events.on("before-quit", (event: unknown) => {
    if (closed) return;
    hold(event);
    if (closing) return;
    closing = true;
    void (async () => {
      held.flush();
      await held.node.close();
      await held.listener.stop();
      await (await held.cloud)?.stop();
      closed = true;
      Utils.quit();
    })();
  });
}

/** The demo cloud packed with the app, on `port`; null, and the cause logged, when it does not start. */
async function startCloud(
  resources: string,
  root: string,
  port: number,
): Promise<CloudProcess | null> {
  try {
    return await startEmbeddedCloud({
      execPath: process.execPath,
      entry: join(resources, "cloud", "main.js"),
      dataDir: join(root, "cloud"),
      webDir: join(resources, "web"),
      seedDir: join(resources, "seed"),
      // the node was given this port's address before the cloud started, so every attempt keeps it
      freePort: () => Promise.resolve(port),
      fetch,
    });
  } catch (error) {
    // the node runs without its cloud, as it does offline
    console.error(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** A node that did not start: the running one is asked to come forward, or the newer store is said. */
async function refuse(
  start: Extract<DesktopNodeStart, { ok: false }>,
  repository: string,
): Promise<never> {
  if (start.reason === "running") {
    if (start.running !== null) await askToFocus(start.running, fetch);
    process.exit(0);
  }
  console.error(SHELL_WORDS.newerStoreLine);
  await alertNewerStore(repository);
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
}): ReturnType<typeof createWindowStateWriter> {
  const { core, node } = options;
  const send = (message: ShellMessage): void => core.shell.send(message);
  const windowState = createWindowStateWriter({
    path: options.statePath,
    clock,
    delayMs: WINDOW_STATE_SAVE_MS,
  });
  const platform = platformOf(process.platform);
  const menu =
    platform === "linux" ? null : createNativeMenu({ platform, send });
  const window = openMainWindow({
    url: `${options.nodeUrl}/?launch=${node.launchToken}`,
    platform: process.platform,
    saved: readWindowState(options.statePath).roles.main ?? null,
    onPlaced: (patch) => windowState.update("main", patch),
    onCloseRequested: () => send({ v: 1, t: "close_requested" }),
  });
  let marked = false;
  const app: App = {
    root: options.root,
    cloudUrl: options.cloudUrl,
    window,
    menu,
    windowState,
    firstFrame() {
      if (marked) return;
      marked = true;
      node.markFirstFrame();
    },
    send,
  };
  core.shell.onMessage((message) => answer(app, message));
  core.onFocusRequest(() => window.focus());
  return windowState;
}

async function launch(): Promise<void> {
  const root = appDataDir(process.platform, process.env, homedir());
  const { version, channel } = await Updater.getLocalInfo();
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
  const start = await createDesktopNode({
    root,
    cloudUrl,
    webDir: join(resources, "web"),
    signIn: createDemoSignIn(),
    directory: createDemoDirectory(),
    versions: build.versions,
    build: version,
    platform: process.platform,
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
  const server = (): ManentServer => {
    if (core === null) throw new Error("the node is used before it listens");
    return core.server;
  };
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    server,
    onServeError,
  );
  const nodeUrl = `http://127.0.0.1:${listener.port}`;
  core = node.listening(nodeUrl);
  const windowState = openApp({
    root,
    cloudUrl,
    node,
    core,
    nodeUrl,
    statePath,
  });
  quitCleanly({ flush: () => windowState.flush(), node, listener, cloud });
}

if (import.meta.main) await launch();
