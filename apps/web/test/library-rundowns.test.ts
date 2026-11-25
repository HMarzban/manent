import { expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  readRundown,
  setCell,
} from "@manent/crdt";
import { NEWS_COLUMNS, SHOW_COLUMNS, randomBlockId } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import { createMessageQueue } from "@manent/ui";
import {
  DEFAULT_TARGET_MS,
  DEFAULT_WINDOW_LEAD_MS,
  airAtForDate,
  createProjectRundown,
  localIsoDate,
  nextFreeAirDate,
  planNewRundown,
  storiesForRundown,
} from "../src/rundown/create-rundown.ts";
import { readWorkspace } from "../src/services/sync/index-entries.ts";
import type { DocumentEntry } from "../src/services/sync/index-entries.ts";
import { liveMap } from "../src/services/sync/private-index.ts";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import { createClock } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const MEDIUM = "medium";
const WED_18_NOV_2026 = new Date(2026, 10, 18, 12, 0, 0).getTime();

const makeEntry = (
  title: string,
  rundownId: string | null,
  trashedAt: number | null = null,
): DocumentEntry => ({
  projectId: "news-1",
  title,
  kind: "script",
  createdAt: WED_18_NOV_2026,
  editedAt: null,
  editedByUserId: null,
  airDate: null,
  rundownId,
  trashedAt,
  trashedByUserId: null,
});

test("a new rundown picks today or the first later free day, with 19:00 and 30:00 by default or the latest rundown's Air and Target", () => {
  const fresh = planNewRundown({ existing: [], nowMs: WED_18_NOV_2026 });
  expect(fresh).toEqual({
    airDate: "2026-11-18",
    airAt: airAtForDate("2026-11-18", 19, 0),
    windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
    targetMs: DEFAULT_TARGET_MS,
  });

  const withExisting = planNewRundown({
    existing: [
      {
        airDate: "2026-11-17",
        airAt: airAtForDate("2026-11-17", 18, 0),
        targetMs: 25 * 60 * 1000,
      },
      {
        airDate: "2026-11-18",
        airAt: airAtForDate("2026-11-18", 23, 35),
        targetMs: 42 * 60 * 1000,
      },
      {
        airDate: "2026-11-25",
        airAt: airAtForDate("2026-11-25", 22, 15),
        targetMs: 45 * 60 * 1000,
      },
    ],
    nowMs: WED_18_NOV_2026,
  });
  expect(withExisting).toEqual({
    airDate: "2026-11-19",
    airAt: airAtForDate("2026-11-19", 22, 15),
    windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
    targetMs: 45 * 60 * 1000,
  });

  expect(
    nextFreeAirDate(
      new Set(["2026-11-18", "2026-11-19", "2026-11-20"]),
      WED_18_NOV_2026,
    ),
  ).toBe("2026-11-21");

  // When the latest rundown's CRDT has not loaded yet, scan earlier loaded rundowns before falling back to 19:00 / 30:00
  const unloadedLatest = planNewRundown({
    existing: [
      {
        airDate: "2026-11-17",
        airAt: airAtForDate("2026-11-17", 21, 30),
        targetMs: 55 * 60 * 1000,
      },
      {
        airDate: "2026-11-18",
        airAt: null,
        targetMs: null,
      },
    ],
    nowMs: WED_18_NOV_2026,
  });
  expect(unloadedLatest).toEqual({
    airDate: "2026-11-19",
    airAt: airAtForDate("2026-11-19", 21, 30),
    windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
    targetMs: 55 * 60 * 1000,
  });
});

test("stories for a rundown keep row order with plain numbers, skip headers and unnumbered rows, and leave loose scripts out", () => {
  const doc = createDoc({ clientId: 1 });
  initRundown(
    doc,
    {
      airDate: "2026-11-18",
      airAt: airAtForDate("2026-11-18", 18, 0),
      windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
      targetMs: 60 * 60 * 1000,
    },
    NEWS_COLUMNS,
  );
  const headerId = randomBlockId();
  const unnumberedId = randomBlockId();
  const firstStoryRow = randomBlockId();
  const itemRow = randomBlockId();
  const secondStoryRow = randomBlockId();
  const splitStoryRow = randomBlockId();
  insertRows(
    doc,
    [
      { id: headerId, kind: "header", docId: null, blockId: null },
      { id: unnumberedId, kind: "item", docId: null, blockId: null },
      { id: firstStoryRow, kind: "script", docId: "story-1", blockId: null },
      { id: itemRow, kind: "item", docId: null, blockId: null },
      { id: secondStoryRow, kind: "script", docId: "story-2", blockId: null },
      {
        id: splitStoryRow,
        kind: "script",
        docId: "story-2",
        blockId: randomBlockId(),
      },
    ],
    null,
  );
  const by = { userId: "ana", now: () => WED_18_NOV_2026 };
  setCell(doc, firstStoryRow, "story", "Fallback story title", by);
  setCell(doc, secondStoryRow, "story", "Weather desk", by);

  const documents = new Map<string, DocumentEntry>([
    [
      "story-1",
      makeEntry("01 Tolle Exchange library: council votes yes", "rundown-1"),
    ],
    ["story-2", makeEntry("Untitled script", "rundown-1")],
    ["story-loose", makeEntry("Loose script", null)],
    ["story-other", makeEntry("Yesterday's story", "rundown-old")],
  ]);

  expect(storiesForRundown("rundown-1", readRundown(doc), documents)).toEqual([
    {
      docId: "story-1",
      title: "01 Tolle Exchange library: council votes yes",
      rowNumber: 2,
    },
    {
      docId: "story-2",
      title: "Weather desk",
      rowNumber: 4,
    },
  ]);

  expect(storiesForRundown("rundown-1", null, documents)).toEqual([
    {
      docId: "story-1",
      title: "01 Tolle Exchange library: council votes yes",
      rowNumber: null,
    },
    {
      docId: "story-2",
      title: "Untitled script",
      rowNumber: null,
    },
  ]);
});

async function leaveProject(
  dana: TabServices,
  kind: "show" | "news",
  settle: () => Promise<void>,
  touch: (docId: string) => Promise<void>,
): Promise<string> {
  const { docId } = await dana.library.createProject(MEDIUM, kind);
  const { status } = dana.documents.open(docId);
  const opening = status.get();
  await until(() => status.get() !== opening);
  await settle();
  await touch(docId);
  dana.documents.close(docId);
  await settle();
  return docId;
}

test("new Show and News projects start on today's rundown with their kind's columns, and an empty one is quietly removed when left", async () => {
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

  const today = localIsoDate(Date.now());
  const removedShow = await leaveProject(
    dana,
    "show",
    w.settleAll,
    async (docId) => {
      const handle = await dana.sync.client.open(docId);
      const data = readRundown(handle.doc());
      expect(data.columns).toEqual([...SHOW_COLUMNS]);
      expect(data.rundown.airDate).toBe(today);
      expect(data.rundown.airAt).toBe(airAtForDate(today, 19, 0));
      expect(data.rundown.targetMs).toBe(DEFAULT_TARGET_MS);
      expect(data.rows).toEqual([]);
      await handle.close();
    },
  );

  const keptNews = await leaveProject(
    dana,
    "news",
    w.settleAll,
    async (docId) => {
      const wsHandle = await dana.sync.client.open(
        indexDocId("workspace", MEDIUM),
      );
      const indexed = readWorkspace({
        projects: liveMap(wsHandle, "projects"),
        documents: liveMap(wsHandle, "documents"),
      }).documents.get(docId);
      expect(indexed?.airDate).toBe(today);
      await wsHandle.close();

      const handle = await dana.sync.client.open(docId);
      expect(readRundown(handle.doc()).columns).toEqual([...NEWS_COLUMNS]);
      insertRows(
        handle.doc(),
        [{ id: randomBlockId(), kind: "item", docId: null, blockId: null }],
        null,
      );
      await handle.close();
    },
  );

  const rows = await dana.library.readProjects(MEDIUM);
  expect(rows.map((r) => [r.firstDocId, r.kind, r.title])).toEqual([
    [keptNews, "news", "Untitled news project"],
  ]);
  expect(rows.some((r) => r.firstDocId === removedShow)).toBe(false);

  dana.sync.client.setOnline(true);
  await w.settleAll();
  const seen = await sam.library.readProjects(MEDIUM);
  expect(seen.map((r) => r.title)).toEqual(["Untitled news project"]);
});

test("New rundown creates an empty rundown document with kind columns, writes airDate in the workspace index and posts its brief message", async () => {
  const w = await createIndexWorld();
  await w.seedWorkspace(MEDIUM, [["dana", "owner"]]);
  const dana = await w.personServices({ person: DANA });
  await w.settleAll();

  const { projectId } = await dana.library.createProject(MEDIUM, "show");
  const clock = createClock(WED_18_NOV_2026);
  const messages = createMessageQueue({
    now: clock.now,
    schedule: clock.schedule,
  });

  const created = await createProjectRundown({
    services: { library: dana.library, messages },
    workspaceId: MEDIUM,
    projectId,
    kind: "show",
    existing: [
      {
        airDate: "2026-11-18",
        airAt: airAtForDate("2026-11-18", 23, 35),
        targetMs: 42 * 60 * 1000,
      },
    ],
    nowMs: WED_18_NOV_2026,
  });

  expect(created.fields).toEqual({
    airDate: "2026-11-19",
    airAt: airAtForDate("2026-11-19", 23, 35),
    windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
    targetMs: 42 * 60 * 1000,
  });
  expect(messages.current()?.text).toBe("New rundown for Thu 19 Nov.");

  const handle = await dana.sync.client.open(created.docId);
  const data = readRundown(handle.doc());
  expect(data).toEqual({
    rundown: created.fields,
    columns: [...SHOW_COLUMNS],
    rows: [],
  });
  await handle.close();

  const wsHandle = await dana.sync.client.open(indexDocId("workspace", MEDIUM));
  const entry = readWorkspace({
    projects: liveMap(wsHandle, "projects"),
    documents: liveMap(wsHandle, "documents"),
  }).documents.get(created.docId);
  expect(entry).toMatchObject({
    projectId,
    title: "Thu 19 Nov",
    kind: "rundown",
    airDate: "2026-11-19",
    rundownId: null,
  });
  await wsHandle.close();
});
