import { expect, test } from "bun:test";
import { createFrameDecoder, encodeMessage } from "@manent/sync-protocol";
import type {
  Message,
  SignInResponse,
  WsTicketResponse,
} from "@manent/sync-protocol";
import { createServer, serveWithBun } from "../src/index.ts";
import type { Listener, ManentServer } from "../src/index.ts";
import { HTTP, makeConfig } from "./config.ts";

const plain500 = (): Response => new Response("no", { status: 500 });

/** A listener on a free loopback port, serving the test configuration with that port as its host. */
function listening(): { listener: Listener; at: string } {
  let built: ManentServer | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    () => {
      if (built === null) throw new Error("the server is not built yet");
      return built;
    },
    plain500,
  );
  const at = `127.0.0.1:${listener.port}`;
  const base = makeConfig();
  built = createServer(
    makeConfig({
      http: { ...HTTP, allowedHosts: [at] },
      socket: { ...base.socket, allowedOrigins: [`http://${at}`] },
    }),
  );
  return { listener, at };
}

/** Bun's client socket with `options`, which the DOM's WebSocket type does not declare. */
function openSocket(url: string, options: Bun.WebSocketOptions): WebSocket {
  const socket: unknown = Reflect.construct(WebSocket, [url, options]);
  if (!(socket instanceof WebSocket))
    throw new TypeError(`no socket for ${url}`);
  return socket;
}

/** Each call waits for the socket's next message, decoded as the server sent it. */
function reader(socket: WebSocket): () => Promise<Message | null> {
  const decoder = createFrameDecoder({ from: "server" });
  return () =>
    new Promise((resolve, reject) => {
      socket.addEventListener(
        "message",
        (event) => {
          const result = decoder.push(new Uint8Array(event.data));
          resolve(result.kind === "message" ? result.message : null);
        },
        { once: true },
      );
      socket.addEventListener("close", reject, { once: true });
    });
}

/** Leo's socket to the listener, open. */
async function leoSocket(at: string): Promise<WebSocket> {
  const { token } = (await (
    await fetch(`http://${at}/api/sign-in`, {
      method: "POST",
      body: JSON.stringify({ userId: "leo" }),
    })
  ).json()) as SignInResponse;
  const issued = await fetch(`http://${at}/api/ws-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const { ticket, expiresInMs } = (await issued.json()) as WsTicketResponse;
  expect([issued.status, expiresInMs]).toEqual([200, 30_000]);
  const socket = openSocket(`ws://${at}/ws?ticket=${ticket}`, {
    headers: { Origin: `http://${at}` },
  });
  socket.binaryType = "arraybuffer";
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return socket;
}

test("Bun carries a real socket to the server and back", async () => {
  const { listener, at } = listening();
  try {
    const socket = await leoSocket(at);
    const next = reader(socket);
    const welcome = next();
    socket.send(
      new Uint8Array(
        encodeMessage({
          type: "HELLO",
          versions: { protocol: 1, schema: 1, engine: 0, table: 0 },
          build: "test",
          deviceId: "device-1",
        }),
      ),
    );
    expect(await welcome).toMatchObject({
      type: "WELCOME",
      session: { userId: "leo", name: "Leo Marsh" },
    });
    const pong = next();
    socket.send(new Uint8Array(encodeMessage({ type: "PING", nonce: 4 })));
    expect(await pong).toEqual({ type: "PONG", nonce: 4 });
    socket.close();
  } finally {
    await listener.stop();
  }
});

test("the adapter returns its bound port and stops its sockets", async () => {
  const { listener, at } = listening();
  expect(listener.port).toBeGreaterThan(0);
  const socket = await leoSocket(at);
  const closed = new Promise<boolean>((resolve) =>
    socket.addEventListener("close", () => resolve(true), { once: true }),
  );
  await listener.stop();
  expect(await closed).toBe(true);
  expect(socket.readyState).toBe(WebSocket.CLOSED);
});

test("a handler that throws is answered by the error handler it was given", async () => {
  let built: ManentServer | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    () => {
      if (built === null) throw new Error("the server is not built yet");
      return built;
    },
    plain500,
  );
  built = {
    ...createServer(makeConfig()),
    fetch: () => Promise.reject(new Error("boom")),
  };
  try {
    const response = await fetch(`http://127.0.0.1:${listener.port}/health`);
    expect([response.status, await response.text()]).toEqual([500, "no"]);
  } finally {
    await listener.stop();
  }
});
