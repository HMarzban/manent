import { expect, test } from "bun:test";
import { createApi, createServerControl } from "../src/api.ts";

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  body: string | null;
}

type Answer =
  | { status: number; body?: unknown }
  | { status: number; text: string }
  | "reject";

/**
 * A fetch that records each request and answers from a list, in order. Like
 * a browser's fetch, it refuses to be called as a method of another object.
 */
function fakeFetch(...answers: Answer[]) {
  const calls: Call[] = [];
  const fn = async function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    if (this !== undefined) throw new TypeError("Illegal invocation");
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.get("Authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const answer = answers[calls.length - 1] ?? "reject";
    if (answer === "reject") throw new TypeError("Failed to fetch");
    const text =
      "text" in answer
        ? answer.text
        : answer.body === undefined
          ? null
          : JSON.stringify(answer.body);
    return new Response(text, {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetch: fn as typeof fetch, calls };
}

const LEO_ME = {
  userId: "leo",
  name: "Leo Marsh",
  workspaces: [{ id: "medium", name: "Writers' room", seeding: null }],
};
const CONTROL = { url: "http://127.0.0.1:4748", token: "ctl" };

/** The api of a tab signed in as "tok", over a fetch answering `answers`. */
const apiAnswering = (...answers: Answer[]) =>
  createApi({ fetch: fakeFetch(...answers).fetch, getToken: () => "tok" });

test("requests carry the tab's session as a bearer token", async () => {
  const f = fakeFetch({
    status: 200,
    body: { userId: "leo", name: "Leo Marsh", workspaces: [] },
  });
  const api = createApi({ fetch: f.fetch, getToken: () => "tok" });
  expect(await api.me()).toEqual({
    ok: true,
    me: { userId: "leo", name: "Leo Marsh", workspaces: [] },
  });
  expect(f.calls).toEqual([
    { url: "/api/me", method: "GET", authorization: "Bearer tok", body: null },
  ]);

  const anonymous = fakeFetch({
    status: 401,
    body: { error: "unauthenticated" },
  });
  expect(
    await createApi({ fetch: anonymous.fetch, getToken: () => null }).me(),
  ).toEqual({ ok: false, reason: "unauthenticated" });
  expect(anonymous.calls).toEqual([]);
});

test("me() tells unauthenticated from unreachable", async () => {
  expect(
    await apiAnswering({
      status: 401,
      body: { error: "unauthenticated" },
    }).me(),
  ).toEqual({ ok: false, reason: "unauthenticated" });
  expect(await apiAnswering("reject").me()).toEqual({
    ok: false,
    reason: "unreachable",
  });
  expect(await apiAnswering({ status: 502 }).me()).toEqual({
    ok: false,
    reason: "unreachable",
  });
});

test("me() gives the whole identity, workspaces included", async () => {
  const f = fakeFetch({ status: 200, body: LEO_ME });
  expect(
    await createApi({ fetch: f.fetch, getToken: () => "tok" }).me(),
  ).toEqual({ ok: true, me: LEO_ME });
});

test("a refusal is read from the body's code", async () => {
  expect(
    await apiAnswering({ status: 404, body: { error: "unknown_user" } }).signIn(
      "zed",
    ),
  ).toEqual({ ok: false, reason: "unknown_user" });
  expect(await apiAnswering({ status: 404 }).signIn("zed")).toEqual({
    ok: false,
    reason: "unreachable",
  });
  expect(
    await apiAnswering({
      status: 401,
      body: { error: "unauthenticated" },
    }).me(),
  ).toEqual({ ok: false, reason: "unauthenticated" });
  expect(
    await apiAnswering({ status: 401, body: { error: "forbidden_host" } }).me(),
  ).toEqual({ ok: false, reason: "unreachable" });
  expect(await apiAnswering({ status: 502 }).me()).toEqual({
    ok: false,
    reason: "unreachable",
  });
  expect(
    await apiAnswering({ status: 502, text: "<html>" }).signIn("leo"),
  ).toEqual({
    ok: false,
    reason: "unreachable",
  });
});

test("a 200 that is not the contract's is thrown, not called unreachable", async () => {
  await expect(
    createApi({
      fetch: fakeFetch({ status: 200, text: "<html>" }).fetch,
      getToken: () => "tok",
    }).me(),
  ).rejects.toThrow();
});

test("choices() lists who can sign in", async () => {
  const choices = [
    { userId: "leo", name: "Leo Marsh", title: "Writer", registered: true },
  ];
  const f = fakeFetch({ status: 200, body: { choices } });
  expect(
    await createApi({ fetch: f.fetch, getToken: () => null }).choices(),
  ).toEqual(choices);
  expect(f.calls[0]?.url).toBe("/api/sign-in");
  const down = fakeFetch("reject");
  await expect(
    createApi({ fetch: down.fetch, getToken: () => null }).choices(),
  ).rejects.toThrow(TypeError);
  const odd = fakeFetch({ status: 500 });
  await expect(
    createApi({ fetch: odd.fetch, getToken: () => null }).choices(),
  ).rejects.toThrow("GET /api/sign-in answered 500");
});

test("signIn() says when the server cannot be reached", async () => {
  const ok = fakeFetch({
    status: 200,
    body: { token: "tok", user: { userId: "leo", name: "Leo Marsh" } },
  });
  expect(
    await createApi({ fetch: ok.fetch, getToken: () => null }).signIn("leo"),
  ).toEqual({
    ok: true,
    person: { token: "tok", userId: "leo", name: "Leo Marsh" },
  });
  expect(ok.calls[0]).toMatchObject({
    url: "/api/sign-in",
    method: "POST",
    body: '{"userId":"leo"}',
  });

  const unknown = fakeFetch({ status: 404, body: { error: "unknown_user" } });
  expect(
    await createApi({ fetch: unknown.fetch, getToken: () => null }).signIn(
      "zed",
    ),
  ).toEqual({ ok: false, reason: "unknown_user" });
  const down = fakeFetch("reject");
  expect(
    await createApi({ fetch: down.fetch, getToken: () => null }).signIn("leo"),
  ).toEqual({ ok: false, reason: "unreachable" });
});

test("demo() tells 'not a demo' from 'cannot tell'", async () => {
  const body = { demo: true, seedId: "s1", control: CONTROL } as const;
  const yes = fakeFetch({ status: 200, body });
  expect(
    await createApi({ fetch: yes.fetch, getToken: () => null }).demo(),
  ).toEqual(body);
  expect(yes.calls[0]?.url).toBe("/api/demo");
  const no = fakeFetch({ status: 404, body: { error: "not_found" } });
  expect(
    await createApi({ fetch: no.fetch, getToken: () => null }).demo(),
  ).toBeNull();
  const down = fakeFetch("reject");
  await expect(
    createApi({ fetch: down.fetch, getToken: () => null }).demo(),
  ).rejects.toThrow(TypeError);
  const odd = fakeFetch({ status: 500 });
  await expect(
    createApi({ fetch: odd.fetch, getToken: () => null }).demo(),
  ).rejects.toThrow("GET /api/demo answered 500");
});

function controlAnswering(answer: Answer) {
  const f = fakeFetch(answer);
  return {
    calls: f.calls,
    client: createServerControl({ fetch: f.fetch, endpoint: CONTROL }),
  };
}

test("the server control narrows what it reads", async () => {
  for (const server of ["running", "stopped", "starting", "failed"] as const) {
    const { calls, client } = controlAnswering({
      status: 200,
      body: { server },
    });
    expect(await client.status()).toBe(server);
    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:4748/status",
      method: "GET",
      authorization: "Bearer ctl",
    });
  }
  for (const answer of [
    "reject",
    { status: 401, body: { error: "unauthenticated" } },
    { status: 200, body: { server: "sleeping" } },
    { status: 200, body: ["running"] },
    { status: 200, text: "<html>" },
  ] as const)
    expect([answer, await controlAnswering(answer).client.status()]).toEqual([
      answer,
      "unreachable",
    ]);

  const stop = controlAnswering({ status: 200, body: { server: "stopped" } });
  await stop.client.stop();
  expect(stop.calls).toEqual([
    {
      url: "http://127.0.0.1:4748/stop-server",
      method: "POST",
      authorization: "Bearer ctl",
      body: null,
    },
  ]);
  const start = controlAnswering({ status: 200, body: { server: "running" } });
  await start.client.start();
  expect(start.calls[0]).toMatchObject({
    url: "http://127.0.0.1:4748/start-server",
    method: "POST",
  });
});
