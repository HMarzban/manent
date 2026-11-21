// The upstream transport in Bun: a one-use ticket for the person's cloud session, then a socket to the
// cloud that names the cloud's own origin, as the cloud's web app does.
import { ConnectError } from "@manent/sync-client";
import type { Connection, Transport } from "@manent/sync-client";
import { REPLAY_REFUSALS, encodeReplayUpdates } from "@manent/sync-protocol";
import type {
  ReplayOverlap,
  ReplayRefusal,
  ReplayResponse,
  ReplaySetAside,
} from "@manent/sync-protocol";
import { call, errorCodeOf, isFields, readBody } from "./cloud-requests.ts";

type Handlers = Parameters<Transport["connect"]>[0];

/** An answer the transport has no outcome for: a refused session asks for sign-in, anything else is unreachable. */
function refusal(status: number): ConnectError {
  return new ConnectError(status === 401 ? "sign_in" : "unreachable");
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOverlap(value: unknown): value is ReplayOverlap {
  return (
    isFields(value) &&
    typeof value.blockId === "string" &&
    typeof value.text === "string"
  );
}

function isSetAside(value: unknown): value is ReplaySetAside {
  return (
    isFields(value) &&
    isTextOrNull(value.blockId) &&
    isTextOrNull(value.nearBlockId) &&
    typeof value.text === "string"
  );
}

/** Each field checked; a key this build does not know is dropped, as a newer cloud may add one. */
function readReplayResponse(value: unknown): ReplayResponse | null {
  if (!isFields(value)) return null;
  const { docId, generation, serverSeq, applied, overlaps, setAside } = value;
  if (typeof docId !== "string" || typeof generation !== "number") return null;
  if (typeof serverSeq !== "number" || typeof applied !== "number") return null;
  if (!Array.isArray(overlaps) || !overlaps.every(isOverlap)) return null;
  if (!Array.isArray(setAside) || !setAside.every(isSetAside)) return null;
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

/** Resolves on `open`; a socket that closes or fails first rejects ConnectError("unreachable"). */
function openSocket(
  socket: WebSocket,
  handlers: Handlers,
): Promise<Connection> {
  return new Promise((resolve, reject) => {
    let opened = false;
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        send: (frame) => socket.send(new Uint8Array(frame)),
        close: (code, reason) => socket.close(code, reason),
      });
    });
    socket.addEventListener("message", (event) => {
      // the cloud sends only binary frames: text is not a frame
      if (event.data instanceof ArrayBuffer)
        handlers.onFrame(new Uint8Array(event.data));
    });
    socket.addEventListener("error", () => {
      if (!opened) reject(new ConnectError("unreachable"));
    });
    socket.addEventListener("close", (event) => {
      if (opened) handlers.onClose(event.code, event.reason);
      else reject(new ConnectError("unreachable"));
    });
  });
}

/** `token` is the person's cloud session, null while they have none: then nothing is asked of the cloud. */
export function bunTransport(options: {
  baseUrl: string;
  token: () => string | null;
  fetch: typeof fetch;
  socket: (url: string, origin: string) => WebSocket;
}): Transport {
  const { baseUrl, fetch } = options;
  const origin = new URL(baseUrl).origin;
  const session = (): string => {
    const token = options.token();
    if (token === null) throw new ConnectError("sign_in");
    return token;
  };
  return {
    async connect(handlers) {
      const token = session();
      const url = `${baseUrl}/api/ws-ticket`;
      const answer = await call(fetch, url, { method: "POST", token });
      if (answer.status !== 200) throw refusal(answer.status);
      const body = await readBody(answer);
      const ticket = isFields(body) ? body.ticket : null;
      if (typeof ticket !== "string") throw new ConnectError("unreachable");
      return openSocket(
        options.socket(socketUrl(baseUrl, ticket), origin),
        handlers,
      );
    },
    async createDocument({ workspaceId, ...request }) {
      const token = session();
      const body = workspaceId === null ? request : { ...request, workspaceId };
      const url = `${baseUrl}/api/docs`;
      const { status } = await call(fetch, url, {
        method: "POST",
        token,
        body,
      });
      if (status === 200) return { ok: true };
      if (status === 403) return { ok: false, code: "forbidden" };
      if (status === 410) return { ok: false, code: "deleted" };
      throw refusal(status);
    },
    async replay({ updates, ...request }) {
      const token = session();
      const body = { ...request, updates: encodeReplayUpdates(updates) };
      const url = `${baseUrl}/api/docs/replay`;
      const answer = await call(fetch, url, { method: "POST", token, body });
      if (answer.status === 401) throw refusal(answer.status);
      const content = await readBody(answer);
      if (answer.status === 200) {
        const response = readReplayResponse(content);
        if (response === null) throw new ConnectError("unreachable");
        return { ok: true, response };
      }
      const code = errorCodeOf(content);
      if (isReplayRefusal(code)) return { ok: false, code };
      throw refusal(answer.status);
    },
  };
}
