import { afterAll, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readServerEnv } from "../src/env.ts";
import { startServer } from "../src/main.ts";
import type { RunningServer } from "../src/main.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";

const trees = createTempTrees("manent-sync-start-");
afterAll(() => trees.removeAll());

/** Signs `userId` in and asks for `docId` in PROJECT; the body of the answer, unread. */
async function createDoc(
  on: RunningServer,
  userId: string,
  docId: string,
): Promise<unknown> {
  const [url] = on.urls;
  const signedIn: unknown = await (
    await fetch(`${url}/api/sign-in`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    })
  ).json();
  const token =
    typeof signedIn === "object" && signedIn !== null && "token" in signedIn
      ? String(signedIn.token)
      : "";
  const response = await fetch(`${url}/api/docs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ docId, kind: "script", home: `project:${PROJECT}` }),
  });
  return response.json();
}

test(
  "the server program keeps documents across a stop and a start",
  async () => {
    const dataDir = await trees.tree({});
    const env = { ...readServerEnv({ MANENT_DEMO: "1" }), port: 0, dataDir };
    const first = await startServer(env);
    expect(await createDoc(first, "sam", DOC)).toMatchObject({ created: true });
    await first.stop();
    expect((await readdir(join(env.dataDir, "data"))).toSorted()).toContain(
      "control.sqlite",
    );
    const second = await startServer(env);
    expect(await createDoc(second, "sam", DOC)).toMatchObject({
      created: false,
    });
    await second.stop();
  },
  { timeout: 30_000 },
);
