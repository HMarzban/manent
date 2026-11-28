// The one way a client scenario reaches a browser: the demo in the test build on ports and a data directory of its own,
// Chromium (or Firefox/WebKit) beside it, and pages signed in as one person each, slowed as the run asks.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStorage } from "@manent/storage";
import { chromium, firefox, webkit } from "@playwright/test";
import type { Browser, CDPSession, Page } from "@playwright/test";
import type { Subprocess } from "bun";
import { NotMeasured } from "../env.ts";
import { throttlePage } from "./throttle.ts";

const ROOT = join(import.meta.dir, "..", "..");
// as long as the end-to-end tests wait for the demo
const DEMO_START_MS = 240_000;
const DEMO_POLL_MS = 250;
const PAGE_VIEW = "[data-editor-host] .mn-page-view";
// not the Library: a first visit there opens the Tour in the side panel
const SIGN_IN_AT = "/preferences/writing";

export type BenchBrowser = "chromium" | "firefox" | "webkit";

const BROWSER_TYPES = { chromium, firefox, webkit } as const;
const MISSING_BROWSER = new RegExp(
  "executable doesn't exist|please run the following command|playwright install",
  "i",
);
const MISSING_DISPLAY = new RegExp(
  "missing x server|cannot open display|unable to open x display|\\$display",
  "i",
);

export interface BenchPage {
  page: Page;
  /** Chromium CDP session; null for Firefox and WebKit. */
  cdp: CDPSession | null;
  userId: string;
  close(): Promise<void>;
}

export interface BenchDemo {
  url: string;
  dataDir: string;
  /** A fresh browser context signed in as `userId` through the demo's sign-in, on a blank script of its own; `offline` cuts its network after that. */
  openPage(options: { userId: string; offline?: boolean }): Promise<BenchPage>;
  /** POST /api/sign-in, as TestServer.token does: a bot's session. */
  token(userId: string): Promise<string>;
  /** Stops the demo, runs `work` on its data directory, and starts the demo again on the same port and directory; open pages and bots reconnect by themselves. */
  whileStopped(work: (dataDir: string) => Promise<void>): Promise<void>;
  /** whileStopped, writing each role with openSqliteStorage({ dir, now: Date.now }).directory.setRole and closing the storage. No route grants a role in this release. */
  share(
    docId: string,
    grants: readonly {
      userId: string;
      role: "owner" | "edit" | "view";
      capabilities: readonly string[];
    }[],
  ): Promise<void>;
  stop(): Promise<void>;
}

/** Throws `NotMeasured` when a headed run on Linux has neither X11 `DISPLAY` nor `WAYLAND_DISPLAY`. */
export function checkHeadedDisplay(
  headed: boolean,
  platform: NodeJS.Platform = process.platform,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (!headed || platform !== "linux") return;
  const hasDisplay = Boolean(
    env.DISPLAY?.trim() || env.WAYLAND_DISPLAY?.trim(),
  );
  if (!hasDisplay) throw new NotMeasured("no display for a headed browser");
}

/** Translates a Playwright browser-launch error into `NotMeasured` when the browser or display is missing; null otherwise. */
export function translateLaunchError(
  browser: BenchBrowser,
  headed: boolean,
  cause: unknown,
): NotMeasured | null {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (MISSING_BROWSER.test(message)) {
    return new NotMeasured(
      `${browser} is not installed: run bun x playwright install ${browser}`,
    );
  }
  if (headed && MISSING_DISPLAY.test(message)) {
    return new NotMeasured("no display for a headed browser");
  }
  return null;
}

async function launchBenchBrowser(
  browser: BenchBrowser,
  headed: boolean,
): Promise<Browser> {
  checkHeadedDisplay(headed);
  const type = BROWSER_TYPES[browser];
  try {
    return await type.launch(
      browser === "chromium"
        ? { headless: !headed, args: ["--disable-gpu"] }
        : { headless: !headed },
    );
  } catch (cause) {
    const notMeasured = translateLaunchError(browser, headed, cause);
    if (notMeasured !== null) throw notMeasured;
    throw cause;
  }
}

/** A port nothing listens on now, as the system gives one for port 0. */
function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    // nothing listens yet
    return false;
  }
}

/** The demo command on `ports`, built into `webDir`, keeping its data in `dataDir`; resolves once /health answers. */
async function spawnDemo(options: {
  port: number;
  controlPort: number;
  dataDir: string;
  webDir: string;
}): Promise<Subprocess> {
  const { port, controlPort, dataDir, webDir } = options;
  const demo = Bun.spawn(
    [
      process.execPath,
      "tools/demo/cli.ts",
      "demo",
      "--no-open",
      "--port",
      String(port),
      "--control-port",
      String(controlPort),
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        MANENT_DATA_DIR: dataDir,
        MANENT_WEB_DIR: webDir,
        MANENT_FLAVOUR: "test",
      },
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const told = new Response(demo.stderr).text();
  const until = performance.now() + DEMO_START_MS;
  while (!(await answers(`http://127.0.0.1:${port}/health`))) {
    if (demo.exitCode !== null || performance.now() > until) {
      demo.kill("SIGINT");
      await demo.exited;
      throw new Error(`the demo did not start on port ${port}:\n${await told}`);
    }
    await Bun.sleep(DEMO_POLL_MS);
  }
  return demo;
}

/** Keeps every set of editor hooks the test build installs, in `window.__editorHooks`. */
async function keepEveryHooks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const installed: unknown[] = [];
    Reflect.set(window, "__editorHooks", installed);
    let manent: unknown = undefined;
    Object.defineProperty(window, "__manent", {
      configurable: true,
      get: () => manent,
      set(value: unknown) {
        manent = value;
        if (typeof value !== "object" || value === null) return;
        let editor: unknown = undefined;
        Object.defineProperty(value, "editor", {
          configurable: true,
          enumerable: true,
          get: () => editor,
          set(hooks: unknown) {
            editor = hooks;
            installed.push(hooks);
          },
        });
      },
    });
  });
}

/** Signs `page` in as `userId`, then makes a blank script on its device as the Library does and opens it, which loads the editor and its hooks. */
async function signIn(page: Page, url: string, userId: string): Promise<void> {
  await page.goto(`${url}${SIGN_IN_AT}?person=${userId}`);
  await page.waitForURL((at) => !at.searchParams.has("person"));
  await page.waitForFunction(() => {
    const sync: unknown = Reflect.get(
      Object(Reflect.get(window, "__manent")),
      "sync",
    );
    return typeof Reflect.get(Object(sync), "createScript") === "function";
  });
  const docId = crypto.randomUUID();
  await page.evaluate(async (id) => {
    const sync: unknown = Reflect.get(
      Object(Reflect.get(window, "__manent")),
      "sync",
    );
    await Reflect.apply(Reflect.get(Object(sync), "createScript"), sync, [id]);
  }, docId);
  await page.goto(`${url}/s/${docId}`);
  await page.locator(PAGE_VIEW).waitFor({ state: "attached", timeout: 90_000 });
}

/** A session token for `userId` from the demo at `url`. */
async function signInToken(url: string, userId: string): Promise<string> {
  const response = await fetch(`${url}/api/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (response.status !== 200)
    throw new Error(
      `the sign-in of ${userId} was answered ${response.status}: ${await response.text()}`,
    );
  const body: unknown = await response.json();
  const token: unknown = Reflect.get(Object(body), "token");
  if (typeof token !== "string")
    throw new Error(`the sign-in of ${userId} gave no token`);
  return token;
}

/** The demo in the test flavour on a free port and a fresh data directory (mkdtemp) unless given; Chromium by default, or Firefox/WebKit. */
export async function startBenchDemo(options?: {
  dataDir?: string;
  browser?: BenchBrowser | false;
  headed?: boolean;
}): Promise<BenchDemo> {
  const browserOption = options?.browser ?? "chromium";
  const headed = options?.headed ?? false;
  const browser =
    browserOption === false
      ? null
      : await launchBenchBrowser(browserOption, headed);
  const ownData = options?.dataDir === undefined;
  const dataDir =
    options?.dataDir ?? (await mkdtemp(join(tmpdir(), "manent bench ")));
  const webDir = await mkdtemp(join(tmpdir(), "manent bench web "));
  const ports = { port: freePort(), controlPort: freePort() };
  const url = `http://127.0.0.1:${ports.port}`;
  const removeDirs = async (): Promise<void> => {
    const opts = {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    };
    await rm(webDir, opts);
    if (ownData) await rm(dataDir, opts);
  };
  let demo: Subprocess;
  try {
    demo = await spawnDemo({ ...ports, dataDir, webDir });
  } catch (error) {
    await browser?.close();
    await removeDirs();
    throw error;
  }
  const halt = async (): Promise<void> => {
    demo.kill("SIGINT");
    await demo.exited;
  };
  const whileStopped: BenchDemo["whileStopped"] = async (work) => {
    await halt();
    await work(dataDir);
    demo = await spawnDemo({ ...ports, dataDir, webDir });
  };
  return {
    url,
    dataDir,
    async openPage({ userId, offline = false }) {
      if (browser === null)
        throw new RangeError("startBenchDemo was started with browser: false");
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        let cdp: CDPSession | null = null;
        if (browserOption === "chromium") {
          cdp = await context.newCDPSession(page);
          await throttlePage(page, cdp);
        }
        await keepEveryHooks(page);
        await signIn(page, url, userId);
        if (offline) await context.setOffline(true);
        return { page, cdp, userId, close: () => context.close() };
      } catch (error) {
        await context.close();
        throw error;
      }
    },
    token: (userId) => signInToken(url, userId),
    whileStopped,
    share: (docId, grants) =>
      whileStopped(async (dir) => {
        const storage = openSqliteStorage({
          dir: join(dir, "data"),
          now: Date.now,
        });
        try {
          for (const grant of grants)
            storage.directory.setRole(
              docId,
              grant.userId,
              grant.role,
              grant.capabilities,
            );
        } finally {
          storage.close();
        }
      }),
    async stop() {
      await browser?.close();
      await halt();
      await removeDirs();
    },
  };
}

/** The page's JavaScript heap after a collection, bytes: HeapProfiler.collectGarbage, then JSHeapUsedSize. */
export async function heapBytes(p: BenchPage): Promise<number> {
  if (p.cdp === null)
    throw new Error("heapBytes requires a Chromium CDP session");
  await p.cdp.send("HeapProfiler.collectGarbage");
  await p.cdp.send("Performance.enable");
  const { metrics } = await p.cdp.send("Performance.getMetrics");
  const used = metrics.find((m) => m.name === "JSHeapUsedSize");
  if (used === undefined) throw new Error("Chromium gave no JSHeapUsedSize");
  return used.value;
}

/** The page's DOM nodes now: Memory.getDOMCounters().nodes. */
export async function domNodes(p: BenchPage): Promise<number> {
  if (p.cdp === null)
    throw new Error("domNodes requires a Chromium CDP session");
  const { nodes } = await p.cdp.send("Memory.getDOMCounters");
  return nodes;
}

/** The durations, ms, of the page's long animation frames that start between `start()` and `stop()`. */
export async function longFrames(
  p: BenchPage,
): Promise<{ start(): Promise<void>; stop(): Promise<number[]> }> {
  return {
    start: () =>
      p.page.evaluate(() => {
        const frames: number[] = [];
        const startMs = performance.now();
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (entry.startTime >= startMs) frames.push(entry.duration);
        });
        observer.observe({ type: "long-animation-frame", buffered: true });
        Reflect.set(window, "__longFrames", { frames, observer, startMs });
      }),
    stop: () =>
      p.page.evaluate(() => {
        const watched: unknown = Reflect.get(window, "__longFrames");
        const observer: unknown = Reflect.get(Object(watched), "observer");
        const frames: unknown = Reflect.get(Object(watched), "frames");
        const startMs = Number(Reflect.get(Object(watched), "startMs"));
        if (
          !(observer instanceof PerformanceObserver) ||
          !Array.isArray(frames)
        )
          throw new RangeError("long frames were not started");
        for (const entry of observer.takeRecords())
          if (entry.startTime >= startMs) frames.push(entry.duration);
        observer.disconnect();
        return frames.map(Number);
      }),
  };
}
