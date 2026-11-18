// Drives one engine against one service worker through checks O0–O6 and writes the result file;
// `--summary` folds the six result files into one status per engine and check.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import type { BrowserContext, BrowserType, Page } from "playwright";

const ROOT = resolve(import.meta.dir, "..");
const ENGINES = ["chromium", "firefox", "webkit"] as const;
const WORKERS = ["serwist", "hand"] as const;
const CHECKS = ["O0", "O1", "O2", "O3", "O4", "O5", "O6"] as const;
const FACES = [
  '16px "Courier Prime"',
  'italic 16px "Courier Prime"',
  'bold 16px "Courier Prime"',
  'italic bold 16px "Courier Prime"',
] as const;
const FONT_FILE = /\.(woff2?|ttf|otf)$/;

type Engine = (typeof ENGINES)[number];
type WorkerName = (typeof WORKERS)[number];
type CheckId = (typeof CHECKS)[number];
type Status = "pass" | "fail" | "not run";

interface Check {
  status: Status;
  detail: string;
}

interface RunResult {
  engine: Engine;
  version: string | null;
  sw: WorkerName;
  port: number;
  launched: boolean;
  setOfflineBlocksWorker: boolean | null;
  checks: Record<CheckId, Check>;
}

interface Server {
  port: number;
  stop(): void;
  requests(): string[];
}

type StartServer = (opts: { dir: string; port: number }) => Server;

const BROWSERS: Record<Engine, BrowserType> = { chromium, firefox, webkit };

function isEngine(value: string | undefined): value is Engine {
  return ENGINES.some((engine) => engine === value);
}

function isWorker(value: string | undefined): value is WorkerName {
  return WORKERS.some((worker) => worker === value);
}

function relative(text: string): string {
  return text.split(ROOT).join(".").split(homedir()).join("~");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function build(sw: WorkerName, buildId: string): string {
  const out = join("dist", buildId);
  const run = Bun.spawnSync(["bun", "build.ts", "--sw", sw, "--build-id", buildId, "--out", out], {
    cwd: ROOT,
  });
  if (run.exitCode !== 0) {
    throw new Error(`build of ${buildId} with the ${sw} worker exited ${run.exitCode}: ${run.stderr.toString().trim()}`);
  }
  return join(ROOT, out);
}

// Every manifest URL mapped to the SHA-256 of the built file it names.
function readShell(dir: string): Map<string, string> {
  const raw: unknown = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  if (!Array.isArray(raw)) throw new TypeError(`${dir}/manifest.json is not a list`);
  const shell = new Map<string, string>();
  const items: unknown[] = raw;
  for (const item of items) {
    const url = typeof item === "object" && item !== null && "url" in item ? item.url : null;
    if (typeof url !== "string") throw new TypeError(`${dir}/manifest.json holds an entry without a url`);
    shell.set(url, sha256(readFileSync(join(dir, url))));
  }
  return shell;
}

// Asks a worker a question over a MessageChannel; null when no worker is there or none answers.
async function ask(page: Page, message: { type: "version" | "probe" }, target: "controller" | "active"): Promise<unknown> {
  return page.evaluate(
    async ({ message, target }) => {
      const timeout = (ms: number) => new Promise<null>((done) => setTimeout(() => done(null), ms));
      const worker =
        target === "controller"
          ? navigator.serviceWorker.controller
          : ((await Promise.race([navigator.serviceWorker.ready, timeout(5000)]))?.active ?? null);
      if (worker === null) return null;
      const channel = new MessageChannel();
      const reply = new Promise<unknown>((done) => {
        channel.port1.onmessage = (event) => done(event.data);
      });
      worker.postMessage(message, [channel.port2]);
      return Promise.race([reply, timeout(10000)]);
    },
    { message, target },
  );
}

function probeFailed(reply: unknown): boolean {
  return typeof reply === "object" && reply !== null && "ok" in reply && reply.ok === false;
}

function pings(server: Server): number {
  return server.requests().filter((request) => request === "GET /api/ping").length;
}

async function pageFetchRejects(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    fetch("/api/ping", { cache: "no-store" }).then(
      () => false,
      () => true,
    ),
  );
}

async function shellText(page: Page): Promise<string> {
  return (await page.locator("#shell").textContent({ timeout: 10000 })) ?? "";
}

// The font guard: each face must resolve to a loaded Courier Prime FontFace.
async function missingFaces(page: Page): Promise<string[]> {
  return page.evaluate(async (faces) => {
    await document.fonts.ready;
    const missing: string[] = [];
    for (const face of faces) {
      const loaded = await document.fonts.load(face);
      const ok = loaded.some((f) => f.status === "loaded" && f.family.replaceAll('"', "") === "Courier Prime");
      if (!ok) missing.push(face);
    }
    return missing;
  }, FACES);
}

// The path and SHA-256 of every response in Cache Storage.
async function cachedResponses(page: Page): Promise<{ path: string; sha: string }[]> {
  return page.evaluate(async () => {
    const found: { path: string; sha: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const bytes = response === undefined ? new ArrayBuffer(0) : await response.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const sha = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
        found.push({ path: new URL(request.url).pathname, sha });
      }
    }
    return found;
  });
}

async function launch(engine: Engine, profile: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await BROWSERS[engine].launchPersistentContext(profile, { headless: true });
  context.setDefaultTimeout(15000);
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

// Bun may hold the port for a moment after a stop; a restart on the same port retries briefly.
async function restart(startServer: StartServer, dir: string, port: number): Promise<Server> {
  for (let attempt = 1; ; attempt++) {
    try {
      return startServer({ dir, port });
    } catch (error) {
      if (attempt === 40) throw error;
      await Bun.sleep(50);
    }
  }
}

function pass(detail: string): Check {
  return { status: "pass", detail };
}

function fail(detail: string): Check {
  return { status: "fail", detail };
}

function notRun(detail: string): Check {
  return { status: "not run", detail };
}

// A step that hangs is a failure after a minute, so one broken engine cannot stall the run.
async function attempt(work: () => Promise<Check>): Promise<Check> {
  try {
    const limit = new Promise<Check>((done) => setTimeout(() => done(fail("the step did not finish within 60 s")), 60000));
    return await Promise.race([work(), limit]);
  } catch (error) {
    return fail(relative(error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error)));
  }
}

function writeResult(result: RunResult): void {
  mkdirSync(join(ROOT, "results"), { recursive: true });
  const file = join(ROOT, "results", `offline-${result.engine}-${result.sw}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.engine} ${result.sw}: ${CHECKS.map((id) => `${id} ${result.checks[id].status}`).join(", ")}`);
}

async function run(engine: Engine, sw: WorkerName): Promise<void> {
  const profile = join(ROOT, ".profiles", `${engine}-${sw}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const v1 = build(sw, "v1");
  const v2 = build(sw, "v2");
  const { startServer, pickPort }: { startServer: StartServer; pickPort: () => number } = await import("../serve.ts");
  const port = pickPort();
  const origin = `http://127.0.0.1:${port}`;
  const checks = Object.fromEntries(CHECKS.map((id) => [id, notRun("an earlier step did not complete")])) as Record<CheckId, Check>;
  const result: RunResult = { engine, version: null, sw, port, launched: false, setOfflineBlocksWorker: null, checks };

  // A persistent context has no Browser object, so a plain launch reads the version and proves the engine starts.
  try {
    const browser = await BROWSERS[engine].launch({ headless: true });
    result.version = browser.version();
    await browser.close();
  } catch (error) {
    for (const id of CHECKS) checks[id] = notRun(`the browser did not launch: ${relative(String(error).split("\n")[0] ?? "")}`);
    writeResult(result);
    return;
  }
  result.launched = true;

  let server = startServer({ dir: v1, port });
  let { context, page } = await launch(engine, profile);
  try {
    checks.O1 = await attempt(async () => {
      await page.goto(`${origin}/`);
      const controlled = await page.evaluate(async () => {
        const ready = await Promise.race([
          navigator.serviceWorker.ready.then(() => true),
          new Promise<false>((done) => setTimeout(() => done(false), 10000)),
        ]);
        if (!ready) return "no worker became active within 10 s";
        if (navigator.serviceWorker.controller !== null) return true;
        return new Promise<boolean>((done) => {
          const timer = setTimeout(() => done(false), 10000);
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            clearTimeout(timer);
            done(true);
          });
        });
      });
      if (typeof controlled === "string") return fail(controlled);
      return controlled ? pass("the page is controlled") : fail("no controller 10 s after ready resolved");
    });

    checks.O2 = await attempt(async () => {
      const shell = readShell(v1);
      const stored = await page.evaluate(async (urls) => {
        const found: Record<string, string | null> = {};
        for (const url of urls) {
          const response = await caches.match(url, { ignoreSearch: true });
          if (response === undefined) {
            found[url] = null;
            continue;
          }
          const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer()));
          found[url] = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
        }
        return found;
      }, [...shell.keys()]);
      const wrong = [...shell].filter(([url, sha]) => stored[url] !== sha).map(([url]) => url);
      const fonts = [...shell.keys()].filter((url) => FONT_FILE.test(url)).length;
      if (wrong.length > 0) return fail(`missing or different in Cache Storage: ${wrong.join(", ")}`);
      if (fonts < 4) {
        const inlined = [...shell.keys()]
          .filter((url) => url.endsWith(".css"))
          .map((url) => readFileSync(join(v1, url), "utf8").split('url("data:font/').length - 1)
          .reduce((sum, count) => sum + count, 0);
        return fail(`${fonts} font files in the manifest, fewer than 4; the built CSS holds ${inlined} fonts inlined as data: URLs`);
      }
      return pass(`${shell.size} manifest URLs stored with the built bytes, ${fonts} of them font files`);
    });

    const o5Online = await attempt(async () => {
      const before = pings(server);
      const times = await page.evaluate(async () => {
        const t: unknown[] = [];
        for (let i = 0; i < 2; i++) {
          const body: unknown = await (await fetch("/api/ping")).json();
          t.push(typeof body === "object" && body !== null && "t" in body ? body.t : null);
          await new Promise((done) => setTimeout(done, 20));
        }
        return t;
      });
      const arrived = pings(server) - before;
      const cachedApi = (await cachedResponses(page)).filter((entry) => entry.path.startsWith("/api/"));
      if (typeof times[0] !== "number" || times[0] === times[1]) return fail(`the two pings returned t ${JSON.stringify(times)}`);
      if (arrived !== 2) return fail(`${arrived} of 2 pings reached the server`);
      if (cachedApi.length > 0) return fail(`Cache Storage holds ${cachedApi.map((e) => e.path).join(", ")}`);
      return pass(`t ${times[0]} then ${times[1]}, both reached the server, no /api/ response in Cache Storage`);
    });

    await context.setOffline(true);
    const before = pings(server);
    // A probe that cannot be asked leaves the answer unknown, which is what null records.
    const probe = await ask(page, { type: "probe" }, "active").catch(() => null);
    result.setOfflineBlocksWorker = probe === null ? null : probeFailed(probe) && pings(server) === before;

    server.stop();
    checks.O0 = await attempt(async () => {
      const reply = await ask(page, { type: "probe" }, "active");
      const rejects = await pageFetchRejects(page);
      if (!probeFailed(reply)) return fail(`the worker's probe answered ${JSON.stringify(reply)}`);
      if (!rejects) return fail("the page's fetch of /api/ping resolved");
      return pass("the worker's probe answered { ok: false } and the page's fetch rejected");
    });

    if (checks.O0.status !== "pass") {
      for (const id of ["O3", "O4", "O5"] as const) checks[id] = notRun("O0 did not pass: offline was not real");
    } else {
      checks.O5 = o5Online.status === "pass" ? pass(`${o5Online.detail}; offline the fetch rejected`) : o5Online;

      checks.O3 = await attempt(async () => {
        await page.reload();
        const text = await shellText(page);
        const missing = await missingFaces(page);
        if (text !== "Manent shell v1") return fail(`#shell reads ${JSON.stringify(text)}`);
        if (missing.length > 0) return fail(`not loaded as Courier Prime: ${missing.join(", ")}`);
        return pass("#shell reads Manent shell v1 and all four Courier Prime faces loaded");
      });

      checks.O4 = await attempt(async () => {
        await context.close();
        ({ context, page } = await launch(engine, profile));
        await context.setOffline(true);
        const read: string[] = [];
        for (const path of ["/", "/s/abc"]) {
          await page.goto(`${origin}${path}`);
          read.push(await shellText(page));
        }
        if (read.some((text) => text !== "Manent shell v1")) return fail(`#shell read ${JSON.stringify(read)} at / and /s/abc`);
        return pass("after a cold start offline, #shell shows at / and at /s/abc");
      });
    }

    if (checks.O1.status !== "pass") {
      checks.O6 = notRun("O1 did not pass: no worker in control");
    } else {
      checks.O6 = await attempt(async () => {
        await context.setOffline(false);
        server = await restart(startServer, v1, port);
        await page.goto(`${origin}/`);
        await page.locator("#shell").waitFor();
        const loadId: unknown = await page.evaluate(() => Reflect.get(window, "__loadId"));
        await page.locator("#edit").pressSequentially("unsaved words");
        server.stop();
        server = await restart(startServer, v2, port);
        const waiting = await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration === undefined) return false;
          await registration.update();
          const deadline = Date.now() + 20000;
          while (registration.waiting === null && Date.now() < deadline) await new Promise((done) => setTimeout(done, 100));
          return registration.waiting !== null;
        });
        if (!waiting) return fail("no worker was waiting 20 s after registration.update()");
        const state = await page.evaluate(() => ({
          loadId: Reflect.get(window, "__loadId"),
          edit: document.querySelector<HTMLTextAreaElement>("#edit")?.value ?? null,
          build: document.body.dataset.build ?? null,
        }));
        const version = await ask(page, { type: "version" }, "controller");
        if (state.loadId !== loadId) return fail("the page reloaded while v2 was waiting");
        if (state.edit !== "unsaved words") return fail(`#edit holds ${JSON.stringify(state.edit)}`);
        if (state.build !== "v1") return fail(`data-build is ${JSON.stringify(state.build)} while v2 waits`);
        if (version !== "v1") return fail(`the controlling worker answered ${JSON.stringify(version)} while v2 waits`);

        for (const open of context.pages()) await open.close();
        await context.close();
        ({ context, page } = await launch(engine, profile));
        await page.goto(`${origin}/`);
        await page.locator("#shell").waitFor();
        const build = await page.evaluate(() => document.body.dataset.build ?? null);
        if (build !== "v2") return fail(`after a relaunch the first navigation shows data-build ${JSON.stringify(build)}`);
        const shell = readShell(v2);
        const byPath = new Map([...shell].map(([url, sha]) => [new URL(url, origin).pathname, sha]));
        const responses = await cachedResponses(page);
        const stale = responses.filter((entry) => byPath.get(entry.path) !== entry.sha).map((entry) => entry.path);
        if (responses.length === 0) return fail("Cache Storage is empty after the update");
        if (stale.length > 0) return fail(`Cache Storage still holds a response not in v2: ${stale.join(", ")}`);
        return pass(`the edit survived, v1 kept control while v2 waited, the relaunch showed v2 and all ${responses.length} cached responses are v2's`);
      });
    }
  } finally {
    server.stop();
    // A step that failed may already have closed the context; closing it twice is harmless.
    await context.close().catch(() => undefined);
  }
  writeResult(result);
}

function readRun(engine: Engine, sw: WorkerName): RunResult {
  const file = join(ROOT, "results", `offline-${engine}-${sw}.json`);
  if (!existsSync(file)) throw new Error(`results/offline-${engine}-${sw}.json is missing; run bun test/offline.ts ${engine} ${sw}`);
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof raw !== "object" || raw === null || !("engine" in raw) || raw.engine !== engine || !("sw" in raw) || raw.sw !== sw) {
    throw new TypeError(`results/offline-${engine}-${sw}.json does not hold the ${engine} ${sw} run`);
  }
  const checks = "checks" in raw && typeof raw.checks === "object" && raw.checks !== null ? raw.checks : {};
  for (const id of CHECKS) {
    const check: unknown = Reflect.get(checks, id);
    const status = typeof check === "object" && check !== null && "status" in check ? check.status : null;
    if (status !== "pass" && status !== "fail" && status !== "not run") {
      throw new TypeError(`results/offline-${engine}-${sw}.json has no valid status for ${id}`);
    }
  }
  return raw as RunResult;
}

// Serwist passes when it passed; it fails only where the hand-written control passed the same check;
// anything else is the harness's or the browser build's fault and decides nothing.
function summarise(): void {
  const summary = Object.fromEntries(
    ENGINES.map((engine) => {
      const serwist = readRun(engine, "serwist");
      const hand = readRun(engine, "hand");
      const statuses = CHECKS.map((id): [CheckId, Status] => {
        const own = serwist.checks[id].status;
        if (own === "pass") return [id, "pass"];
        if (own === "fail" && hand.checks[id].status === "pass") return [id, "fail"];
        return [id, "not run"];
      });
      return [engine, Object.fromEntries(statuses)];
    }),
  );
  writeFileSync(join(ROOT, "results", "offline-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}

if (import.meta.main) {
  const [first, second] = process.argv.slice(2);
  if (first === "--summary") {
    summarise();
  } else if (isEngine(first) && isWorker(second)) {
    await run(first, second);
  } else {
    console.error("Usage: bun test/offline.ts <chromium|firefox|webkit> <serwist|hand>, or bun test/offline.ts --summary.");
    process.exit(2);
  }
}
