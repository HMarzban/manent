import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { ShellMessage } from "@manent/sync-protocol";
import { afterFirstFrame } from "../src/desktop/first-frame.ts";
import { readDesktopHost } from "../src/desktop/host.ts";
import { DATA_DIR } from "./desktop.fixtures.ts";

const ORIGIN = "http://127.0.0.1:5123";
const GLOBAL = {
  v: 1,
  platform: "mac",
  version: "0.1.0",
  channel: "stable",
  dataDir: DATA_DIR,
};

interface Sent {
  url: string;
  method: string;
  body: unknown;
}

/** The page's requests, each answered by the latest `answer` given; the spy is restored after each test. */
function spyFetch(answer: () => Promise<Response>): {
  sent: Sent[];
  answer(next: () => Promise<Response>): void;
} {
  const sent: Sent[] = [];
  let current = answer;
  const fake = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    sent.push({ url: String(input), method: init?.method ?? "GET", body });
    return current();
  };
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fake, { preconnect: fetch.preconnect }),
  );
  return {
    sent,
    answer(next) {
      current = next;
    },
  };
}

const NO_CONTENT = async (): Promise<Response> =>
  new Response(null, { status: 204 });
const GONE = (): Promise<Response> =>
  Promise.reject(new TypeError("the node is gone"));

/** An event source the test feeds by hand, standing in for the browser's. */
class FakeEventSource {
  static opened: FakeEventSource[] = [];
  readonly heard: ((event: { data: unknown }) => void)[] = [];
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(name: string, listener: (event: { data: unknown }) => void) {
    if (name === "message") this.heard.push(listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    for (const listener of this.heard) listener({ data });
  }
}

/** Settles after every message-channel task queued before it. */
const turn = (): Promise<void> =>
  new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.addEventListener("message", () => {
      port1.close();
      resolve();
    });
    port1.start();
    port2.postMessage(null);
  });

afterEach(() => {
  mock.restore();
  Reflect.deleteProperty(globalThis, "EventSource");
  FakeEventSource.opened = [];
});

const host = () => {
  const found = readDesktopHost(GLOBAL, ORIGIN);
  if (found === null) throw new TypeError("the shell's global was refused");
  return found;
};

test("the desktop is recognised only by the shell's own global", () => {
  const { platform, version, channel, dataDir } = host();
  expect([platform, version, channel, dataDir]).toEqual([
    "mac",
    "0.1.0",
    "stable",
    DATA_DIR,
  ]);
  expect(
    [undefined, { ...GLOBAL, v: 2 }, "x", { ...GLOBAL, platform: "ios" }].map(
      (global) => readDesktopHost(global, ORIGIN),
    ),
  ).toEqual([null, null, null, null]);
});

test("first paint values go to the shell as the boot cache writes them", async () => {
  const { sent } = spyFetch(NO_CONTENT);
  host().firstPaint([["a", "data-theme", "dark"]]);
  await turn();
  expect(sent).toEqual([
    {
      url: `${ORIGIN}/api/local/shell`,
      method: "POST",
      body: { v: 1, t: "first_paint", writes: [["a", "data-theme", "dark"]] },
    },
  ]);
});

test("a message the shell cannot take is dropped without a word", async () => {
  const { sent } = spyFetch(GONE);
  host().openInBrowser();
  host().openFiles();
  await turn();
  expect(sent.map((each) => each.body)).toEqual([
    { v: 1, t: "open_in_browser" },
    { v: 1, t: "open_files" },
  ]);
});

test("the shell's messages arrive through one event stream", () => {
  Reflect.set(globalThis, "EventSource", FakeEventSource);
  const desktop = host();
  const heard: ShellMessage[][] = [[], []];
  const stops = heard.map((into) =>
    desktop.onMessage((message) => into.push(message)),
  );
  const [source] = FakeEventSource.opened;
  const menu: ShellMessage = { v: 1, t: "menu_command", id: "app.palette" };
  for (const data of [JSON.stringify(menu), "not json", '{"v":2}', 7])
    source?.emit(data);
  for (const stop of stops) stop();
  expect([
    FakeEventSource.opened.map((each) => [each.url, each.closed]),
    heard,
  ]).toEqual([[[`${ORIGIN}/api/local/shell/events`, true]], [[menu], [menu]]]);
});

test("This device's storage is read from the node, and is nothing when the node does not answer", async () => {
  const fetched = spyFetch(async () =>
    Response.json({ scripts: 14, bytes: 23_000_000 }),
  );
  const answered = await host().storage();
  fetched.answer(GONE);
  const unanswered = await host().storage();
  fetched.answer(async () => Response.json({ scripts: "many" }));
  const malformed = await host().storage();
  fetched.answer(async () =>
    Response.json({ error: "forbidden" }, { status: 403 }),
  );
  const refused = await host().storage();
  expect([answered, unanswered, malformed, refused, fetched.sent[0]]).toEqual([
    { scripts: 14, bytes: 23_000_000 },
    null,
    null,
    null,
    { url: `${ORIGIN}/api/local/storage`, method: "GET", body: null },
  ]);
});

test("the demo's Connection on desktop is sent to the node", async () => {
  const { sent } = spyFetch(NO_CONTENT);
  await host().setConnection("slow", 1500);
  expect(sent).toEqual([
    {
      url: `${ORIGIN}/api/local/connection`,
      method: "POST",
      body: { mode: "slow", delayMs: 1500 },
    },
  ]);
});

test("the first frame is reported after the frame, not before", async () => {
  const ran: string[] = [];
  const frames: (() => void)[] = [];
  afterFirstFrame(() => ran.push("reported"), {
    request: (fn) => frames.push(fn),
  });
  await turn();
  const beforeFrame = [...ran];
  for (const frame of frames.splice(0)) frame();
  const atFrame = [...ran];
  await turn();
  expect([beforeFrame, atFrame, ran]).toEqual([[], [], ["reported"]]);
});
