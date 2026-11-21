// The smoke's view of a running local node: the page it serves, and Sam's sync client and shell channel,
// reached through the launch token as the app's window reaches them.
import { scriptBody } from "@manent/crdt";
import { bunTransport, bunUpstreamPorts } from "@manent/local-node";
import type { NodeFile } from "@manent/local-node";
import { randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { DocHandle, DocStatus, SyncClient } from "@manent/sync-client";
import { parseDesktopGlobal, parseShellMessage } from "@manent/sync-protocol";
import type { ShellMessage } from "@manent/sync-protocol";
import { VERSIONS } from "./build.ts";

const launchHeader = (node: NodeFile): Record<string, string> => ({
  "X-Manent-Launch": node.launchToken,
});

/** The version in the desktop global the node writes into its page; null when the page has none. */
export async function pageVersion(node: NodeFile): Promise<string | null> {
  const page = await (
    await fetch(`${node.nodeUrl}/`, { headers: launchHeader(node) })
  ).text();
  const literal = new RegExp("manentDesktop = Object\\.freeze\\((.*)\\);").exec(
    page,
  )?.[1];
  return literal === undefined
    ? null
    : (parseDesktopGlobal(JSON.parse(literal))?.version ?? null);
}

export async function answersHealth(node: NodeFile): Promise<boolean> {
  try {
    return (await fetch(`${node.nodeUrl}/health`)).ok;
  } catch {
    // nothing listens there
    return false;
  }
}

const bytes = (n: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(n));

/** Chooses Sam at the node; the node's session token for him. */
async function signInSam(node: NodeFile): Promise<string> {
  const headers = { ...launchHeader(node), "Content-Type": "application/json" };
  const answer = await fetch(`${node.nodeUrl}/api/sign-in`, {
    method: "POST",
    headers,
    body: '{"userId":"sam"}',
  });
  const body: unknown = await answer.json();
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? body.token
      : null;
  if (typeof token !== "string")
    throw new Error(`the node did not sign Sam in: ${answer.status}`);
  return token;
}

/** What Sign in to sync asks of the node: Sam's scripts made on this device are handed to the cloud. */
export async function syncSamsScripts(node: NodeFile): Promise<boolean> {
  const token = await signInSam(node);
  const answer = await fetch(`${node.nodeUrl}/api/local/sign-in-to-sync`, {
    method: "POST",
    headers: { ...launchHeader(node), Authorization: `Bearer ${token}` },
  });
  return answer.ok;
}

/** Sam, chosen at the node, with a sync client that reaches the node as the window does. */
export async function openClient(node: NodeFile): Promise<SyncClient> {
  const token = await signInSam(node);
  const through: typeof fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          ...launchHeader(node),
        },
      }),
    { preconnect: fetch.preconnect },
  );
  const socket = (url: string, origin: string): WebSocket => {
    const made: unknown = Reflect.construct(WebSocket, [
      url,
      { headers: { Origin: origin, ...launchHeader(node) } },
    ]);
    if (!(made instanceof WebSocket))
      throw new TypeError(`no socket for ${url}`);
    return made;
  };
  return createSyncClient({
    userId: "sam",
    deviceId: bytes(8).toHex(),
    build: "smoke",
    versions: VERSIONS,
    minServer: VERSIONS,
    via: "local_node",
    ports: {
      ...bunUpstreamPorts({ now: Date.now, random: Math.random, bytes }),
      transport: bunTransport({
        baseUrl: node.nodeUrl,
        token: () => token,
        fetch: through,
        socket,
      }),
      store: createMemoryStore("sam"),
      leader: soloLeader("smoke"),
    },
  });
}

/** True once the handle's status holds; false when `ms` passes first. */
export function until(
  handle: DocHandle,
  holds: (status: DocStatus) => boolean,
  ms: number,
): Promise<boolean> {
  return new Promise((done) => {
    const timer = setTimeout(() => finish(false), ms);
    const stop = handle.status.subscribe((status) => {
      if (holds(status)) finish(true);
    });
    function finish(held: boolean): void {
      clearTimeout(timer);
      stop();
      done(held);
    }
    if (holds(handle.status.get())) finish(true);
  });
}

/** A new action line at the start of the script. */
export function typeLine(handle: DocHandle, text: string): void {
  const block: BlockJSON = {
    type: "block",
    attrs: { id: randomBlockId(), type: "action" },
    content: [{ type: "text", text }],
  };
  scriptBody(handle.doc()).write((writer) =>
    writer.insertBlocks(null, [block]),
  );
}

/** A check asked again while one runs only repeats the current state, which also keeps the stream busy. */
const ASK_EVERY_MS = 2_000;

/** The shell channel's messages, as its event stream sends them. */
async function* shellMessages(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ShellMessage> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of body) {
    text += decoder.decode(chunk, { stream: true });
    const frames = text.split("\n\n");
    text = frames.pop() ?? "";
    for (const frame of frames) {
      if (!frame.startsWith("data: ")) continue;
      const message = parseShellMessage(
        JSON.parse(frame.slice("data: ".length)),
      );
      if (message !== null) yield message;
    }
  }
}

/**
 * Asks the app over its shell channel to check for updates, again every ASK_EVERY_MS, since the
 * stream says nothing until its first message; true once `update_state` is `ready`, false on
 * `check_failed` or after `ms`.
 */
export async function updateReady(
  node: NodeFile,
  ms: number,
): Promise<boolean> {
  const cookie = { Cookie: `manent_launch=${node.launchToken}` };
  const signal = AbortSignal.timeout(ms);
  const events = fetch(`${node.nodeUrl}/api/local/shell/events`, {
    headers: cookie,
    signal,
  });
  const ask = (): void =>
    void fetch(`${node.nodeUrl}/api/local/shell`, {
      method: "POST",
      headers: { ...cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ v: 1, t: "check_for_updates" }),
    }).catch(() => {
      // the next ask, or the timeout, decides
    });
  ask();
  const asking = setInterval(ask, ASK_EVERY_MS);
  try {
    const { body } = await events;
    if (body === null) return false;
    for await (const message of shellMessages(body)) {
      if (message.t !== "update_state") continue;
      if (message.state === "ready") return true;
      if (message.state === "check_failed") return false;
    }
    return false;
  } catch (error) {
    if (signal.aborted) return false;
    throw error;
  } finally {
    clearInterval(asking);
  }
}
