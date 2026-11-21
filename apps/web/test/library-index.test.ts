import { expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import { projectHome } from "@manent/sync-protocol";
import fc from "fast-check";
import {
  projectItems,
  readWorkspace,
} from "../src/services/sync/index-entries.ts";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const MEDIUM = "medium";
const MINUTE_MS = 60_000;

/** Dana and Sam, each in a tab of their own, both members of the Writers' room. */
async function writersRoom() {
  const w = await createIndexWorld();
  await w.seedWorkspace(MEDIUM, [
    ["dana", "owner"],
    ["sam", "edit"],
  ]);
  const dana = await w.personServices({ person: DANA });
  const sam = await w.personServices({ person: SAM });
  return { ...w, dana, sam };
}

/** Types at the start of the first block of a document, as the person. */
async function typeInto(person: TabServices, docId: string, text: string) {
  const handle = await person.sync.client.open(docId);
  const body = scriptBody(handle.doc());
  const id = body.materialize().content?.[0]?.content?.[0]?.attrs?.id;
  if (typeof id !== "string") throw new RangeError("no first block");
  body.write((w) => w.insertText(id, 0, text));
  await handle.close();
}

test("a script Dana makes in the Writers' room appears in Sam's Library, with its place, and Sam can open it", async () => {
  const { dana, sam, settleAll, serverHomeOf } = await writersRoom();
  sam.library.projects(MEDIUM);
  const made = await dana.library.createProject(MEDIUM, "film");
  await settleAll();
  expect(serverHomeOf(made.docId)).toBe(projectHome(made.projectId));
  expect(sam.library.projects(MEDIUM).get()).toMatchObject([
    {
      title: "Untitled film",
      kind: "film",
      firstDocId: made.docId,
      place: { kind: "not_on_device" },
    },
  ]);
  sam.documents.open(made.docId);
  await settleAll();
  // the row reads the device's store again once the script has synced here
  const rows = sam.library.projects(MEDIUM);
  await until(() => rows.get()[0]?.place.kind === "synced");
  expect(rows.get()[0]?.place).toEqual({ kind: "synced" });
});

test("a project made offline is in the Library at once and on the server after the next connection", async () => {
  const { dana, settleAll, serverHomeOf } = await writersRoom();
  await settleAll();
  dana.sync.client.setOnline(false);
  const made = await dana.library.createProject(MEDIUM, "series");
  await until(() => dana.library.projects(MEDIUM).get().length === 1);
  expect(dana.library.projects(MEDIUM).get()).toMatchObject([
    {
      title: "Untitled series",
      kind: "series",
      place: { kind: "never_synced" },
    },
  ]);
  await settleAll();
  expect(serverHomeOf(made.docId)).toBeNull();
  dana.sync.client.setOnline(true);
  await settleAll();
  expect(serverHomeOf(made.docId)).toBe(`project:${made.projectId}`);
});

test("Continue lists what this person opened, newest first, in that workspace", async () => {
  const { dana, sam, world, settleAll } = await writersRoom();
  const first = await dana.library.createProject(MEDIUM, "film");
  const second = await dana.library.createProject(MEDIUM, "podcast");
  const own = await sam.library.createProject("sam", "book");
  await settleAll();
  for (const { docId } of [second, own, first]) {
    sam.documents.open(docId);
    await settleAll();
    world.clock.advance(MINUTE_MS);
  }
  await until(() => sam.library.continueList(MEDIUM).get().length === 2);
  expect(sam.library.continueList(MEDIUM).get()).toEqual([
    {
      docId: first.docId,
      title: "Untitled script",
      projectTitle: "Untitled film",
      kind: "film",
      place: { kind: "synced" },
    },
    {
      docId: second.docId,
      title: "Untitled script",
      projectTitle: "Untitled podcast",
      kind: "podcast",
      place: { kind: "synced" },
    },
  ]);
  const desk = sam.library.continueList("sam");
  await until(() => desk.get().length > 0);
  expect(desk.get().map((i) => i.docId)).toEqual([own.docId]);
  expect(dana.library.continueList(MEDIUM).get()).toEqual([]);
});

test("a script someone else edited since you opened it says so", async () => {
  const { dana, sam, world, settleAll } = await writersRoom();
  const made = await dana.library.createProject(MEDIUM, "film");
  dana.documents.open(made.docId);
  await settleAll();
  await typeInto(dana, made.docId, "INT. ");
  await settleAll();
  sam.documents.open(made.docId);
  await settleAll();
  expect((await sam.library.readProjects(MEDIUM))[0]?.lastEdited).toEqual({
    byName: "Dana",
    at: expect.any(Number),
  });
  sam.documents.close(made.docId);
  world.clock.advance(10 * MINUTE_MS);
  await typeInto(dana, made.docId, "DAY ");
  await settleAll();
  expect((await sam.library.readProjects(MEDIUM))[0]?.lastEdited).toEqual({
    changedSinceOpened: true,
  });
});

const KINDS = ["film", "book", "radio"] as const;

/** A project entry near the shape the Library reads: each field valid, of another type, or absent. */
const nearProject = fc.record(
  {
    title: fc.oneof(fc.string({ maxLength: 4 }), fc.constant(7)),
    kind: fc.constantFrom(...KINDS),
    createdAt: fc.oneof(fc.integer(), fc.constant(1.5), fc.constant("1")),
    createdByUserId: fc.oneof(fc.constant("dana"), fc.constant(null)),
  },
  { requiredKeys: [] },
);

const isReadable = (entry: Readonly<Record<string, unknown>>): boolean =>
  typeof entry.title === "string" &&
  (entry.kind === "film" || entry.kind === "book") &&
  Number.isSafeInteger(entry.createdAt) &&
  typeof entry.createdByUserId === "string";

test("the Library lists every project entry whose shape it reads, passes over the rest, and keeps them all", () => {
  fc.assert(
    fc.property(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 3 }),
        fc.oneof(nearProject, fc.jsonValue()),
        { maxKeys: 6 },
      ),
      (entries) => {
        const doc = createDoc({ clientId: 1 });
        const projects = jsonMap(doc, "projects");
        // what a map refuses to hold (a __proto__ key) never reaches a reader
        const stored = Object.entries(entries).filter(([key, value]) => {
          try {
            projects.set(key, value);
            return true;
          } catch (error) {
            if (error instanceof TypeError) return false;
            throw error;
          }
        });
        const index = readWorkspace({
          projects,
          documents: jsonMap(doc, "documents"),
        });
        const listed = projectItems(index, {
          userId: "sam",
          summaries: new Map(),
          continued: new Map(),
          nameOf: (userId) => userId,
        }).map((item) => item.projectId);
        const readable = stored.flatMap(([key, value]) =>
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          isReadable(value)
            ? [key]
            : [],
        );
        expect(listed.toSorted()).toEqual(readable.toSorted());
        expect(projects.keys()).toEqual(stored.map(([key]) => key).toSorted());
      },
    ),
    { numRuns: 300 },
  );
});
