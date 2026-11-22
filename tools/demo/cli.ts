// The demo command: checks the machine, installs, builds and seeds, then runs the server under a supervisor.
import type { ServerState } from "@manent/sync-protocol";
import { checkBunVersion, pickLanAddress } from "./preflight.ts";

// node: modules are built in, so they load on a fresh clone; this file's packages load only after the install
const { join, resolve } = await import("node:path");
const { rm, writeFile } = await import("node:fs/promises");

const ROOT = join(import.meta.dir, "..", "..");
const SERVER_COMMAND = [
  process.execPath,
  "--no-orphans",
  "apps/server/src/main.ts",
];
const ANSWER_TIMEOUT_MS = 1000;
const POLL_MS = 100;
const STALE_SERVER_WAIT_MS = 5000;
const STOP_WAIT_MS = 10_000;
const PORT = /^[1-9]\d{0,4}$/;
const COULD_NOT_START = "The server could not start.";

/** What run.json holds while a demo runs. */
interface RunFile {
  /** The demo command's process. */
  pid: number;
  serverPid: number;
  appUrl: string;
  controlUrl: string;
  token: string;
}

interface DemoOptions {
  dataDir: string;
  port: number;
  controlPort: number;
  lan: boolean;
  /** The address asked for with --lan-host; null to pick this machine's own. */
  lanHost: string | null;
  open: boolean;
}

/** A demo found through run.json: `live` when its supervisor answers; a stale file may hold nothing readable. */
export type FoundDemo =
  { live: true; run: RunFile } | { live: false; run: RunFile | null };

const portInUse = (port: number): string =>
  `Port ${port} is in use. Stop what is using it, or run make stop if that is Manent.`;

const runPath = (dataDir: string): string => join(dataDir, "run.json");

const portOf = (url: string): number => Number(new URL(url).port);

const isPid = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

function isRunFile(value: unknown): value is RunFile {
  if (typeof value !== "object" || value === null) return false;
  return (
    "pid" in value &&
    isPid(value.pid) &&
    "serverPid" in value &&
    isPid(value.serverPid) &&
    "appUrl" in value &&
    typeof value.appUrl === "string" &&
    URL.canParse(value.appUrl) &&
    "controlUrl" in value &&
    typeof value.controlUrl === "string" &&
    URL.canParse(value.controlUrl) &&
    "token" in value &&
    typeof value.token === "string"
  );
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  limitMs: number,
): Promise<boolean> {
  for (let waited = 0; waited < limitMs; waited += POLL_MS) {
    if (await condition()) return true;
    await Bun.sleep(POLL_MS);
  }
  return condition();
}

async function answers(url: string, token: string | null): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    // refused or timed out: nothing that answers listens there
    return false;
  }
}

function isPortFree(port: number): boolean {
  try {
    Bun.listen({
      hostname: "127.0.0.1",
      port,
      socket: { data: () => {} },
    }).stop(true);
    return true;
  } catch {
    // the listen was refused: something holds the port
    return false;
  }
}

/** The supervisor's state once it has done `path`; null when it did not answer with one. */
async function post(run: RunFile, path: string): Promise<ServerState | null> {
  const { isServerState } = await import("@manent/sync-protocol");
  try {
    const response = await fetch(run.controlUrl + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${run.token}` },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("server" in body))
      return null;
    return isServerState(body.server) ? body.server : null;
  } catch {
    // the supervisor went away, or its answer was not JSON: there is no state to report
    return null;
  }
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  } catch {
    // no browser opener on this machine: the printed address is enough
  }
}

/** Bun with `args` in the repository root, its output shown; `failure` is the sentence when it does not succeed. */
async function runBun(args: string[], failure: string): Promise<void> {
  const step = Bun.spawn([process.execPath, ...args], {
    cwd: ROOT,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await step.exited) !== 0) throw new Error(failure);
}

async function findDemo(dataDir: string): Promise<FoundDemo | null> {
  const file = Bun.file(runPath(dataDir));
  if (!(await file.exists())) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(await file.text());
  } catch {
    // a garbled run.json is stale, and the caller clears it
    return { live: false, run: null };
  }
  if (!isRunFile(stored)) return { live: false, run: null };
  if (await answers(`${stored.controlUrl}/status`, stored.token))
    return { live: true, run: stored };
  return { live: false, run: stored };
}

/** What a demo that died left behind: its server, when that still answers, and run.json. */
async function clearStale(dataDir: string, run: RunFile | null): Promise<void> {
  if (run !== null) {
    const port = portOf(run.appUrl);
    if (await answers(`http://127.0.0.1:${port}/health`, null)) {
      try {
        process.kill(run.serverPid, "SIGKILL");
      } catch {
        // the server has exited since it answered
      }
      if (!(await waitFor(() => isPortFree(port), STALE_SERVER_WAIT_MS)))
        throw new Error(portInUse(port));
    }
  }
  await rm(runPath(dataDir), { force: true });
}

/** True when a live demo was joined; a stale one is cleared first. */
async function joinRunning(options: DemoOptions): Promise<boolean> {
  const found = await findDemo(options.dataDir);
  if (found === null) return false;
  if (!found.live) {
    await clearStale(options.dataDir, found.run);
    return false;
  }
  if ((await post(found.run, "/start-server")) !== "running")
    throw new Error(COULD_NOT_START);
  if (options.open) openBrowser(found.run.appUrl);
  console.log(`Manent is already running at ${found.run.appUrl}`);
  return true;
}

/** The private address to listen on as well as loopback; null outside LAN mode. */
async function chooseLanHost(options: DemoOptions): Promise<string | null> {
  if (!options.lan) return null;
  const { networkInterfaces } = await import("node:os");
  const address = options.lanHost ?? pickLanAddress(networkInterfaces());
  if (address === null)
    throw new Error("No private network address was found on this machine.");
  const { checkDemoBind } = await import("@manent/server-core");
  const check = checkDemoBind(address, { lan: true });
  if (check.ok) return check.address;
  const { bindRefusal } = await import("@manent/demo");
  throw new Error(bindRefusal(address, check.reason));
}

const urlHost = (address: string): string =>
  address.includes(":") ? `[${address}]` : address;

/** Starts the server under a supervisor and stays until a signal or POST /shutdown ends it. */
async function serve(
  options: DemoOptions,
  lanHost: string | null,
): Promise<number> {
  const { port, controlPort, dataDir } = options;
  const ended = Promise.withResolvers<"signal" | "shutdown">();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.on(signal, () => ended.resolve("signal"));
  const { startSupervisor } = await import("./supervisor.ts");
  const { resetSeed } = await import("./seed.ts");
  const appUrl = `http://localhost:${port}`;
  const controlUrl = `http://127.0.0.1:${controlPort}`;
  const token = crypto.randomUUID();
  const supervisor = await startSupervisor({
    command: SERVER_COMMAND,
    env: {
      ...process.env,
      MANENT_DEMO: "1",
      MANENT_PORT: String(port),
      MANENT_DATA_DIR: dataDir,
      MANENT_LAN_HOST: lanHost ?? "",
      MANENT_CONTROL_URL: controlUrl,
      MANENT_CONTROL_TOKEN: token,
    },
    cwd: ROOT,
    healthUrl: `http://127.0.0.1:${port}/health`,
    controlPort,
    token,
    allowedOrigins: [appUrl, `http://127.0.0.1:${port}`],
    onReset: async () => {
      await resetSeed(dataDir);
    },
    onShutdown: () => ended.resolve("shutdown"),
  }).catch((cause: unknown) => {
    throw new Error(COULD_NOT_START, { cause });
  });
  try {
    await supervisor.startServer();
  } catch (error) {
    await supervisor.shutdown();
    throw error;
  }
  const run: RunFile = {
    pid: process.pid,
    // startServer resolved, so the server is running and has a process
    serverPid: supervisor.serverPid()!,
    appUrl,
    controlUrl,
    token,
  };
  await writeFile(runPath(dataDir), JSON.stringify(run), { mode: 0o600 });
  console.log(`Manent is running at ${appUrl}`);
  if (lanHost !== null)
    console.log(`On your network: http://${urlHost(lanHost)}:${port}`);
  console.log("Press Ctrl+C or run `make stop` to stop it.");
  if (options.open) openBrowser(appUrl);
  if ((await ended.promise) === "signal") await supervisor.shutdown();
  await rm(runPath(dataDir), { force: true });
  return 0;
}

async function demo(options: DemoOptions): Promise<number> {
  const version = checkBunVersion(Bun.version);
  if (!version.ok) throw new Error(version.message);
  if (await joinRunning(options)) return 0;
  for (const port of [options.port, options.controlPort])
    if (!isPortFree(port)) throw new Error(portInUse(port));
  await runBun(
    ["install", "--frozen-lockfile"],
    "The packages could not be installed.",
  );
  const lanHost = await chooseLanHost(options);
  await runBun(["apps/web/build.ts"], "The web app could not be built.");
  const { ensureSeed, resetSeed } = await import("./seed.ts");
  if ((await ensureSeed(options.dataDir)) === "stale") {
    await resetSeed(options.dataDir);
    console.log(
      "The demo data came from another build, so it was seeded again.",
    );
  }
  return serve(options, lanHost);
}

async function stop(dataDir: string): Promise<number> {
  const found = await findDemo(dataDir);
  if (found === null) {
    console.log("Nothing is running.");
    return 0;
  }
  if (!found.live) {
    await clearStale(dataDir, found.run);
    console.log("Stopped.");
    return 0;
  }
  const ports = [portOf(found.run.appUrl), portOf(found.run.controlUrl)];
  await post(found.run, "/shutdown");
  const gone = async () =>
    !(await Bun.file(runPath(dataDir)).exists()) && ports.every(isPortFree);
  if (!(await waitFor(gone, STOP_WAIT_MS))) {
    const held = ports.find((port) => !isPortFree(port));
    if (held !== undefined) throw new Error(portInUse(held));
    await rm(runPath(dataDir), { force: true });
  }
  console.log("Stopped.");
  return 0;
}

async function reset(dataDir: string): Promise<number> {
  const found = await findDemo(dataDir);
  if (found?.live) {
    if ((await post(found.run, "/reset")) !== "running")
      throw new Error(COULD_NOT_START);
  } else {
    const { resetSeed } = await import("./seed.ts");
    await resetSeed(dataDir);
  }
  console.log("The demo data was seeded again.");
  return 0;
}

function readPort(
  value: string | undefined,
  fallback: number,
  flag: string,
): number {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!PORT.test(value) || port > 65_535)
    throw new Error(`${flag} must be a port number.`);
  return port;
}

async function main(args: string[]): Promise<number> {
  const { parseArgs } = await import("node:util");
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      lan: { type: "boolean" },
      "lan-host": { type: "string" },
      "no-open": { type: "boolean" },
      port: { type: "string" },
      "control-port": { type: "string" },
      "data-dir": { type: "string" },
    },
  });
  const given = values["data-dir"] ?? process.env.MANENT_DATA_DIR;
  const dataDir = given ? resolve(given) : join(ROOT, ".manent-demo");
  const command = positionals[0] ?? "";
  if (command === "demo")
    return demo({
      dataDir,
      port: readPort(values.port, 4747, "--port"),
      controlPort: readPort(values["control-port"], 4748, "--control-port"),
      lan:
        values.lan === true ||
        values["lan-host"] !== undefined ||
        process.env.LAN === "1",
      lanHost: values["lan-host"] ?? null,
      open: values["no-open"] !== true,
    });
  if (command === "stop") return stop(dataDir);
  if (command === "reset") return reset(dataDir);
  if (command === "desktop") {
    const { buildAgainst } = await import("../desktop/build.ts");
    return buildAgainst(await findDemo(dataDir), join(dataDir, "desktop"));
  }
  throw new Error(`Unknown command ${command}. Run make to see the commands.`);
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
