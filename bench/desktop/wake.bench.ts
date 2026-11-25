// Waking the desktop node after an abrupt upstream socket drop: runs a local node over a
// loopback TCP relay to a real cloud server, terminates the upstream socket with no close frame,
// writes one offline edit, and times reconnect_ms from wake to cloud acknowledgement.
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptBody } from "@manent/crdt";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import {
  bunTransport,
  bunUpstreamPorts,
  createDesktopNode,
} from "@manent/local-node";
import type { DesktopNode, NodeCore } from "@manent/local-node";
import {
  ENGINE_VERSION,
  ENGINE_VERSIONS,
  TABLE_VERSION,
} from "@manent/pagination";
import { SCHEMA_VERSION, randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { serveWithBun } from "@manent/server-core";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { DocHandle, DocStatus, SyncClient } from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { VersionSet } from "@manent/sync-protocol";
import { startTestServer } from "@manent/testkit";
import type { TestServer } from "@manent/testkit";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement, sampleMs } from "../measure.ts";
import { until } from "../server/support.ts";

type Mode = ReturnType<typeof benchMode>;

const WAKES: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 2,
  standard: 5,
  full: 5,
});
const SYNC_TIMEOUT_MS = 15_000;
const DROP_TIMEOUT_MS = 10_000;
const ACK_TIMEOUT_MS = 15_000;

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

const randomBytes = (n: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(n));

interface TcpProxy {
  readonly url: string;
  /** Drops every live TCP tunnel without a WebSocket close frame and refuses new tunnels. */
  suspend(): void;
  /** Allows new TCP tunnels to reach the upstream server again. */
  resume(): void;
  close(): Promise<void>;
}

function dropSocket(socket: Socket): void {
  if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
  else socket.destroy();
}

function rewriteHttpHeaders(
  headerText: string,
  proxyPort: number,
  targetPort: number,
): string {
  const from = `127.0.0.1:${proxyPort}`;
  const to = `127.0.0.1:${targetPort}`;
  const upgraded = /^upgrade:\s*websocket\r?$/im.test(headerText);
  const lines = headerText.split("\r\n").map((line) => {
    if (/^(host|origin):/i.test(line)) return line.replaceAll(from, to);
    if (!upgraded && /^connection:/i.test(line)) return "Connection: close";
    return line;
  });
  if (!upgraded && !lines.some((line) => /^connection:/i.test(line)))
    lines.push("Connection: close");
  return lines.join("\r\n");
}

async function startTcpProxy(targetPort: number): Promise<TcpProxy> {
  const sockets = new Set<Socket>();
  let suspended = false;
  let proxyPort = 0;
  const server: Server = createServer((client) => {
    if (suspended) {
      dropSocket(client);
      return;
    }
    const upstream = createConnection({ host: "127.0.0.1", port: targetPort });
    sockets.add(client);
    sockets.add(upstream);
    const cleanup = (): void => {
      sockets.delete(client);
      sockets.delete(upstream);
      if (!client.destroyed) client.destroy();
      if (!upstream.destroyed) upstream.destroy();
    };
    let headBuf = Buffer.alloc(0);
    let passthrough = false;
    client.on("data", (chunk: Buffer) => {
      if (passthrough) {
        upstream.write(chunk);
        return;
      }
      headBuf = Buffer.concat([headBuf, chunk]);
      const split = headBuf.indexOf("\r\n\r\n");
      if (split === -1) return;
      const rewritten = rewriteHttpHeaders(
        headBuf.subarray(0, split).toString("latin1"),
        proxyPort,
        targetPort,
      );
      const rest = headBuf.subarray(split + 4);
      headBuf = Buffer.alloc(0);
      passthrough = true;
      upstream.write(`${rewritten}\r\n\r\n`, "latin1");
      if (rest.length > 0) upstream.write(rest);
    });
    upstream.pipe(client);
    client.on("error", cleanup);
    client.on("close", cleanup);
    upstream.on("error", cleanup);
    upstream.on("close", cleanup);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo | null;
  if (address === null) throw new Error("TCP proxy bound without a port");
  proxyPort = address.port;
  const suspend = (): void => {
    suspended = true;
    for (const sock of sockets) dropSocket(sock);
    sockets.clear();
  };
  return {
    url: `http://127.0.0.1:${proxyPort}`,
    suspend,
    resume() {
      suspended = false;
    },
    async close() {
      suspend();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function postNodeJson(
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<Response> {
  return fetch(url, { method: "POST", headers, body });
}

async function signInSam(
  nodeUrl: string,
  launchToken: string,
): Promise<string> {
  const response = await postNodeJson(
    `${nodeUrl}/api/sign-in`,
    { "X-Manent-Launch": launchToken, "Content-Type": "application/json" },
    '{"userId":"sam"}',
  );
  const body: unknown = await response.json();
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? body.token
      : null;
  if (typeof token !== "string")
    throw new Error(`the desktop node did not sign Sam in: ${response.status}`);
  return token;
}

async function signInToSync(
  nodeUrl: string,
  launchToken: string,
  token: string,
): Promise<void> {
  const response = await postNodeJson(`${nodeUrl}/api/local/sign-in-to-sync`, {
    "X-Manent-Launch": launchToken,
    Authorization: `Bearer ${token}`,
  });
  if (!response.ok)
    throw new Error(
      `the desktop node did not sign Sam in to sync: ${response.status}`,
    );
}

function openNodeClient(
  nodeUrl: string,
  launchToken: string,
  token: string,
): SyncClient {
  const through: typeof fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          "X-Manent-Launch": launchToken,
        },
      }),
    { preconnect: fetch.preconnect },
  );
  const socket = (url: string, origin: string): WebSocket => {
    const made: unknown = Reflect.construct(WebSocket, [
      url,
      { headers: { Origin: origin, "X-Manent-Launch": launchToken } },
    ]);
    if (!(made instanceof WebSocket))
      throw new TypeError(`no socket for ${url}`);
    return made;
  };
  return createSyncClient({
    userId: "sam",
    deviceId: randomBytes(8).toHex(),
    build: "bench",
    versions: VERSIONS,
    minServer: MIN_SERVER,
    via: "local_node",
    ports: {
      ...bunUpstreamPorts({
        now: Date.now,
        random: Math.random,
        bytes: randomBytes,
      }),
      transport: bunTransport({
        baseUrl: nodeUrl,
        token: () => token,
        fetch: through,
        socket,
      }),
      store: createMemoryStore("sam"),
      leader: soloLeader("bench"),
    },
  });
}

function awaitHandle(
  handle: DocHandle,
  holds: (status: DocStatus) => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  if (holds(handle.status.get())) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`${label} did not hold within ${timeoutMs} ms`));
    }, timeoutMs);
    const stop = handle.status.subscribe((status) => {
      if (!holds(status)) return;
      clearTimeout(timer);
      stop();
      resolve();
    });
  });
}

async function measure(mode: Mode): Promise<Measurement[]> {
  const dataDir = await mkdtemp(join(tmpdir(), "manent-desktop-wake-"));
  let server: TestServer | null = null;
  let proxy: TcpProxy | null = null;
  let node: DesktopNode | null = null;
  let listener: ReturnType<typeof serveWithBun> | null = null;
  let client: SyncClient | null = null;
  try {
    server = await startTestServer();
    proxy = await startTcpProxy(server.port);
    const started = await createDesktopNode({
      root: dataDir,
      cloudUrl: proxy.url,
      webDir: dataDir,
      signIn: createDemoSignIn(),
      directory: createDemoDirectory(),
      versions: { current: VERSIONS, min: MIN_SERVER },
      build: "bench",
      platform: process.platform,
      renderPdf: () => Promise.resolve(new Uint8Array()),
      boot: null,
    });
    if (!started.ok)
      throw new Error(`desktop node did not start: ${started.reason}`);
    node = started.node;
    let core: NodeCore | null = null;
    listener = serveWithBun(
      { hostname: "127.0.0.1", port: 0 },
      () => {
        if (core === null) throw new Error("node used before it listens");
        return core.server;
      },
      () => new Response("", { status: 500 }),
    );
    const nodeUrl = `http://127.0.0.1:${listener.port}`;
    core = node.listening(nodeUrl);
    const liveCore = core;
    const token = await signInSam(nodeUrl, node.launchToken);
    client = openNodeClient(nodeUrl, node.launchToken, token);
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
    scriptBody(handle.doc()).write((w) => w.insertBlocks(null, [initialBlock]));
    await awaitHandle(handle, (s) => s.saved, ACK_TIMEOUT_MS, "initial save");
    await signInToSync(nodeUrl, node.launchToken, token);
    await awaitHandle(
      handle,
      (s) => s.synced && s.waiting === 0,
      SYNC_TIMEOUT_MS,
      "initial cloud sync",
    );

    const count = WAKES[mode];
    const samples: number[] = [];
    for (let n = 0; n < count; n++) {
      proxy.suspend();
      await until(
        () => liveCore.relay.status(handle.docId).link === "offline",
        DROP_TIMEOUT_MS,
      );
      await awaitHandle(handle, (s) => !s.synced, DROP_TIMEOUT_MS, "drop");
      const seqBefore = handle.lastServerSeq() ?? 0;
      scriptBody(handle.doc()).write((w) => w.insertText(blockId, n, "w"));
      await awaitHandle(
        handle,
        (s) => s.saved && (handle.lastServerSeq() ?? 0) > seqBefore,
        ACK_TIMEOUT_MS,
        "offline local save",
      );
      await until(
        () => liveCore.relay.status(handle.docId).waiting > 0,
        DROP_TIMEOUT_MS,
      );

      const ms = await sampleMs(async () => {
        proxy!.resume();
        liveCore.relay.reconnect();
        await awaitHandle(
          handle,
          (s) => s.synced && s.waiting === 0,
          SYNC_TIMEOUT_MS,
          "post-wake cloud sync",
        );
      });
      samples.push(ms);
    }
    return [measurement("reconnect_ms", "ms", samples)];
  } finally {
    if (client !== null) await client.close();
    if (listener !== null) await listener.stop();
    if (node !== null) await node.close();
    if (proxy !== null) await proxy.close();
    if (server !== null) {
      await server.stop();
      await rm(server.dataDir, { recursive: true, force: true });
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

const scenario: Scenario = {
  id: "desktop.wake",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    return measure(benchMode());
  },
};

export default scenario;
