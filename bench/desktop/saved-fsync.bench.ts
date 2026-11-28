// Saving keystrokes through the headless desktop node with full fsync: spawns headless.ts,
// signs in as Sam with the launch guard, creates a script and times each write to the node's ACK.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { browserClock, browserRandom, webTransport } from "@manent/client-web";
import type { SocketLike } from "@manent/client-web";
import { blockIds, scriptBody } from "@manent/crdt";
import {
  ENGINE_VERSION,
  ENGINE_VERSIONS,
  TABLE_VERSION,
} from "@manent/pagination";
import { SCHEMA_VERSION, randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { DocHandle, Frames, SyncClient } from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { VersionSet } from "@manent/sync-protocol";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { inputBlocks, measurement, sampleMs } from "../measure.ts";
import { delay } from "../server/support.ts";

type Mode = ReturnType<typeof benchMode>;

const REPO_ROOT = join(import.meta.dir, "../..");
const HEADLESS_ENTRY = join(REPO_ROOT, "tools/desktop/headless.ts");
const KEYSTROKES: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 3,
  standard: 230,
  full: 230,
});
const BETWEEN_KEYSTROKES_MS: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 50,
  standard: 300,
  full: 300,
});
const START_TIMEOUT_MS = 15_000;
const ACK_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;

const VERSIONS: Readonly<VersionSet> = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSIONS.at(-1)!,
  table: TABLE_VERSION,
});
const MIN_SERVER: Readonly<VersionSet> = Object.freeze({
  ...VERSIONS,
  engine: ENGINE_VERSION,
});

const NO_FRAMES: Frames = {
  request(fn) {
    const timer = setTimeout(fn, 0);
    return () => clearTimeout(timer);
  },
};

interface HeadlessNode {
  nodeUrl: string;
  launchToken: string;
}

function parseNodeLine(line: string): HeadlessNode {
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null)
    throw new TypeError("headless node printed a non-object JSON line");
  const nodeUrl = "nodeUrl" in parsed ? parsed.nodeUrl : null;
  const launchToken = "launchToken" in parsed ? parsed.launchToken : null;
  if (typeof nodeUrl !== "string" || typeof launchToken !== "string")
    throw new TypeError(
      "headless node JSON line is missing nodeUrl or launchToken",
    );
  return { nodeUrl, launchToken };
}

async function readFirstLine(
  stream: ReadableStream<Uint8Array>,
  timeoutMs: number,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = setTimeout(() => {
    void reader.cancel();
  }, timeoutMs);
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const newline = buffer.indexOf("\n");
      if (newline !== -1) return buffer.slice(0, newline).trim();
    }
    throw new Error(
      "headless desktop node closed stdout before printing its address",
    );
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
}

async function spawnHeadless(
  dataDir: string,
): Promise<{ child: Subprocess; node: HeadlessNode }> {
  const child = Bun.spawn(
    [process.execPath, HEADLESS_ENTRY, "--data-dir", dataDir],
    {
      cwd: REPO_ROOT,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const line = await readFirstLine(child.stdout, START_TIMEOUT_MS);
    return { child, node: parseNodeLine(line) };
  } catch (cause) {
    child.kill("SIGKILL");
    await child.exited;
    const stderr = await new Response(child.stderr).text();
    throw new Error(`headless desktop node did not start: ${stderr.trim()}`, {
      cause,
    });
  }
}

async function stopHeadless(child: Subprocess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    child.exited.then(() => true),
    delay(STOP_TIMEOUT_MS).then(() => false),
  ]);
  if (!exited) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

async function signInSam(node: HeadlessNode): Promise<string> {
  const response = await fetch(`${node.nodeUrl}/api/sign-in`, {
    method: "POST",
    headers: {
      "X-Manent-Launch": node.launchToken,
      "Content-Type": "application/json",
    },
    body: '{"userId":"sam"}',
  });
  const body: unknown = await response.json();
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? body.token
      : null;
  if (typeof token !== "string")
    throw new Error(`the desktop node did not sign Sam in: ${response.status}`);
  return token;
}

function launchSocket(
  url: string,
  origin: string,
  launchToken: string,
): SocketLike {
  const socket: unknown = Reflect.construct(WebSocket, [
    url,
    { headers: { Origin: origin, "X-Manent-Launch": launchToken } },
  ]);
  if (!(socket instanceof WebSocket))
    throw new TypeError(`no socket for ${url}`);
  socket.binaryType = "arraybuffer";
  const like: SocketLike = {
    binaryType: "arraybuffer",
    send: (data) => socket.send(new Uint8Array(data)),
    close: (code, reason) => socket.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.addEventListener("open", () => like.onopen?.());
  socket.addEventListener("message", (event) => like.onmessage?.(event));
  socket.addEventListener("close", (event) => like.onclose?.(event));
  socket.addEventListener("error", () => like.onerror?.());
  return like;
}

async function openNodeClient(node: HeadlessNode): Promise<SyncClient> {
  const token = await signInSam(node);
  return createSyncClient({
    userId: "sam",
    deviceId: browserRandom.bytes(8).toHex(),
    build: "bench",
    versions: VERSIONS,
    minServer: MIN_SERVER,
    via: "local_node",
    ports: {
      transport: webTransport({
        baseUrl: node.nodeUrl,
        session: () => token,
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            headers: {
              ...init.headers,
              "X-Manent-Launch": node.launchToken,
            },
          }),
        socket: (url) => launchSocket(url, node.nodeUrl, node.launchToken),
      }),
      store: createMemoryStore("sam"),
      leader: soloLeader("bench"),
      clock: browserClock,
      random: browserRandom,
      frames: NO_FRAMES,
    },
  });
}

/** Resolves once the node has acknowledged a write past `seqBefore` and nothing waits. */
function awaitSavedAfter(
  handle: DocHandle,
  seqBefore: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): boolean =>
      handle.status.get().saved && (handle.lastServerSeq() ?? 0) > seqBefore;
    if (done()) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      stop();
      reject(
        new Error(`keystroke was not acknowledged within ${timeoutMs} ms`),
      );
    }, timeoutMs);
    const stop = handle.status.subscribe(() => {
      if (!done()) return;
      clearTimeout(timer);
      stop();
      resolve();
    });
  });
}

async function measure(mode: Mode): Promise<Measurement[]> {
  const dataDir = await mkdtemp(join(tmpdir(), "manent-desktop-fsync-"));
  let child: Subprocess | null = null;
  let client: SyncClient | null = null;
  try {
    const spawned = await spawnHeadless(dataDir);
    child = spawned.child;
    client = await openNodeClient(spawned.node);
    const handle = await client.create({
      kind: "script",
      home: `project:${crypto.randomUUID()}`,
      workspaceId: null,
    });
    const blockId = randomBlockId();
    const initialBlock: BlockJSON = {
      type: "block",
      attrs: { id: blockId, type: "action" },
      content: [],
    };
    const initialAck = awaitSavedAfter(handle, 0, ACK_TIMEOUT_MS);
    scriptBody(handle.doc()).write((writer) =>
      writer.insertBlocks(null, [initialBlock]),
    );
    await initialAck;
    const blocks = blockIds(handle.doc()).length;
    const count = KEYSTROKES[mode];
    const gapMs = BETWEEN_KEYSTROKES_MS[mode];
    const samples: number[] = [];
    for (let n = 0; n < count; n++) {
      const seqBefore = handle.lastServerSeq() ?? 0;
      const ms = await sampleMs(async () => {
        const acked = awaitSavedAfter(handle, seqBefore, ACK_TIMEOUT_MS);
        scriptBody(handle.doc()).write((writer) =>
          writer.insertText(blockId, n, "x"),
        );
        await acked;
      });
      samples.push(ms);
      if (n + 1 < count) await delay(gapMs);
    }
    return [measurement("keystroke_saved", "ms", samples), inputBlocks(blocks)];
  } finally {
    if (client !== null) await client.close();
    if (child !== null) await stopHeadless(child);
    await rm(dataDir, { recursive: true, force: true });
  }
}

const scenario: Scenario = {
  id: "desktop.saved-fsync",
  workload: "W1",
  processes: 5,
  async run(): Promise<Measurement[]> {
    return measure(benchMode());
  },
};

export default scenario;
