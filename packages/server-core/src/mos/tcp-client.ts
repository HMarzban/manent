// Outbound node:net UTF-16BE MOS 2.8.5 TCP client connecting strictly to DNS-pinned studio IPs.
import {
  MOS_MAX_MESSAGE_BYTES,
  createMosFramer,
  encodeMosMessage,
  parseMosMessage,
} from "@manent/formats";
import type { MosMessage } from "@manent/formats";
import { createConnection } from "node:net";
import type { Socket } from "node:net";
import type { PinnedTarget } from "./allowlist.ts";

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_ACK_TIMEOUT_MS = 5_000;

export interface MosTcpClient {
  readonly connected: boolean;
  send(message: MosMessage): Promise<MosMessage | null>;
  close(): void;
}

interface PendingAck {
  resolve(msg: MosMessage | null): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Opens an outbound MOS TCP socket strictly to a pre-validated, DNS-pinned IP target.
 * Serializes requests and frames all UTF-16BE `<mos>...</mos>` replies up to 1 MiB.
 */
export function createMosTcpClient(options: {
  target: PinnedTarget;
  connectTimeoutMs?: number;
  ackTimeoutMs?: number;
  onMessage?: (message: MosMessage) => void;
  onStatus?: (connected: boolean) => void;
}): MosTcpClient {
  const {
    target,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    ackTimeoutMs = DEFAULT_ACK_TIMEOUT_MS,
    onMessage,
    onStatus,
  } = options;

  let socket: Socket | null = null;
  let connecting: Promise<Socket> | null = null;
  let closed = false;
  let sendChain: Promise<void> = Promise.resolve();
  let pending: PendingAck | null = null;

  function failPending(err: Error): void {
    if (pending === null) return;
    const cur = pending;
    pending = null;
    clearTimeout(cur.timer);
    cur.reject(err);
  }

  function detachSocket(sock: Socket): void {
    if (socket === sock) {
      socket = null;
      onStatus?.(false);
    }
    failPending(new Error("MOS socket closed"));
  }

  function ensureConnected(): Promise<Socket> {
    if (closed) return Promise.reject(new Error("MOS client closed"));
    if (socket !== null && !socket.destroyed) return Promise.resolve(socket);
    if (connecting !== null) return connecting;

    connecting = new Promise<Socket>((resolve, reject) => {
      const framer = createMosFramer({ maxBytes: MOS_MAX_MESSAGE_BYTES });
      const sock = createConnection({
        host: target.address,
        family: target.family,
        port: target.port,
      });
      let settled = false;
      const connectTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        connecting = null;
        sock.destroy();
        reject(new Error("MOS connect timeout"));
      }, connectTimeoutMs);

      sock.once("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        connecting = null;
        if (closed) {
          sock.destroy();
          reject(new Error("MOS client closed"));
          return;
        }
        socket = sock;
        onStatus?.(true);
        resolve(sock);
      });

      sock.on("data", (chunk: Uint8Array) => {
        try {
          const frames = framer.push(chunk);
          for (const xml of frames) {
            const msg = parseMosMessage(xml);
            if (pending !== null) {
              const cur = pending;
              pending = null;
              clearTimeout(cur.timer);
              cur.resolve(msg);
            } else {
              onMessage?.(msg);
            }
          }
        } catch {
          sock.destroy();
        }
      });

      sock.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimer);
          connecting = null;
          reject(err);
        }
        detachSocket(sock);
      });

      sock.on("close", () => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimer);
          connecting = null;
          reject(new Error("MOS connection closed"));
        }
        detachSocket(sock);
      });
    });

    return connecting;
  }

  function sendOne(message: MosMessage): Promise<MosMessage | null> {
    return new Promise<MosMessage | null>((resolve, reject) => {
      const run = async (): Promise<void> => {
        try {
          const sock = await ensureConnected();
          const wire = encodeMosMessage(message);
          const reply = await new Promise<MosMessage | null>((res, rej) => {
            const timer = setTimeout(() => {
              if (pending?.timer === timer) {
                pending = null;
                rej(new Error("MOS ack timeout"));
              }
            }, ackTimeoutMs);
            pending = { resolve: res, reject: rej, timer };
            sock.write(wire, (writeErr) => {
              if (writeErr && pending?.timer === timer) {
                clearTimeout(timer);
                pending = null;
                rej(writeErr);
              }
            });
          });
          resolve(reply);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      sendChain = sendChain.then(run, run);
    });
  }

  return {
    get connected() {
      return socket !== null && !socket.destroyed;
    },
    send: sendOne,
    close() {
      closed = true;
      failPending(new Error("MOS client closed"));
      if (socket !== null) {
        const s = socket;
        socket = null;
        s.destroy();
        onStatus?.(false);
      }
    },
  };
}

/** Performs a one-shot MOS heartbeat handshake against a DNS-pinned target and closes cleanly. */
export async function checkMosHandshake(options: {
  target: PinnedTarget;
  mosId: string;
  ncsId: string;
  nowIso: string;
  timeoutMs?: number;
}): Promise<
  { ok: true } | { ok: false; reason: "unreachable" | "bad_response" }
> {
  const client = createMosTcpClient({
    target: options.target,
    connectTimeoutMs: options.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    ackTimeoutMs: options.timeoutMs ?? DEFAULT_ACK_TIMEOUT_MS,
  });
  try {
    const reply = await client.send({
      kind: "heartbeat",
      mosId: options.mosId,
      ncsId: options.ncsId,
      messageId: 1,
      time: options.nowIso,
    });
    if (
      reply === null ||
      (reply.kind !== "heartbeat" && reply.kind !== "roAck")
    )
      return { ok: false, reason: "bad_response" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    client.close();
  }
}
