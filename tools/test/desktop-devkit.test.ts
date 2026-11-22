import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import {
  DEVKIT_KEYS,
  ELECTROBUN_CEF_SHA256,
  ELECTROBUN_CORE_SHA256,
  HUTCH_SHA256,
  HUTCH_VERSION,
  checkDevkitLock,
  devkitKey,
  fetchHutch,
  hutchCommand,
  hutchUrl,
} from "../desktop/devkit.ts";

const trees = createTempTrees("manent-devkit-");
afterAll(() => trees.removeAll());

const KEYS = [
  "macos-arm64",
  "macos-x64",
  "linux-x64",
  "linux-arm64",
  "windows-x64",
  "windows-arm64",
];

const sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

/** A fetch that answers every request with `bytes`. */
const answering = (bytes: Uint8Array<ArrayBuffer>): typeof fetch =>
  Object.assign(async () => new Response(bytes), {
    preconnect: fetch.preconnect,
  });

/** A gzipped tar of one launcher file, laid out as the release's archive is. */
async function launcherArchive(): Promise<Uint8Array<ArrayBuffer>> {
  const dir = await trees.tree({
    "hutch-v0.29.0-macos-arm64/bin/hutch": "#!/bin/sh\n",
    "hutch-v0.29.0-macos-arm64/hutch-release.json": "{}",
  });
  const tar = Bun.spawn(["tar", "-czf", "-", "hutch-v0.29.0-macos-arm64"], {
    cwd: dir,
    stdout: "pipe",
  });
  const bytes = new Uint8Array(await new Response(tar.stdout).arrayBuffer());
  expect(await tar.exited).toBe(0);
  return bytes;
}

/** The dependencies lock as Hutch writes it, with the core's and Chromium's checksums of `key`. */
function lockText(core: string, cef: string, key = "macos-arm64"): string {
  return JSON.stringify({
    schemaVersion: 1,
    kind: "hutch-project-dependencies",
    objects: [
      { type: "electrobun", platform: key, coreSha256: core },
      { type: "electrobun-cef", platform: key, cefSha256: cef },
    ],
  });
}

test("the toolkit is pinned for every system it is built on", () => {
  expect([
    HUTCH_VERSION,
    [...DEVKIT_KEYS],
    Object.keys(HUTCH_SHA256),
    Object.keys(ELECTROBUN_CORE_SHA256),
    Object.keys(ELECTROBUN_CEF_SHA256),
  ]).toEqual(["0.29.0", KEYS, KEYS, KEYS, KEYS]);
  expect(HUTCH_SHA256["macos-arm64"]).toBe(
    "f081abca6d08d9d862577e77365f3cb5437e65858ca45a27173505e4e2345994",
  );
  expect([
    devkitKey("darwin", "arm64"),
    devkitKey("win32", "x64"),
    devkitKey("linux", "arm64"),
  ]).toEqual(["macos-arm64", "windows-x64", "linux-arm64"]);
  expect(() => devkitKey("freebsd", "x64")).toThrow(RangeError);
  expect(() => devkitKey("linux", "ia32")).toThrow(RangeError);
});

test("the launcher comes from the toolkit's release and runs with its own home", () => {
  expect(hutchUrl("linux-x64")).toBe(
    "https://github.com/blackboardsh/electrobun/releases/download/v2.0.6/electrobun-hutch-linux-x64.tar.gz",
  );
  expect(hutchCommand("macos-arm64", ["build", "--env=dev"])).toEqual({
    cmd: [
      "apps/desktop/.hutch-cli/hutch-v0.29.0-macos-arm64/bin/hutch",
      "electrobun",
      "build",
      "--env=dev",
    ],
    env: { HUTCH_HOME: "apps/desktop/.hutch-home" },
  });
});

test("a launcher whose checksum differs is refused and nothing is kept", async () => {
  const into = join(await trees.tree({}), "cli");
  const bytes = await launcherArchive();
  const refused: unknown = await fetchHutch({
    url: hutchUrl("macos-arm64"),
    sha256: sha256(new Uint8Array([1, 2, 3])),
    into,
    fetch: answering(bytes),
  }).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(RangeError);
  expect(refused).toEqual(new RangeError("hutch checksum mismatch"));
  expect([existsSync(into), existsSync(`${into}.download`)]).toEqual([
    false,
    false,
  ]);
});

test("a matching launcher is unpacked", async () => {
  const into = join(
    await trees.tree({ "cli/old.txt": "left by a run" }),
    "cli",
  );
  const bytes = await launcherArchive();
  await fetchHutch({
    url: hutchUrl("macos-arm64"),
    sha256: sha256(bytes),
    into,
    fetch: answering(bytes),
  });
  expect([
    existsSync(join(into, "hutch-v0.29.0-macos-arm64/bin/hutch")),
    existsSync(join(into, "old.txt")),
    existsSync(`${into}.download`),
  ]).toEqual([true, false, false]);
});

test("the core and Chromium the toolkit fetched must be the pinned ones", () => {
  const core = ELECTROBUN_CORE_SHA256["macos-arm64"];
  const cef = ELECTROBUN_CEF_SHA256["macos-arm64"];
  const other = "0".repeat(64);
  expect([
    checkDevkitLock(lockText(core, cef), "macos-arm64"),
    checkDevkitLock(lockText(other, cef), "macos-arm64"),
    checkDevkitLock(lockText(core, other), "macos-arm64"),
    checkDevkitLock(lockText(core, cef), "linux-x64"),
    checkDevkitLock("{", "macos-arm64"),
    checkDevkitLock("[]", "macos-arm64"),
  ]).toEqual([
    { ok: true },
    { ok: false, reason: "core" },
    { ok: false, reason: "cef" },
    { ok: false, reason: "core" },
    { ok: false, reason: "unreadable" },
    { ok: false, reason: "unreadable" },
  ]);
});
