// Inbound node:net MOS TCP listener with peer allowlist, max 8 connections and 1 MiB UTF-16BE framing.
import {
  MOS_MAX_MESSAGE_BYTES,
  createMosFramer,
  encodeMosMessage,
  parseMosMessage,
} from "@manent/formats";
import type { MosMessage } from "@manent/formats";
import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";
import { isIpAllowed, unwrapDualStackIpv4 } from "./allowlist.ts";

export const MOS_MAX_CONNECTIONS = 8;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

export interface MosTcpServer {
  readonly port: number;
  readonly connections: number;
  close(): Promise<void>;
}

/** Validates an inbound peer socket address against studio allowlist (unwrapping IPv4 on dual-stack listeners). */
function isPeerSocketAllowed(
  socket: Socket,
  allowedCidrs: readonly string[],
): boolean {
  const remote = socket.remoteAddress;
  if (remote === undefined) return false;
  if (isIpAllowed(remote, allowedCidrs)) return true;
  if (socket.localFamily === "IPv6") {
    const unwrapped = unwrapDualStackIpv4(remote);
    if (unwrapped !== null) return isIpAllowed(unwrapped, allowedCidrs);
  }
  return false;
}

export async function createMosTcpServer(options: {
  host?: string;
  port?: number;
  allowedCidrs?: readonly string[];
  idleTimeoutMs?: number;
  maxConnections?: number;
  onMessage(message: MosMessage): readonly MosMessage[];
}): Promise<MosTcpServer> {
  const {
    host = "127.0.0.1",
    port = 0,
    allowedCidrs = [],
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxConnections = MOS_MAX_CONNECTIONS,
    onMessage,
  } = options;

  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    if (
      sockets.size >= maxConnections ||
      !isPeerSocketAllowed(socket, allowedCidrs)
    ) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const framer = createMosFramer({ maxBytes: MOS_MAX_MESSAGE_BYTES });
    socket.setTimeout(idleTimeoutMs, () => socket.destroy());

    socket.on("data", (chunk: Uint8Array) => {
      try {
        for (const xml of framer.push(chunk)) {
          const msg = parseMosMessage(xml);
          const replies = onMessage(msg);
          for (const reply of replies) socket.write(encodeMosMessage(reply));
        }
      } catch {
        socket.destroy();
      }
    });

    socket.on("error", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  return {
    port: addr.port,
    get connections() {
      return sockets.size;
    },
    close() {
      for (const s of sockets) s.destroy();
      sockets.clear();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
