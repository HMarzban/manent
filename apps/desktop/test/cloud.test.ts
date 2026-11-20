import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cloudCommand, startEmbeddedCloud } from "../src/cloud.ts";

const SERVER_MAIN = join(import.meta.dir, "../../server/src/main.ts");
const SEED_ID = "0193b1f4-2c1e-7a00-8000-0000000000e1";
const TIMEOUT = { timeout: 40_000 };

const made: string[] = [];

/** A fresh directory holding `files` (path → text). */
async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "manent-cloud-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

afterAll(async () => {
  await Promise.all(made.map((dir) => rm(dir, { recursive: true })));
});

function seed(seedId: string): Record<string, string> {
  return { "data/seed.json": JSON.stringify({ seedId }) };
}

/** Binds 127.0.0.1:0, reads the port the system gave, and lets it go. */
function freePort(): Promise<number> {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return Promise.resolve(port);
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    // a refused connection is the answer this asks for
    return false;
  }
}

async function demoBody(url: string): Promise<unknown> {
  return (await fetch(url + "/api/demo")).json();
}

test("the embedded cloud runs the server with a Bun that exits with the app", () => {
  expect(cloudCommand("/apps/Manent/bun", "/apps/Manent/server.js")).toEqual([
    "/apps/Manent/bun",
    "--no-orphans",
    "/apps/Manent/server.js",
  ]);
});

test(
  "the embedded cloud starts from the packaged seed and keeps its data",
  async () => {
    const dataDir = join(await tree({}), "cloud");
    const webDir = await tree({ "index.html": "<!doctype html>" });
    const options = {
      execPath: process.execPath,
      entry: SERVER_MAIN,
      dataDir,
      webDir,
      seedDir: await tree(seed(SEED_ID)),
      freePort,
      fetch,
    };
    const cloud = await startEmbeddedCloud(options);
    expect(await demoBody(cloud.url)).toMatchObject({
      demo: true,
      seedId: SEED_ID,
    });
    await cloud.stop();
    expect(await reachable(cloud.url + "/health")).toBe(false);

    const again = await startEmbeddedCloud({
      ...options,
      seedDir: await tree(seed("0193b1f4-2c1e-7a00-8000-0000000000e2")),
    });
    expect(await demoBody(again.url)).toMatchObject({ seedId: SEED_ID });
    await again.stop();
  },
  TIMEOUT,
);

test(
  "a cloud that cannot start is reported, never waited on for ever",
  async () => {
    const entry = join(
      await tree({ "exit.ts": "process.exit(3);\n" }),
      "exit.ts",
    );
    let chosen = 0;
    const started = startEmbeddedCloud({
      execPath: process.execPath,
      entry,
      dataDir: await tree({}),
      webDir: await tree({}),
      seedDir: await tree(seed(SEED_ID)),
      freePort: () => {
        chosen += 1;
        return freePort();
      },
      fetch,
    });
    await expect(started).rejects.toThrow(
      "the embedded cloud exited with code 3 before it answered, 3 times",
    );
    expect(chosen).toBe(3);
  },
  TIMEOUT,
);

test(
  "a port taken between choosing and starting is tried again on another",
  async () => {
    const holder = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {} },
    });
    const free = await freePort();
    const ports = [holder.port, free];
    try {
      const cloud = await startEmbeddedCloud({
        execPath: process.execPath,
        entry: SERVER_MAIN,
        dataDir: await tree({}),
        webDir: await tree({}),
        seedDir: await tree(seed(SEED_ID)),
        freePort: () => Promise.resolve(ports.shift() ?? free),
        fetch,
      });
      expect(cloud.url).toBe(`http://127.0.0.1:${free}`);
      expect(ports).toEqual([]);
      await cloud.stop();
    } finally {
      holder.stop(true);
    }
  },
  TIMEOUT,
);

test(
  "the embedded cloud takes none of the app's own Manent settings",
  async () => {
    const before = process.env.MANENT_LAN_HOST;
    process.env.MANENT_LAN_HOST = "not an address";
    try {
      const cloud = await startEmbeddedCloud({
        execPath: process.execPath,
        entry: SERVER_MAIN,
        dataDir: await tree({}),
        webDir: await tree({}),
        seedDir: await tree(seed(SEED_ID)),
        freePort,
        fetch,
      });
      expect(await demoBody(cloud.url)).toMatchObject({ seedId: SEED_ID });
      await cloud.stop();
    } finally {
      if (before === undefined) delete process.env.MANENT_LAN_HOST;
      else process.env.MANENT_LAN_HOST = before;
    }
  },
  TIMEOUT,
);

test(
  "a seed copy cut short is never taken for a finished one",
  async () => {
    const dataDir = join(await tree({}), "cloud");
    // what a launch killed mid-copy leaves: the marker without the rest
    await mkdir(join(`${dataDir}.partial`, "data"), { recursive: true });
    await writeFile(
      join(`${dataDir}.partial`, "data", "seed.json"),
      JSON.stringify({ seedId: "0193b1f4-2c1e-7a00-8000-0000000000e2" }),
    );
    const cloud = await startEmbeddedCloud({
      execPath: process.execPath,
      entry: SERVER_MAIN,
      dataDir,
      webDir: await tree({}),
      seedDir: await tree({ ...seed(SEED_ID), "data/beside.txt": "kept" }),
      freePort,
      fetch,
    });
    expect(await demoBody(cloud.url)).toMatchObject({ seedId: SEED_ID });
    await cloud.stop();
    expect(await readdir(dirname(dataDir))).toEqual(["cloud"]);
    expect(await Bun.file(join(dataDir, "data", "beside.txt")).text()).toBe(
      "kept",
    );
  },
  TIMEOUT,
);
