// The desktop's node as the app starts it: one store, one lock, one upstream client per person, over
// the real clock, the system's randomness and the files of the data directory.
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_SETTING_RULES } from "@manent/server-core";
import type { Directory, RenderPdf, SignInProvider } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import { createSyncClient, soloLeader } from "@manent/sync-client";
import type { LocalStore } from "@manent/sync-client";
import type {
  DesktopGlobal,
  FirstPaintWrite,
  ServerVersions,
} from "@manent/sync-protocol";
import { acquireInstanceLock } from "../lock/instance-lock.ts";
import {
  readNodeFile,
  removeNodeFile,
  writeNodeFile,
} from "../lock/node-file.ts";
import type { NodeFile } from "../lock/node-file.ts";
import { openSqliteRecords } from "../records/sqlite.ts";
import { openStore } from "../store/open-store.ts";
import { readStoreUsage } from "../store/usage.ts";
import { httpCloudApi } from "../upstream/cloud-api.ts";
import { bunUpstreamPorts } from "../upstream/ports.ts";
import { openSqliteLocalStore } from "../upstream/sqlite-store.ts";
import { bunTransport } from "../upstream/transport.ts";
import { createNodeCore } from "./core.ts";
import type { NodeCore } from "./core.ts";
import type { UpstreamFactory } from "./ports.ts";

/** A second instance waits this long for the first one's node.json, reading it every 100 ms. */
const NODE_FILE_WAIT_MS = 5_000;
const NODE_FILE_POLL_MS = 100;
const LAUNCH_TOKEN_BYTES = 32;
/** Hex characters of the node's device ID after `desktop-`. */
const DEVICE_ID_CHARS = 16;
/** The records a demo reset keeps: the node's signing key and the people chosen here. */
const KEPT_ON_RESET = new Set(["secret", "people"]);

export interface DesktopNodeOptions {
  root: string;
  cloudUrl: string;
  webDir: string;
  signIn: SignInProvider;
  directory: Directory;
  versions: ServerVersions;
  build: string;
  platform: NodeJS.Platform;
  renderPdf: RenderPdf;
  /** Passed on as the core's `boot`. */
  boot: (() => { global: DesktopGlobal; boot: FirstPaintWrite[] }) | null;
}

export interface DesktopNode {
  readonly launchToken: string;
  /**
   * Builds the core for the bound address and writes node.json; called once, in the same
   * synchronous run as the bind, as the server's listener takes `() => core.server`.
   */
  listening(nodeUrl: string): NodeCore;
  /** Writes firstFrameAt into node.json. */
  markFirstFrame(): void;
  /** The core's close, the storages, node.json removed, the lock released. */
  close(): Promise<void>;
}

export type DesktopNodeStart =
  | { ok: true; node: DesktopNode }
  /** The lock is held; the running node's file, when readable. */
  | { ok: false; reason: "running"; running: NodeFile | null }
  | { ok: false; reason: "newer_store" };

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

const randomBytes = (n: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(n));

/** Bun's WebSocket with the Origin header a browser would send; the DOM's type does not declare its headers. */
function socket(url: string, origin: string): WebSocket {
  const made: unknown = Reflect.construct(WebSocket, [
    url,
    { headers: { Origin: origin } },
  ]);
  if (!(made instanceof WebSocket)) throw new TypeError(`no socket for ${url}`);
  return made;
}

const sqliteFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".sqlite"))
        .map((name) => join(dir, name))
    : [];

/**
 * The node's device at the cloud, which recognises a re-sent setting by it: the same at every
 * launch, as the records' secret is, and a one-way digest of it, so it names no secret.
 */
function deviceIdOf(secret: Uint8Array): string {
  const digest = createHash("sha256").update("manent.device").update(secret);
  return `desktop-${digest.digest("hex").slice(0, DEVICE_ID_CHARS)}`;
}

/** Every row of every table of the file but those of `kept`, in one transaction; the schema stays. */
function emptyFile(path: string, kept: ReadonlySet<string>): void {
  const db = new Database(path);
  try {
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .filter(({ name }) => !kept.has(name));
    db.transaction(() => {
      for (const { name } of tables) db.run(`DELETE FROM "${name}"`);
    }).immediate();
  } finally {
    db.close();
  }
}

async function answersHealth(nodeUrl: string): Promise<boolean> {
  try {
    return (await fetch(`${nodeUrl}/health`)).ok;
  } catch {
    // nothing listens there yet: the caller reads node.json again
    return false;
  }
}

/** Reads node.json every `pollMs` until it names a node that answers /health; null once `waitMs` has passed. */
export async function findRunning(
  root: string,
  options: { waitMs: number; pollMs: number; sleep(ms: number): Promise<void> },
): Promise<NodeFile | null> {
  for (let waited = 0; ; waited += options.pollMs) {
    const file = readNodeFile(root);
    if (file !== null && (await answersHealth(file.nodeUrl))) return file;
    if (waited >= options.waitMs) return null;
    await options.sleep(options.pollMs);
  }
}

/** Asks the running node to bring its window to the front; false when it did not answer so. */
export async function askToFocus(
  running: NodeFile,
  fetch: typeof globalThis.fetch,
): Promise<boolean> {
  try {
    const answer = await fetch(`${running.nodeUrl}/api/local/focus`, {
      method: "POST",
      headers: { "X-Manent-Launch": running.launchToken },
    });
    return answer.status === 204;
  } catch {
    // the running node has gone: there is nothing to bring forward
    return false;
  }
}

/** Opens and closes every file of a copied store with this build's drivers, so each runs its own migrations. */
function openFiles(dir: string): void {
  openSqliteStorage({ dir: join(dir, "node"), now: Date.now }).close();
  openSqliteRecords(join(dir, "records.sqlite"), Date.now, randomBytes).close();
  for (const path of sqliteFiles(join(dir, "upstream")))
    void openSqliteLocalStore({ path, userId: "", now: Date.now }).close();
}

/** The production composition: the only place in the package that reads the real clock, randomness and files. */
export async function createDesktopNode(
  options: DesktopNodeOptions,
): Promise<DesktopNodeStart> {
  const { root, cloudUrl } = options;
  const held = acquireInstanceLock(root);
  if (!held.ok) {
    const running = await findRunning(root, {
      waitMs: NODE_FILE_WAIT_MS,
      pollMs: NODE_FILE_POLL_MS,
      sleep,
    });
    return { ok: false, reason: "running", running };
  }
  const opened = openStore(root, { openFiles });
  if (!opened.ok) {
    held.lock.release();
    return opened;
  }
  const storeDir = opened.dir;
  const upstreamDir = join(storeDir, "upstream");
  mkdirSync(upstreamDir, { recursive: true });
  const storage = openSqliteStorage({
    dir: join(storeDir, "node"),
    now: Date.now,
  });
  const records = openSqliteRecords(
    join(storeDir, "records.sqlite"),
    Date.now,
    randomBytes,
  );
  const stores = new Map<string, LocalStore>();
  const storeOf = (userId: string): LocalStore => {
    const known = stores.get(userId);
    if (known !== undefined) return known;
    const path = join(upstreamDir, `${userId}.sqlite`);
    const made = openSqliteLocalStore({ path, userId, now: Date.now });
    stores.set(userId, made);
    return made;
  };
  const launchToken = randomBytes(LAUNCH_TOKEN_BYTES).toHex();
  const deviceId = deviceIdOf(records.secret());
  const ports = bunUpstreamPorts({
    now: Date.now,
    random: Math.random,
    bytes: randomBytes,
  });
  const upstream: UpstreamFactory = {
    create: (userId, token) =>
      createSyncClient({
        userId,
        deviceId,
        build: options.build,
        versions: options.versions.current,
        minServer: options.versions.min,
        ports: {
          ...ports,
          transport: bunTransport({ baseUrl: cloudUrl, token, fetch, socket }),
          store: storeOf(userId),
          leader: soloLeader(`desktop-${userId}`),
        },
      }),
    store: storeOf,
  };
  let core: NodeCore | null = null;
  let file: NodeFile | null = null;
  return {
    ok: true,
    node: {
      launchToken,
      listening(nodeUrl) {
        core = createNodeCore({
          storage,
          records,
          cloud: httpCloudApi({ baseUrl: cloudUrl, fetch }),
          upstream,
          clock: ports.clock,
          defer: (fn) => setImmediate(fn),
          random: ports.random,
          signIn: options.signIn,
          directory: options.directory,
          versions: options.versions,
          build: options.build,
          webDir: options.webDir,
          launchToken,
          registry: PRODUCT_SETTING_RULES,
          renderPdf: options.renderPdf,
          boot: options.boot,
          storeUsage: () => readStoreUsage(storeDir),
          nodeUrl,
          async wipe() {
            for (const path of sqliteFiles(join(storeDir, "node")))
              emptyFile(path, new Set());
            for (const path of sqliteFiles(upstreamDir))
              emptyFile(path, new Set());
            emptyFile(join(storeDir, "records.sqlite"), KEPT_ON_RESET);
          },
        });
        file = {
          pid: process.pid,
          nodeUrl,
          launchToken,
          startedAt: Date.now(),
          firstFrameAt: null,
        };
        writeNodeFile(root, file);
        return core;
      },
      markFirstFrame() {
        if (file === null) return;
        file = { ...file, firstFrameAt: Date.now() };
        writeNodeFile(root, file);
      },
      async close() {
        await core?.close();
        for (const store of stores.values()) await store.close();
        records.close();
        storage.close();
        removeNodeFile(root);
        held.lock.release();
      },
    },
  };
}
