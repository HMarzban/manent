import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  jsonMap,
  readRundown,
  setCell,
  writeDurations,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
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
import { RundownScreen } from "../src/rundown/screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { DocumentServices, ProjectKind } from "../src/services/ports.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { rundownActions } from "../src/state/rundown.store.ts";
import { typeInto } from "./document-frame.fixtures.tsx";
import {
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

const DOC_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const STORY_A = "33333333-3333-4333-8333-333333333333";
const ROW_H1 = "44444444-4444-4444-8444-444444444441";
const ROW_1 = "44444444-4444-4444-8444-444444444442";
const ROW_2 = "44444444-4444-4444-8444-444444444443";

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => {
    panelsActions.close("side");
    mounted?.unmount();
  });
  mounted = null;
  globalThis.fetch = originalFetch;
});

function fakeHandle(docId: string, doc: CrdtDoc): DocHandle {
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
    readOnly: createValue(null),
    viewers: createValue(0),
    on: () => () => {},
    sendAwareness: () => {},
    onAwareness: () => () => {},
    close: async () => {},
  } as unknown as DocHandle;
}

function makeStatus(patch: Partial<StatusFacts> = {}): StatusFacts {
  return {
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
    now: new Date(2026, 10, 17, 23, 0, 0).getTime(),
    ...patch,
  };
}

function mockDescribe(
  role: "owner" | "edit" | "comment" | "view",
  capabilities: readonly string[] = [],
  people: readonly { userId: string; name: string }[] = [
    { userId: "dana", name: "Dana Reyes" },
    { userId: "sam", name: "Sam Okafor" },
  ],
): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/docs/describe")) {
      return new Response(JSON.stringify({ role, capabilities }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/docs/people")) {
      return new Response(JSON.stringify({ people }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function mountRundown(options: {
  rundownDoc: CrdtDoc;
  privateDoc?: CrdtDoc;
  workspaceIndexDoc?: CrdtDoc;
  projectKind?: ProjectKind;
  projectTitle?: string;
  status?: Partial<StatusFacts>;
  onDevice?: ReadonlySet<string>;
  nowMs?: number;
}) {
  const nowMs = options.nowMs ?? new Date(2026, 10, 17, 23, 0, 0).getTime();
  const privateDoc = options.privateDoc ?? createDoc();
  const workspaceIndexId = indexDocId("workspace", "dana");
  const statusSub = createValue(makeStatus({ now: nowMs, ...options.status }));
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
      materialSnapshotOf: () => ({
        alternates: {},
        cuts: {},
        notes: [],
      }),
      moveScene: () => ({ ok: false, reason: "not_found" }),
    },
  };

  const environment = testEnvironment({
    now: () => nowMs,
    shellState: createValue({
      ...INITIAL_SHELL_STATE,
      screen: "document" as const,
      docId: DOC_ID,
    }),
  });
  bindGuard(environment.guard);

  const nav = createNavigation({
    routeId: "/s/$docId",
    href: `/s/${DOC_ID}`,
    search: {},
  });
  const baseServices = testServices({
    userId: "dana",
    environment,
    router: nav.navigation,
  });

  const projectTitle = options.projectTitle ?? "The Late Desk";
  const projectKind = options.projectKind ?? "show";
  const services = {
    ...baseServices,
    openHandle: async (id: string) =>
      id === DOC_ID
        ? fakeHandle(DOC_ID, options.rundownDoc)
        : id === workspaceIndexId && options.workspaceIndexDoc !== undefined
          ? fakeHandle(id, options.workspaceIndexDoc)
          : fakeHandle(id, privateDoc),
    onDevice: async () => options.onDevice ?? new Set<string>(),
    library: {
      ...baseServices.library,
      documentTitle: () => createValue("Tue 17 Nov"),
      documentKind: () => createValue<ProjectKind | null>(projectKind),
      docKindOf: () => createValue("rundown" as const),
      documentProject: () => createValue(PROJECT_ID),
      projects: () =>
        createValue([
          {
            projectId: PROJECT_ID,
            title: projectTitle,
            kind: projectKind,
            firstDocId: DOC_ID,
            lastEdited: { byName: "Dana", at: nowMs },
            place: { kind: "synced" as const },
          },
        ]),
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
                  <RundownScreen
                    docId={DOC_ID}
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
  const routeTree = rootRoute.addChildren([
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
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/s/${DOC_ID}`] }),
  });
  await router.load();

  const host = document.createElement("div");
  document.body.innerHTML = "";
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted!.render(<RouterProvider router={router} />);
  });
  return { host, services, statusSub, privateDoc };
}

function createSampleShowDoc(): CrdtDoc {
  const doc = createDoc();
  const airAt = new Date(2026, 10, 17, 23, 35, 0).getTime();
  initRundown(
    doc,
    {
      airDate: "2026-11-17",
      airAt,
      windowLeadMs: 3_600_000,
      targetMs: 10 * 60 * 1000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    doc,
    [
      { id: ROW_H1, kind: "header", docId: null, blockId: null },
      { id: ROW_1, kind: "script", docId: STORY_A, blockId: null },
      { id: ROW_2, kind: "item", docId: null, blockId: null },
    ],
    null,
  );
  const by = { userId: "dana", now: () => 1_700_000_000_000 };
  setCell(doc, ROW_H1, "segment", "ACT ONE", by);
  setCell(doc, ROW_1, "segment", "Monologue", by);
  setCell(doc, ROW_1, "writer", "Sam Okafor", by);
  setCell(doc, ROW_2, "segment", "Band intro", by);
  setCell(doc, ROW_2, "dur", 30_000, by);
  writeDurations(doc, new Map([[ROW_1, 618_000]]));
  return doc;
}

test("show rundown renders title bar, timing state bar with air window, columns, row readout and persists Columns menu changes", async () => {
  mockDescribe("owner", ["edit_rundowns"]);
  const rundownDoc = createSampleShowDoc();
  const { host, services, privateDoc } = await mountRundown({
    rundownDoc,
    nowMs: new Date(2026, 10, 17, 23, 0, 0).getTime(),
  });

  await until(() => host.querySelector('[role="grid"]') !== null);

  expect(host.querySelector("h1")?.textContent).toContain(
    "The Late Desk · Tue 17 Nov",
  );
  const headers = [...host.querySelectorAll('[role="columnheader"]')].map(
    (el) => el.textContent,
  );
  expect(headers).toEqual([
    "#Row number",
    "Segment",
    "Writer",
    "Dur",
    "Cume",
    "Start",
    "Back",
    "Prompter",
  ]);
  const stateBar = host.querySelector('[data-region="state_bar"]');
  expect(stateBar?.textContent).toContain(
    "Air 23:35 · Target 10:00 · Over 0:48",
  );
  expect(stateBar?.textContent).toContain(RUNDOWN_WORDS.airWindow);

  // Open Columns menu via the registered columns slot and hide Writer; verify private index persists it
  await act(async () => {
    rundownActions.slot("columns")?.columns?.();
  });
  await until(
    () =>
      document.body.textContent?.includes("Yours, on this rundown") ?? false,
  );
  const writerItem = [
    ...document.querySelectorAll('[role="menuitemcheckbox"]'),
  ].find((el) => el.textContent === "Writer") as HTMLElement | undefined;
  expect(writerItem).toBeDefined();
  await act(async () => {
    writerItem!.click();
  });
  await until(
    () =>
      ![...host.querySelectorAll('[role="columnheader"]')].some(
        (el) => el.textContent === "Writer",
      ),
  );
  expect(jsonMap(privateDoc, "rundown_columns").get(DOC_ID)).toEqual({
    hidden: ["writer"],
    widthsPx: {},
  });

  // Resize Segment column with ArrowRight and verify private index persists width
  const segResize = host.querySelector(
    '[data-resize-handle="segment"]',
  ) as HTMLElement;
  expect(segResize.getAttribute("aria-label")).toBe("Resize Segment column");
  await act(async () => {
    segResize.focus();
    segResize.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect(jsonMap(privateDoc, "rundown_columns").get(DOC_ID)).toEqual({
    hidden: ["writer"],
    widthsPx: { segment: 268 },
  });

  // Edit Dur cell: reject invalid "2:7", accept "5:00" without touching durationMs, then clear to restore computed Dur
  const durCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="dur"]`,
  ) as HTMLElement;
  await act(async () => {
    durCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  const durInput = durCell.querySelector("input") as HTMLInputElement;
  expect(durInput).not.toBeNull();
  typeInto(durInput, "2:7");
  await act(async () => {
    durInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(durCell.textContent).toContain(RUNDOWN_WORDS.invalidDuration("2:7"));
  typeInto(durInput, "5:00");
  await act(async () => {
    durInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  const afterTyped = readRundown(rundownDoc).rows.find((r) => r.id === ROW_1);
  expect(afterTyped?.cells.dur?.value).toBe(300_000);
  expect(afterTyped?.durationMs).toBe(618_000);

  // Undo cell edit through rundown undo slot
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(
    readRundown(rundownDoc).rows.find((r) => r.id === ROW_1)?.cells.dur,
  ).toBeUndefined();
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.undidCellChange("Dur", 1),
  );
});

test("news rundown renders News columns with plain row numbers", async () => {
  mockDescribe("owner", ["edit_rundowns"]);
  const doc = createDoc();
  initRundown(
    doc,
    {
      airDate: "2026-11-17",
      airAt: new Date(2026, 10, 17, 18, 0, 0).getTime(),
      windowLeadMs: 3_600_000,
      targetMs: 59 * 60 * 1000 + 30_000,
    },
    NEWS_COLUMNS,
  );
  insertRows(
    doc,
    [{ id: ROW_1, kind: "script", docId: STORY_A, blockId: null }],
    null,
  );
  setCell(doc, ROW_1, "story", "Council votes yes", {
    userId: "dana",
    now: () => 1,
  });

  const { host } = await mountRundown({
    rundownDoc: doc,
    projectKind: "news",
    projectTitle: "Lannick One News",
  });
  await until(() => host.querySelector('[role="grid"]') !== null);

  const headers = [...host.querySelectorAll('[role="columnheader"]')].map(
    (el) => el.textContent,
  );
  expect(headers).toEqual([
    "#Row number",
    "Story",
    "Presenter",
    "Type",
    "Dur",
    "Cume",
    "Start",
    "Back",
    "Prompter",
  ]);
  const numCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="number"]`,
  );
  expect(numCell?.textContent).toBe("1");
});

test("offline story not on this device reads em dash in Dur, Cume, Start and Back", async () => {
  mockDescribe("owner", ["edit_rundowns"]);
  const doc = createSampleShowDoc();
  const { host } = await mountRundown({
    rundownDoc: doc,
    status: { network: "offline" },
    onDevice: new Set<string>(),
  });
  await until(() => host.querySelector('[role="grid"]') !== null);

  for (const col of ["dur", "cume", "start", "back"]) {
    const cell = host.querySelector(
      `[data-row-id="${ROW_1}"][data-col-id="${col}"]`,
    );
    expect(cell?.textContent).toBe("—");
  }
});

test("Can edit without edit_rundowns shows View only and pushes the capability message on key press", async () => {
  mockDescribe("edit", []);
  const doc = createSampleShowDoc();
  const { host, services } = await mountRundown({ rundownDoc: doc });
  await until(
    () =>
      host
        .querySelector('[data-region="title_bar"]')
        ?.textContent?.includes("View only") ?? false,
  );
  const segCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="segment"]`,
  ) as HTMLElement;
  await act(async () => {
    segCell.click();
    segCell.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
  });
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.needsEditRundowns,
  );
  // never writes durationMs or mutates the doc while read-only
  expect(readRundown(doc).rows.find((r) => r.id === ROW_1)?.durationMs).toBe(
    618_000,
  );
});

test("Can view or Can comment shows the prompter notice with Present on prompter", async () => {
  mockDescribe("comment", []);
  const doc = createSampleShowDoc();
  const { host } = await mountRundown({
    rundownDoc: doc,
    status: { access: "comment" },
  });
  await until(
    () => host.textContent?.includes(RUNDOWN_WORDS.cannotOpenWithRole) ?? false,
  );
  expect(host.textContent).toContain(RUNDOWN_WORDS.cannotOpenWithRole);
  expect(host.textContent).toContain(RUNDOWN_WORDS.presentOnPrompter);
});

test("empty rundown displays empty state with Add row", async () => {
  mockDescribe("owner", ["edit_rundowns"]);
  const doc = createDoc();
  initRundown(
    doc,
    {
      airDate: "2026-11-17",
      airAt: new Date(2026, 10, 17, 23, 35, 0).getTime(),
      windowLeadMs: 3_600_000,
      targetMs: 42 * 60 * 1000,
    },
    SHOW_COLUMNS,
  );
  const { host } = await mountRundown({ rundownDoc: doc });
  await until(() => host.textContent?.includes(RUNDOWN_WORDS.empty) ?? false);
  expect(host.textContent).toContain(RUNDOWN_WORDS.empty);
  expect(host.textContent).toContain(RUNDOWN_WORDS.addRow);
});

function fieldByLabel(root: ParentNode, labelText: string): HTMLElement {
  const label = [...root.querySelectorAll("label")].find(
    (el) => el.textContent === labelText,
  );
  const forId = label?.getAttribute("for");
  const control = forId ? document.getElementById(forId) : null;
  if (control === null) throw new Error(`no field labelled ${labelText}`);
  return control;
}

async function enterFieldValue(
  input: HTMLInputElement,
  value: string,
): Promise<void> {
  await act(async () => {
    input.focus();
  });
  typeInto(input, value);
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

test("Details → Rundown edits Date, Air, Target and Air window starts, refuses invalid and taken entries, and undoes each change in one step", async () => {
  mockDescribe("owner", ["edit_rundowns"]);
  const rundownDoc = createSampleShowDoc();
  const wsDoc = createDoc();
  const OTHER_RUNDOWN = "55555555-5555-4555-8555-555555555555";
  jsonMap(wsDoc, "projects").set(PROJECT_ID, {
    title: "The Late Desk",
    kind: "show",
    createdAt: 1,
    createdByUserId: "dana",
  });
  jsonMap(wsDoc, "documents").set(DOC_ID, {
    projectId: PROJECT_ID,
    title: "Tue 17 Nov",
    kind: "rundown",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
    airDate: "2026-11-17",
    rundownId: null,
  });
  jsonMap(wsDoc, "documents").set(OTHER_RUNDOWN, {
    projectId: PROJECT_ID,
    title: "Tue 24 Nov",
    kind: "rundown",
    createdAt: 2,
    editedAt: null,
    editedByUserId: null,
    airDate: "2026-11-24",
    rundownId: null,
  });

  const { host } = await mountRundown({
    rundownDoc,
    workspaceIndexDoc: wsDoc,
    nowMs: new Date(2026, 10, 17, 23, 0, 0).getTime(),
  });
  await until(() => host.querySelector('[role="grid"]') !== null);

  await act(async () => {
    panelsActions.open("side", "details");
  });
  await until(() => host.querySelector('[data-tour="rundown:air"]') !== null);

  // Only the Rundown scope is shown in Details on a rundown
  const sidePanel = host.querySelector('[data-region="side_panel"]')!;
  expect(
    [...sidePanel.querySelectorAll("h2")].map((el) => el.textContent),
  ).toEqual(["Rundown"]);

  const dateButton = fieldByLabel(sidePanel, "Date") as HTMLButtonElement;
  const airInput = fieldByLabel(sidePanel, "Air") as HTMLInputElement;
  const targetInput = fieldByLabel(sidePanel, "Target") as HTMLInputElement;
  const windowInput = fieldByLabel(
    sidePanel,
    "Air window starts",
  ) as HTMLInputElement;

  expect(airInput.getAttribute("data-tour")).toBe("rundown:air");
  expect([
    dateButton.textContent,
    airInput.value,
    targetInput.value,
    windowInput.value,
  ]).toEqual(["Tue 17 Nov", "23:35", "10:00", "60"]);

  // Invalid & empty Air keeps old value and shows S3-RG-67 / S3-RG-70
  await enterFieldValue(airInput, "25:10");
  expect(sidePanel.textContent).toContain(
    RUNDOWN_WORDS.invalidAirTime("25:10"),
  );
  expect(airInput.value).toBe("23:35");

  await enterFieldValue(airInput, "");
  expect(sidePanel.textContent).toContain(RUNDOWN_WORDS.airTimeRequired);
  expect(airInput.value).toBe("23:35");

  // Valid Air updates CRDT, state bar and row Start/Back, and undoes in one step
  await enterFieldValue(airInput, "23:40");
  expect(readRundown(rundownDoc).rundown.airAt).toBe(
    new Date(2026, 10, 17, 23, 40, 0).getTime(),
  );
  expect(
    host.querySelector('[data-region="state_bar"]')?.textContent,
  ).toContain("Air 23:40 · Target 10:00 · Over 0:48");
  expect(
    host.querySelector(`[data-row-id="${ROW_1}"][data-col-id="start"]`)
      ?.textContent,
  ).toBe("23:40:00");

  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(rundownDoc).rundown.airAt).toBe(
    new Date(2026, 10, 17, 23, 35, 0).getTime(),
  );

  // Invalid & empty Target keeps old value; valid Target moves Over/Under
  await enterFieldValue(targetInput, "42.00");
  expect(sidePanel.textContent).toContain(RUNDOWN_WORDS.invalidTarget("42.00"));
  await enterFieldValue(targetInput, "");
  expect(sidePanel.textContent).toContain(RUNDOWN_WORDS.targetRequired);

  await enterFieldValue(targetInput, "12:00");
  expect(readRundown(rundownDoc).rundown.targetMs).toBe(12 * 60 * 1000);
  expect(
    host.querySelector('[data-region="state_bar"]')?.textContent,
  ).toContain("Air 23:35 · Target 12:00 · Under 1:12");

  // Invalid Air window starts keeps old value; valid 15 leaves the air window at 23:00
  await enterFieldValue(windowInput, "-5");
  expect(sidePanel.textContent).toContain(RUNDOWN_WORDS.invalidAirWindow("-5"));
  await enterFieldValue(windowInput, "15");
  expect(readRundown(rundownDoc).rundown.windowLeadMs).toBe(15 * 60 * 1000);
  expect(
    host.querySelector('[data-region="state_bar"]')?.textContent,
  ).not.toContain(RUNDOWN_WORDS.airWindow);

  // Date picker refuses a date already taken in this project (S3-RG-71) and accepts a free date
  await act(async () => {
    dateButton.click();
  });
  await until(
    () => document.querySelector('[data-date="2026-11-24"]') !== null,
  );
  // Calendar grid wraps columnheaders and each week of gridcells inside direct role="row" elements
  const calendarGrid = document
    .querySelector('[data-date="2026-11-24"]')
    ?.closest('[role="grid"]');
  expect(calendarGrid).not.toBeNull();
  const calendarRows = [...(calendarGrid?.children ?? [])];
  expect(calendarRows.length).toBe(7);
  expect(calendarRows.every((row) => row.getAttribute("role") === "row")).toBe(
    true,
  );
  expect(
    [...calendarRows[0]!.children].every(
      (cell) => cell.getAttribute("role") === "columnheader",
    ),
  ).toBe(true);
  expect(calendarRows[0]!.children.length).toBe(7);
  expect(
    calendarRows
      .slice(1)
      .every(
        (week) =>
          week.children.length === 7 &&
          [...week.children].every(
            (cell) => cell.getAttribute("role") === "gridcell",
          ),
      ),
  ).toBe(true);
  await act(async () => {
    (
      document.querySelector('[data-date="2026-11-24"]') as HTMLButtonElement
    ).click();
  });
  expect(sidePanel.textContent).toContain(
    RUNDOWN_WORDS.dateAlreadyHasRundown("Tue 24 Nov"),
  );
  expect(readRundown(rundownDoc).rundown.airDate).toBe("2026-11-17");

  await act(async () => {
    dateButton.click();
  });
  await until(
    () => document.querySelector('[data-date="2026-11-19"]') !== null,
  );
  await act(async () => {
    (
      document.querySelector('[data-date="2026-11-19"]') as HTMLButtonElement
    ).click();
  });
  expect(readRundown(rundownDoc).rundown.airDate).toBe("2026-11-19");
  expect(host.querySelector("h1")?.textContent).toContain(
    "The Late Desk · Thu 19 Nov",
  );
  expect(
    (jsonMap(wsDoc, "documents").get(DOC_ID) as { airDate?: string } | null)
      ?.airDate,
  ).toBe("2026-11-19");

  // Undoing the Date change restores both CRDT airDate and workspace index airDate in one step
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(rundownDoc).rundown.airDate).toBe("2026-11-17");
  expect(
    (jsonMap(wsDoc, "documents").get(DOC_ID) as { airDate?: string } | null)
      ?.airDate,
  ).toBe("2026-11-17");
});

test("Details → Rundown is read-only under S3-RG-34 for Can edit without edit_rundowns", async () => {
  mockDescribe("edit", []);
  const rundownDoc = createSampleShowDoc();
  const { host } = await mountRundown({ rundownDoc });
  await until(
    () =>
      host
        .querySelector('[data-region="title_bar"]')
        ?.textContent?.includes("View only") ?? false,
  );
  await act(async () => {
    panelsActions.open("side", "details");
  });
  await until(() => host.querySelector('[data-tour="rundown:air"]') !== null);

  const sidePanel = host.querySelector('[data-region="side_panel"]')!;
  expect(sidePanel.textContent).toContain(RUNDOWN_WORDS.needsEditRundowns);
  const dateButton = fieldByLabel(sidePanel, "Date") as HTMLButtonElement;
  const airInput = fieldByLabel(sidePanel, "Air") as HTMLInputElement;
  const targetInput = fieldByLabel(sidePanel, "Target") as HTMLInputElement;
  const windowInput = fieldByLabel(
    sidePanel,
    "Air window starts",
  ) as HTMLInputElement;

  expect(dateButton.getAttribute("aria-disabled")).toBe("true");
  expect([
    airInput.readOnly,
    targetInput.readOnly,
    windowInput.readOnly,
  ]).toEqual([true, true, true]);

  await act(async () => {
    dateButton.click();
  });
  expect(document.querySelector('[data-date="2026-11-19"]')).toBeNull();
});

test("header cell edits emit an undo message and Details field edits stay aligned with earlier cell undo labels", async () => {
  mockDescribe("owner", ["edit_rundowns"]);
  const rundownDoc = createSampleShowDoc();
  const { host, services } = await mountRundown({
    rundownDoc,
    nowMs: new Date(2026, 10, 17, 23, 0, 0).getTime(),
  });
  await until(() => host.querySelector('[role="grid"]') !== null);

  // Edit header row (ROW_H1) and undo it -> emits undidCellChange for row 1
  const headerCell = host.querySelector(
    `[data-row-id="${ROW_H1}"][role="gridcell"]`,
  ) as HTMLElement;
  await act(async () => {
    headerCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  const headerInput = headerCell.querySelector("input") as HTMLInputElement;
  typeInto(headerInput, "ACT ONE UPDATED");
  await act(async () => {
    headerInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(
    readRundown(rundownDoc).rows.find((r) => r.id === ROW_H1)?.cells.segment
      ?.value,
  ).toBe("ACT ONE UPDATED");
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(
    readRundown(rundownDoc).rows.find((r) => r.id === ROW_H1)?.cells.segment
      ?.value,
  ).toBe("ACT ONE");
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.undidCellChange("Segment", 1),
  );
  act(() => {
    const cur = services.messages.current();
    if (cur !== null) services.messages.dismiss(cur.id);
  });

  // Edit Dur cell, then edit Air in Details: first undo reverts Air without stealing Dur's toast, second undo reverts Dur with its toast
  const durCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="dur"]`,
  ) as HTMLElement;
  await act(async () => {
    durCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  const durInput = durCell.querySelector("input") as HTMLInputElement;
  typeInto(durInput, "5:00");
  await act(async () => {
    durInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });

  await act(async () => {
    panelsActions.open("side", "details");
  });
  await until(() => host.querySelector('[data-tour="rundown:air"]') !== null);
  const airInput = fieldByLabel(
    host.querySelector('[data-region="side_panel"]')!,
    "Air",
  ) as HTMLInputElement;
  await enterFieldValue(airInput, "23:40");
  expect(readRundown(rundownDoc).rundown.airAt).toBe(
    new Date(2026, 10, 17, 23, 40, 0).getTime(),
  );

  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(rundownDoc).rundown.airAt).toBe(
    new Date(2026, 10, 17, 23, 35, 0).getTime(),
  );
  expect(services.messages.current()).toBeNull();
  expect(
    readRundown(rundownDoc).rows.find((r) => r.id === ROW_1)?.cells.dur?.value,
  ).toBe(300_000);

  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(
    readRundown(rundownDoc).rows.find((r) => r.id === ROW_1)?.cells.dur,
  ).toBeUndefined();
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.undidCellChange("Dur", 1),
  );
});
