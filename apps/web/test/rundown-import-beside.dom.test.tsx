import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  createDoc,
  createRundownUndo,
  initRundown,
  insertRows,
  jsonMap,
  readRundown,
  scriptBody,
  setCell,
  writeDurations,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle, DocStatus } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import {
  CommandsProvider,
  RUNDOWN_WORDS,
  SettingsProvider,
  TimingProvider,
  createValue,
} from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { closeBeside, openBeside } from "../src/beside/open-beside.ts";
import { computeLiveDuration } from "../src/rundown/beside.ts";
import {
  dropImportFiles,
  dropScriptLink,
  parseDroppedScriptLink,
} from "../src/rundown/drop.ts";
import {
  SPLIT_NEEDS_MORE_SLUGS,
  createUndoGroupTracker,
  extractRowsFromBlocks,
  replaceRowWithSplit,
} from "../src/rundown/rows-from-script.ts";
import { RundownScreen } from "../src/rundown/screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  DocumentServices,
  DocumentStart,
  PersonServices,
  ProjectKind,
} from "../src/services/ports.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { rundownActions } from "../src/state/rundown.store.ts";
import { publishTimingFacts } from "../src/timing/timing-facts.ts";
import {
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

const WORKSPACE_ID = "ws-medium";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-999999999999";
const RUNDOWN_ID = "11111111-1111-4111-8111-111111111111";
const STORY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STORY_ID = "33333333-3333-4333-8333-999999999999";
const ROW_1 = "44444444-4444-4444-8444-444444444441";

const ACT_1_ID = "act00001";
const ACT_2_ID = "act00002";
const SLUG_1_ID = "slug0001";
const SLUG_2_ID = "slug0002";
const SLUG_3_ID = "slug0003";
const SLUG_4_ID = "slug0004";
const BRACKET_ID = "brkt0001";

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => {
    closeBeside();
    publishTimingFacts(STORY_ID, null);
    mounted?.unmount();
  });
  mounted = null;
  globalThis.fetch = originalFetch;
});

function block(
  id: string,
  type: string,
  text: string,
  kind: "new_act" | "end_of_act" | null = null,
): BlockJSON {
  return {
    type: "block",
    attrs: { id, type, kind },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

function fourSlugBlocks(): BlockJSON[] {
  return [
    block(ACT_1_ID, "act_break", "ACT ONE", "new_act"),
    block(SLUG_1_ID, "slug", "COLD OPEN"),
    block(BRACKET_ID, "bracket", "[THE BAND PLAYS T=0:15]"),
    block("dlg00001", "dialogue", "Good evening everyone."),
    block(SLUG_2_ID, "slug", "MONOLOGUE"),
    block("end00001", "act_break", "END OF ACT ONE", "end_of_act"),
    block(ACT_2_ID, "act_break", "ACT TWO", "new_act"),
    block(SLUG_3_ID, "slug", "DESK PIECE"),
    block(SLUG_4_ID, "slug", "GOODNIGHTS"),
  ];
}

function fakeHandle(docId: string, doc: CrdtDoc): DocHandle {
  const settings = createValue<Record<string, unknown>>({
    "script.format": "variety",
  });
  const status = createValue<DocStatus>({
    saved: true,
    docSync: "synced",
    link: "online",
    waiting: 0,
    synced: true,
    wentOfflineAt: null,
    neverSynced: false,
    recovered: 0,
    side: [],
  });
  return {
    docId,
    doc: () => doc,
    status,
    settings,
    setSetting: (k: string, v: unknown) =>
      settings.set({ ...settings.get(), [k]: v }),
    readOnly: createValue(null),
    viewers: createValue(0),
    on: () => () => {},
    sendAwareness: () => {},
    onAwareness: () => () => {},
    close: async () => {},
  } as unknown as DocHandle;
}

function mockDescribe(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/docs/describe"))
      return new Response(
        JSON.stringify({ role: "owner", capabilities: ["edit_rundowns"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    if (url.endsWith("/api/docs/people"))
      return new Response(
        JSON.stringify({ people: [{ userId: "dana", name: "Dana Reyes" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

function buildWorkspaceIndexDoc(): CrdtDoc {
  const wsDoc = createDoc();
  const projects = jsonMap(wsDoc, "projects");
  projects.set(PROJECT_ID, {
    title: "The Late Desk",
    kind: "show",
    createdAt: 1,
    createdByUserId: "dana",
    folderId: null,
  });
  projects.set(OTHER_PROJECT_ID, {
    title: "Low Tide",
    kind: "film",
    createdAt: 2,
    createdByUserId: "dana",
    folderId: null,
  });
  const documents = jsonMap(wsDoc, "documents");
  documents.set(RUNDOWN_ID, {
    projectId: PROJECT_ID,
    title: "Tue 17 Nov",
    kind: "rundown",
    createdAt: 10,
    editedAt: null,
    editedByUserId: null,
    airDate: "2026-11-17",
    rundownId: null,
    trashedAt: null,
    trashedByUserId: null,
  });
  documents.set(STORY_ID, {
    projectId: PROJECT_ID,
    title: "Benny's Mailbag",
    kind: "script",
    createdAt: 11,
    editedAt: null,
    editedByUserId: null,
    airDate: null,
    rundownId: null,
    trashedAt: null,
    trashedByUserId: null,
  });
  documents.set(OTHER_STORY_ID, {
    projectId: OTHER_PROJECT_ID,
    title: "Low Tide",
    kind: "script",
    createdAt: 12,
    editedAt: null,
    editedByUserId: null,
    airDate: null,
    rundownId: null,
    trashedAt: null,
    trashedByUserId: null,
  });
  return wsDoc;
}

test("extracting rows from a script keeps act headers and slugs with blockIds and skips brackets and end_of_act", () => {
  const extracted = extractRowsFromBlocks(fourSlugBlocks());
  expect(extracted).toEqual({
    slugCount: 4,
    headerCount: 2,
    rows: [
      { kind: "header", blockId: ACT_1_ID, title: "ACT ONE" },
      { kind: "script", blockId: SLUG_1_ID, title: "COLD OPEN" },
      { kind: "script", blockId: SLUG_2_ID, title: "MONOLOGUE" },
      { kind: "header", blockId: ACT_2_ID, title: "ACT TWO" },
      { kind: "script", blockId: SLUG_3_ID, title: "DESK PIECE" },
      { kind: "script", blockId: SLUG_4_ID, title: "GOODNIGHTS" },
    ],
  });
});

test("splitting a script row into acts and slugs is a single undo step", () => {
  const doc = createDoc();
  initRundown(
    doc,
    {
      airDate: "2026-11-17",
      airAt: new Date(2026, 10, 17, 23, 35, 0).getTime(),
      windowLeadMs: 3_600_000,
      targetMs: 2_520_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    doc,
    [{ id: ROW_1, kind: "script", docId: STORY_ID, blockId: null }],
    null,
  );
  setCell(doc, ROW_1, "segment", "Benny's Mailbag", {
    userId: "dana",
    now: () => 100,
  });

  const undo = createRundownUndo(doc, { trackedOrigins: [null] });
  const tracker = createUndoGroupTracker();
  const stopTrack = tracker.watchDoc(doc);
  let seq = 1;
  const split = replaceRowWithSplit({
    rundownDoc: doc,
    sourceRowId: ROW_1,
    storyDocId: STORY_ID,
    titleColumn: "segment",
    extracted: extractRowsFromBlocks(fourSlugBlocks()),
    userId: "dana",
    now: () => 200,
    ids: () => `splitrow0${seq++}`,
  });
  expect(split?.rowIds.length).toBe(6);
  tracker.recordGrouped({ kind: "split", txCount: split!.txCount });
  const afterSplit = readRundown(doc).rows;
  expect(
    afterSplit.map((r) => [r.kind, r.blockId, r.cells.segment?.value]),
  ).toEqual([
    ["header", ACT_1_ID, "ACT ONE"],
    ["script", SLUG_1_ID, "COLD OPEN"],
    ["script", SLUG_2_ID, "MONOLOGUE"],
    ["header", ACT_2_ID, "ACT TWO"],
    ["script", SLUG_3_ID, "DESK PIECE"],
    ["script", SLUG_4_ID, "GOODNIGHTS"],
  ]);

  const step = tracker.popUndo();
  expect(step).toEqual({ kind: "split", txCount: 8 });
  for (let i = 0; i < step!.txCount; i += 1) undo.undo();
  const afterUndo = readRundown(doc).rows;
  expect(afterUndo.map((r) => [r.id, r.docId, r.cells.segment?.value])).toEqual(
    [[ROW_1, STORY_ID, "Benny's Mailbag"]],
  );
  stopTrack();
  undo.destroy();
});

test("dropped script link parser reads relative and absolute /s/<id> links and rejects others", () => {
  expect([
    parseDroppedScriptLink(`/s/${STORY_ID}`),
    parseDroppedScriptLink(`# comment\nhttps://manent.local/s/${STORY_ID}?x=1`),
    parseDroppedScriptLink("https://manent.local/other/123"),
    parseDroppedScriptLink("plain text"),
  ]).toEqual([STORY_ID, STORY_ID, null, null]);
});

test("live duration computes script total for whole-story rows and slug total for slug rows", () => {
  const facts = {
    script: { dialogueChars: 1125, bracketMs: 15_000 },
    slugs: [
      { slugId: SLUG_1_ID, total: { dialogueChars: 225, bracketMs: 15_000 } },
      { slugId: SLUG_2_ID, total: { dialogueChars: 900, bracketMs: 0 } },
    ],
    selection: null,
    unread: [],
  };
  const wholeRow = {
    id: ROW_1,
    order: "a",
    kind: "script" as const,
    cells: {},
    docId: STORY_ID,
    blockId: null,
    durationMs: 60_000,
    prompter: null,
    unnumbered: false,
  };
  const slugRow = { ...wholeRow, blockId: SLUG_1_ID };
  expect(computeLiveDuration(wholeRow, STORY_ID, facts, 11.25)).toBe(115_000);
  expect(computeLiveDuration(slugRow, STORY_ID, facts, 11.25)).toBe(35_000);
  expect(
    computeLiveDuration(wholeRow, OTHER_STORY_ID, facts, 11.25),
  ).toBeNull();
});

test("drop link, split by slug, undo, cross-project refusal, file import and story Beside work in the rundown screen", async () => {
  mockDescribe();
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const rundownDoc = createDoc();
  initRundown(
    rundownDoc,
    {
      airDate: "2026-11-17",
      airAt: new Date(2026, 10, 17, 23, 35, 0).getTime(),
      windowLeadMs: 3_600_000,
      targetMs: 10 * 60 * 1000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    rundownDoc,
    [{ id: ROW_1, kind: "script", docId: STORY_ID, blockId: null }],
    null,
  );
  setCell(rundownDoc, ROW_1, "segment", "Benny's Mailbag", {
    userId: "dana",
    now: () => nowMs,
  });
  writeDurations(rundownDoc, new Map([[ROW_1, 60_000]]));

  const storyDoc = createDoc();
  scriptBody(storyDoc).write((w) => w.insertBlocks(null, fourSlugBlocks()));
  const wsDoc = buildWorkspaceIndexDoc();
  const privateDoc = createDoc();
  const createdCopies: {
    workspaceId: string;
    projectId: string | null;
    rundownId: string | null;
    title: string;
    docId: string;
  }[] = [];
  const docsById = new Map<string, CrdtDoc>([
    [RUNDOWN_ID, rundownDoc],
    [STORY_ID, storyDoc],
    [indexDocId("workspace", WORKSPACE_ID), wsDoc],
  ]);

  const statusSub = createValue<StatusFacts>({
    access: "edit",
    device: "ok",
    network: "online",
    server: "synced",
    waiting: 0,
    notSent: 0,
    offlineSinceAt: null,
    neverSynced: false,
    shell: "web",
    toReview: 0,
    now: nowMs,
  });
  const docServices: DocumentServices = {
    status: statusSub,
    waitingByScene: createValue([]),
    stateFacts: createValue([]),
    scriptBag: {
      read: () => ({}),
      provenance: () => null,
      write: () => {},
      subscribe: () => () => {},
      canWrite: () => true,
    },
    people: createValue([]),
    viewers: createValue(0),
    material: {
      materialSnapshotOf: () => ({ alternates: {}, cuts: {}, notes: [] }),
      moveScene: () => ({ ok: false, reason: "not_found" }),
    },
  };

  const environment = testEnvironment({
    now: () => nowMs,
    shellState: createValue({
      ...INITIAL_SHELL_STATE,
      screen: "document" as const,
      docId: RUNDOWN_ID,
    }),
  });
  bindGuard(environment.guard);
  const nav = createNavigation({
    routeId: "/s/$docId",
    href: `/s/${RUNDOWN_ID}`,
    search: {},
  });
  const base = testServices({
    userId: "dana",
    environment,
    router: nav.navigation,
  });
  const services: PersonServices = {
    ...base,
    api: {
      ...base.api,
      me: async () => ({
        ok: true as const,
        me: {
          userId: "dana",
          name: "Dana Reyes",
          workspaces: [
            { id: WORKSPACE_ID, name: "Writers' room", seeding: null },
          ],
        },
      }),
    },
    openHandle: async (id: string) =>
      fakeHandle(id, docsById.get(id) ?? privateDoc),
    onDevice: async () => new Set([STORY_ID]),
    besideMount: () => ({
      mount: () => () => {},
    }),
    documents: {
      open: () => docServices,
      close: () => {},
    },
    library: {
      ...base.library,
      documentTitle: (id: string) =>
        createValue(id === STORY_ID ? "Benny's Mailbag" : "Tue 17 Nov"),
      documentKind: () => createValue<ProjectKind | null>("show"),
      docKindOf: (id: string) =>
        createValue(
          id === RUNDOWN_ID ? ("rundown" as const) : ("script" as const),
        ),
      documentProject: (id: string) =>
        createValue(id === OTHER_STORY_ID ? OTHER_PROJECT_ID : PROJECT_ID),
      projects: () =>
        createValue([
          {
            projectId: PROJECT_ID,
            title: "The Late Desk",
            kind: "show" as const,
            firstDocId: RUNDOWN_ID,
            lastEdited: { byName: "Dana", at: nowMs },
            place: { kind: "synced" as const },
          },
        ]),
      addCopy: async (
        wsId: string,
        projectId: string | null,
        _kind: ProjectKind,
        title: string,
        start: DocumentStart,
      ) => {
        const newDocId = "55555555-5555-4555-8555-555555555555";
        const newDoc = createDoc();
        docsById.set(newDocId, newDoc);
        start.start(fakeHandle(newDocId, newDoc));
        createdCopies.push({
          workspaceId: wsId,
          projectId,
          rundownId: start.rundownId,
          title,
          docId: newDocId,
        });
        return { projectId: projectId ?? PROJECT_ID, docId: newDocId };
      },
    },
  };

  const factsStore = createFactsStore({
    guard: environment.guard,
    frame: environment.frame,
  });
  const rootRoute = createRootRoute({
    component: () => (
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <TimingProvider
                timing={{
                  now: environment.now,
                  schedule: environment.schedule,
                }}
              >
                <FactsContext value={factsStore.selectors}>
                  <div data-region="page" style={{ gridArea: "page" }} />
                  <RundownScreen
                    docId={RUNDOWN_ID}
                    kind="rundown"
                    doc={docServices}
                  />
                </FactsContext>
              </TimingProvider>
            </CommandsProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => null,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId",
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [`/s/${RUNDOWN_ID}`] }),
  });
  await router.load();

  const host = document.createElement("div");
  document.body.innerHTML = "";
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted!.render(<RouterProvider router={router} />);
  });
  await until(() => host.querySelector('[role="grid"]') !== null);

  const clearMessages = (): void => {
    let cur = services.messages.current();
    while (cur !== null) {
      services.messages.dismiss(cur.id);
      cur = services.messages.current();
    }
  };

  // 1. Drop script link from another project -> refused with S3-RG-55
  await act(async () => {
    await dropScriptLink(
      { services, rundownDocId: RUNDOWN_ID, now: () => nowMs },
      OTHER_STORY_ID,
      `/s/${OTHER_STORY_ID}`,
      null,
    );
  });
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.cannotAddOtherProject("Low Tide", "The Late Desk"),
  );
  act(clearMessages);

  // 2. Drop script link from same project -> adds 1 row, updates workspace index rundownId, offers Split + Undo
  let dropped: Awaited<ReturnType<typeof dropScriptLink>> = null;
  await act(async () => {
    dropped = await dropScriptLink(
      { services, rundownDocId: RUNDOWN_ID, now: () => nowMs },
      STORY_ID,
      `/s/${STORY_ID}`,
      null,
    );
  });
  expect(dropped!.storyDocId).toBe(STORY_ID);
  expect(
    (jsonMap(wsDoc, "documents").get(STORY_ID) as { rundownId?: string })
      ?.rundownId,
  ).toBe(RUNDOWN_ID);
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.droppedScript("Benny's Mailbag"),
  );
  expect(services.messages.current()?.actions.map((a) => a.commandId)).toEqual([
    "rundown.splitBySlug",
    "edit.undo",
  ]);
  act(clearMessages);

  // 3. Drop import file (.fountain) -> creates story in project via addCopy with rundownId set, refuses bad ext with S3-RG-54
  const fountain = new TextEncoder().encode(
    "INT. STAGE - NIGHT\n\nHOST\nHello.",
  );
  let imported: Awaited<ReturnType<typeof dropImportFiles>> = [];
  await act(async () => {
    imported = await dropImportFiles(
      { services, rundownDocId: RUNDOWN_ID, now: () => nowMs },
      [{ name: "mailbag.fountain", bytes: fountain }],
      "en-GB",
      null,
    );
  });
  expect(imported.length).toBe(1);
  expect(createdCopies[0]?.projectId).toBe(PROJECT_ID);
  expect(createdCopies[0]?.rundownId).toBe(RUNDOWN_ID);
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.droppedImport("mailbag.fountain"),
  );
  act(clearMessages);

  await act(async () => {
    await dropImportFiles(
      { services, rundownDocId: RUNDOWN_ID, now: () => nowMs },
      [{ name: "photo.png", bytes: new Uint8Array([1, 2, 3]) }],
      "en-GB",
      null,
    );
  });
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.cannotAddFile("photo.png"),
  );
  act(clearMessages);

  // 3b. DOM drop on grid stops propagation so parent window drop does not also fire
  let windowDrops = 0;
  const onWindowDrop = (): void => {
    windowDrops += 1;
  };
  host.addEventListener("drop", onWindowDrop);
  try {
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [],
        types: ["text/plain"],
        getData: (type: string) =>
          type === "text/plain" ? "not-a-script" : "",
      },
    });
    await act(async () => {
      grid.dispatchEvent(dropEvent);
    });
    expect(windowDrops).toBe(0);
    expect(dropEvent.defaultPrevented).toBe(true);
    expect(services.messages.current()?.text).toBe(
      RUNDOWN_WORDS.cannotAddFile("not-a-script"),
    );
    act(clearMessages);
  } finally {
    host.removeEventListener("drop", onWindowDrop);
  }

  // 4. Click ▸ on ROW_1 -> opens story Beside with air_window state bar, live ● Dur updates, closing returns focus
  const openBtn = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="segment"] button`,
  ) as HTMLButtonElement;
  await act(async () => {
    openBtn.click();
  });
  await until(() => host.querySelector('[data-beside="story"]') !== null);
  const besideEl = host.querySelector('[data-beside="story"]') as HTMLElement;
  expect(besideEl.textContent).toContain("Benny's Mailbag");
  expect(besideEl.textContent).toContain(RUNDOWN_WORDS.airWindow);

  // Publish live timing -> grid Dur shows live figure and accessible label
  await act(async () => {
    publishTimingFacts(STORY_ID, {
      script: { dialogueChars: 2250, bracketMs: 0 },
      slugs: [],
      selection: null,
      unread: [],
    });
  });
  await until(
    () =>
      host
        .querySelector(`[data-row-id="${ROW_1}"][data-col-id="dur"]`)
        ?.textContent?.includes("3:20") ?? false,
  );
  const durCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="dur"]`,
  );
  expect(durCell?.getAttribute("aria-label")).toBe(
    RUNDOWN_WORDS.liveDuration("3:20"),
  );

  // Close Beside -> focus returns to ROW_1's gridcell
  const closeBtn = besideEl.querySelector(
    'button[aria-label^="Close"]',
  ) as HTMLButtonElement;
  await act(async () => {
    closeBtn.click();
  });
  await until(() => host.querySelector('[data-beside="story"]') === null);
  expect(
    (document.activeElement as HTMLElement | null)?.getAttribute("data-row-id"),
  ).toBe(ROW_1);

  // 5. Split via imports slot on a 1-slug story refuses with S3-RG-13; splitting STORY_ID splits and undoes in 1 step
  const singleDoc = createDoc();
  scriptBody(singleDoc).write((w) =>
    w.insertBlocks(null, [block("one00001", "slug", "ONLY ONE")]),
  );
  docsById.set("66666666-6666-4666-8666-666666666666", singleDoc);
  await act(async () => {
    insertRows(
      rundownDoc,
      [
        {
          id: "single01",
          kind: "script",
          docId: "66666666-6666-4666-8666-666666666666",
          blockId: null,
        },
      ],
      null,
    );
  });
  await until(
    () =>
      host.querySelector('[data-row-id="single01"][data-col-id="segment"]') !==
      null,
  );
  // Select single01 (Space selects the active row) and run importRows -> refused with S3-RG-13
  const singleCell = host.querySelector(
    '[data-row-id="single01"][data-col-id="segment"]',
  ) as HTMLElement;
  await act(async () => {
    singleCell.click();
    singleCell.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
  });
  await act(async () => {
    rundownActions.slot("imports")?.importRows?.();
  });
  await until(
    () => services.messages.current()?.text === SPLIT_NEEDS_MORE_SLUGS,
  );
  act(clearMessages);

  // Select ROW_1 and run importRows -> splits into 4 script rows + 2 header rows, then 1 undo restores ROW_1 with S3-RG-60
  const row1Cell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="segment"]`,
  ) as HTMLElement;
  await act(async () => {
    row1Cell.click();
    row1Cell.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
  });
  await act(async () => {
    rundownActions.slot("imports")?.importRows?.();
  });
  await until(
    () =>
      services.messages.current()?.text ===
      RUNDOWN_WORDS.splitIntoRows("Benny's Mailbag", 4, 2),
  );
  expect(
    readRundown(rundownDoc).rows.filter((r) => r.blockId !== null).length,
  ).toBe(6);

  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  await until(() => readRundown(rundownDoc).rows.some((r) => r.id === ROW_1));
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.undidImportRows);

  // Direct openBeside(story, at) works when invoked from a slug row too
  await act(async () => {
    openBeside(STORY_ID, "story", { blockId: SLUG_2_ID });
  });
  await until(() => host.querySelector('[data-beside="story"]') !== null);
  await act(async () => {
    closeBeside();
  });
});
