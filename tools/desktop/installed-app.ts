// The installed desktop app as the smoke drives it from outside: where it lives, its processes judged by
// executable path (the launcher can outlive the app), launching it, quitting it and measuring it.
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const QUIT_WAIT_MS = 15_000;
const EMBEDDED_CLOUD_ENTRY = join("app", "cloud", "main.js");

export interface Install {
  root: string;
  resources: string;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** macOS: the `.app` bundle; elsewhere the folder above the executable's own. */
export function installOf(app: string): Install {
  if (process.platform !== "darwin") {
    const root = canonicalPath(dirname(dirname(app)));
    return { root, resources: join(root, "Resources") };
  }
  const root = canonicalPath(
    app.slice(0, app.lastIndexOf(".app") + ".app".length),
  );
  return { root, resources: join(root, "Contents", "Resources") };
}

export interface AppProcess {
  pid: number;
  rssBytes: number;
  command: string;
}

/** True for the embedded demo cloud server and its background seed worker, which stand in for a remote server in demo builds. */
export function isEmbeddedCloudProcess(command: string): boolean {
  return (
    command.includes(EMBEDDED_CLOUD_ENTRY) ||
    command.includes("app/cloud/main.js")
  );
}

/** Resident memory summed over the desktop app's own processes, leaving out the embedded demo cloud; null when none match. */
export function sumDesktopRss(processes: readonly AppProcess[]): number | null {
  const desktop = processes.filter(
    ({ command }) => !isEmbeddedCloudProcess(command),
  );
  return desktop.length === 0
    ? null
    : desktop.reduce((sum, { rssBytes }) => sum + rssBytes, 0);
}

const LISTING = new RegExp("^\\s*(\\d+)\\s+(\\d+)\\s+(.+)$");
const LINUX_PSS = /^Pss:\s+(\d+)\s+kB$/m;
const MAC_FOOTPRINT = /Footprint:\s+(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)\b/i;
const WINDOWS_LISTING = (root: string): string =>
  `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${root.replaceAll("'", "''")}') } | ForEach-Object { "$($_.ProcessId) $($_.WorkingSetSize) $($_.CommandLine)" }`;

/** Extracts proportional set size in bytes from Linux `/proc/<pid>/smaps_rollup` so shared CEF mappings are not double-counted across helper processes. */
export function parseLinuxPssBytes(smaps: string): number | null {
  const match = LINUX_PSS.exec(smaps);
  return match === null ? null : Number(match[1]) * 1024;
}

const MAC_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

/** Extracts physical footprint in bytes from macOS `footprint` output so shared CEF framework pages are not double-counted across helper processes. */
export function parseMacFootprintBytes(output: string): number | null {
  const match = MAC_FOOTPRINT.exec(output);
  if (match === null) return null;
  const scale = MAC_UNITS[match[2]!.toUpperCase()];
  return scale === undefined ? null : Math.round(Number(match[1]) * scale);
}

function linuxPssOrFallback(pid: number, fallbackBytes: number): number {
  try {
    return (
      parseLinuxPssBytes(readFileSync(`/proc/${pid}/smaps_rollup`, "utf8")) ??
      fallbackBytes
    );
  } catch {
    return fallbackBytes;
  }
}

function macFootprintOrFallback(pid: number, fallbackBytes: number): number {
  try {
    const out = Bun.spawnSync(["footprint", "-p", String(pid), "-f", "bytes"]);
    if (out.exitCode !== 0) return fallbackBytes;
    return parseMacFootprintBytes(out.stdout.toString()) ?? fallbackBytes;
  } catch {
    return fallbackBytes;
  }
}

/** Every process whose executable is inside `root`; physical memory in bytes (Linux uses PSS and macOS uses `footprint` when readable). */
function appProcesses(root: string): AppProcess[] {
  const windows = process.platform === "win32";
  const linux = process.platform === "linux";
  const darwin = process.platform === "darwin";
  const listed = windows
    ? Bun.spawnSync([
        "powershell",
        "-NoProfile",
        "-Command",
        WINDOWS_LISTING(root),
      ])
    : Bun.spawnSync(["ps", "-axo", "pid=,rss=,args="]);
  return listed.stdout
    .toString()
    .split(/\r?\n/)
    .flatMap((line) => {
      const [, pid, rss, command] = LISTING.exec(line) ?? [];
      if (pid === undefined || rss === undefined || command === undefined)
        return [];
      if (!windows && !command.startsWith(root)) return [];
      const pidNum = Number(pid);
      // ps gives kibibytes, Windows bytes; on Linux prefer PSS and on macOS prefer phys_footprint so shared CEF pages count once.
      const rawBytes = Number(rss) * (windows ? 1 : 1024);
      const rssBytes = linux
        ? linuxPssOrFallback(pidNum, rawBytes)
        : darwin
          ? macFootprintOrFallback(pidNum, rawBytes)
          : rawBytes;
      return [{ pid: pidNum, rssBytes, command }];
    });
}

/** Resolves to the first value `read` gives that is not null, polling every 100 ms; throws once `ms` has passed. */
export async function waitFor<T>(
  what: string,
  ms: number,
  read: () => T | null | Promise<T | null>,
): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(100)) {
    const value = await read();
    if (value !== null) return value;
  }
  throw new Error(`${what}: not within ${ms} ms`);
}

/** Starts the app's executable on `dataDir`; its spawn time and its exit code. */
export function launch(
  app: string,
  dataDir: string,
): { spawnedAt: number; exited: Promise<number> } {
  const spawnedAt = Date.now();
  const child = Bun.spawn([canonicalPath(app)], {
    env: { ...process.env, MANENT_DATA_DIR: dataDir },
    stdio: ["ignore", "inherit", "inherit"],
  });
  return { spawnedAt, exited: child.exited };
}

function killQuietly(pid: number, signal?: NodeJS.Signals): void {
  try {
    if (signal === undefined) process.kill(pid);
    else process.kill(pid, signal);
  } catch {
    // process already exited
  }
}

/** A clean quit where the system has one (SIGINT to the app's own process); elsewhere every process is ended. */
export async function quit(install: Install): Promise<void> {
  const running = appProcesses(install.root);
  const main = running.find(({ command }) =>
    command.endsWith(join("Resources", "main.js")),
  );
  if (process.platform !== "win32" && main !== undefined)
    killQuietly(main.pid, "SIGINT");
  else for (const { pid } of running) killQuietly(pid);
  try {
    await waitFor("the app quits", QUIT_WAIT_MS, () =>
      appProcesses(install.root).length === 0 ? true : null,
    );
  } catch {
    // a process that did not quit in time is ended, so the next launch starts alone
    for (const { pid } of appProcesses(install.root))
      killQuietly(pid, "SIGKILL");
  }
}

/** Resident memory summed over the desktop app's own processes (excluding the embedded demo cloud); null where the system lists none. */
export function idleRss(install: Install): number | null {
  return sumDesktopRss(appProcesses(install.root));
}

/** Ends the app's embedded cloud, so the node is offline while the app runs. */
export function stopCloud(install: Install): void {
  for (const { pid, command } of appProcesses(install.root))
    if (isEmbeddedCloudProcess(command)) killQuietly(pid, "SIGKILL");
}
