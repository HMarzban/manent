import { expect, test } from "bun:test";
import { ConnectError } from "@manent/sync-client";
import { webTransport } from "../src/index.ts";
import type { SocketLike } from "../src/index.ts";

const BASE = "http://localhost:4799";
const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "7c1e2a90-4b5d-4f3e-8a21-93d0c6b5e4f2";

interface Asked {
  url: string;
  method: string;
  authorization: string | undefined;
  body: string | undefined;
}

/** A socket the test opens, feeds and closes by hand. */
class FakeSocket implements SocketLike {
  binaryType = "blob";
  readonly sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {}
}

type Answer = number | "throw";

/**
 * A fake fetch answering `answer` to every request, with the ticket T1 unless `body` is given,
 * and records what was asked; every socket made is kept in `sockets`.
 */
function fakes(
  answer: Answer,
  options: { session?: string | null; baseUrl?: string; body?: unknown } = {},
) {
  const asked: Asked[] = [];
  const sockets: FakeSocket[] = [];
  const transport = webTransport({
    baseUrl: options.baseUrl ?? BASE,
    session: () => (options.session === undefined ? "S1" : options.session),
    fetch: async (url, init) => {
      asked.push({
        url,
        method: init.method,
        authorization: init.headers.Authorization,
        body: init.body,
      });
      if (answer === "throw") throw new TypeError("network down");
      return {
        status: answer,
        json: async () =>
          "body" in options
            ? options.body
            : { ticket: "T1", expiresInMs: 30_000 },
      };
    },
    socket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return { transport, asked, sockets };
}

/** Lets every pending promise chain run its course. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

async function codeOf(outcome: Promise<unknown>): Promise<string> {
  try {
    await outcome;
    return "resolved";
  } catch (error) {
    return error instanceof ConnectError ? error.code : String(error);
  }
}

function recording() {
  const frames: Uint8Array[] = [];
  const closes: [number, string][] = [];
  const handlers = {
    onFrame: (frame: Uint8Array) => frames.push(frame),
    onClose: (code: number, reason: string) => closes.push([code, reason]),
  };
  return { frames, closes, handlers };
}

/** A transport whose ticket is given and whose socket ends with `end` before it opens. */
async function failingSocket(
  end: (socket: FakeSocket) => void,
): Promise<string> {
  const { transport, sockets } = fakes(200);
  const connecting = codeOf(transport.connect(recording().handlers));
  await settle();
  end(sockets[0]!);
  return connecting;
}

test("a ticket is asked for with the session, and the socket opens with it", async () => {
  const { transport, asked, sockets } = fakes(200);
  const { frames, closes, handlers } = recording();
  const connecting = transport.connect(handlers);
  await settle();
  expect(asked).toEqual([
    {
      url: "http://localhost:4799/api/ws-ticket",
      method: "POST",
      authorization: "Bearer S1",
      body: undefined,
    },
  ]);
  const socket = sockets[0]!;
  expect(socket.url).toBe("ws://localhost:4799/ws?ticket=T1");
  expect(socket.binaryType).toBe("arraybuffer");
  socket.onopen!();
  const connection = await connecting;
  socket.onmessage!({ data: new Uint8Array([5, 0, 7]).buffer });
  socket.onmessage!({ data: "text" });
  expect(frames).toEqual([new Uint8Array([5, 0, 7])]);
  connection.send(new Uint8Array([1]));
  expect(socket.sent).toEqual([new Uint8Array([1])]);
  socket.onclose!({ code: 1012, reason: "restarting" });
  socket.onclose!({ code: 1006, reason: "" });
  expect(closes).toEqual([[1012, "restarting"]]);
});

test("each way of not connecting has its one outcome", async () => {
  const noSession = fakes(200, { session: null });
  expect(await codeOf(noSession.transport.connect(recording().handlers))).toBe(
    "sign_in",
  );
  expect(noSession.asked).toEqual([]);
  expect(await codeOf(fakes(401).transport.connect(recording().handlers))).toBe(
    "sign_in",
  );
  expect(
    await codeOf(
      fakes(200, { body: { expiresInMs: 30_000 } }).transport.connect(
        recording().handlers,
      ),
    ),
  ).toBe("unreachable");
  for (const answer of [500, 404, "throw"] as const)
    expect(
      await codeOf(fakes(answer).transport.connect(recording().handlers)),
    ).toBe("unreachable");
  expect(
    await failingSocket((socket) =>
      socket.onclose!({ code: 1006, reason: "" }),
    ),
  ).toBe("unreachable");
  expect(await failingSocket((socket) => socket.onerror!())).toBe(
    "unreachable",
  );
});

test("an https base opens a wss socket", async () => {
  const { transport, sockets } = fakes(200, {
    baseUrl: "https://manent.example",
  });
  void transport.connect(recording().handlers);
  await settle();
  expect(sockets.map((socket) => socket.url)).toEqual([
    "wss://manent.example/ws?ticket=T1",
  ]);
});

test("creating a document maps each answer", async () => {
  const body = { docId: DOC, kind: "script", home: `project:${PROJECT}` };
  let asked: Asked[] = [];
  const create = (answer: Answer) => {
    const made = fakes(answer);
    asked = made.asked;
    return made.transport.createDocument(body);
  };
  expect(await create(200)).toEqual({ ok: true });
  expect(asked).toEqual([
    {
      url: "http://localhost:4799/api/docs",
      method: "POST",
      authorization: "Bearer S1",
      body: JSON.stringify(body),
    },
  ]);
  expect(await create(403)).toEqual({ ok: false, code: "forbidden" });
  expect(await create(410)).toEqual({ ok: false, code: "deleted" });
  expect(await codeOf(create(401))).toBe("sign_in");
  expect(await codeOf(create(503))).toBe("unreachable");
  expect(await codeOf(create("throw"))).toBe("unreachable");
  const signedOut = fakes(200, { session: null });
  expect(await codeOf(signedOut.transport.createDocument(body))).toBe(
    "sign_in",
  );
  expect(signedOut.asked).toEqual([]);
});
