// Where the desktop app keeps its data on each system.
import { posix, win32 } from "node:path";

/** `MANENT_DATA_DIR` when set; otherwise the folder each system gives an app's own data. An empty variable counts as unset. */
export function appDataDir(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  if (env.MANENT_DATA_DIR) return env.MANENT_DATA_DIR;
  if (platform === "darwin")
    return posix.join(home, "Library", "Application Support", "Manent");
  if (platform === "win32")
    return win32.join(
      env.APPDATA || win32.join(home, "AppData", "Roaming"),
      "Manent",
    );
  return posix.join(
    env.XDG_DATA_HOME || posix.join(home, ".local", "share"),
    "manent",
  );
}
