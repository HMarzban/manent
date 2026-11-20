import { expect, test } from "bun:test";
import type { ManentServer, RequestContext } from "@manent/server-core";
import { createLaunchGuard } from "../src/index.ts";

const TOKEN = "4f8a1c2e9b7d6a5f4e3d2c1b0a9f8e7d";
const CTX: RequestContext = {
  remoteAddress: "127.0.0.1",
  upgrade: () => false,
};

function fakeServer(answer: () => Response): ManentServer {
  return {
    fetch: async () => answer(),
    connections: {
      open() {},
      message() {},
      drain() {},
      close() {},
      maxFrameBytes: 1024,
    },
    sync: null,
  };
}

const inner = fakeServer(() => new Response("inner"));
const guard = createLaunchGuard({ token: TOKEN, inner, bootScript: null });

const req = (path: string, headers: Record<string, string> = {}): Request =>
  new Request(`http://127.0.0.1:51234${path}`, { headers });

async function bodyOf(response: Response | null): Promise<[number, unknown]> {
  if (response === null) throw new TypeError("the request was upgraded");
  return [response.status, await response.json()];
}

test("the app's own window gets in, and nothing else does", async () => {
  const first = await guard.fetch(req("/library?launch=" + TOKEN), CTX);
  expect([
    first!.status,
    first!.headers.get("location"),
    first!.headers.get("set-cookie"),
  ]).toEqual([
    302,
    "/library",
    `manent_launch=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`,
  ]);
  const kept = await guard.fetch(req(`/library?tab=2&launch=${TOKEN}`), CTX);
  expect(kept!.headers.get("location")).toBe("/library?tab=2");
  expect(
    (await guard.fetch(
      req("/library", { cookie: `manent_launch=${TOKEN}` }),
      CTX,
    ))!.status,
  ).toBe(200);
  expect(
    (await guard.fetch(
      req("/library", { cookie: `theme=dark; manent_launch=${TOKEN}` }),
      CTX,
    ))!.status,
  ).toBe(200);
  expect(
    (await guard.fetch(req("/library", { "x-manent-launch": TOKEN }), CTX))!
      .status,
  ).toBe(200);
  for (const r of [
    req("/library"),
    req("/library?launch=wrong"),
    req("/ws", { cookie: "manent_launch=wrong" }),
    req("/library", { "x-manent-launch": "wrong" }),
  ])
    expect(await bodyOf(await guard.fetch(r, CTX))).toEqual([
      403,
      { error: "forbidden" },
    ]);
  expect((await guard.fetch(req("/health"), CTX))!.status).toBe(200);
});

test("the token is compared in constant time and refused at any length", async () => {
  for (const wrong of [TOKEN.slice(1), `${TOKEN}0`, ""]) {
    expect(
      await bodyOf(await guard.fetch(req(`/library?launch=${wrong}`), CTX)),
    ).toEqual([403, { error: "forbidden" }]);
    expect(
      await bodyOf(
        await guard.fetch(
          req("/library", { cookie: `manent_launch=${wrong}` }),
          CTX,
        ),
      ),
    ).toEqual([403, { error: "forbidden" }]);
    expect(
      await bodyOf(
        await guard.fetch(req("/library", { "x-manent-launch": wrong }), CTX),
      ),
    ).toEqual([403, { error: "forbidden" }]);
  }
});

test("the page the node serves carries the desktop's startup values first", async () => {
  const page = "<!doctype html><HEAD><script>boot()</script>";
  const html = fakeServer(
    () =>
      new Response(page, {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  );
  const css = fakeServer(
    () => new Response("a{}", { headers: { "content-type": "text/css" } }),
  );
  const pass = { cookie: `manent_launch=${TOKEN}` };
  const withBoot = (server: ManentServer) =>
    createLaunchGuard({ token: TOKEN, inner: server, bootScript: () => "S" });
  const served = await withBoot(html).fetch(req("/", pass), CTX);
  expect([served!.headers.get("content-type"), await served!.text()]).toEqual([
    "text/html; charset=utf-8",
    "<!doctype html><HEAD><script>S</script><script>boot()</script>",
  ]);
  const twice = fakeServer(
    () =>
      new Response("<header><head data-x><head>", {
        headers: { "content-type": "text/html" },
      }),
  );
  expect(await (await withBoot(twice).fetch(req("/", pass), CTX))!.text()).toBe(
    "<header><head data-x><script>S</script><head>",
  );
  expect(
    await (await withBoot(css).fetch(req("/app.css", pass), CTX))!.text(),
  ).toBe("a{}");
  const none = createLaunchGuard({
    token: TOKEN,
    inner: html,
    bootScript: null,
  });
  expect(await (await none.fetch(req("/", pass), CTX))!.text()).toBe(page);
});
