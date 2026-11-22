// The installed desktop app as the smoke drives it from outside: where it lives, its processes judged by
// executable path (the launcher can outlive the app), launching it, quitting it and measuring it.
import { dirname, join } from "node:path";

const QUIT_WAIT_MS = 15_000;

export interface Install {
  root: string;
  resources: string;
}

/** macOS: the `.app` bundle; elsewhere the folder above the executable's own. */
export function installOf(app: string): Install {
  if (process.platform !== "darwin") {
    const root = dirname(dirname(app));
    return { root, resources: join(root, "Resources") };
  }
  const root = app.slice(0, app.lastIndexOf(".app") + ".app".length);
  return { root, resources: join(root, "Contents", "Resources") };
}

interface AppProcess {
  pid: number;
  rssBytes: number;
  command: string;
}

const LISTING = new RegExp("^\\s*(\\d+)\\s+(\\d+)\\s+(.+)$");
const WINDOWS_LISTING = (root: string): string =>
  `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${root.replaceAll("'", "''")}') } | ForEach-Object { "$($_.ProcessId) $($_.WorkingSetSize) $($_.CommandLine)" }`;

/** Every process whose executable is inside `root`; resident memory in bytes. */
function appProcesses(root: string): AppProcess[] {
  const windows = process.platform === "win32";
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
      // ps gives kibibytes, Windows bytes
      const rssBytes = Number(rss) * (windows ? 1 : 1024);
      return [{ pid: Number(pid), rssBytes, command }];
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
  const child = Bun.spawn([app], {
    env: { ...process.env, MANENT_DATA_DIR: dataDir },
    stdio: ["ignore", "inherit", "inherit"],
  });
  return { spawnedAt, exited: child.exited };
}

/** A clean quit where the system has one (SIGINT to the app's own process); elsewhere every process is ended. */
export async function quit(install: Install): Promise<void> {
  const running = appProcesses(install.root);
  const main = running.find(({ command }) =>
    command.endsWith(join("Resources", "main.js")),
  );
  if (process.platform !== "win32" && main !== undefined)
    process.kill(main.pid, "SIGINT");
  else for (const { pid } of running) process.kill(pid);
  try {
    await waitFor("the app quits", QUIT_WAIT_MS, () =>
      appProcesses(install.root).length === 0 ? true : null,
    );
  } catch {
    // a process that did not quit in time is ended, so the next launch starts alone
    for (const { pid } of appProcesses(install.root))
      process.kill(pid, "SIGKILL");
  }
}

/** Resident memory summed over the app's processes; null where the system lists none. */
export function idleRss(install: Install): number | null {
  const running = appProcesses(install.root);
  return running.length === 0
    ? null
    : running.reduce((sum, { rssBytes }) => sum + rssBytes, 0);
}

/** Ends the app's embedded cloud, so the node is offline while the app runs. */
export function stopCloud(install: Install): void {
  for (const { pid, command } of appProcesses(install.root))
    if (command.endsWith(join("app", "cloud", "main.js")))
      process.kill(pid, "SIGKILL");
}
