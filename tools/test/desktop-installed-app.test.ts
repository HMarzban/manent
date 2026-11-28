import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  installOf,
  isEmbeddedCloudProcess,
  parseLinuxPssBytes,
  parseMacFootprintBytes,
  sumDesktopRss,
} from "../desktop/installed-app.ts";
import { installedVersion } from "../desktop/smoke.ts";

test("installOf resolves symlinked install roots to their canonical path and falls back to resolve when absent", () => {
  const base = mkdtempSync(join(tmpdir(), "manent-installed-app-"));
  try {
    const realParent = join(base, "real");
    const linkParent = join(base, "link");
    const bundle =
      process.platform === "darwin"
        ? join(realParent, "Manent-canary.app")
        : join(realParent, "Manent-canary");
    const binDir =
      process.platform === "darwin"
        ? join(bundle, "Contents", "MacOS")
        : join(bundle, "bin");
    mkdirSync(binDir, { recursive: true });
    symlinkSync(realParent, linkParent);

    const linkedExecutable =
      process.platform === "darwin"
        ? join(linkParent, "Manent-canary.app", "Contents", "MacOS", "launcher")
        : join(linkParent, "Manent-canary", "bin", "launcher");
    const install = installOf(linkedExecutable);
    const expectedRoot = realpathSync(bundle);

    expect(install.root).toBe(expectedRoot);
    expect(install.resources).toBe(
      process.platform === "darwin"
        ? join(expectedRoot, "Contents", "Resources")
        : join(expectedRoot, "Resources"),
    );

    const missingExecutable =
      process.platform === "darwin"
        ? join(
            base,
            "missing",
            "Manent-canary.app",
            "Contents",
            "MacOS",
            "launcher",
          )
        : join(base, "missing", "Manent-canary", "bin", "launcher");
    const missing = installOf(missingExecutable);
    expect(missing.root).toBe(
      process.platform === "darwin"
        ? resolve(base, "missing", "Manent-canary.app")
        : resolve(base, "missing", "Manent-canary"),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("sumDesktopRss excludes the embedded demo cloud server and its background seed worker", () => {
  const root = "/private/tmp/Manent-canary.app";
  const processes = [
    {
      pid: 1,
      rssBytes: 2_000_000,
      command: `${root}/Contents/MacOS/launcher`,
    },
    {
      pid: 2,
      rssBytes: 310_000_000,
      command: `${root}/Contents/MacOS/bun ${root}/Contents/Resources/main.js`,
    },
    {
      pid: 3,
      rssBytes: 180_000_000,
      command: `${root}/Contents/Frameworks/bun Helper.app/Contents/MacOS/bun Helper --type=renderer`,
    },
    {
      pid: 4,
      rssBytes: 160_000_000,
      command: `${root}/Contents/MacOS/bun --no-orphans ${root}/Contents/Resources/app/cloud/main.js`,
    },
    {
      pid: 5,
      rssBytes: 1_280_000_000,
      command: `${root}/Contents/MacOS/bun ${root}/Contents/Resources/app/cloud/main.js seed --phase background --data-dir /tmp/cloud`,
    },
  ];

  expect(isEmbeddedCloudProcess(processes[1]!.command)).toBe(false);
  expect(isEmbeddedCloudProcess(processes[3]!.command)).toBe(true);
  expect(isEmbeddedCloudProcess(processes[4]!.command)).toBe(true);
  expect(sumDesktopRss(processes)).toBe(492_000_000);
  expect(sumDesktopRss([processes[3]!, processes[4]!])).toBeNull();
});

test("parseLinuxPssBytes extracts proportional set size in bytes from smaps_rollup", () => {
  const sample = [
    "55e0c0000000-7fff00000000 ---p 00000000 00:00 0                          [rollup]",
    "Rss:              245760 kB",
    "Pss:               98304 kB",
    "Shared_Clean:     147456 kB",
  ].join("\n");
  expect(parseLinuxPssBytes(sample)).toBe(98_304 * 1024);
  expect(parseLinuxPssBytes("Rss: 1234 kB\n")).toBeNull();
});

test("parseMacFootprintBytes extracts physical footprint in bytes from footprint output", () => {
  expect(
    parseMacFootprintBytes(
      "bun [1234]: 64-bit    Footprint: 48234496 B (16384 bytes per page)\n",
    ),
  ).toBe(48_234_496);
  expect(
    parseMacFootprintBytes(
      "bun Helper [1235]: 64-bit    Footprint: 2064 KB (16384 bytes per page)\n",
    ),
  ).toBe(2064 * 1024);
  expect(
    parseMacFootprintBytes(
      "Manent [1236]: 64-bit    Footprint: 142.5 MB (16384 bytes per page)\n",
    ),
  ).toBe(Math.round(142.5 * 1024 * 1024));
  expect(parseMacFootprintBytes("no footprint line here\n")).toBeNull();
});

test("installedVersion reads the version field from Resources/version.json and returns null when absent", () => {
  const base = mkdtempSync(join(tmpdir(), "manent-version-"));
  try {
    expect(installedVersion(base)).toBeNull();
    writeFileSync(
      join(base, "version.json"),
      JSON.stringify({ version: "0.0.2", channel: "canary" }),
    );
    expect(installedVersion(base)).toBe("0.0.2");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
