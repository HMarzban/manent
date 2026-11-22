import { expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const MEDIUM = "medium";
const untouched = async (): Promise<void> => {};

/** Makes a film in the Writers' room offline, opens it until it has loaded, does `touch` to it, and leaves it. */
async function leaveFilm(
  dana: TabServices,
  settle: () => Promise<void>,
  touch: (docId: string) => Promise<void>,
): Promise<string> {
  const { docId } = await dana.library.createProject(MEDIUM, "film");
  const { status } = dana.documents.open(docId);
  const opening = status.get();
  // loaded once its status is the handle's
  await until(() => status.get() !== opening);
  await settle();
  await touch(docId);
  dana.documents.close(docId);
  await settle();
  return docId;
}

test("a project left untouched offline is removed and never reaches the server; one typed in or renamed is kept, named in turn", async () => {
  const w = await createIndexWorld();
  await w.seedWorkspace(MEDIUM, [
    ["dana", "owner"],
    ["sam", "edit"],
  ]);
  const dana = await w.personServices({ person: DANA });
  const sam = await w.personServices({ person: SAM });
  sam.library.projects(MEDIUM);
  await w.settleAll();
  dana.sync.client.setOnline(false);
  const left = await leaveFilm(dana, w.settleAll, untouched);
  const typed = await leaveFilm(dana, w.settleAll, async (docId) => {
    const handle = await dana.sync.client.open(docId);
    const body = scriptBody(handle.doc());
    const id = body.materialize().content?.[0]?.content?.[0]?.attrs?.id;
    if (typeof id !== "string") throw new RangeError("no first block");
    body.write((writer) => writer.insertText(id, 0, "INT. "));
    await handle.close();
  });
  const renamed = await leaveFilm(dana, w.settleAll, async (docId) => {
    dana.library.renameDocument(docId, "Pilot");
  });
  await leaveFilm(dana, w.settleAll, untouched);
  const rows = (await dana.library.readProjects(MEDIUM)).map((row) => [
    row.firstDocId,
    row.title,
  ]);
  expect(rows.toSorted()).toEqual(
    [
      [typed, "Untitled film"],
      [renamed, "Untitled film 2"],
    ].toSorted(),
  );
  expect(rows.some(([docId]) => docId === left)).toBe(false);
  dana.sync.client.setOnline(true);
  await w.settleAll();
  const seen = await sam.library.readProjects(MEDIUM);
  expect(seen.map((row) => row.title).toSorted()).toEqual([
    "Untitled film",
    "Untitled film 2",
  ]);
});
