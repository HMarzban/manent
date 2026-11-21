import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DemoResponse, SignInResponse } from "@manent/sync-protocol";
import { createServer } from "../src/index.ts";
import type { ManentServer, RequestContext } from "../src/index.ts";
import { CONTROL, HTTP, makeConfig } from "./config.ts";

const made: string[] = [];
afterAll(async () => {
  await Promise.all(
    made.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const peer = (remoteAddress = "127.0.0.1"): RequestContext => ({
  remoteAddress,
  upgrade: () => false,
});

/** The server's answer; no request here is upgraded. */
async function answer(
  on: ManentServer,
  request: Request,
  from = "127.0.0.1",
): Promise<Response> {
  const response = await on.fetch(request, peer(from));
  if (response === null) throw new TypeError(`${request.url} was upgraded`);
  return response;
}

const server = createServer(makeConfig());
const fetchAt = (url: string, init?: RequestInit, on = server) =>
  answer(on, new Request(url, init));
const get = (path: string, token?: string) =>
  fetchAt(`http://localhost:4747${path}`, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
const getFrom = (path: string, from: string) =>
  answer(server, new Request(`http://localhost:4747${path}`), from);
const postRaw = (path: string, body: string) =>
  fetchAt(`http://localhost:4747${path}`, { method: "POST", body });
const post = (path: string, body: unknown) =>
  postRaw(path, JSON.stringify(body));

test("health answers ok", async () => {
  const r = await get("/health");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});

test("a person signs in and the token names them", async () => {
  const signIn = await post("/api/sign-in", { userId: "leo" });
  const body = (await signIn.json()) as SignInResponse;
  expect([signIn.status, body.user]).toEqual([
    200,
    { userId: "leo", name: "Leo Marsh" },
  ]);
  expect(await (await get("/api/me", body.token)).json()).toEqual({
    userId: "leo",
    name: "Leo Marsh",
    workspaces: [{ id: "medium", name: "Writers' room", seeding: null }],
  });
});

test("a person nobody knows is 404 unknown_user", async () => {
  const r = await post("/api/sign-in", { userId: "mallory" });
  expect([r.status, await r.json()]).toEqual([404, { error: "unknown_user" }]);
});

test("a body the provider cannot read is 400 bad_request", async () => {
  for (const body of ["not json", '{"userId":7}', "[]", "null", "{}", ""]) {
    const r = await postRaw("/api/sign-in", body);
    expect([body, r.status, await r.json()]).toEqual([
      body,
      400,
      { error: "bad_request" },
    ]);
  }
});

test("without a session, me is 401 unauthenticated", async () => {
  for (const token of [undefined, "nonsense"]) {
    const r = await get("/api/me", token);
    expect([r.status, await r.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
  }
});

test("the sign-in screen gets the choices and no wording", async () => {
  expect(await (await get("/api/sign-in")).json()).toEqual({
    choices: [
      { userId: "leo", name: "Leo Marsh", title: "", registered: true },
      { userId: "ana", name: "Ana Costa", title: "", registered: true },
    ],
  });
});

test("a signed session for a user the directory no longer lists is 401", async () => {
  const token = makeConfig().auth.sessions.issue("gone");
  const r = await get("/api/me", token);
  expect([r.status, await r.json()]).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
});

test("demo mode is announced only when it is on, with the seed's id", async () => {
  let seed: string | null = "s1";
  const demo = createServer(
    makeConfig({
      demo: { seedId: () => seed, control: CONTROL, controls: null },
    }),
  );
  const seedId = async () =>
    (
      (await (
        await fetchAt("http://localhost:4747/api/demo", {}, demo)
      ).json()) as DemoResponse
    ).seedId;
  expect(
    await (await fetchAt("http://localhost:4747/api/demo", {}, demo)).json(),
  ).toEqual({ demo: true, seedId: "s1", control: CONTROL });
  seed = "s2";
  expect(await seedId()).toBe("s2");
  seed = null;
  expect(await seedId()).toBeNull();
  const withoutSupervisor = createServer(
    makeConfig({ demo: { seedId: () => "s1", control: null, controls: null } }),
  );
  expect(
    await (
      await fetchAt("http://localhost:4747/api/demo", {}, withoutSupervisor)
    ).json(),
  ).toEqual({ demo: true, seedId: "s1", control: null });
  const notDemo = createServer(makeConfig({ demo: null }));
  const r = await fetchAt("http://localhost:4747/api/demo", {}, notDemo);
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: "not_found" });
});

const control = async (from: string) =>
  ((await (await getFrom("/api/demo", from)).json()) as DemoResponse).control;

test("control is given only to a loopback requester", async () => {
  for (const from of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"])
    expect(await control(from)).toEqual(CONTROL);
  for (const from of ["192.168.1.20", "localhost", "fe80::1%eth0", ""])
    expect(await control(from)).toBeNull();
});

test("a request for another host is refused before any handler runs", async () => {
  for (const url of [
    "http://evil.example:4747/api/sign-in",
    "http://localhost:9999/api/me",
    "http://localhost/api/demo",
  ]) {
    const r = await fetchAt(url);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "forbidden_host" });
  }
  const signIn = await fetchAt("http://evil.example:4747/api/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId: "leo" }),
  });
  expect(signIn.status).toBe(403);
  const page = await fetchAt("http://macbook.local:4747/");
  expect(page.status).toBe(403);
  expect(await page.text()).toBe("Open Manent at http://192.168.1.20:4747.");
  expect((await fetchAt("http://macbook.local:4747/health")).status).toBe(403);
});

test("other API paths and methods are not found", async () => {
  for (const [path, method] of [
    ["/api/nope", "GET"],
    ["/api/me", "POST"],
    ["/api/sign-in", "DELETE"],
    ["/api", "GET"],
  ] as const) {
    const r = await fetchAt(`http://localhost:4747${path}`, { method });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  }
});

test("the web app is served, with a fallback for app routes and none for the API", async () => {
  const root = await mkdtemp(join(tmpdir(), "manent-web-"));
  made.push(root);
  const webDir = join(root, "web");
  await mkdir(join(webDir, "assets"), { recursive: true });
  await writeFile(join(root, "secret.txt"), "the secret");
  await writeFile(
    join(webDir, "index.html"),
    "<!doctype html><title>app</title>",
  );
  await writeFile(join(webDir, "chunk-abc.js"), "export const a = 1;");
  await writeFile(join(webDir, "assets", "font.css"), "body{}");
  await symlink(join(root, "secret.txt"), join(webDir, "linked.txt"));
  const web = createServer(makeConfig({ http: { ...HTTP, webDir } }));
  const at = (path: string, init?: RequestInit) =>
    fetchAt(`http://localhost:4747${path}`, init, web);

  for (const path of ["/", "/s/01a1b2c3", "/choose?next=%2F", "/missing.js"]) {
    const r = await at(path);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toStartWith("text/html");
    expect(await r.text()).toBe("<!doctype html><title>app</title>");
  }
  const chunk = await at("/chunk-abc.js");
  expect(chunk.status).toBe(200);
  expect(chunk.headers.get("content-type")).toStartWith("text/javascript");
  expect(await chunk.text()).toBe("export const a = 1;");
  expect(await (await at("/assets/font.css")).text()).toBe("body{}");

  const api = await at("/api/nope");
  expect(api.status).toBe(404);
  expect(await api.json()).toEqual({ error: "not_found" });

  for (const path of [
    "/..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
    "/%2e%2e/secret.txt",
    "/../secret.txt",
    "/assets/..%2f..%2fsecret.txt",
    "/linked.txt",
    "/%E0%A4%A",
    "/a%00b",
  ]) {
    expect(await (await at(path)).text()).not.toContain("the secret");
  }

  const posted = await at("/", { method: "POST" });
  expect(posted.status).toBe(404);
  expect(await posted.json()).toEqual({ error: "not_found" });

  for (const dir of [null, join(root, "absent")]) {
    const none = createServer(makeConfig({ http: { ...HTTP, webDir: dir } }));
    const r = await fetchAt("http://localhost:4747/", {}, none);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  }
});
