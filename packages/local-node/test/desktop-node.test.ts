import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { serveWithBun } from "@manent/server-core";
import type { Listener } from "@manent/server-core";
import {
  createFakeDirectory,
  createFakeSignIn,
} from "@manent/server-core/testing";
import { createFrameDecoder } from "@manent/sync-protocol";
import type {
  DesktopGlobal,
  FirstPaintWrite,
  FrameDecoder,
} from "@manent/sync-protocol";
import { createTempTrees, startTestServer } from "@manent/testkit";
import type { TestServer } from "@manent/testkit";
import {
  STORE_VERSION,
  acquireInstanceLock,
  askToFocus,
  bootScript,
  createDesktopNode,
  findRunning,
  readNodeFile,
  removeNodeFile,
  writeNodeFile,
} from "../src/index.ts";
import type {
  DesktopNode,
  DesktopNodeOptions,
  NodeCore,
} from "../src/index.ts";

const TIMEOUT = { timeout: 30_000 };
const PEOPLE = [{ userId: "sam", name: "Sam Okafor" }];
const V = { protocol: 1, schema: 1, engine: 0, table: 0 };
const GLOBAL: DesktopGlobal = {
  v: 1,
  platform: "mac",
  version: "0.1.0",
  channel: "canary",
  dataDir: "/Users/sam/Library/Application Support/Manent",
};
const BOOT: FirstPaintWrite[] = [["a", "data-theme", "dark"]];
const PAGE =
  "<!doctype html><html><head><title>Manent</title></head><body></body></html>";

const trees = createTempTrees("manent-desktop-");
let cloud: TestServer;
let webDir: string;
/** What a test left running, stopped when the file ends. */
const left: { node: DesktopNode; listener: Listener }[] = [];

beforeAll(async () => {
  cloud = await startTestServer({ dataDir: await trees.tree({}) });
  webDir = await trees.tree({ "index.html": PAGE });
}, 30_000);

afterAll(async () => {
  for (const { node, listener } of left.splice(0)) {
    await listener.stop();
    await node.close();
  }
  await cloud.stop();
  await trees.removeAll();
});

function options(root: string, cloudUrl = cloud.url): DesktopNodeOptions {
  return {
    root,
    cloudUrl,
    webDir,
    signIn: createFakeSignIn(PEOPLE),
    directory: createFakeDirectory(
      PEOPLE.map((user) => ({ user, workspaces: [] })),
    ),
    versions: { current: V, min: V },
    build: "test",
    platform: process.platform,
    boot: () => ({ global: GLOBAL, boot: BOOT }),
  };
}

/** A node started on `root` and listening on a free port of loopback, as the app starts it. */
async function started(
  root: string,
  cloudUrl = cloud.url,
): Promise<{ node: DesktopNode; core: NodeCore; listener: Listener }> {
  const start = await createDesktopNode(options(root, cloudUrl));
  if (!start.ok) throw new Error(`the node did not start: ${start.reason}`);
  let core: NodeCore | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    () => core!.server,
    () => new Response("", { status: 500 }),
  );
  core = start.node.listening(`http://127.0.0.1:${listener.port}`);
  return { node: start.node, core, listener };
}

/** Every file under `root` but the lock, with its bytes, as one string to compare. */
function digest(root: string): string {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path !== "instance.lock")
    .filter((path) => statSync(join(root, path)).isFile())
    .toSorted()
    .map((path) => `${path}:${readFileSync(join(root, path)).toHex()}`)
    .join("\n");
}

test(
  "the desktop node starts, listens, and refuses a second start on the same data",
  async () => {
    const root = await trees.tree({});
    const first = await started(root);
    const nodeUrl = `http://127.0.0.1:${first.listener.port}`;
    const second = await createDesktopNode(options(root));
    expect(second).toEqual({
      ok: false,
      reason: "running",
      running: {
        pid: process.pid,
        nodeUrl,
        launchToken: first.node.launchToken,
        startedAt: expect.any(Number),
        firstFrameAt: null,
      },
    });
    await first.listener.stop();
    await first.node.close();
    expect(readdirSync(root).includes("node.json")).toBe(false);
  },
  TIMEOUT,
);

test(
  "a second instance asks the first to come forward",
  async () => {
    const root = await trees.tree({});
    const first = await started(root);
    left.push(first);
    let asked = 0;
    first.core.onFocusRequest(() => {
      asked += 1;
    });
    const file = readNodeFile(root);
    if (file === null) throw new Error("the node wrote no node.json");
    expect(await askToFocus(file, fetch)).toBe(true);
    expect(asked).toBe(1);
  },
  TIMEOUT,
);

test(
  "a second instance that finds no node file yet waits for it",
  async () => {
    const root = await trees.tree({});
    const first = await started(root);
    left.push(first);
    const file = readNodeFile(root);
    if (file === null) throw new Error("the node wrote no node.json");
    removeNodeFile(root);
    let slept = 0;
    // node.json appears 300 ms after the second instance first looks
    const found = await findRunning(root, {
      waitMs: 5_000,
      pollMs: 100,
      sleep: async () => {
        slept += 1;
        if (slept === 3) writeNodeFile(root, file);
      },
    });
    expect([found, slept]).toEqual([file, 3]);
    let waited = 0;
    const never = await findRunning(await trees.tree({}), {
      waitMs: 500,
      pollMs: 100,
      sleep: async () => {
        waited += 1;
      },
    });
    expect([never, waited]).toEqual([null, 5]);
  },
  TIMEOUT,
);

test("a store from a newer version is refused and left as it was", async () => {
  const root = await trees.tree({});
  const newer = STORE_VERSION + 1;
  mkdirSync(join(root, `store-${newer}`, "node"), { recursive: true });
  writeFileSync(join(root, `store-${newer}`, "node", "control.sqlite"), "kept");
  writeFileSync(join(root, "store.json"), JSON.stringify({ current: newer }));
  const before = digest(root);
  expect(await createDesktopNode(options(root))).toEqual({
    ok: false,
    reason: "newer_store",
  });
  const lock = acquireInstanceLock(root);
  expect(lock.ok).toBe(true);
  if (lock.ok) lock.lock.release();
  expect(digest(root)).toBe(before);
});

test(
  "the page carries the chosen person's session, and the first frame is written down",
  async () => {
    const root = await trees.tree({});
    const first = await started(root);
    left.push(first);
    const nodeUrl = `http://127.0.0.1:${first.listener.port}`;
    const launch = { "X-Manent-Launch": first.node.launchToken };
    const chose = await fetch(`${nodeUrl}/api/sign-in`, {
      method: "POST",
      headers: { ...launch, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "sam" }),
    });
    expect(chose.status).toBe(200);
    const page = await fetch(`${nodeUrl}/`, {
      headers: { cookie: `manent_launch=${first.node.launchToken}` },
    });
    const html = await page.text();
    const session = new RegExp(
      'setItem\\("manent\\.demo\\.session", "(.*)"\\)',
    ).exec(html)?.[1];
    if (session === undefined) throw new Error("the page carries no session");
    const parsed: unknown = JSON.parse(JSON.parse(`"${session}"`));
    const token =
      typeof parsed === "object" && parsed !== null && "token" in parsed
        ? String(parsed.token)
        : "";
    const sent = JSON.stringify({ token, userId: "sam", name: "Sam Okafor" });
    const script = bootScript({ global: GLOBAL, boot: BOOT, session: sent });
    expect(html).toBe(
      PAGE.replace("<head>", `<head><script>${script}</script>`),
    );
    const person = await fetch(`${nodeUrl}/api/local/person`, {
      headers: { ...launch, Authorization: `Bearer ${token}` },
    });
    expect(await person.json()).toEqual({
      userId: "sam",
      name: "Sam Okafor",
      cloud: "signed_in",
    });
    first.node.markFirstFrame();
    expect(readNodeFile(root)?.firstFrameAt).toEqual(expect.any(Number));
  },
  TIMEOUT,
);

/** A cloud that adopts every script it is handed and hears the device each socket's HELLO names, and nothing more. */
function helloCloud(): {
  url: string;
  /** The device the next HELLO names. */
  nextHello(): Promise<string>;
  stop(): Promise<void>;
} {
  let waiting: ((deviceId: string) => void) | null = null;
  const decoders = new Map<object, FrameDecoder>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, served) {
      const { pathname } = new URL(request.url);
      if (pathname === "/ws")
        return served.upgrade(request)
          ? undefined
          : new Response("", { status: 400 });
      if (pathname === "/api/sign-in") return Response.json({ token: "c" });
      if (pathname === "/api/ws-ticket") return Response.json({ ticket: "t" });
      if (pathname !== "/api/docs/adopt")
        return new Response("", { status: 404 });
      const asked: unknown = await request.json();
      const field = (key: string): unknown =>
        typeof asked === "object" && asked !== null && key in asked
          ? Reflect.get(asked, key)
          : null;
      return Response.json({
        docId: field("docId"),
        kind: "script",
        home: field("home"),
        generation: 1,
        adoptedSeq: 1,
        created: true,
      });
    },
    websocket: {
      message(ws, data) {
        if (typeof data === "string") return;
        const decoder =
          decoders.get(ws) ?? createFrameDecoder({ from: "client" });
        decoders.set(ws, decoder);
        const read = decoder.push(new Uint8Array(data));
        if (read.kind !== "message" || read.message.type !== "HELLO") return;
        waiting?.(read.message.deviceId);
        waiting = null;
      },
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    nextHello: () =>
      new Promise((resolve) => {
        waiting = resolve;
      }),
    stop: () => server.stop(true),
  };
}

/** Sam chooses themselves at the node, makes a script there and signs in to sync it. */
async function syncsAScript(
  launched: { node: DesktopNode; listener: Listener },
  docId: string,
): Promise<void> {
  const nodeUrl = `http://127.0.0.1:${launched.listener.port}`;
  const launch = { "X-Manent-Launch": launched.node.launchToken };
  const json = { ...launch, "Content-Type": "application/json" };
  const chose = await fetch(`${nodeUrl}/api/sign-in`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: "sam" }),
  });
  const body: unknown = await chose.json();
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String(body.token)
      : "";
  const signed = { ...json, Authorization: `Bearer ${token}` };
  const made = await fetch(`${nodeUrl}/api/docs`, {
    method: "POST",
    headers: signed,
    body: JSON.stringify({ docId, kind: "script", home: `project:${PROJECT}` }),
  });
  const synced = await fetch(`${nodeUrl}/api/local/sign-in-to-sync`, {
    method: "POST",
    headers: signed,
  });
  expect([chose.status, made.status, synced.status]).toEqual([200, 200, 200]);
}

const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";

test(
  "the node is one device at the cloud from launch to launch, and never names its launch secret",
  async () => {
    const root = await trees.tree({});
    const fake = helloCloud();
    const devices: string[] = [];
    const tokens: string[] = [];
    for (const docId of [
      "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
      "0193b1f4-2c1e-7a00-8000-00000000000b",
    ]) {
      const launch = await started(root, fake.url);
      const hello = fake.nextHello();
      await syncsAScript(launch, docId);
      devices.push(await hello);
      tokens.push(launch.node.launchToken);
      await launch.listener.stop();
      await launch.node.close();
    }
    await fake.stop();
    const device = devices[0] ?? "";
    expect(devices).toEqual([device, device]);
    expect(tokens.some((token) => token.includes(device.slice(8)))).toBe(false);
  },
  TIMEOUT,
);
