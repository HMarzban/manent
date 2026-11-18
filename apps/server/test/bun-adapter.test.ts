import { afterAll, expect, spyOn, test } from "bun:test";
import { createFrameDecoder, encodeMessage } from "@manent/sync-protocol";
import type {
  Message,
  SignInResponse,
  WsTicketResponse,
} from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import { onServeError } from "../src/bun-adapter.ts";
import { readServerEnv } from "../src/env.ts";
import { startServer } from "../src/main.ts";

const trees = createTempTrees("manent-adapter-");
afterAll(() => trees.removeAll());

test("a handler that throws answers a plain 500", async () => {
  const lines: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((line) => {
    lines.push(String(line));
  });
  const response = onServeError(new Error("boom at secret/path.ts"));
  spy.mockRestore();
  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toStartWith("text/plain");
  expect(await response.text()).toBe("Manent could not answer that request.");
  expect(lines).toEqual(["A request could not be answered."]);
});

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

test("Bun carries a real socket to the server and back", async () => {
  const dataDir = await trees.tree({});
  const running = await startServer({
    ...readServerEnv({ MANENT_DEMO: "1" }),
    port: 0,
    dataDir,
    webDir: dataDir,
  });
  try {
    const at = `127.0.0.1:${running.port}`;
    const { token } = (await (
      await fetch(`http://${at}/api/sign-in`, {
        method: "POST",
        body: JSON.stringify({ userId: "sam" }),
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
    const next = reader(socket);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const welcome = next();
    socket.send(
      new Uint8Array(
        encodeMessage({
          type: "HELLO",
          versions: { protocol: 1, schema: 1, engine: 1, table: 1 },
          build: "test",
          deviceId: "device-1",
        }),
      ),
    );
    expect(await welcome).toMatchObject({
      type: "WELCOME",
      session: { userId: "sam", name: "Sam Okafor" },
    });
    const pong = next();
    socket.send(new Uint8Array(encodeMessage({ type: "PING", nonce: 4 })));
    expect(await pong).toEqual({ type: "PONG", nonce: 4 });
    socket.close();
  } finally {
    await running.stop();
  }
});
