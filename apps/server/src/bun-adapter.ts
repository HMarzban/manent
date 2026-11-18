// Bun's listener and sockets, adapted to the server's request and connection seams.
import type {
  Connection,
  ConnectionData,
  ManentServer,
} from "@manent/server-core";
import { FRAME_LIMIT_BYTES } from "@manent/sync-protocol";

/**
 * The answer to a request whose handler threw: a plain sentence, with nothing of the thrown value
 * on the page or in the log, since it may name files and lines of this machine.
 */
export function onServeError(_error: unknown): Response {
  console.error("A request could not be answered.");
  return new Response("Manent could not answer that request.", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
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
 * Listens on `listen` and hands every request and socket event to `server()`, which is called
 * per event because the server is built only once its listeners have bound their port.
 */
export function serveWithBun(
  listen: { hostname: string; port: number },
  server: () => ManentServer,
): Bun.Server<ConnectionData> {
  return Bun.serve<ConnectionData>({
    hostname: listen.hostname,
    port: listen.port,
    development: false,
    // with development off, Bun shares a port that is already taken unless told not to
    reusePort: false,
    error: onServeError,
    async fetch(request, bun) {
      const response = await server().fetch(request, {
        remoteAddress: bun.requestIP(request)?.address ?? "",
        upgrade: (data) => bun.upgrade(request, { data }),
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
}
