import { expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import type { JsonMapView } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId, projectHome } from "@manent/sync-protocol";
import fc from "fast-check";
import {
  continueItems,
  projectItems,
  readContinueMap,
  readWorkspace,
} from "../src/services/sync/index-entries.ts";
import { checkCleared } from "../src/services/sync/on-device.ts";
import { openPrivateIndex } from "../src/services/sync/private-index.ts";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import { mostly } from "./arbitraries.ts";
import { MemoryStorage } from "./services.fixtures.ts";
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

test("a script Dana makes in the Writers' room is fetched to Sam's device while he is online, and his row reads Synced", async () => {
  const { dana, sam, settleAll, serverHomeOf } = await writersRoom();
  sam.library.projects(MEDIUM);
  const made = await dana.library.createProject(MEDIUM, "film");
  await settleAll();
  expect(serverHomeOf(made.docId)).toBe(projectHome(made.projectId));
  const rows = sam.library.projects(MEDIUM);
  await until(() => rows.get()[0]?.place.kind === "synced");
  expect(rows.get()).toMatchObject([
    {
      title: "Untitled film",
      kind: "film",
      firstDocId: made.docId,
      place: { kind: "synced" },
    },
  ]);
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
      place: { kind: "waiting", count: 3 },
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

test("Continue lists a script opened here and left before it had loaded", async () => {
  const { sam, settleAll } = await writersRoom();
  const made = await sam.library.createProject(MEDIUM, "film");
  await settleAll();
  sam.documents.open(made.docId);
  sam.documents.close(made.docId);
  await settleAll();
  expect(
    sam.library
      .continueList(MEDIUM)
      .get()
      .map((item) => item.docId),
  ).toEqual([made.docId]);
});

test("a script someone else edited since you opened it says so", async () => {
  const { dana, sam, world, settleAll } = await writersRoom();
  const made = await dana.library.createProject(MEDIUM, "film");
  dana.documents.open(made.docId);
  const project = dana.library.documentProject(made.docId);
  await until(() => project.get() === made.projectId);
  expect(project.get()).toBe(made.projectId);
  expect(dana.library.documentProject("unknown-doc").get()).toBeNull();
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

/** Writes each entry the map can hold into it, and returns those; what it refuses (a __proto__ key) never reaches a reader. */
function storeEach(
  map: JsonMapView,
  entries: Readonly<Record<string, unknown>>,
): [string, unknown][] {
  return Object.entries(entries).filter(([key, value]) => {
    try {
      map.set(key, value);
      return true;
    } catch (error) {
      if (error instanceof TypeError) return false;
      throw error;
    }
  });
}

const isFieldsValue = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
        const stored = storeEach(projects, entries);
        const index = readWorkspace({
          projects,
          documents: jsonMap(doc, "documents"),
        });
        const listed = projectItems(index, {
          userId: "sam",
          signedIn: true,
          online: false,
          summaries: new Map(),
          fetched: new Set(),
          refused: new Set(),
          continued: new Map(),
          nameOf: (userId) => userId,
        }).map((item) => item.projectId);
        const readable = stored.flatMap(([key, value]) =>
          isFieldsValue(value) && isReadable(value) ? [key] : [],
        );
        expect(listed.toSorted()).toEqual(readable.toSorted());
        expect(projects.keys()).toEqual(stored.map(([key]) => key).toSorted());
      },
    ),
    { numRuns: 300 },
  );
});

/** A document entry near the shape the Library reads: each field valid, or of another type. */
const nearDocument = fc.record({
  projectId: mostly(fc.constant("p1"), fc.constant(7)),
  title: mostly(fc.string({ maxLength: 4 }), fc.constant(7)),
  kind: mostly(fc.constantFrom("script", "index"), fc.constant("film")),
  createdAt: mostly(fc.integer(), fc.constant(1.5), fc.constant("1")),
  editedAt: mostly(
    fc.oneof(fc.integer({ min: 0 }), fc.constant(null)),
    fc.constant(1.5),
  ),
  editedByUserId: mostly(fc.constantFrom("dana", null), fc.constant(7)),
});

const isReadableDocument = (entry: Readonly<Record<string, unknown>>) =>
  typeof entry.projectId === "string" &&
  typeof entry.title === "string" &&
  (entry.kind === "script" || entry.kind === "index") &&
  Number.isSafeInteger(entry.createdAt) &&
  (entry.editedAt === null || Number.isSafeInteger(entry.editedAt)) &&
  (entry.editedByUserId === null || typeof entry.editedByUserId === "string");

/** The one project every generated document names. */
const P1 = Object.freeze({
  title: "Night Shift",
  kind: "film",
  createdAt: 1,
  createdByUserId: "dana",
});

test("every document entry the Library reads is listed in Continue and dates its project, and the rest are passed over and kept", () => {
  fc.assert(
    fc.property(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 3 }),
        fc.oneof(nearDocument, fc.jsonValue()),
        { maxKeys: 6 },
      ),
      (entries) => {
        const doc = createDoc({ clientId: 1 });
        const projects = jsonMap(doc, "projects");
        projects.set("p1", P1);
        const documents = jsonMap(doc, "documents");
        const stored = storeEach(documents, entries);
        const index = readWorkspace({ projects, documents });
        const readable = stored.flatMap(([key, value]) =>
          isFieldsValue(value) && isReadableDocument(value)
            ? [{ key, value }]
            : [],
        );
        const facts = {
          userId: "sam",
          signedIn: true,
          online: false,
          summaries: new Map(),
          fetched: new Set<string>(),
          refused: new Set<string>(),
          continued: new Map(
            stored.map(([key]) => [
              key,
              { workspaceId: MEDIUM, openedAt: Number.MAX_SAFE_INTEGER },
            ]),
          ),
          nameOf: (userId: string) => userId,
        };
        const continued = continueItems(MEDIUM, index, facts);
        const edits = readable.flatMap(({ value }) =>
          typeof value.editedAt === "number" &&
          typeof value.editedByUserId === "string"
            ? [value.editedAt]
            : [],
        );
        expect([
          continued.map((item) => item.docId).toSorted(),
          projectItems(index, facts)[0]?.lastEdited,
          documents.keys(),
        ]).toEqual([
          readable.map(({ key }) => key).toSorted(),
          {
            byName: "dana",
            at: edits.length === 0 ? P1.createdAt : Math.max(...edits),
          },
          stored.map(([key]) => key).toSorted(),
        ]);
      },
    ),
    { numRuns: 300 },
  );
});

/** A Continue entry near the shape the Library reads. */
const nearContinue = fc.record({
  workspaceId: mostly(fc.constantFrom(MEDIUM, "other"), fc.constant(7)),
  openedAt: mostly(fc.integer({ min: 0 }), fc.constant(1.5), fc.constant("1")),
});

const CONTINUED = ["d1", "d2", "d3", "d4"] as const;

test("every Continue entry the Library reads of a workspace is listed, newest first, and the rest are passed over and kept", () => {
  fc.assert(
    fc.property(
      fc.dictionary(
        fc.constantFrom(...CONTINUED),
        fc.oneof(nearContinue, fc.jsonValue()),
      ),
      (entries) => {
        const doc = createDoc({ clientId: 1 });
        const projects = jsonMap(doc, "projects");
        projects.set("p1", P1);
        const documents = jsonMap(doc, "documents");
        for (const docId of CONTINUED)
          documents.set(docId, {
            projectId: "p1",
            title: docId,
            kind: "script",
            createdAt: 1,
            editedAt: null,
            editedByUserId: null,
          });
        const map = jsonMap(doc, "continue");
        const stored = storeEach(map, entries);
        const listed = continueItems(
          MEDIUM,
          readWorkspace({ projects, documents }),
          {
            userId: "sam",
            signedIn: true,
            online: false,
            summaries: new Map(),
            fetched: new Set(),
            refused: new Set(),
            continued: readContinueMap(map),
            nameOf: (userId) => userId,
          },
        ).map((item) => item.docId);
        const openedAt = new Map(
          stored.flatMap(([key, value]) =>
            isFieldsValue(value) &&
            value.workspaceId === MEDIUM &&
            typeof value.openedAt === "number" &&
            Number.isSafeInteger(value.openedAt)
              ? [[key, value.openedAt]]
              : [],
          ),
        );
        const times = listed.map((docId) => openedAt.get(docId));
        expect([listed.toSorted(), times, map.keys()]).toEqual([
          [...openedAt.keys()].toSorted(),
          times.toSorted((a = 0, b = 0) => b - a),
          stored.map(([key]) => key).toSorted(),
        ]);
      },
    ),
    { numRuns: 300 },
  );
});

/** An entry of what a device holds, near the shape the cleared check reads. */
const nearOnDevice = fc.record({
  title: mostly(fc.string({ maxLength: 4 }), fc.constant(7)),
  synced: mostly(fc.boolean(), fc.constant("yes")),
  at: fc.oneof(fc.integer(), fc.constant(null)),
});

test("a cleared browser is told of every entry of this device it reads, and only the lost ones are removed", async () => {
  const w = await createIndexWorld();
  const you = await w.personServices({
    person: { token: null, userId: "you", name: "You" },
  });
  await you.ready;
  const privateIndex = await openPrivateIndex({
    sync: you.sync,
    userId: "you",
    memory: you.sync.memory,
  });
  const { onDevice } = privateIndex;
  await fc.assert(
    fc.asyncProperty(
      fc.dictionary(
        fc.constantFrom("d1|a", "d1|b", "d1|c", "d2|a"),
        fc.oneof(nearOnDevice, fc.jsonValue()),
      ),
      async (entries) => {
        for (const key of onDevice.keys()) onDevice.delete(key);
        storeEach(onDevice, entries);
        const held = Object.entries(onDevice.entries()).flatMap(
          ([key, value]) =>
            key.startsWith("d1|") &&
            isFieldsValue(value) &&
            typeof value.title === "string" &&
            typeof value.synced === "boolean"
              ? [{ key, title: value.title, synced: value.synced }]
              : [],
        );
        const lost = held.filter((entry) => !entry.synced);
        const kept = onDevice
          .keys()
          .filter((key) => !lost.some((entry) => entry.key === key));
        const told = await checkCleared({
          hadDatabase: false,
          privateIndex,
          deviceId: "d1",
          documents: async () => [],
        });
        expect([told, onDevice.keys()]).toEqual([
          held.length === 0
            ? null
            : {
                kind: "offline_data_cleared",
                restored: held.length - lost.length,
                lostTitles: lost.map((entry) => entry.title),
              },
          kept,
        ]);
      },
    ),
    { numRuns: 200 },
  );
});

/** The value `key` holds in the map `map` of the handle's document, as stored: its fields in their order. */
const stored = (handle: DocHandle, map: string, key: string): string =>
  JSON.stringify(jsonMap(handle.doc(), map).get(key));

test("the Library writes each value of the indexes with its fields in their stored order", async () => {
  const w = await createIndexWorld();
  await w.seedWorkspace(MEDIUM, [["dana", "owner"]]);
  const storage = new MemoryStorage();
  storage.setItem("manent.device.id", "device-desk");
  const dana = await w.personServices({ person: DANA, storage });
  await w.settleAll();
  const at = w.world.clock.clock.now();
  const made = await dana.library.createProject(MEDIUM, "film");
  dana.documents.open(made.docId);
  const project = dana.library.documentProject(made.docId);
  await until(() => project.get() === made.projectId);
  expect(project.get()).toBe(made.projectId);
  expect(dana.library.documentProject("unknown-doc").get()).toBeNull();
  const workspace = await dana.sync.client.open(
    indexDocId("workspace", MEDIUM),
  );
  const own = await dana.sync.client.open(indexDocId("user", "dana"));
  const onDevice = `device-desk|${made.docId}`;
  await until(() => jsonMap(own.doc(), "on_device").get(onDevice) !== null);
  expect([
    stored(workspace, "projects", made.projectId),
    stored(workspace, "documents", made.docId),
    stored(own, "continue", made.docId),
    stored(own, "on_device", onDevice),
  ]).toEqual([
    `{"title":"Untitled film","kind":"film","createdAt":${at},"createdByUserId":"dana"}`,
    `{"projectId":"${made.projectId}","title":"Untitled script","kind":"script","createdAt":${at},"editedAt":null,"editedByUserId":null,"airDate":null,"rundownId":null}`,
    `{"workspaceId":"medium","openedAt":${at}}`,
    `{"title":"Untitled script","synced":false,"at":${at}}`,
  ]);
});
