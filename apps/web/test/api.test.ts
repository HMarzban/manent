import { expect, test } from "bun:test";
import { createApi, createServerControl } from "../src/api.ts";

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  body: string | null;
}

type Answer = { status: number; body?: unknown } | "reject";

/** A fetch that records each request and answers from a list, in order. */
function fakeFetch(...answers: Answer[]) {
  const calls: Call[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.get("Authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const answer = answers[calls.length - 1] ?? "reject";
    if (answer === "reject") throw new TypeError("Failed to fetch");
    return new Response(
      answer.body === undefined ? null : JSON.stringify(answer.body),
      {
        status: answer.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  return { fetch: fn as typeof fetch, calls };
}

test("requests carry the tab's session as a bearer token", async () => {
  const f = fakeFetch({
    status: 200,
    body: { userId: "leo", name: "Leo Marsh", workspaces: [] },
  });
  const api = createApi(f.fetch, () => "tok");
  expect(await api.me()).toEqual({
    status: "ok",
    userId: "leo",
    name: "Leo Marsh",
  });
  expect(f.calls).toEqual([
    { url: "/api/me", method: "GET", authorization: "Bearer tok", body: null },
  ]);

  const anonymous = fakeFetch({
    status: 401,
    body: { error: "unauthenticated" },
  });
  await createApi(anonymous.fetch, () => null).me();
  expect(anonymous.calls[0]?.authorization).toBeNull();
});

test("me() tells unauthenticated from unreachable", async () => {
  const no = fakeFetch({ status: 401, body: { error: "unauthenticated" } });
  expect(await createApi(no.fetch, () => "tok").me()).toEqual({
    status: "unauthenticated",
  });
  const down = fakeFetch("reject");
  expect(await createApi(down.fetch, () => "tok").me()).toEqual({
    status: "unreachable",
  });
  const broken = fakeFetch({ status: 502 });
  expect(await createApi(broken.fetch, () => "tok").me()).toEqual({
    status: "unreachable",
  });
});

test("people() lists who can sign in", async () => {
  const people = [{ id: "leo", name: "Leo Marsh", role: "Writer" }];
  const f = fakeFetch({ status: 200, body: { provider: "demo", people } });
  expect(await createApi(f.fetch, () => null).people()).toEqual(people);
  expect(f.calls[0]?.url).toBe("/api/sign-in");
  const down = fakeFetch("reject");
  await expect(createApi(down.fetch, () => null).people()).rejects.toThrow();
});

test("signIn() says when the server cannot be reached", async () => {
  const ok = fakeFetch({
    status: 200,
    body: { session: "tok", person: { userId: "leo", name: "Leo Marsh" } },
  });
  expect(await createApi(ok.fetch, () => null).signIn("leo")).toEqual({
    status: "ok",
    person: { token: "tok", userId: "leo", name: "Leo Marsh" },
  });
  expect(ok.calls[0]).toMatchObject({
    url: "/api/sign-in",
    method: "POST",
    body: JSON.stringify({ personId: "leo" }),
  });

  const unknown = fakeFetch({ status: 404, body: { error: "unknown_person" } });
  expect(await createApi(unknown.fetch, () => null).signIn("zed")).toEqual({
    status: "unknown_person",
  });
  const down = fakeFetch("reject");
  expect(await createApi(down.fetch, () => null).signIn("leo")).toEqual({
    status: "unreachable",
  });
});

test("demo() tells 'not a demo' from 'cannot tell'", async () => {
  const body = {
    demo: true,
    seedId: "s1",
    control: { url: "http://127.0.0.1:4748", token: "ctl" },
  };
  const yes = fakeFetch({ status: 200, body });
  expect(await createApi(yes.fetch, () => null).demo()).toEqual({
    seedId: "s1",
    control: { url: "http://127.0.0.1:4748", token: "ctl" },
  });
  expect(yes.calls[0]?.url).toBe("/api/demo");
  const no = fakeFetch({ status: 404, body: { error: "not_found" } });
  expect(await createApi(no.fetch, () => null).demo()).toBeNull();
  const down = fakeFetch("reject");
  await expect(createApi(down.fetch, () => null).demo()).rejects.toThrow();
  const odd = fakeFetch({ status: 500 });
  await expect(createApi(odd.fetch, () => null).demo()).rejects.toThrow();
});

test("the server control reads four states and a fifth when nothing answers", async () => {
  const control = { url: "http://127.0.0.1:4748", token: "ctl" };
  for (const server of ["running", "stopped", "starting", "failed"] as const) {
    const f = fakeFetch({ status: 200, body: { server } });
    expect(await createServerControl(f.fetch, control).status()).toBe(server);
    expect(f.calls[0]).toMatchObject({
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
  ] as const) {
    const f = fakeFetch(answer);
    expect(await createServerControl(f.fetch, control).status()).toBe(
      "unreachable",
    );
  }

  const stop = fakeFetch({ status: 200, body: { server: "stopped" } });
  await createServerControl(stop.fetch, control).stop();
  expect(stop.calls).toEqual([
    {
      url: "http://127.0.0.1:4748/stop-server",
      method: "POST",
      authorization: "Bearer ctl",
      body: null,
    },
  ]);
  const start = fakeFetch({ status: 200, body: { server: "running" } });
  await createServerControl(start.fetch, control).start();
  expect(start.calls[0]).toMatchObject({
    url: "http://127.0.0.1:4748/start-server",
    method: "POST",
  });
});
