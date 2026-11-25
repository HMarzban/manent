import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  installOf,
  isEmbeddedCloudProcess,
  sumDesktopRss,
} from "../desktop/installed-app.ts";

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
