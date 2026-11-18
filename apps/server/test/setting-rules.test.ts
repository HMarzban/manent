import { afterAll, expect, test } from "bun:test";
import type { DocEvent, DocHandle } from "@manent/sync-client";
import { createBot, createTempTrees } from "@manent/testkit";
import type { Bot } from "@manent/testkit";
import { readServerEnv } from "../src/env.ts";
import { startServer } from "../src/main.ts";

const DOC = "0f3c9a52-7d1e-4b8a-9c6f-2e5d8b1a4c73";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";

const trees = createTempTrees("manent-setting-rules-");
afterAll(() => trees.removeAll());

async function signIn(url: string, userId: string): Promise<string> {
  const body: unknown = await (
    await fetch(`${url}/api/sign-in`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    })
  ).json();
  if (typeof body !== "object" || body === null || !("token" in body))
    throw new Error(`the sign-in of ${userId} gave no token`);
  return String(body.token);
}

async function createScript(url: string, token: string): Promise<void> {
  const response = await fetch(`${url}/api/docs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      docId: DOC,
      kind: "script",
      home: `project:${PROJECT}`,
    }),
  });
  if (response.status !== 200)
    throw new Error(`creating the script was answered ${response.status}`);
}

/** Resolves once the handle is synced with nothing waiting: every request it sent is answered. */
function settled(handle: DocHandle): Promise<void> {
  const done = () => {
    const status = handle.status.get();
    return status.synced && status.waiting === 0;
  };
  return new Promise((resolve) => {
    if (done()) return resolve();
    const stop = handle.status.subscribe(() => {
      if (!done()) return;
      stop();
      resolve();
    });
  });
}

test(
  "the running server accepts a script setting from an editor",
  async () => {
    const dataDir = await trees.tree({});
    const env = { ...readServerEnv({ MANENT_DEMO: "1" }), port: 0, dataDir };
    const server = await startServer(env);
    const [url = ""] = server.urls;
    const token = await signIn(url, "sam");
    await createScript(url, token);
    const bots: Bot[] = [];
    const bot = (): Bot => {
      const made = createBot({ server: { url }, userId: "sam", token });
      bots.push(made);
      return made;
    };
    try {
      const writer = await bot().open(DOC);
      await settled(writer);
      const events: DocEvent[] = [];
      writer.on((event) => events.push(event));
      writer.setSetting("script.paper", "a4");
      await settled(writer);
      const reader = await bot().open(DOC);
      await settled(reader);
      expect([events, reader.settings.get()["script.paper"]]).toEqual([
        [],
        "a4",
      ]);
    } finally {
      await Promise.all(bots.map((b) => b.close()));
      await server.stop();
    }
  },
  { timeout: 30_000 },
);
