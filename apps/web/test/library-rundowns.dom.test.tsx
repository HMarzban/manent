import { withDom } from "@manent/testkit/dom";
import {
  createDoc,
  initRundown,
  insertRows,
  jsonMap,
  readRundown,
  setCell,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { NEWS_COLUMNS, SHOW_COLUMNS, randomBlockId } from "@manent/schema";
import type { DocHandle, DocStatus } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  DEFAULT_WINDOW_LEAD_MS,
  airAtForDate,
} from "../src/rundown/create-rundown.ts";
import { LibraryScreen } from "../src/screens/library/library-screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  ContinueItem,
  CreateResult,
  DocumentStart,
  LibraryIndex,
  PersonServices,
  ProjectItem,
} from "../src/services/ports.ts";
import { createPersonServices } from "../src/services/services.ts";
import { writePerson } from "../src/session.ts";
import type { TabPerson } from "../src/session.ts";
import { AppShell } from "../src/shell/app-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { rundownActions } from "../src/state/rundown.store.ts";
import {
  MemoryStorage,
  createClock,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";

withDom();
notifyManager.setScheduler(queueMicrotask);

const NOW = new Date(2026, 10, 18, 12, 0, 0).getTime();
const DANA: TabPerson = {
  token: "dana-token",
  userId: "dana",
  name: "Dana Reyes",
};
const ROOM: WorkspaceRef = {
  id: "medium",
  name: "Writers' room",
  seeding: null,
};

function fakeHandle(docId: string, crdtDoc: CrdtDoc): DocHandle {
  const status = createValue<DocStatus>({
    link: "online",
    docSync: "synced",
    synced: true,
    saved: true,
    neverSynced: false,
    waiting: 0,
    wentOfflineAt: null,
    recovered: 0,
    side: [],
  });
  return {
    docId,
    doc: () => crdtDoc,
    status,
    lastServerSeq: () => 1,
    on: () => () => {},
    getSetting: () => undefined,
    setSetting: () => {},
    flush: async () => {},
    close: async () => {},
  } as unknown as DocHandle;
}

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  globalThis.fetch = originalFetch;
});

async function renderRundownLibrary(options: {
  projects: readonly ProjectItem[];
  continueList?: readonly ContinueItem[];
  docs: ReadonlyMap<string, CrdtDoc>;
  docKinds?: ReadonlyMap<string, "script" | "rundown">;
  onAddCopy?: (
    projectId: string | null,
    title: string,
    start: DocumentStart,
  ) => CreateResult;
}): Promise<{ router: AnyRouter; services: PersonServices }> {
  const clock = createClock(NOW);
  const tabStorage = new MemoryStorage();
  writePerson(tabStorage, DANA);
  const environment = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    storage: new MemoryStorage(),
    tabStorage,
  });
  bindGuard(environment.guard);
  let router: AnyRouter | null = null;
  const api = fakeApi({
    me: async () => ({
      ok: true,
      me: { userId: DANA.userId, name: DANA.name, workspaces: [ROOM] },
    }),
  });
  const projectsValue = createValue(options.projects);
  const continueValue = createValue(options.continueList ?? []);
  const empty = createValue<readonly never[]>([]);
  const library: LibraryIndex = {
    continueList: (id) => (id === "medium" ? continueValue : empty),
    projects: (id) => (id === "medium" ? projectsValue : empty),
    readProjects: async (id) => (id === "medium" ? options.projects : []),
    loadState: () => createValue<"cached" | "problem">("cached"),
    createProject: async () => ({ projectId: "p", docId: "d" }),
    importProject: async () => ({ projectId: "p", docId: "d" }),
    documentTitle: () => createValue(null),
    documentKind: () => createValue(null),
    docKindOf: (id) => createValue(options.docKinds?.get(id) ?? null),
    documentProject: () => createValue(null),
    renameDocument: () => {},
    addCopy: async (_ws, projectId, _kind, title, start) =>
      options.onAddCopy?.(projectId, title, start) ?? {
        projectId: projectId ?? "p",
        docId: "new-rundown-id",
      },
  };
  const base = createPersonServices({
    ...environment,
    person: DANA,
    demo: createValue(false),
    api,
    usePerson: createPersonStore(tabStorage),
    router: {
      navigate(href) {
        void router?.navigate({ href });
      },
      here: () => ({
        routeId: router?.state.matches.at(-1)?.routeId ?? null,
        href: router?.state.location.href ?? "/",
        search: router?.state.location.search ?? {},
      }),
    },
  });
  const services: PersonServices = {
    ...base,
    library,
    openHandle: async (docId) => {
      const found = options.docs.get(docId);
      if (found === undefined) throw new Error(`missing doc ${docId}`);
      return fakeHandle(docId, found);
    },
    onDevice: async (docIds) =>
      new Set(docIds.filter((id) => options.docs.has(id))),
  };
  const rootRoute = createRootRoute({
    component: () => (
      <ServicesProvider services={services}>
        <AppShell>
          <Outlet />
        </AppShell>
      </ServicesProvider>
    ),
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      validateSearch: (search: Record<string, unknown>) => ({
        w: typeof search.w === "string" ? search.w : null,
      }),
      component: () => <LibraryScreen api={api} person={DANA} />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/s/$docId",
      component: () => <h1 tabIndex={-1}>Rundown</h1>,
    }),
  ]);
  router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={client}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {});
  await act(async () => {});
  return { router, services };
}

test("Show and News projects list rundowns by date with nested stories, plain row numbers, data-tour and New rundown slot", async () => {
  const wsDoc = createDoc({ clientId: 1 });
  const projectsMap = jsonMap(wsDoc, "projects");
  projectsMap.set("news-proj", {
    title: "Lannick One News",
    kind: "news",
    createdAt: NOW - 3600_000,
    createdByUserId: "ana",
  });
  const docsMap = jsonMap(wsDoc, "documents");
  docsMap.set("rd-today", {
    projectId: "news-proj",
    title: "Wed 18 Nov",
    kind: "rundown",
    createdAt: NOW - 2000,
    editedAt: NOW - 300_000,
    editedByUserId: "ana",
    airDate: "2026-11-18",
    rundownId: null,
  });
  docsMap.set("rd-next-year", {
    projectId: "news-proj",
    title: "Mon 18 Jan 2027",
    kind: "rundown",
    createdAt: NOW - 1000,
    editedAt: null,
    editedByUserId: null,
    airDate: "2027-01-18",
    rundownId: null,
  });
  docsMap.set("story-1", {
    projectId: "news-proj",
    title: "01 Tolle Exchange library: council votes yes",
    kind: "script",
    createdAt: NOW - 1500,
    editedAt: NOW - 120_000,
    editedByUserId: "ana",
    airDate: null,
    rundownId: "rd-today",
  });
  docsMap.set("loose-script", {
    projectId: "news-proj",
    title: "Loose script never shown",
    kind: "script",
    createdAt: NOW - 1200,
    editedAt: null,
    editedByUserId: null,
    airDate: null,
    rundownId: null,
  });

  const rdToday = createDoc({ clientId: 2 });
  initRundown(
    rdToday,
    {
      airDate: "2026-11-18",
      airAt: airAtForDate("2026-11-18", 18, 0),
      windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
      targetMs: 60 * 60 * 1000,
    },
    NEWS_COLUMNS,
  );
  const r1 = randomBlockId();
  insertRows(
    rdToday,
    [{ id: r1, kind: "script", docId: "story-1", blockId: null }],
    null,
  );
  setCell(rdToday, r1, "story", "Tolle Exchange", {
    userId: "ana",
    now: () => NOW,
  });

  const rdNextYear = createDoc({ clientId: 3 });
  initRundown(
    rdNextYear,
    {
      airDate: "2027-01-18",
      airAt: airAtForDate("2027-01-18", 18, 0),
      windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
      targetMs: 60 * 60 * 1000,
    },
    NEWS_COLUMNS,
  );

  const userDoc = createDoc({ clientId: 4 });
  const docs = new Map<string, CrdtDoc>([
    [indexDocId("workspace", "medium"), wsDoc],
    [indexDocId("user", DANA.userId), userDoc],
    ["rd-today", rdToday],
    ["rd-next-year", rdNextYear],
    ["story-1", createDoc({ clientId: 5 })],
  ]);

  const added: {
    projectId: string | null;
    title: string;
    airDate: string | null;
  }[] = [];
  const { router, services } = await renderRundownLibrary({
    projects: [
      {
        projectId: "news-proj",
        title: "Lannick One News",
        kind: "news",
        firstDocId: "rd-today",
        lastEdited: { byName: "Ana", at: NOW - 300_000 },
        place: { kind: "synced" },
      },
    ],
    docs,
    onAddCopy: (projectId, title, start) => {
      added.push({ projectId, title, airDate: start.airDate });
      return { projectId: projectId ?? "news-proj", docId: "rd-created" };
    },
  });

  const tourList = document.querySelector('[data-tour="library:rundowns"]');
  expect(tourList).not.toBeNull();
  expect(tourList?.textContent).toContain("Date");
  expect(tourList?.textContent).toContain("Air");
  expect(tourList?.textContent).toContain("Rows");
  expect(tourList?.textContent).toContain("Last edited");

  const rows = [...(tourList?.querySelectorAll<HTMLElement>(".mn-row") ?? [])];
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringContaining("Mon 18 Jan 2027"),
    expect.stringContaining("Wed 18 Nov"),
    expect.stringContaining("01 Tolle Exchange library: council votes yes"),
  ]);
  expect(rows[1]?.textContent).toContain("18:00");
  expect(rows[1]?.textContent).toContain("1 row");
  expect(rows[2]?.textContent).toContain("Row 1");
  expect(tourList?.textContent).not.toContain("Loose script never shown");

  // Every row is activatable (pointer cursor / hover per R-X)
  expect(rows.every((row) => row.hasAttribute("tabindex"))).toBe(true);

  // Disclosure chevron collapses and expands nested stories without opening the rundown
  const toggle = tourList?.querySelector<HTMLButtonElement>(
    'button[aria-expanded="true"]',
  );
  expect(toggle).not.toBeNull();
  await act(async () => toggle?.click());
  expect(router.state.location.pathname).toBe("/");
  expect(tourList?.querySelectorAll(".mn-row").length).toBe(2);
  await act(async () => toggle?.click());
  expect(tourList?.querySelectorAll(".mn-row").length).toBe(3);

  // Command slot `library` powers `rundown.new`
  expect(rundownActions.slot("library")?.new).toBeFunction();
  await act(async () => {
    services.commands.run("rundown.new", "palette");
  });
  expect(added).toEqual([
    { projectId: "news-proj", title: "Thu 19 Nov", airDate: "2026-11-19" },
  ]);
  expect(services.messages.current()?.text).toBe("New rundown for Thu 19 Nov.");
  expect(router.state.location.pathname).toBe("/s/rd-created");
});

test("a Show project with no rundowns shows No rundowns yet with New rundown and opens a rundown when clicked", async () => {
  const wsDoc = createDoc({ clientId: 1 });
  const projectsMap = jsonMap(wsDoc, "projects");
  projectsMap.set("show-empty", {
    title: "The Late Desk",
    kind: "show",
    createdAt: NOW,
    createdByUserId: "ana",
  });
  const docs = new Map<string, CrdtDoc>([
    [indexDocId("workspace", "medium"), wsDoc],
    [indexDocId("user", DANA.userId), createDoc({ clientId: 2 })],
  ]);

  let startedColumns: readonly string[] = [];
  const { router } = await renderRundownLibrary({
    projects: [
      {
        projectId: "show-empty",
        title: "The Late Desk",
        kind: "show",
        firstDocId: null,
        lastEdited: { byName: "Ana", at: NOW },
        place: { kind: "synced" },
      },
    ],
    docs,
    onAddCopy: (projectId, _title, start) => {
      const targetDoc = createDoc({ clientId: 9 });
      start.start(fakeHandle("rd-first", targetDoc));
      startedColumns = readRundown(targetDoc).columns;
      return { projectId: projectId ?? "show-empty", docId: "rd-first" };
    },
  });

  const tourList = document.querySelector('[data-tour="library:rundowns"]');
  expect(tourList?.textContent).toContain("No rundowns yet");
  const allNewButtons = document.querySelectorAll<HTMLButtonElement>(
    '[data-tour="rundown.new"]',
  );
  expect(allNewButtons.length).toBe(1);
  const newButton = [
    ...(tourList?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((btn) => btn.textContent?.includes("New rundown"));
  expect(newButton).not.toBeUndefined();
  expect(newButton?.getAttribute("data-tour")).toBe("rundown.new");
  expect(newButton?.className).toContain("cursor-pointer");
  await act(async () => newButton?.click());
  expect(startedColumns).toEqual([...SHOW_COLUMNS]);
  expect(router.state.location.pathname).toBe("/s/rd-first");
});

test("read-only project access disables New rundown with a reason and Continue rows show a rundown's broadcast date and air time", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/docs/describe")) {
      return new Response(JSON.stringify({ role: "view", capabilities: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ people: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const wsDoc = createDoc({ clientId: 1 });
  jsonMap(wsDoc, "projects").set("news-ro", {
    title: "Lannick One News",
    kind: "news",
    createdAt: NOW,
    createdByUserId: "ana",
  });
  jsonMap(wsDoc, "documents").set("rd-ro", {
    projectId: "news-ro",
    title: "Wed 18 Nov",
    kind: "rundown",
    createdAt: NOW,
    editedAt: null,
    editedByUserId: null,
    airDate: "2026-11-18",
    rundownId: null,
  });
  const rdDoc = createDoc({ clientId: 2 });
  initRundown(
    rdDoc,
    {
      airDate: "2026-11-18",
      airAt: airAtForDate("2026-11-18", 18, 0),
      windowLeadMs: DEFAULT_WINDOW_LEAD_MS,
      targetMs: 60 * 60 * 1000,
    },
    NEWS_COLUMNS,
  );
  const docs = new Map<string, CrdtDoc>([
    [indexDocId("workspace", "medium"), wsDoc],
    [indexDocId("user", DANA.userId), createDoc({ clientId: 3 })],
    ["rd-ro", rdDoc],
  ]);

  await renderRundownLibrary({
    projects: [
      {
        projectId: "news-ro",
        title: "Lannick One News",
        kind: "news",
        firstDocId: "rd-ro",
        lastEdited: { byName: "Ana", at: NOW },
        place: { kind: "synced" },
      },
    ],
    continueList: [
      {
        docId: "rd-ro",
        title: "Wed 18 Nov",
        projectTitle: "Lannick One News",
        kind: "news",
        place: { kind: "synced" },
      },
    ],
    docs,
    docKinds: new Map([["rd-ro", "rundown"]]),
  });

  const newButton = document.querySelector<HTMLButtonElement>(
    '[data-tour="rundown.new"]',
  );
  expect(newButton?.getAttribute("aria-disabled")).toBe("true");
  const describedBy = newButton?.getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(describedBy)?.textContent).toBe(
    "New rundown — needs edit access",
  );

  const continueSection = document.querySelector(
    'section[aria-label="Continue"]',
  );
  expect(continueSection?.textContent).toContain("Wed 18 Nov · Air 18:00");
});
