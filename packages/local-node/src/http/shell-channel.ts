// The shell channel over the node's HTTP: the page posts its messages, and reads the shell's from an event stream.
import type { Clock } from "@manent/sync-client";
import type {
  ErrorResponse,
  PageMessage,
  ShellMessage,
} from "@manent/sync-protocol";
import { parsePageMessage } from "@manent/sync-protocol";
import type { EventStream } from "./sse.ts";
import { createEventStream } from "./sse.ts";

/** The shell's half of the channel, in the same process. */
export interface ShellEnd {
  /** The returned function stops the listener. */
  onMessage(listener: (message: PageMessage) => void): () => void;
  /** To every open event stream; dropped when none is open. */
  send(message: ShellMessage): void;
}

export interface ShellChannel {
  readonly shell: ShellEnd;
  /** Null: not a shell route. */
  handle(request: Request): Response | Promise<Response> | null;
  /** Ends every open event stream and cancels its heartbeat timer. */
  close(): void;
}

const MESSAGES_PATH = "/api/local/shell";
const EVENTS_PATH = "/api/local/shell/events";

const badRequest = (): Response =>
  Response.json({ error: "bad_request" } satisfies ErrorResponse, {
    status: 400,
  });

/** `heartbeatMs`: how long an idle stream waits before a comment frame keeps it open. */
export function createShellChannel(options: {
  clock: Clock;
  heartbeatMs: number;
  /** Optional initial frames sent when a new event stream opens. */
  onOpen?: (send: (message: ShellMessage) => void) => void;
}): ShellChannel {
  const listeners = new Set<(message: PageMessage) => void>();
  const streams = new Set<EventStream>();
  const receive = async (request: Request): Promise<Response> => {
    // A body that is not JSON reads as null, which is no message.
    const message = parsePageMessage(await request.json().catch(() => null));
    if (message === null) return badRequest();
    for (const listener of listeners) listener(message);
    return new Response(null, { status: 204 });
  };
  const open = (): Response => {
    const stream = createEventStream({
      clock: options.clock,
      heartbeatMs: options.heartbeatMs,
      onClose: () => streams.delete(stream),
    });
    streams.add(stream);
    options.onOpen?.((message) => stream.send(JSON.stringify(message)));
    return stream.response;
  };
  return {
    shell: {
      onMessage(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      send(message) {
        const data = JSON.stringify(message);
        for (const stream of streams) stream.send(data);
      },
    },
    handle(request) {
      const { pathname } = new URL(request.url);
      if (request.method === "POST" && pathname === MESSAGES_PATH)
        return receive(request);
      if (request.method === "GET" && pathname === EVENTS_PATH) return open();
      return null;
    },
    close() {
      for (const stream of streams) stream.close();
      streams.clear();
    },
  };
}
