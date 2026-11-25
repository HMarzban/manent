import { expect, test } from "bun:test";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import type { TabPerson } from "../src/session.ts";
import { DANA, createIndexWorld } from "./index.fixtures.ts";
import type { IndexWorld, TabServices } from "./index.fixtures.ts";
import { turn } from "./sync.fixtures.ts";

const YOU: TabPerson = Object.freeze({
  token: null,
  userId: "you",
  name: "You",
});
const YOU_SIGNED_IN: TabPerson = Object.freeze({ ...YOU, token: "token-you" });

/** You, before signing in, with three scripts on Your desk, their projects' indexes and a preference set. */
async function yourDesk(): Promise<{
  w: IndexWorld;
  scripts: string[];
  projectIndexes: string[];
}> {
  const w = await createIndexWorld();
  const local = await w.personServices({ person: YOU });
  const scripts: string[] = [];
  const projectIndexes: string[] = [];
  for (const kind of ["film", "podcast", "book"] as const) {
    const made = await local.library.createProject("you", kind);
    scripts.push(made.docId);
    projectIndexes.push(indexDocId("project", made.projectId));
  }
  local.settings.set("appearance.theme", "dark");
  await w.settleAll();
  expect(w.serverContacts()).toBe(0);
  local.dispose();
  return { w, scripts, projectIndexes };
}

/** Delivers one frame at a time, a frame's time passing when none is queued, until `done`. */
async function stepUntil(w: IndexWorld, done: () => boolean): Promise<void> {
  for (let i = 0; i < 5_000 && !done(); i++) {
    if (!w.world.network.step()) w.world.clock.advance(16);
    await turn();
  }
  expect(done()).toBe(true);
}

/** Each of the person's documents on this device, and whether the server has all of it. */
async function synced(person: TabServices): Promise<Record<string, boolean>> {
  const listed = await person.sync.client.documents();
  return Object.fromEntries(
    listed.map((d) => [d.docId, !d.neverSynced && d.waiting === 0]),
  );
}

test("Sign in to sync hands You's scripts, preferences and Library to the server", async () => {
  const { w, scripts, projectIndexes } = await yourDesk();
  const signedIn = await w.personServices({ person: YOU_SIGNED_IN });
  await w.settleAll();
  const privateIndex = indexDocId("user", "you");
  const desk = indexDocId("workspace", "you");
  expect(await synced(signedIn)).toEqual(
    Object.fromEntries(
      [privateIndex, desk, ...scripts, ...projectIndexes].map((id) => [
        id,
        true,
      ]),
    ),
  );
  expect(w.serverHomeOf(privateIndex)).toBe("user:you");
  expect(w.serverHomeOf(desk)).toBe(workspaceHome("you"));
});

test("switching person mid-sync sends nothing under the new person and leaves the old person's work waiting", async () => {
  const { w, scripts } = await yourDesk();
  const signedIn = await w.personServices({ person: YOU_SIGNED_IN });
  await stepUntil(w, () => w.sentUnder("token-you").length > 0);
  signedIn.dispose();
  await w.personServices({ person: DANA });
  await w.settleAll();
  expect(
    w.sentUnder("token-dana").filter((docId) => scripts.includes(docId)),
  ).toEqual([]);

  const again = await w.personServices({ person: YOU_SIGNED_IN });
  const before = await synced(again);
  expect(scripts.map((docId) => before[docId])).toEqual([false, false, false]);
  await w.settleAll();
  const after = await synced(again);
  expect(scripts.map((docId) => after[docId])).toEqual([true, true, true]);
});
