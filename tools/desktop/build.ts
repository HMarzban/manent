// bun tools/desktop/build.ts [--dev] [--open] [--channel stable|canary] [--version <semver>] [--update-url <url>]:
// stages the web app, the cloud, the seed and the notices, then builds this system's unsigned installer.
import { existsSync } from "node:fs";
import { copyFile, cp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { FoundDemo } from "../demo/cli.ts";
import { checkBunVersion } from "../demo/preflight.ts";
import { resetSeed } from "../demo/seed.ts";
import { desktopNotices } from "../notices.ts";
import {
  DEVKIT_MISMATCH,
  HUTCH_VERSION,
  devkitKey,
  installHutch,
  isDevkitPinned,
  runHutch,
} from "./devkit.ts";
import type { DevkitKey } from "./devkit.ts";

export const CHANNELS = ["stable", "canary"] as const;
export type Channel = (typeof CHANNELS)[number];

export const REPOSITORY = "HMarzban/manent";

/** Where a channel's update files are published: one fixed release per channel. */
export function updateBaseUrl(repository: string, channel: Channel): string {
  return `https://github.com/${repository}/releases/download/channel-${channel}/`;
}

export interface BuildPlan {
  stage: string;
  web: string;
  cloudEntry: string;
  seed: string;
  channel: Channel;
  version: string;
  /** A development build: no installer, the update check off. */
  dev: boolean;
  /** Launch the built app once it is built. */
  open: boolean;
  updateUrl: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;

const isChannel = (value: string): value is Channel =>
  CHANNELS.some((channel) => channel === value);

function readFlags(argv: readonly string[]): {
  dev?: boolean;
  open?: boolean;
  channel?: string;
  version?: string;
  "update-url"?: string;
} {
  try {
    return parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        dev: { type: "boolean" },
        open: { type: "boolean" },
        channel: { type: "string" },
        version: { type: "string" },
        "update-url": { type: "string" },
      },
    }).values;
  } catch (cause) {
    throw new RangeError(
      `the desktop build takes --dev, --open, --channel, --version and --update-url, not ${argv.join(" ")}`,
      { cause },
    );
  }
}

/** Throws RangeError for an unknown flag, a channel not in CHANNELS, or a version that is not three dot-separated integers. */
export function buildPlan(argv: readonly string[], root: string): BuildPlan {
  const flags = readFlags(argv);
  const channel = flags.channel ?? "stable";
  if (!isChannel(channel))
    throw new RangeError(`a channel is stable or canary, not ${channel}`);
  const version = flags.version ?? "0.0.0";
  if (!VERSION.test(version))
    throw new RangeError(
      `a version is three dot-separated integers, not ${version}`,
    );
  const stage = join(root, "apps/desktop/build/stage");
  return {
    stage,
    web: join(stage, "web"),
    cloudEntry: join(stage, "cloud", "main.js"),
    seed: join(stage, "seed"),
    channel,
    version,
    dev: flags.dev ?? false,
    open: flags.open ?? false,
    updateUrl: flags["update-url"] ?? updateBaseUrl(REPOSITORY, channel),
  };
}

type System = "darwin" | "win32" | "linux";

/** The copies a release publishes, named by version, channel, system and architecture. */
export const INSTALLER_NAMES: Readonly<
  Record<System, (version: string, channel: Channel, arch: string) => string>
> = Object.freeze({
  darwin: (version, channel, arch) =>
    `Manent-${version}-${channel}-macos-${arch}.dmg`,
  win32: (version, channel, arch) =>
    `Manent-${version}-${channel}-windows-${arch}-setup.zip`,
  linux: (version, channel, arch) =>
    `Manent-${version}-${channel}-linux-${arch}.tar.gz`,
});

/** Electrobun's own name for the installer it writes into artifacts/. */
export function electrobunInstaller(
  platform: System,
  channel: Channel,
  arch: string,
): string {
  const canary = channel === "canary";
  switch (platform) {
    case "darwin":
      return canary
        ? `canary-macos-${arch}-Manent-canary.dmg`
        : `macos-${arch}-Manent.dmg`;
    case "win32":
      return canary
        ? `canary-win-${arch}-Manent-Setup-canary.zip`
        : `win-${arch}-Manent-Setup.zip`;
    case "linux":
      return canary
        ? `canary-linux-${arch}-Manent-canary-Setup.tar.gz`
        : `linux-${arch}-Manent-Setup.tar.gz`;
  }
}

const SYSTEMS: readonly System[] = ["darwin", "win32", "linux"];
/** Electrobun's name for each system in its build and artifact names. */
const OS_NAMES: Readonly<Record<System, string>> = Object.freeze({
  darwin: "macos",
  win32: "win",
  linux: "linux",
});

function systemOf(platform: NodeJS.Platform): System {
  const system = SYSTEMS.find((each) => each === platform);
  if (system === undefined)
    throw new RangeError(`the desktop app is not built on ${platform}`);
  return system;
}

/** Runs `cmd` in `root` with `env` added and its output shown; throws when it does not exit 0. */
async function run(
  cmd: string[],
  root: string,
  env: Record<string, string>,
): Promise<void> {
  const child = Bun.spawn(cmd, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with ${code}`);
}

/** One bundle for Bun at `out`. */
async function bundle(entry: string, out: string): Promise<void> {
  const built = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    outdir: dirname(out),
    naming: basename(out),
  });
  if (!built.success)
    throw new Error(built.logs.map((log) => log.message).join("\n"));
}

/**
 * The server as one file, beside its checkpoint worker under the name the server opens it by, and
 * the script font it reads at start, where the bundled server's lookup finds it.
 */
async function stageCloud(root: string, entry: string): Promise<void> {
  const server = join(root, "apps/server");
  const cloudDir = dirname(entry);
  await bundle(join(server, "src/main.ts"), entry);
  await bundle(
    join(server, "src/checkpoint-worker.ts"),
    join(cloudDir, "checkpoint-worker.ts"),
  );
  const font = "@fontsource/courier-prime";
  await cp(
    dirname(Bun.resolveSync(`${font}/package.json`, server)),
    join(cloudDir, "node_modules", font),
    { recursive: true },
  );
}

/** Everything the app packs, under `plan.stage`; resolves to the toolkit notices that are missing. */
async function stageApp(plan: BuildPlan, root: string): Promise<string[]> {
  await rm(plan.stage, { recursive: true, force: true });
  await run([process.execPath, "apps/web/build.ts"], root, {
    MANENT_WEB_DIR: plan.web,
  });
  await stageCloud(root, plan.cloudEntry);
  await resetSeed(plan.seed);
  const versions = {
    protocol: PROTOCOL_VERSION,
    schema: SCHEMA_VERSION,
    engine: ENGINE_VERSION,
    table: TABLE_VERSION,
  };
  await writeFile(
    join(plan.stage, "build.json"),
    JSON.stringify({ repository: REPOSITORY, versions }),
  );
  const notices = desktopNotices(
    await readFile(join(plan.web, "third-party-notices.txt"), "utf8"),
    join(root, "tools/notices/desktop"),
  );
  await writeFile(join(plan.stage, "THIRD-PARTY-NOTICES.txt"), notices.text);
  return notices.missing;
}

/** The launcher, when it is not fetched yet, then Electrobun's build; false when a download is not the pinned one. */
async function buildApp(
  plan: BuildPlan,
  root: string,
  key: DevkitKey,
): Promise<{ ok: true; code: number } | { ok: false }> {
  const launcher = join(
    root,
    "apps/desktop/.hutch-cli",
    `hutch-v${HUTCH_VERSION}-${key}`,
  );
  if (!existsSync(launcher) && !(await installHutch(root, key)))
    return { ok: false };
  const code = await runHutch(
    root,
    key,
    ["build", `--env=${plan.dev ? "dev" : plan.channel}`],
    {
      MANENT_BUILD_VERSION: plan.version,
      MANENT_UPDATE_BASE_URL: plan.updateUrl,
    },
  );
  if (code !== 0) return { ok: true, code };
  return isDevkitPinned(root, key) ? { ok: true, code } : { ok: false };
}

/** Starts the built app's launcher on its own; the build does not wait for it. */
async function openBuilt(
  plan: BuildPlan,
  root: string,
  system: System,
): Promise<void> {
  const env = plan.dev ? "dev" : plan.channel;
  const dir = join(
    root,
    "apps/desktop/build",
    `${env}-${OS_NAMES[system]}-${process.arch}`,
  );
  const glob = new Bun.Glob(
    system === "win32" ? "**/launcher.exe" : "**/launcher",
  );
  for await (const path of glob.scan({ cwd: dir })) {
    Bun.spawn([join(dir, path)], {
      stdio: ["ignore", "ignore", "ignore"],
    }).unref();
    return;
  }
  throw new Error(`no launcher under ${dir}`);
}

/**
 * `make desktop`: a development build opened against the running demo, its data in `dataDir`.
 * Throws the terminal sentence when Bun is too old or no demo answers; resolves to the build's exit code.
 */
export async function buildAgainst(
  demo: FoundDemo | null,
  dataDir: string,
): Promise<number> {
  const version = checkBunVersion(Bun.version);
  if (!version.ok) throw new Error(version.message);
  if (!demo?.live)
    throw new Error(
      "Manent is not running. Run make demo first, then make desktop.",
    );
  const build = Bun.spawn(
    [process.execPath, import.meta.path, "--dev", "--open"],
    {
      env: {
        ...process.env,
        MANENT_CLOUD_URL: demo.run.appUrl,
        MANENT_DATA_DIR: dataDir,
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  return build.exited;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  try {
    const plan = buildPlan(process.argv.slice(2), root);
    const system = systemOf(process.platform);
    const key = devkitKey(process.platform, process.arch);
    const missing = await stageApp(plan, root);
    if (missing.length > 0)
      console.error(`no licence text for ${missing.join(", ")}`);
    const built = await buildApp(plan, root, key);
    if (!built.ok) {
      console.error(DEVKIT_MISMATCH);
      process.exit(1);
    }
    if (built.code !== 0) process.exit(built.code);
    if (!plan.dev) {
      const artifacts = join(root, "apps/desktop/artifacts");
      await copyFile(
        join(
          artifacts,
          electrobunInstaller(system, plan.channel, process.arch),
        ),
        join(
          artifacts,
          INSTALLER_NAMES[system](plan.version, plan.channel, process.arch),
        ),
      );
    }
    if (plan.open) await openBuilt(plan, root, system);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
