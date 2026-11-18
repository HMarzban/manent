import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDemoSignIn,
  createServer,
  createSignedSessionStore,
  DEMO_PEOPLE,
} from "../src/index.ts";
import type { ConnectionData, Identity, ServerConfig } from "../src/index.ts";

const CONTROL = { url: "http://127.0.0.1:4748", token: "t0ken" };
let seed: string | null = "s1";

const made: string[] = [];
afterAll(async () => {
  await Promise.all(
    made.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    demo: { seedId: () => seed, control: CONTROL },
    signIn: createDemoSignIn(),
    sessions: createSignedSessionStore({ secret: new Uint8Array(32).fill(3) }),
    allowedHosts: ["localhost:4747", "127.0.0.1:4747", "192.168.1.20:4747"],
    allowedOrigins: [
      "http://localhost:4747",
      "http://127.0.0.1:4747",
      "http://192.168.1.20:4747",
    ],
    openUrl: "http://192.168.1.20:4747",
    webDir: null,
    ...overrides,
  };
}

const config = makeConfig();
const server = createServer(config);

function fakeServer(address: string): Bun.Server<ConnectionData> {
  return {
    requestIP: () => ({
      address,
      family: address.includes(":") ? "IPv6" : "IPv4",
      port: 50_000,
    }),
    upgrade: () => false,
  } as unknown as Bun.Server<ConnectionData>;
}

async function fetchAt(
  url: string,
  init?: RequestInit,
  from = "127.0.0.1",
  on = server,
): Promise<Response> {
  const response = await on.fetch(new Request(url, init), fakeServer(from));
  if (!response) throw new Error("expected a response");
  return response;
}

const get = (path: string, session?: string) =>
  fetchAt(`http://localhost:4747${path}`, {
    headers: session ? { Authorization: `Bearer ${session}` } : {},
  });
const postRaw = (path: string, body: string) =>
  fetchAt(`http://localhost:4747${path}`, { method: "POST", body });
const post = (path: string, body: unknown) =>
  postRaw(path, JSON.stringify(body));

async function sessionFor(personId: string): Promise<string> {
  const response = await post("/api/sign-in", { personId });
  return ((await response.json()) as { session: string }).session;
}

test("health answers ok", async () => {
  const r = await get("/health");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});

test("a person is chosen, and the session names them", async () => {
  const signIn = await post("/api/sign-in", { personId: "leo" });
  expect(signIn.status).toBe(200);
  const { session, person } = (await signIn.json()) as {
    session: string;
    person: Identity;
  };
  expect(person).toEqual({ userId: "leo", name: "Leo Marsh" });
  expect(await (await get("/api/me", session)).json()).toEqual({
    userId: "leo",
    name: "Leo Marsh",
    workspaces: [{ id: "medium", name: "Writers' room", seeding: null }],
  });
  const dana = (await (
    await get("/api/me", await sessionFor("dana"))
  ).json()) as {
    workspaces: { id: string }[];
  };
  expect(dana.workspaces.map((w) => w.id)).toEqual(["medium", "heavy"]);
  const anonymous = await get("/api/me");
  expect(anonymous.status).toBe(401);
  expect(await anonymous.json()).toEqual({ error: "unauthenticated" });
  expect((await get("/api/me", "not-a-session")).status).toBe(401);
  const unknown = await post("/api/sign-in", { personId: "mallory" });
  expect(unknown.status).toBe(404);
  expect(await unknown.json()).toEqual({ error: "unknown_person" });
  for (const body of [
    "{not json",
    "{}",
    '{"personId":7}',
    "[]",
    '"leo"',
    "null",
    "",
  ]) {
    const r = await postRaw("/api/sign-in", body);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "bad_request" });
  }
});

test("the sign-in screen gets the people and no wording", async () => {
  expect(await (await get("/api/sign-in")).json()).toEqual({
    provider: "demo",
    people: DEMO_PEOPLE,
  });
});

test("a signed session for a person no longer listed is 401", async () => {
  expect((await get("/api/me", config.sessions.issue("ghost"))).status).toBe(
    401,
  );
});

test("demo mode is announced only when it is on, with the seed's id", async () => {
  expect(await (await get("/api/demo")).json()).toEqual({
    demo: true,
    seedId: "s1",
    control: CONTROL,
  });
  seed = "s2";
  expect(
    ((await (await get("/api/demo")).json()) as { seedId: string }).seedId,
  ).toBe("s2");
  seed = null;
  expect(
    ((await (await get("/api/demo")).json()) as { seedId: null }).seedId,
  ).toBeNull();
  seed = "s1";
  const withoutSupervisor = createServer(
    makeConfig({ demo: { seedId: () => "s1", control: null } }),
  );
  expect(
    await (
      await fetchAt(
        "http://localhost:4747/api/demo",
        {},
        "127.0.0.1",
        withoutSupervisor,
      )
    ).json(),
  ).toEqual({ demo: true, seedId: "s1", control: null });
  const notDemo = createServer(makeConfig({ demo: null }));
  const r = await fetchAt(
    "http://localhost:4747/api/demo",
    {},
    "127.0.0.1",
    notDemo,
  );
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: "not_found" });
});

async function controlSeenFrom(from: string): Promise<unknown> {
  const r = await fetchAt("http://localhost:4747/api/demo", {}, from);
  return ((await r.json()) as { control: unknown }).control;
}

test("control is given only to a loopback requester", async () => {
  for (const from of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    expect(await controlSeenFrom(from)).toEqual(CONTROL);
  }
  for (const from of ["192.168.1.30", "::ffff:192.168.1.30", "10.0.0.9"]) {
    expect(await controlSeenFrom(from)).toBeNull();
  }
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
    body: JSON.stringify({ personId: "leo" }),
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
  const web = createServer(makeConfig({ webDir }));
  const at = (path: string, init?: RequestInit) =>
    fetchAt(`http://localhost:4747${path}`, init, "127.0.0.1", web);

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
    const none = createServer(makeConfig({ webDir: dir }));
    const r = await fetchAt("http://localhost:4747/", {}, "127.0.0.1", none);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  }
});
