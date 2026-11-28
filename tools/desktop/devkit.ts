// The desktop toolkit, pinned by checksum: bun tools/desktop/devkit.ts fetches the Hutch launcher for this
// system, lets it fetch the Electrobun core and Chromium into apps/desktop/.hutch/, and checks what it fetched.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

export const HUTCH_VERSION = "0.29.0";

export const DEVKIT_KEYS = [
  "macos-arm64",
  "macos-x64",
  "linux-x64",
  "linux-arm64",
  "windows-x64",
  "windows-arm64",
] as const;
export type DevkitKey = (typeof DEVKIT_KEYS)[number];

/** Of each system's launcher archive, as the toolkit's release index gives it. */
export const HUTCH_SHA256: Readonly<Record<DevkitKey, string>> = Object.freeze({
  "macos-arm64":
    "f081abca6d08d9d862577e77365f3cb5437e65858ca45a27173505e4e2345994",
  "macos-x64":
    "a8d0b5c9a330f02b9fe11222dadd1a4590f7d6f77e3f8f301fc9b5c360528b65",
  "linux-x64":
    "4aa3c5c7fa24898d8227b087dd393eb2a1463658f0d87e23a72cfe611af83b75",
  "linux-arm64":
    "9897e36548ef25c40cd8038ab1c5e35b561c603a6d8864b6563ad78d507e42db",
  "windows-x64":
    "5689e643748c6569f0d40e702300555ca08c93790fe69f4327797279b2a75213",
  "windows-arm64":
    "4d988c6f9d8268335b2d1743d78f62a34ff6a7f5ea40825bfa8e901f03fc9c97",
});

export const ELECTROBUN_CORE_SHA256: Readonly<Record<DevkitKey, string>> =
  Object.freeze({
    "macos-arm64":
      "99813cdc64be5aa743b2d620dcf99e77f240dce53e01dc95aa3f9c7e00705d49",
    "macos-x64":
      "3344a37ad19fabfa0894187d16375ce619400ac38e7320b296c61bc94b06bdb1",
    "linux-x64":
      "06afade9cf1cf620a705b5fbbf7c09cd89719f04424453f7f302bcf52d1be1f0",
    "linux-arm64":
      "4f3e636565bfe97afc77cc0e0ae1ad37a26a25f410cd43c91b9a7b2cca63697d",
    "windows-x64":
      "2cea374ddea0c1ae52da5cc6e6f5c8b97844a49aad702330fffb0cdd705a772f",
    "windows-arm64":
      "1998239f19c0d447cbecd3c6e4b96ceb54fae685d0d08c7b2d13a9c82d1e9103",
  });

export const ELECTROBUN_CEF_SHA256: Readonly<Record<DevkitKey, string>> =
  Object.freeze({
    "macos-arm64":
      "aa04393159f57b598d44bc164da1662b530a91b382f60d5fd19691a2747b39ff",
    "macos-x64":
      "4439e2ce2a082071d0177c532f3fa76ec6381e823d4acae47738bda6367cc82a",
    "linux-x64":
      "b573038f55f6014c5faabdb1aaa6cb2243b20d63fc464033585a417ae59039c1",
    "linux-arm64":
      "ae2f74879aea9c274d8ea445b68ee75750b00a45121838efa6a2846d64d17b72",
    "windows-x64":
      "7f7db93262b9601521f47b702b776946e6e71895c3f8ec4d57bb4ab2d7686c32",
    "windows-arm64":
      "1d8286504afaf25216d8b7cb1e95a521162ee2e7820443156b5db2d606e0a991",
  });

const SYSTEMS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
};

const isDevkitKey = (value: string): value is DevkitKey =>
  DEVKIT_KEYS.some((key) => key === value);

/** Throws RangeError for a system or an architecture the toolkit is not released for. */
export function devkitKey(platform: NodeJS.Platform, arch: string): DevkitKey {
  const key = `${SYSTEMS[platform] ?? platform}-${arch}`;
  if (!isDevkitKey(key))
    throw new RangeError(`the desktop toolkit is not released for ${key}`);
  return key;
}

export function hutchUrl(key: DevkitKey): string {
  return `https://github.com/blackboardsh/electrobun/releases/download/v2.0.6/electrobun-hutch-${key}.tar.gz`;
}

async function sha256Of(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

/**
 * Relative `tar` arguments executed from `archive`'s parent directory so MSYS/GNU `tar` on Windows
 * never mistakes a drive letter like `D:\...` for a remote host.
 */
export function tarExtractCommand(
  archive: string,
  dest: string,
  pathMod: Pick<
    typeof import("node:path"),
    "basename" | "dirname" | "relative" | "resolve"
  > = {
    basename,
    dirname,
    relative,
    resolve,
  },
): { cmd: string[]; cwd: string } {
  const resolvedArchive = pathMod.resolve(archive);
  const resolvedDest = pathMod.resolve(dest);
  const cwd = pathMod.dirname(resolvedArchive);
  const archiveArg = pathMod.basename(resolvedArchive);
  const destArg =
    pathMod.relative(cwd, resolvedDest).replaceAll("\\", "/") || ".";
  return { cmd: ["tar", "-xzf", archiveArg, "-C", destArg], cwd };
}

/**
 * Downloads `url` to `<into>.download` and unpacks it into `into`, replacing what was there, when
 * its SHA-256 is `sha256`. Another SHA-256 deletes the download, leaves `into` as it was and
 * throws RangeError; a download that does not answer 200 throws Error.
 */
export async function fetchHutch(options: {
  url: string;
  sha256: string;
  into: string;
  fetch: typeof fetch;
}): Promise<void> {
  const { url, sha256 } = options;
  const into = resolve(options.into);
  const download = `${into}.download`;
  const response = await options.fetch(url);
  if (!response.ok)
    throw new Error(
      `the launcher download answered ${response.status}: ${url}`,
    );
  try {
    await Bun.write(download, response);
    if ((await sha256Of(download)) !== sha256)
      throw new RangeError("hutch checksum mismatch");
    await rm(into, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    await mkdir(into, { recursive: true });
    const { cmd, cwd } = tarExtractCommand(download, into);
    const tar = Bun.spawn(cmd, {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await tar.exited;
    if (code !== 0) throw new Error(`tar exited with ${code} on ${download}`);
  } finally {
    await rm(download, { force: true, maxRetries: 10, retryDelay: 100 });
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The objects of a dependencies lock; null when the text is not one. */
function lockObjects(lockText: string): Record<string, unknown>[] | null {
  let lock: unknown;
  try {
    lock = JSON.parse(lockText);
  } catch {
    // not JSON: no lock the toolkit wrote
    return null;
  }
  if (!isRecord(lock) || !Array.isArray(lock.objects)) return null;
  return lock.objects.filter(isRecord);
}

/**
 * The lock in which Hutch records the SHA-256 of the core and of Chromium it fetched for `key`: both
 * must equal this file's records. A missing record differs from every recorded one.
 */
export function checkDevkitLock(
  lockText: string,
  key: DevkitKey,
): { ok: true } | { ok: false; reason: "core" | "cef" | "unreadable" } {
  const objects = lockObjects(lockText);
  if (objects === null) return { ok: false, reason: "unreadable" };
  const recorded = (type: string, field: string): unknown =>
    objects.find((each) => each.type === type && each.platform === key)?.[
      field
    ];
  if (recorded("electrobun", "coreSha256") !== ELECTROBUN_CORE_SHA256[key])
    return { ok: false, reason: "core" };
  if (recorded("electrobun-cef", "cefSha256") !== ELECTROBUN_CEF_SHA256[key])
    return { ok: false, reason: "cef" };
  return { ok: true };
}

/** Paths are from the repository root; the command runs in apps/desktop. */
export function hutchCommand(
  key: DevkitKey,
  args: readonly string[],
): { cmd: string[]; env: Record<string, string> } {
  return {
    cmd: [
      `apps/desktop/.hutch-cli/hutch-v${HUTCH_VERSION}-${key}/bin/hutch`,
      "electrobun",
      ...args,
    ],
    env: { HUTCH_HOME: "apps/desktop/.hutch-home" },
  };
}

/** Where Hutch records the checksums of what it fetched, from apps/desktop. */
const DEVKIT_LOCK = ".hutch/dependencies.lock";

/** Printed, and the script exits 1, when a download is not the pinned one. */
export const DEVKIT_MISMATCH =
  "The desktop toolkit download does not match its recorded checksum.";

/** Runs Hutch in `<root>/apps/desktop` with `env` added; resolves to its exit code. */
export function runHutch(
  root: string,
  key: DevkitKey,
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<number> {
  const { cmd, env: paths } = hutchCommand(key, args);
  const [launcher = "", ...rest] = cmd;
  // each of Hutch's variables is a path from the repository root
  const hutchEnv = Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [name, join(root, path)]),
  );
  const child = Bun.spawn([join(root, launcher), ...rest], {
    cwd: join(root, "apps/desktop"),
    env: { ...process.env, ...env, ...hutchEnv },
    stdio: ["inherit", "inherit", "inherit"],
  });
  return child.exited;
}

/** Whether the core and Chromium Hutch recorded under `<root>/apps/desktop` are the pinned ones. */
export function isDevkitPinned(root: string, key: DevkitKey): boolean {
  const path = join(root, "apps/desktop", DEVKIT_LOCK);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return checkDevkitLock(text, key).ok;
}

/** Fetches the launcher for `key` into apps/desktop/.hutch-cli/; false when the download is not the pinned one. */
export async function installHutch(
  root: string,
  key: DevkitKey,
): Promise<boolean> {
  try {
    await fetchHutch({
      url: hutchUrl(key),
      sha256: HUTCH_SHA256[key],
      into: join(root, "apps/desktop/.hutch-cli"),
      fetch,
    });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  const key = devkitKey(process.platform, process.arch);
  if (!(await installHutch(root, key))) {
    console.error(DEVKIT_MISMATCH);
    process.exit(1);
  }
  const code = await runHutch(root, key, ["prepare"]);
  if (code !== 0) process.exit(code);
  if (!isDevkitPinned(root, key)) {
    console.error(DEVKIT_MISMATCH);
    process.exit(1);
  }
}
