import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  createDoc,
  decodeAwareness,
  encodeAwareness,
  initRundown,
  insertRows,
  jsonMap,
  readRundown,
  scriptBody,
  setCell,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
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
import {
  PASTE_NEEDS_ROWS_TEXT,
  RUNDOWN_ROWS_MIME,
  clearCopiedRows,
} from "../src/rundown/clipboard.ts";
import {
  MOVE_DOWN_LAST_ROW_TEXT,
  MOVE_UP_FIRST_ROW_TEXT,
  ROW_MENU_ITEMS,
} from "../src/rundown/rows.tsx";
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
import { rundownActions } from "../src/state/rundown.store.ts";
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
const ROW_1 = "44444444-4444-4444-8444-444444444441";
const ROW_2 = "44444444-4444-4444-8444-444444444442";
const ROW_3 = "44444444-4444-4444-8444-444444444443";
const WS_ID = "dana";

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => {
    closeBeside();
    mounted?.unmount();
  });
  mounted = null;
  clearCopiedRows();
  globalThis.fetch = originalFetch;
});

function createAwarenessBus() {
  const listeners = new Set<(update: Uint8Array) => void>();
  const sent: Uint8Array[] = [];
  return {
    sent,
    sendAwareness(update: Uint8Array) {
      sent.push(update);
    },
    onAwareness(listener: (update: Uint8Array) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(update: Uint8Array) {
      for (const listener of listeners) listener(update);
    },
  };
}

function fakeHandle(
  docId: string,
  doc: CrdtDoc,
  bus?: ReturnType<typeof createAwarenessBus>,
): DocHandle {
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
  const settingsMap = createValue<Readonly<Record<string, unknown>>>({});
  return {
    docId,
    doc: () => doc,
    status,
    settings: settingsMap,
    setSetting: (key: string, value: unknown) => {
      settingsMap.set({ ...settingsMap.get(), [key]: value });
    },
    readOnly: createValue(null),
    viewers: createValue(0),
    on: () => () => {},
    sendAwareness: (u: Uint8Array) => bus?.sendAwareness(u),
    onAwareness: (fn: (u: Uint8Array) => void) =>
      bus ? bus.onAwareness(fn) : () => {},
    close: async () => {},
  } as unknown as DocHandle;
}

function mockDescribe(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/docs/describe")) {
      return new Response(
        JSON.stringify({ role: "owner", capabilities: ["edit_rundowns"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/api/docs/people")) {
      return new Response(
        JSON.stringify({
          people: [
            { userId: "dana", name: "Dana Reyes" },
            { userId: "sam", name: "Sam Okafor" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function mountRundown(options: {
  rundownDoc: CrdtDoc;
  nowMs?: number;
  docs?: Map<string, CrdtDoc>;
}) {
  mockDescribe();
  const nowMs = options.nowMs ?? new Date(2026, 10, 17, 23, 0, 0).getTime();
  const bus = createAwarenessBus();
  const docs = options.docs ?? new Map<string, CrdtDoc>();
  docs.set(DOC_ID, options.rundownDoc);

  const wsIndexId = indexDocId("workspace", WS_ID);
  const wsDoc = docs.get(wsIndexId) ?? createDoc();
  jsonMap(wsDoc, "projects").set(PROJECT_ID, {
    title: "The Late Desk",
    kind: "show",
    createdAt: 1,
    createdByUserId: "dana",
    folderId: null,
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
    trashedAt: null,
    trashedByUserId: null,
  });
  docs.set(wsIndexId, wsDoc);

  const storyDoc = docs.get(STORY_A) ?? createDoc();
  scriptBody(storyDoc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: {
          id: "77777777-7777-4777-8777-777777777771",
          type: "slug",
          kind: null,
        },
        content: [{ type: "text", text: "MONOLOGUE" }],
      },
    ]),
  );
  docs.set(STORY_A, storyDoc);

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

  let createdCounter = 0;
  const createdCopies: {
    docId: string;
    title: string;
    rundownId: string | null;
  }[] = [];

  const services = {
    ...baseServices,
    openHandle: async (id: string) => {
      let target = docs.get(id);
      if (target === undefined) {
        target = createDoc();
        docs.set(id, target);
      }
      return fakeHandle(id, target, id === DOC_ID ? bus : undefined);
    },
    onDevice: async () => new Set<string>([STORY_A]),
    library: {
      ...baseServices.library,
      documentTitle: () => createValue("Tue 17 Nov"),
      documentKind: () => createValue<ProjectKind | null>("show"),
      docKindOf: () => createValue("rundown" as const),
      documentProject: () => createValue(PROJECT_ID),
      addCopy: async (
        _ws: string,
        projectId: string | null,
        _kind: ProjectKind,
        title: string,
        start: {
          docKind: string;
          airDate: string | null;
          rundownId: string | null;
          start(handle: DocHandle): void;
        },
      ) => {
        createdCounter += 1;
        const newDocId = `88888888-8888-4888-8888-88888888888${createdCounter}`;
        const created = createDoc();
        docs.set(newDocId, created);
        start.start(fakeHandle(newDocId, created));
        jsonMap(wsDoc, "documents").set(newDocId, {
          projectId: projectId ?? PROJECT_ID,
          title,
          kind: start.docKind,
          createdAt: nowMs,
          editedAt: null,
          editedByUserId: null,
          airDate: start.airDate,
          rundownId: start.rundownId,
          trashedAt: null,
          trashedByUserId: null,
        });
        createdCopies.push({
          docId: newDocId,
          title,
          rundownId: start.rundownId,
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
  await until(() => host.querySelector('[role="grid"]') !== null);
  return { host, services, bus, wsDoc, createdCopies, docs };
}

function makeBaseDoc(nowMs: number): CrdtDoc {
  const doc = createDoc({ clientId: 100 });
  initRundown(
    doc,
    {
      airDate: "2026-11-17",
      airAt: new Date(2026, 10, 17, 23, 35, 0).getTime(),
      windowLeadMs: 3_600_000,
      targetMs: 600_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    doc,
    [
      { id: ROW_1, kind: "script", docId: STORY_A, blockId: null },
      { id: ROW_2, kind: "item", docId: null, blockId: null },
      { id: ROW_3, kind: "header", docId: null, blockId: null },
    ],
    null,
  );
  const byDana = { userId: "dana", now: () => nowMs - 120_000 };
  const bySam = { userId: "sam", now: () => nowMs - 15_000 };
  setCell(doc, ROW_1, "segment", "Monologue", byDana);
  setCell(doc, ROW_1, "dur", 540_000, byDana);
  setCell(doc, ROW_1, "dur", 465_000, bySam);
  setCell(doc, ROW_2, "segment", "Band intro", byDana);
  setCell(doc, ROW_3, "segment", "ACT TWO", byDana);
  return doc;
}

test("add row, header row, move up/down with edge messages, unnumbered toggle, start a script and delete with undo", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const doc = makeBaseDoc(nowMs);
  const { host, services, createdCopies } = await mountRundown({
    rundownDoc: doc,
    nowMs,
  });

  // Move up on first row shows S3-RG-05 brief message
  const firstCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="segment"]`,
  ) as HTMLElement;
  await act(async () => {
    firstCell.click();
  });
  await act(async () => {
    rundownActions.slot("rows")?.moveUp?.();
  });
  expect(services.messages.current()?.text).toBe(MOVE_UP_FIRST_ROW_TEXT);

  // Move down swaps ROW_1 below ROW_2; Undo puts it back
  await act(async () => {
    rundownActions.slot("rows")?.moveDown?.();
  });
  expect(readRundown(doc).rows.map((r) => r.id)).toEqual([ROW_2, ROW_1, ROW_3]);
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(doc).rows.map((r) => r.id)).toEqual([ROW_1, ROW_2, ROW_3]);
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.undidMoveRows);

  // Move down on last row shows S3-RG-05 brief message
  const lastCell = host.querySelector(
    `[data-row-id="${ROW_3}"][role="gridcell"]`,
  ) as HTMLElement;
  await act(async () => {
    lastCell.click();
  });
  await act(async () => {
    rundownActions.slot("rows")?.moveDown?.();
  });
  expect(services.messages.current()?.text).toBe(MOVE_DOWN_LAST_ROW_TEXT);

  // Add row & Add header row, each one undo step
  await act(async () => {
    rundownActions.slot("rows")?.addRow?.();
  });
  expect(readRundown(doc).rows.length).toBe(4);
  expect(readRundown(doc).rows[3]?.kind).toBe("item");
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(doc).rows.length).toBe(3);
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.undidAddRow);

  await act(async () => {
    rundownActions.slot("rows")?.addHeaderRow?.();
  });
  expect(readRundown(doc).rows[3]?.kind).toBe("header");
  expect(host.textContent).toContain(RUNDOWN_WORDS.headerPlaceholder);
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.undidAddHeaderRow,
  );

  // Leave unnumbered / Number this row (C3-3, S3-RG-59)
  const row2Cell = host.querySelector(
    `[data-row-id="${ROW_2}"][data-col-id="segment"]`,
  ) as HTMLElement;
  await act(async () => {
    row2Cell.click();
  });
  await act(async () => {
    rundownActions.slot("rows")?.leaveUnnumbered?.();
  });
  expect(readRundown(doc).rows.find((r) => r.id === ROW_2)?.unnumbered).toBe(
    true,
  );
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.rowUnnumbered("Band intro"),
  );
  await act(async () => {
    rundownActions.slot("rows")?.numberRow?.();
  });
  expect(readRundown(doc).rows.find((r) => r.id === ROW_2)?.unnumbered).toBe(
    false,
  );
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.rowNumbered("Band intro", 2),
  );

  // Start a script on item row ROW_2 creates empty story in project with rundownId set
  await act(async () => {
    rundownActions.slot("rows")?.startScript?.();
  });
  await until(() => createdCopies.length === 1);
  expect(createdCopies[0]).toEqual({
    docId: createdCopies[0]!.docId,
    title: "Band intro",
    rundownId: DOC_ID,
  });
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.startedScript("Band intro"),
  );
  expect(services.messages.current()?.actions).toEqual([
    { label: "Open beside", commandId: "rundown.openBeside" },
  ]);

  // Delete active row with Undo (S3-RG-49 & S3-RG-60)
  const beforeDeleteCount = readRundown(doc).rows.length;
  await act(async () => {
    rundownActions.slot("rows")?.deleteRows?.();
  });
  expect(readRundown(doc).rows.length).toBe(beforeDeleteCount - 1);
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.deletedRows(1));
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(doc).rows.length).toBe(beforeDeleteCount);
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.undidDelete);
});

test("copy and paste make new story copies and undo quietly removes them from the workspace index", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const doc = makeBaseDoc(nowMs);
  const { host, services, wsDoc, createdCopies } = await mountRundown({
    rundownDoc: doc,
    nowMs,
  });

  // Paste with empty clipboard shows S3-RG-08
  await act(async () => {
    rundownActions.slot("rows")?.pasteRows?.();
  });
  expect(services.messages.current()?.text).toBe(PASTE_NEEDS_ROWS_TEXT);

  // Select ROW_1 (script row) and fire DOM copy event
  const row1Cell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="segment"]`,
  ) as HTMLElement;
  await act(async () => {
    row1Cell.click();
  });
  const clipStore = new Map<string, string>();
  const clipboardData = {
    setData: (type: string, value: string) => clipStore.set(type, value),
    getData: (type: string) => clipStore.get(type) ?? "",
  } as unknown as DataTransfer;
  const copyEvent = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(copyEvent, "clipboardData", { value: clipboardData });
  await act(async () => {
    row1Cell.dispatchEvent(copyEvent);
  });
  expect(clipStore.has(RUNDOWN_ROWS_MIME)).toBe(true);
  expect(clipStore.get("text/plain")).toContain("Monologue");

  // Fire DOM paste event
  const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
  await act(async () => {
    row1Cell.dispatchEvent(pasteEvent);
  });
  await until(() => readRundown(doc).rows.length === 4);
  expect(createdCopies.length).toBe(1);
  const pastedRow = readRundown(doc).rows[1]!;
  expect(pastedRow.kind).toBe("script");
  expect(pastedRow.docId).toBe(createdCopies[0]!.docId);
  expect(pastedRow.docId).not.toBe(STORY_A);
  expect(
    jsonMap(wsDoc, "documents").get(createdCopies[0]!.docId),
  ).not.toBeNull();
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.pastedRows(1, 1),
  );

  // Undo paste removes row in one step and quietly removes copied story from workspace index (C3-4)
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(readRundown(doc).rows.length).toBe(3);
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.undidPaste);
  await until(
    () => jsonMap(wsDoc, "documents").get(createdCopies[0]!.docId) === null,
  );
  expect(jsonMap(wsDoc, "documents").get(createdCopies[0]!.docId)).toBeNull();
});

test("corner mark opens Previous value popover, restores in one undo step, and keeps rundown:cell unique", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const doc = makeBaseDoc(nowMs);
  const { host, services } = await mountRundown({ rundownDoc: doc, nowMs });

  // Exactly one data-tour="rundown:cell" on the overwritten Dur cell
  const tourCells = host.querySelectorAll('[data-tour="rundown:cell"]');
  expect(tourCells.length).toBe(1);
  expect((tourCells[0] as HTMLElement).dataset.rowId).toBe(ROW_1);
  expect((tourCells[0] as HTMLElement).dataset.colId).toBe("dur");

  // Click the 6 px corner mark button to open cell_popover
  const markBtn = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="dur"] [data-corner-mark="true"]`,
  ) as HTMLElement;
  expect(markBtn).not.toBeNull();
  await act(async () => {
    markBtn.click();
  });
  await until(
    () => document.querySelector('[data-surface="cell_popover"]') !== null,
  );
  const popover = document.querySelector('[data-surface="cell_popover"]')!;
  expect(popover.textContent).toContain("Previous value — Sam ");
  expect(popover.textContent).toContain("Was 9:00");

  // Click Restore: restores 9:00 in one undo step and announces S3-RG-58
  const restoreBtn = [...popover.querySelectorAll("button")].find(
    (btn) => btn.textContent === RUNDOWN_WORDS.restore,
  ) as HTMLButtonElement;
  expect(restoreBtn).toBeDefined();
  await act(async () => {
    restoreBtn.click();
  });
  expect(
    readRundown(doc).rows.find((r) => r.id === ROW_1)?.cells.dur?.value,
  ).toBe(540_000);
  expect(services.messages.current()?.text).toBe(
    RUNDOWN_WORDS.restoredCell("Dur", { kind: "row", number: 1 }, "9:00"),
  );
  expect(host.querySelectorAll('[data-tour="rundown:cell"]').length).toBe(1);

  // Undo Restore puts 7:45 back in one step
  await act(async () => {
    rundownActions.slot("rows")?.undo?.();
  });
  expect(
    readRundown(doc).rows.find((r) => r.id === ROW_1)?.cells.dur?.value,
  ).toBe(465_000);
  expect(services.messages.current()?.text).toBe(RUNDOWN_WORDS.undidRestore);
});

test("presence shows remote cell and story initials and publishes local awareness via encodeAwareness", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const doc = makeBaseDoc(nowMs);
  const { host, bus } = await mountRundown({ rundownDoc: doc, nowMs });

  // Emit remote collaborator editing Dur on ROW_2 and viewing STORY_A on ROW_1
  await act(async () => {
    bus.emit(
      encodeAwareness([
        {
          clientId: 202,
          clock: 1,
          state: {
            user: { userId: "sam" },
            cell: { rowId: ROW_2, columnId: "dur" },
          },
        },
        {
          clientId: 203,
          clock: 1,
          state: {
            user: { userId: "ana" },
            cell: { rowId: ROW_1, columnId: null },
          },
        },
      ]),
    );
  });

  await until(
    () =>
      host.querySelector('[aria-label="Sam is editing this cell"]') !== null,
  );
  expect(
    host.querySelector('[aria-label="Sam is editing this cell"]')?.textContent,
  ).toBe("SO");
  expect(
    host.querySelector('[aria-label="Ana has this script open"]')?.textContent,
  ).toBe("AC");

  // Opening ROW_1's story Beside publishes { rowId: ROW_1, columnId: null }
  await act(async () => {
    openBeside(STORY_A, "script", null);
  });
  await until(() =>
    bus.sent.some((frame) => {
      const entries = decodeAwareness(frame);
      const cell = entries[0]?.state?.cell as
        { rowId: string; columnId: string | null } | null | undefined;
      return cell?.rowId === ROW_1 && cell.columnId === null;
    }),
  );
  expect(ROW_MENU_ITEMS).toEqual([
    "prompter.send",
    "rundown.openBeside",
    "rundown.moveUp",
    "rundown.moveDown",
    "rundown.copyRows",
    "rundown.deleteRows",
    "rundown.previousValue",
    "rundown.startScript",
    "rundown.leaveUnnumbered",
    "rundown.numberRow",
  ]);
});

test("row menu draws items in ROW_MENU_ITEMS order with per-row filtering", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const doc = makeBaseDoc(nowMs);
  const { host } = await mountRundown({ rundownDoc: doc, nowMs });

  // Open row menu on ROW_1 (script row with previous value on dur): has Previous value, Leave unnumbered, no Start a script
  const row1Trigger = host.querySelector(
    'button[aria-label="Monologue — row menu"]',
  ) as HTMLButtonElement;
  expect(row1Trigger).not.toBeNull();
  await act(async () => {
    row1Trigger.click();
  });
  await until(() => document.querySelectorAll('[role="menuitem"]').length > 0);
  const row1Labels = [...document.querySelectorAll('[role="menuitem"]')].map(
    (el) => el.textContent,
  );
  expect(row1Labels).toEqual([
    "Open beside",
    "Move up",
    "Move down",
    "Copy",
    "Delete",
    "Previous value",
    "Leave unnumbered",
  ]);

  // Close menu, then open on ROW_2 (item row without previous value): has Start a script and Leave unnumbered, no Previous value
  await act(async () => {
    row1Trigger.click();
  });
  const row2Trigger = host.querySelector(
    'button[aria-label="Band intro — row menu"]',
  ) as HTMLButtonElement;
  await act(async () => {
    row2Trigger.click();
  });
  await until(() =>
    [...document.querySelectorAll('[role="menuitem"]')].some(
      (el) => el.textContent === "Start a script",
    ),
  );
  const row2Labels = [...document.querySelectorAll('[role="menuitem"]')].map(
    (el) => el.textContent,
  );
  expect(row2Labels).toEqual([
    "Open beside",
    "Move up",
    "Move down",
    "Copy",
    "Delete",
    "Start a script",
    "Leave unnumbered",
  ]);
});
