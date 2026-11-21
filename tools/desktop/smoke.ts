// bun tools/desktop/smoke.ts --app <installed executable> [--expect-version <v>] [--update-from <dir>]: launches the
// installed app on a fresh data directory, checks it through its local node with a headless sync client, and
// writes results/desktop-smoke-<platform>.json. Exits 1 on any failed check or hard fail.
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { scriptBody } from "@manent/crdt";
import { readNodeFile } from "@manent/local-node";
import type { NodeFile } from "@manent/local-node";
import {
  idleRss,
  installOf,
  launch,
  quit,
  stopCloud,
  waitFor,
} from "./installed-app.ts";
import type { Install } from "./installed-app.ts";
import {
  answersHealth,
  openClient,
  pageVersion,
  syncSamsScripts,
  typeLine,
  until,
  updateReady,
} from "./node-client.ts";

export type Verdict = "within" | "over_budget" | "hard_fail";

export interface SmokeResult {
  platform: string;
  /** The version the installed app reported at its first timed launch. */
  version: string;
  /** From the node listening to the page's first frame. */
  firstFrameMs: number;
  /** From the spawn to the page's first frame. */
  coldStartMs: number;
  /** Summed over the app's processes 30 s after the first frame; null where the system gives no reading. */
  idleRssBytes: number | null;
  coldStart: Verdict;
  idleMemory: Verdict | null;
  saved: boolean;
  synced: boolean;
  secondInstanceDeferred: boolean;
  offlineSaved: boolean;
  /** null when no update was offered (no --update-from). */
  updatedWithOutbox: boolean | null;
  noticesBeside: boolean;
}

const judge = (value: number, budget: number, hardFail: number): Verdict =>
  value <= budget ? "within" : value <= hardFail ? "over_budget" : "hard_fail";

/** Both budgets are estimates until the benchmark measures them: only a hard fail fails the smoke. */
export function coldStartVerdict(ms: number): Verdict {
  return judge(ms, 2_000, 4_000);
}

export function idleMemoryVerdict(bytes: number): Verdict {
  return judge(bytes, 400_000_000, 700_000_000);
}

export function smokeVerdict(result: SmokeResult): 0 | 1 {
  const checks = [
    result.saved,
    result.synced,
    result.secondInstanceDeferred,
    result.offlineSaved,
    result.updatedWithOutbox !== false,
    result.noticesBeside,
  ];
  const hardFail =
    result.coldStart === "hard_fail" || result.idleMemory === "hard_fail";
  return checks.every(Boolean) && !hardFail ? 0 : 1;
}

/** The loopback address the smoke builds' update URL names. */
const UPDATE_PORT = 47471;
const NODE_WAIT_MS = 60_000;
const SECOND_INSTANCE_MS = 10_000;
const IDLE_AFTER_MS = 30_000;
const SYNC_WAIT_MS = 30_000;
const OFFLINE_WAIT_MS = 5_000;
const UPDATE_WAIT_MS = 300_000;

/** The node's file once the page has drawn its first frame. */
const firstFrame = (
  dataDir: string,
): Promise<NodeFile & { firstFrameAt: number }> =>
  waitFor("the first frame", NODE_WAIT_MS, () => {
    const node = readNodeFile(dataDir);
    if (node === null || node.firstFrameAt === null) return null;
    return { ...node, firstFrameAt: node.firstFrameAt };
  });

/** The version the update files in `dir` carry, read from its update manifest. */
function offeredVersion(dir: string): string {
  const manifest = readdirSync(dir).find((name) =>
    name.endsWith("-update.json"),
  );
  if (manifest === undefined) throw new Error(`no update manifest in ${dir}`);
  const value: unknown = JSON.parse(readFileSync(join(dir, manifest), "utf8"));
  const version =
    typeof value === "object" && value !== null && "version" in value
      ? value.version
      : null;
  if (typeof version !== "string")
    throw new Error(`${manifest} names no version`);
  return version;
}

/** Serves `dir` flat on the update port until stopped. */
function serveUpdates(dir: string): { stop(): Promise<void> } {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: UPDATE_PORT,
    async fetch(request) {
      const file = Bun.file(join(dir, basename(new URL(request.url).pathname)));
      return (await file.exists())
        ? new Response(file)
        : new Response("", { status: 404 });
    },
  });
}

/** The update: checked for while running, applied at the next launch, and the waiting edit then synced. */
async function updated(
  app: string,
  install: Install,
  dataDir: string,
  from: string,
  waiting: { docId: string; line: string },
): Promise<boolean> {
  const server = serveUpdates(from);
  try {
    const running = readNodeFile(dataDir);
    if (running === null || !(await updateReady(running, UPDATE_WAIT_MS)))
      return false;
    await quit(install);
    void launch(app, dataDir).exited;
    const version = offeredVersion(from);
    const node = await waitFor("the updated app", UPDATE_WAIT_MS, async () => {
      const file = readNodeFile(dataDir);
      return file !== null &&
        (await answersHealth(file)) &&
        (await pageVersion(file)) === version
        ? file
        : null;
    });
    const client = await openClient(node);
    const handle = await client.open(waiting.docId);
    const synced = await until(handle, (status) => status.synced, SYNC_WAIT_MS);
    const kept = JSON.stringify(
      scriptBody(handle.doc()).materialize(),
    ).includes(waiting.line);
    await client.close();
    return synced && kept;
  } finally {
    await server.stop();
  }
}

const nodeFile = (dataDir: string): Promise<NodeFile> =>
  waitFor("node.json", NODE_WAIT_MS, () => readNodeFile(dataDir));

/** The app's first launch unpacks the build, so it is made once, untimed, on a data directory of its own. */
async function unpack(app: string, install: Install): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "manent-unpack-"));
  try {
    void launch(app, dataDir).exited;
    await nodeFile(dataDir);
    await quit(install);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/** A second launch on the same data: it exits 0 within the limit, and the first still answers with the same pid. */
async function secondInstanceDeferred(
  app: string,
  dataDir: string,
  node: NodeFile,
): Promise<boolean> {
  const code = await Promise.race([
    launch(app, dataDir).exited,
    Bun.sleep(SECOND_INSTANCE_MS).then(() => null),
  ]);
  return (
    code === 0 &&
    readNodeFile(dataDir)?.pid === node.pid &&
    (await answersHealth(node))
  );
}

async function smoke(
  app: string,
  expectVersion: string | null,
  updateFrom: string | null,
): Promise<SmokeResult> {
  const install = installOf(app);
  await unpack(app, install);
  const dataDir = mkdtempSync(join(tmpdir(), "manent-smoke-"));
  try {
    const { spawnedAt } = launch(app, dataDir);
    const node = await firstFrame(dataDir);
    const version = (await pageVersion(node)) ?? "";
    if (expectVersion !== null && version !== expectVersion)
      throw new Error(
        `the app reports version ${version}, not ${expectVersion}`,
      );
    await Bun.sleep(
      Math.max(0, node.firstFrameAt + IDLE_AFTER_MS - Date.now()),
    );
    const idleRssBytes = idleRss(install);
    const client = await openClient(node);
    const handle = await client.create({
      kind: "script",
      // a script lives in a project
      home: `project:${crypto.randomUUID()}`,
      workspaceId: null,
    });
    typeLine(handle, "The kettle sings in the empty flat.");
    const saved = await until(handle, (status) => status.saved, SYNC_WAIT_MS);
    const synced =
      (await syncSamsScripts(node)) &&
      (await until(handle, (status) => status.synced, SYNC_WAIT_MS));
    const deferred = await secondInstanceDeferred(app, dataDir, node);
    stopCloud(install);
    const line = "Nobody answers the door.";
    typeLine(handle, line);
    const offlineSaved =
      (await until(handle, (status) => status.saved, SYNC_WAIT_MS)) &&
      !(await until(handle, (status) => status.synced, OFFLINE_WAIT_MS));
    await client.close();
    const coldStartMs = node.firstFrameAt - spawnedAt;
    return {
      platform: process.platform,
      version,
      firstFrameMs: node.firstFrameAt - node.startedAt,
      coldStartMs,
      idleRssBytes,
      coldStart: coldStartVerdict(coldStartMs),
      idleMemory:
        idleRssBytes === null ? null : idleMemoryVerdict(idleRssBytes),
      saved,
      synced,
      secondInstanceDeferred: deferred,
      offlineSaved,
      updatedWithOutbox:
        updateFrom === null
          ? null
          : await updated(app, install, dataDir, updateFrom, {
              docId: handle.docId,
              line,
            }),
      noticesBeside: existsSync(
        join(install.resources, "app", "THIRD-PARTY-NOTICES.txt"),
      ),
    };
  } finally {
    await quit(install);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      app: { type: "string" },
      "expect-version": { type: "string" },
      "update-from": { type: "string" },
    },
  });
  if (values.app === undefined) {
    console.error(
      "usage: bun tools/desktop/smoke.ts --app <installed executable> [--expect-version <v>] [--update-from <dir>]",
    );
    process.exit(1);
  }
  try {
    const result = await smoke(
      values.app,
      values["expect-version"] ?? null,
      values["update-from"] ?? null,
    );
    await mkdir("results", { recursive: true });
    await writeFile(
      join("results", `desktop-smoke-${result.platform}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result, null, 2));
    process.exit(smokeVerdict(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
