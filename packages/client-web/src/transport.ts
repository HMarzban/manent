// The transport over the browser's fetch and WebSocket: a one-use ticket for the
// session, then the socket that carries the frames.
import { ConnectError } from "@manent/sync-client";
import type { Connection, Transport } from "@manent/sync-client";
import { REPLAY_REFUSALS, encodeReplayUpdates } from "@manent/sync-protocol";
import type {
  ReplayOverlap,
  ReplayRefusal,
  ReplayResponse,
  ReplaySetAside,
} from "@manent/sync-protocol";

/** What the transport uses of a WebSocket. */
export interface SocketLike {
  binaryType: string;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
}

interface FetchAnswer {
  status: number;
  json(): Promise<unknown>;
}

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchAnswer>;

/** A thrown fetch is ConnectError("unreachable"). A body is JSON text. */
async function post(
  send: Fetch,
  url: string,
  session: string,
  body?: string,
): Promise<FetchAnswer> {
  try {
    const authorization = { Authorization: `Bearer ${session}` };
    const headers =
      body === undefined
        ? authorization
        : { ...authorization, "Content-Type": "application/json" };
    return await send(url, { method: "POST", headers, body });
  } catch (cause) {
    throw new ConnectError("unreachable", { cause });
  }
}

/** An answer the transport has no outcome for: a refused session asks for sign-in, anything else is unreachable. */
function refusal(status: number): ConnectError {
  return new ConnectError(status === 401 ? "sign_in" : "unreachable");
}

/** A body that is not JSON is ConnectError("unreachable"). */
async function readBody(response: FetchAnswer): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ConnectError("unreachable", { cause });
  }
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readTicket(response: FetchAnswer): Promise<string> {
  const body = await readBody(response);
  const ticket = isFields(body) ? body.ticket : null;
  if (typeof ticket !== "string") throw new ConnectError("unreachable");
  return ticket;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function readOverlap(value: unknown): ReplayOverlap | null {
  if (!isFields(value)) return null;
  const { blockId, text } = value;
  return typeof blockId === "string" && typeof text === "string"
    ? { blockId, text }
    : null;
}

function readSetAside(value: unknown): ReplaySetAside | null {
  if (!isFields(value)) return null;
  const { blockId, nearBlockId, text } = value;
  return isStringOrNull(blockId) &&
    isStringOrNull(nearBlockId) &&
    typeof text === "string"
    ? { blockId, nearBlockId, text }
    : null;
}

/** Null when the value is not a list, or one of its items does not read. */
function readList<T>(
  value: unknown,
  read: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(read);
  return items.every((item): item is T => item !== null) ? items : null;
}

/** Each field checked; a key this build does not know is dropped, as a newer server may add one. */
function readReplayResponse(value: unknown): ReplayResponse | null {
  if (!isFields(value)) return null;
  const { docId, generation, serverSeq, applied } = value;
  const overlaps = readList(value.overlaps, readOverlap);
  const setAside = readList(value.setAside, readSetAside);
  if (typeof docId !== "string" || typeof generation !== "number") return null;
  if (typeof serverSeq !== "number" || typeof applied !== "number") return null;
  if (overlaps === null || setAside === null) return null;
  return { docId, generation, serverSeq, applied, overlaps, setAside };
}

function isReplayRefusal(value: unknown): value is ReplayRefusal {
  return REPLAY_REFUSALS.some((code) => code === value);
}

function socketUrl(baseUrl: string, ticket: string): string {
  const base = new URL(baseUrl);
  const scheme = base.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${base.host}/ws?ticket=${encodeURIComponent(ticket)}`;
}

type SocketHandlers = Pick<
  SocketLike,
  "onopen" | "onmessage" | "onerror" | "onclose"
>;

/** Resolves on `open`; a socket that closes or fails first rejects ConnectError("unreachable"). */
function openSocket(
  socket: SocketLike,
  handlers: Parameters<Transport["connect"]>[0],
): Promise<Connection> {
  return new Promise((resolve, reject) => {
    let opened = false;
    let closed = false;
    const on: SocketHandlers = {
      onopen: () => {
        opened = true;
        resolve({
          send: (frame) => socket.send(frame),
          close: (code, reason) => socket.close(code, reason),
        });
      },
      onmessage: (event) => {
        // the server sends only binary frames: text is not a frame
        if (event.data instanceof ArrayBuffer)
          handlers.onFrame(new Uint8Array(event.data));
      },
      onerror: () => {
        if (!opened) reject(new ConnectError("unreachable"));
      },
      onclose: (event) => {
        if (!opened) reject(new ConnectError("unreachable"));
        else if (!closed) handlers.onClose(event.code, event.reason);
        closed = true;
      },
    };
    socket.binaryType = "arraybuffer";
    // the shape has handler properties, not addEventListener: they are set together
    Object.assign(socket, on);
  });
}

/** The browser types a WebSocket's frame as ArrayBuffer-backed; one over shared memory is copied. */
function isArrayBacked(view: Uint8Array): view is Uint8Array<ArrayBuffer> {
  return view.buffer instanceof ArrayBuffer;
}

/**
 * A WebSocket as a SocketLike. The browser's handler properties take its own event
 * types, which the shape's do not, so its events are passed on to the shape's handlers.
 */
function browserSocket(url: string): SocketLike {
  const socket = new WebSocket(url);
  const like: SocketLike = {
    get binaryType() {
      return socket.binaryType;
    },
    set binaryType(type: string) {
      if (type !== "arraybuffer" && type !== "blob")
        throw new TypeError(
          `a socket's binary type is arraybuffer or blob, not ${type}`,
        );
      socket.binaryType = type;
    },
    send: (data) =>
      socket.send(isArrayBacked(data) ? data : new Uint8Array(data)),
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

/** Defaults: the global fetch and a WebSocket, read when this is called. */
export function webTransport(options: {
  baseUrl: string;
  /** The tab's session token; null when nobody is signed in. */
  session: () => string | null;
  fetch?: Fetch;
  socket?: (url: string) => SocketLike;
}): Transport {
  const { baseUrl, session } = options;
  const send = options.fetch ?? fetch;
  const open = options.socket ?? browserSocket;
  return {
    async connect(handlers) {
      const token = session();
      if (token === null) throw new ConnectError("sign_in");
      const response = await post(send, `${baseUrl}/api/ws-ticket`, token);
      if (response.status !== 200) throw refusal(response.status);
      const ticket = await readTicket(response);
      return openSocket(open(socketUrl(baseUrl, ticket)), handlers);
    },
    async createDocument(request) {
      const token = session();
      if (token === null) throw new ConnectError("sign_in");
      const body = JSON.stringify(request);
      const { status } = await post(send, `${baseUrl}/api/docs`, token, body);
      if (status === 200) return { ok: true };
      if (status === 403) return { ok: false, code: "forbidden" };
      if (status === 410) return { ok: false, code: "deleted" };
      throw refusal(status);
    },
    async replay({ docId, generation, lastServerSeq, key, updates }) {
      const token = session();
      if (token === null) throw new ConnectError("sign_in");
      const body = JSON.stringify({
        docId,
        generation,
        lastServerSeq,
        key,
        updates: encodeReplayUpdates(updates),
      });
      const url = `${baseUrl}/api/docs/replay`;
      const reply = await post(send, url, token, body);
      if (reply.status === 401) throw refusal(reply.status);
      const content = await readBody(reply);
      if (reply.status === 200) {
        const response = readReplayResponse(content);
        if (response === null) throw new ConnectError("unreachable");
        return { ok: true, response };
      }
      const code = isFields(content) ? content.error : null;
      if (isReplayRefusal(code)) return { ok: false, code };
      throw refusal(reply.status);
    },
  };
}
