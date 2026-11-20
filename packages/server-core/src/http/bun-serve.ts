// Bun's listener and sockets, adapted to the server's request and connection seams.
import { FRAME_LIMIT_BYTES } from "@manent/sync-protocol";
import type { Connection, ConnectionData } from "../socket/connection.ts";
import type { ManentServer } from "./server.ts";

/** A bound listener: the port it bound, and a stop that also closes its sockets. */
export interface Listener {
  readonly port: number;
  stop(): Promise<void>;
}

function asConnection(socket: Bun.ServerWebSocket<ConnectionData>): Connection {
  return {
    data: socket.data,
    get bufferedBytes() {
      return socket.getBufferedAmount();
    },
    send(frame) {
      const written = socket.send(frame);
      if (written === -1) return "backpressure";
      return written === 0 ? "dropped" : "sent";
    },
    close: (code, reason) => socket.close(code, reason),
  };
}

/**
 * Listens on `listen` (port 0 asks for a free one) and hands every request and socket event to
 * `server()`, which is called per event because the server is built only once its listeners have
 * bound their port. A request whose handler throws is answered by `onError`.
 */
export function serveWithBun(
  listen: { hostname: string; port: number },
  server: () => ManentServer,
  onError: (error: unknown) => Response,
): Listener {
  const bun = Bun.serve<ConnectionData>({
    hostname: listen.hostname,
    port: listen.port,
    development: false,
    // with development off, Bun shares a port that is already taken unless told not to
    reusePort: false,
    error: onError,
    async fetch(request, served) {
      const response = await server().fetch(request, {
        remoteAddress: served.requestIP(request)?.address ?? "",
        upgrade: (data) => served.upgrade(request, { data }),
      });
      return response ?? undefined;
    },
    websocket: {
      maxPayloadLength: FRAME_LIMIT_BYTES,
      open: (socket) => server().connections.open(asConnection(socket)),
      message: (socket, frame) =>
        server().connections.message(asConnection(socket), frame),
      drain: (socket) => server().connections.drain(asConnection(socket)),
      close: (socket) => server().connections.close(asConnection(socket)),
    },
  });
  // a listener on a host and a port always reports the port it bound
  const port = bun.port!;
  return { port, stop: () => bun.stop(true) };
}
