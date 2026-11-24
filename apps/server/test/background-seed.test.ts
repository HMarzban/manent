import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeSeedRun } from "../src/seed/adopt.ts";
import { stagingDirOf, startBackgroundSeed } from "../src/seed/background.ts";

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

test("stopping a seed this server did not start never signals the process its record names", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "manent-background-seed-"));
  dirs.push(dataDir);
  const other = Bun.spawn(["sleep", "30"]);
  const stagingDir = stagingDirOf(dataDir);
  await mkdir(stagingDir, { recursive: true });
  const now = Date.now();
  // a process that never ends, under a beat a second from lapsing, so that the stop's wait ends
  writeSeedRun(stagingDir, {
    pid: other.pid,
    startedAt: now,
    beatAt: now - 299_000,
    progress: { done: 3, total: 40 },
    failed: null,
    owner: process.pid,
  });
  const heard: number[][] = [];
  const seed = startBackgroundSeed({
    command: ["false"],
    dataDir,
    seedAt: now,
    owner: process.pid,
    onProgress: (done, total) => heard.push([done, total]),
    onDone: async () => {},
    onFailed: () => {},
  });
  await seed.stop();
  other.kill("SIGTERM");
  await other.exited;
  expect({
    heard,
    signal: other.signalCode,
    staging: await readdir(dirname(stagingDir)),
  }).toEqual({ heard: [[3, 40]], signal: "SIGTERM", staging: [] });
});
