import { withDom } from "@manent/testkit/dom";
import { TOUR, isShown } from "@manent/demo";
import { afterEach, expect, test } from "bun:test";
import type { LocalStore } from "@manent/sync-client";
import { createFaultyStoreSpace } from "@manent/sync-client/testing";
import { createValue } from "@manent/ui";
import type { WorkspaceRef } from "@manent/sync-protocol";
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
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Api, MeResult } from "../src/api.ts";
import type { Navigation } from "../src/handlers/index.ts";
import { LibraryScreen } from "../src/screens/library/library-screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  ContinueItem,
  CreateResult,
  LibraryIndex,
  PersonServices,
  ProjectItem,
  ProjectKind,
} from "../src/services/ports.ts";
import { createPersonServices } from "../src/services/services.ts";
import type { TabPerson } from "../src/session.ts";
import { AppShell } from "../src/shell/app-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { dialogActions } from "../src/state/dialog.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { paletteActions } from "../src/state/palette.store.ts";
import { panelsActions, usePanel } from "../src/state/panels.store.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  MemoryStorage,
  createClock,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";
import { turn } from "./sync.fixtures.ts";

withDom();

// the query client tells components of an answer at once, so that act() sees it
notifyManager.setScheduler(queueMicrotask);

// a Wednesday, local time
const NOW = new Date(2026, 10, 18, 12, 0).getTime();
const MINUTE_MS = 60_000;
const NIGHT_DOC = "5d2e7c1a-3b4f-4a6d-9e8c-1f2a3b4c5d6e";
const GAME_DOC = "8a9b0c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d";
const NEW_DOC = "0b1c2d3e-4f5a-4b6c-9d8e-7f6a5b4c3d2e";
const LIBRARY_PROBLEM =
  "Couldn't load the list. Showing what is on this device.";

const DANA: TabPerson = {
  token: "dana-token",
  userId: "dana",
  name: "Dana Reyes",
};
const YOU: TabPerson = { token: null, userId: "you", name: "You" };

const ROOM: WorkspaceRef = {
  id: "medium",
  name: "Writers' room",
  seeding: null,
};
const STUDIOS: WorkspaceRef = {
  id: "heavy",
  name: "Lanternfield Studios",
  seeding: { done: 12, total: 40, failed: false },
};

const LONG_NIGHT: ProjectItem = {
  projectId: "night",
  title: "The Long Night",
  kind: "film",
  firstDocId: NIGHT_DOC,
  lastEdited: { byName: "Priya", at: NOW - 14 * MINUTE_MS },
  place: { kind: "synced" },
};
const GAME_SAMPLES: ProjectItem = {
  projectId: "game",
  title: "Game samples",
  kind: "game",
  firstDocId: GAME_DOC,
  // Monday, two days before
  lastEdited: { byName: "Dana", at: new Date(2026, 10, 16, 10, 0).getTime() },
  place: { kind: "not_on_device" },
};
const NIGHT_SCRIPT: ContinueItem = {
  docId: NIGHT_DOC,
  title: "The Long Night",
  projectTitle: "The Long Night",
  kind: "film",
  place: { kind: "synced" },
};

/** An index holding what each workspace is seeded with; `createProject` waits until `finish` is called. */
function seededIndex(seed: {
  projects?: Readonly<Record<string, readonly ProjectItem[]>>;
  continueList?: Readonly<Record<string, readonly ContinueItem[]>>;
  loadState?: "cached" | "problem";
}): LibraryIndex & { created: [string, ProjectKind][]; finish(): void } {
  const projects = new Map(
    Object.entries(seed.projects ?? {}).map(([id, items]) => [
      id,
      createValue(items),
    ]),
  );
  const continueLists = new Map(
    Object.entries(seed.continueList ?? {}).map(([id, items]) => [
      id,
      createValue(items),
    ]),
  );
  const none = createValue<readonly never[]>([]);
  const loadState = createValue(seed.loadState ?? "cached");
  const created: [string, ProjectKind][] = [];
  let finish: (() => void) | null = null;
  return {
    created,
    finish: () => finish?.(),
    continueList: (id) => continueLists.get(id) ?? none,
    projects: (id) => projects.get(id) ?? none,
    readProjects: async (id) => projects.get(id)?.get() ?? [],
    loadState: () => loadState,
    createProject(id, kind) {
      created.push([id, kind]);
      return new Promise<CreateResult>((resolve) => {
        finish = () => resolve({ projectId: "new", docId: NEW_DOC });
      });
    },
    importProject: () => new Promise<CreateResult>(() => {}),
    documentTitle: () => createValue(null),
    documentKind: () => createValue(null),
    docKindOf: () => createValue(null),
    renameDocument: () => {},
    addCopy: () => new Promise<CreateResult>(() => {}),
  };
}

/** A query client set as the app's: a failed query is not retried. */
const appClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  act(() => {
    panelsActions.close("side");
    dialogActions.close();
    paletteActions.close();
  });
});

/** The Library at `path`, as `person`, in the shell, with `library` as the person's index. */
async function renderLibrary(options: {
  person: TabPerson;
  library: LibraryIndex;
  api?: Api;
  path?: string;
  demo?: boolean;
  /** The browser's store of each person, kept from one drawing to the next; a store of its own unless given. */
  stores?: { store(userId: string): LocalStore };
  client?: QueryClient;
}): Promise<{ router: AnyRouter; services: PersonServices }> {
  const { person } = options;
  const api = options.api ?? fakeApi();
  const clock = createClock(NOW);
  const environment = testEnvironment(
    {
      dom: createShellDom(document),
      now: clock.now,
      schedule: clock.schedule,
      storage: new MemoryStorage(),
    },
    options.stores,
  );
  bindGuard(environment.guard);
  let router: AnyRouter | null = null;
  const navigation: Navigation = {
    navigate(href) {
      void router?.navigate({ href });
    },
    here() {
      const state = router?.state;
      return {
        routeId: state?.matches.at(-1)?.routeId ?? null,
        href: state?.location.href ?? "/",
        search: state?.location.search ?? {},
      };
    },
  };
  const services: PersonServices = {
    ...createPersonServices({
      ...environment,
      person,
      demo: createValue(options.demo ?? false),
      api,
      usePerson: createPersonStore(null),
      router: navigation,
    }),
    library: options.library,
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
      component: () => <LibraryScreen api={api} person={person} />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/s/$docId",
      component: () => <h1 tabIndex={-1}>Document</h1>,
    }),
  ]);
  router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [options.path ?? "/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  const client = options.client ?? appClient();
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={client}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  // the server's answer about the person's workspaces
  await act(async () => {});
  return { router, services };
}

const region = (name: string): HTMLElement => {
  const found = [...document.querySelectorAll("section")].find(
    (s) => s.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no region ${name}`);
  return found;
};

const buttonNames = (root: ParentNode): string[] =>
  [...root.querySelectorAll("button")].map((b) => b.textContent ?? "");

/** The words a row shows, part by part, in the order they are drawn. */
const rowWords = (row: Element): string[] =>
  [row, ...row.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && e.textContent !== "")
    .map((e) => e.textContent ?? "");

const rowsOf = (root: ParentNode): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(".mn-row"),
];

const meWith = (workspaces: readonly WorkspaceRef[]): Api =>
  fakeApi({
    me: async () => ({
      ok: true,
      me: { userId: "dana", name: "Dana Reyes", workspaces },
    }),
  });

const openMenu = async (trigger: HTMLElement): Promise<HTMLElement[]> => {
  await act(async () => trigger.click());
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
};

/** The first control of the header row. */
const switcherButton = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>(
    '[data-region="title_bar"] button',
  );
  if (found === null) throw new Error("no header button");
  return found;
};

test("an empty workspace teaches by doing", async () => {
  await renderLibrary({ person: YOU, library: seededIndex({}) });
  const projects = region("Projects");
  expect(projects.textContent).toContain("No scripts yet");
  expect(buttonNames(projects)).toEqual([
    "Import…",
    "New script",
    "New project",
  ]);
  expect(
    buttonNames(document).filter((name) => name.includes("Import")),
  ).toEqual(["Import…", "Import…"]);
  const heading = document.querySelector("h1");
  expect([heading?.textContent, document.activeElement]).toEqual([
    "Library",
    heading,
  ]);
  expect(document.title).toBe("Library — You — Manent demo");
});

test("Continue comes first, then the projects with their kind, last edit and place", async () => {
  const library = seededIndex({
    projects: { medium: [LONG_NIGHT, GAME_SAMPLES] },
    continueList: { medium: [NIGHT_SCRIPT] },
  });
  const { router } = await renderLibrary({
    person: DANA,
    library,
    api: meWith([ROOM]),
  });
  const continueList = region("Continue");
  const projects = region("Projects");
  expect(
    continueList.compareDocumentPosition(projects) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(rowsOf(continueList).map(rowWords)).toEqual([
    ["The Long Night", "The Long Night · Film", "Synced"],
  ]);
  const [night, game] = rowsOf(projects);
  expect([night, game].map((row) => (row ? rowWords(row) : []))).toEqual([
    ["The Long Night", "Film", "Priya, 14 min ago", "Synced"],
    ["Game samples", "Game", "Dana, Mon", "Not on this device"],
  ]);
  expect(game?.getAttribute("aria-disabled")).toBe("true");
  expect(game?.tabIndex).toBe(0);
  await act(async () => game?.click());
  expect(router.state.location.pathname).toBe("/");
  const statusBar = document.querySelector('[data-region="status_bar"]');
  expect(statusBar?.textContent).toContain(
    "1 of 2 projects are on this device",
  );
  await act(async () => night?.click());
  expect(router.state.location.pathname).toBe(`/s/${NIGHT_DOC}`);
});

test("the switcher lists the person's workspaces and says which is getting ready", async () => {
  const library = seededIndex({
    projects: { medium: [LONG_NIGHT, GAME_SAMPLES] },
    continueList: { medium: [NIGHT_SCRIPT] },
  });
  const { router } = await renderLibrary({
    person: DANA,
    library,
    api: meWith([ROOM, STUDIOS]),
  });
  expect(switcherButton().textContent).toContain("Writers' room");
  const items = await openMenu(switcherButton());
  expect(
    items.map((item) => [rowWords(item), item.getAttribute("aria-current")]),
  ).toEqual([
    [["Writers' room", "2 projects · The Long Night"], "true"],
    [["Lanternfield Studios", "getting ready, 12 of 40 projects"], null],
  ]);
  await act(async () => items[1]?.click());
  expect([
    router.state.location.pathname,
    router.state.location.search,
  ]).toEqual(["/", { w: "heavy" }]);
  // a workspace getting ready says so in place of its lists, never that it is empty
  const lines = [...document.querySelectorAll("p")].map((p) => p.textContent);
  expect(lines).toContain(
    "Lanternfield Studios is getting ready, 12 of 40 projects.",
  );
  expect(lines).not.toContain("No scripts yet");
});

test("a person with no session has one workspace, on this device only, and can sign in from it", async () => {
  const signIns: string[] = [];
  const api = fakeApi({
    signIn: async (userId) => {
      signIns.push(userId);
      return { ok: false, reason: "unreachable" };
    },
  });
  await renderLibrary({ person: YOU, library: seededIndex({}), api });
  expect(switcherButton().textContent).toContain("Your desk");
  const items = await openMenu(switcherButton());
  expect(items.map(rowWords)).toEqual([
    ["Your desk", "Only in this browser"],
    ["Sign in to sync"],
  ]);
  await act(async () => items[1]?.click());
  expect(signIns).toEqual(["you"]);
});

const cardButtons = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '[data-slot="popover-content"] button',
  ),
];

/** The New project cards, each by its accessible name and description. */
const cards = (): { name: string; description: string }[] =>
  cardButtons().map((card) => ({
    name:
      document.getElementById(card.getAttribute("aria-labelledby") ?? "")
        ?.textContent ?? "",
    description:
      document.getElementById(card.getAttribute("aria-describedby") ?? "")
        ?.textContent ?? "",
  }));

/** `key` pressed where focus is. */
const press = (key: string): void =>
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });

const openNewProject = async (): Promise<void> => {
  const header = document.querySelector('[data-region="title_bar"]');
  const trigger = [...(header?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === "New project",
  );
  await act(async () => trigger?.click());
};

test("New project offers one card per kind, each named by its kind and described by its line", async () => {
  await renderLibrary({ person: YOU, library: seededIndex({}) });
  await openNewProject();
  expect(cards().map((c) => [c.name, c.description])).toEqual([
    ["Film", "One script and its outline"],
    ["Series", "Seasons and episodes"],
    ["Show", "A rundown for each show day"],
    ["News", "A rundown for each newscast"],
    ["Podcast", "Episodes with running times"],
    ["Book", "One manuscript with chapters"],
    ["Game", "Game Script and Ink"],
    ["Stage play", "A script for the stage and its outline"],
  ]);
  const all = cardButtons();
  expect(document.activeElement).toBe(all[0] ?? null);
  press("ArrowRight");
  press("ArrowDown");
  expect(document.activeElement).toBe(all[5] ?? null);
  press("ArrowLeft");
  press("ArrowUp");
  expect(document.activeElement).toBe(all[0] ?? null);
});

test("choosing a kind creates the project and opens its first document", async () => {
  const library = seededIndex({});
  const { router } = await renderLibrary({
    person: DANA,
    library,
    api: meWith([ROOM]),
  });
  await openNewProject();
  const book = cardButtons()[5];
  const width = book?.className;
  await act(async () => book?.click());
  expect(library.created).toEqual([["medium", "book"]]);
  expect([book?.disabled, book?.className]).toEqual([true, width]);
  expect(router.state.location.pathname).toBe("/");
  await act(async () => library.finish());
  expect(router.state.location.pathname).toBe(`/s/${NEW_DOC}`);
});

test("a list that cannot be loaded says so and shows what is on this device", async () => {
  const cases: { api: Api; loadState: "cached" | "problem" }[] = [
    { api: meWith([ROOM]), loadState: "problem" },
    {
      api: fakeApi({ me: async () => ({ ok: false, reason: "unreachable" }) }),
      loadState: "cached",
    },
  ];
  for (const { api, loadState } of cases) {
    const library = seededIndex({
      projects: { medium: [LONG_NIGHT], dana: [LONG_NIGHT] },
      loadState,
    });
    await renderLibrary({ person: DANA, library, api, path: "/?w=medium" });
    const problem = [...document.querySelectorAll("p")].find(
      (p) => p.textContent === LIBRARY_PROBLEM,
    );
    const projects = region("Projects");
    expect([
      problem?.textContent,
      Boolean(
        problem &&
        problem.compareDocumentPosition(projects) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      rowsOf(projects).map(rowWords),
    ]).toEqual([
      LIBRARY_PROBLEM,
      true,
      [["The Long Night", "Film", "Priya, 14 min ago", "Synced"]],
    ]);
    act(() => mounted?.unmount());
    mounted = null;
  }
});

test("when the server cannot be reached, the Library keeps the workspaces it last heard of and says so", async () => {
  const answers: MeResult[] = [
    {
      ok: true,
      me: { userId: "dana", name: "Dana Reyes", workspaces: [ROOM] },
    },
    { ok: false, reason: "unreachable" },
  ];
  const api = fakeApi({
    me: async () => answers.shift() ?? { ok: false, reason: "unreachable" },
  });
  const client = appClient();
  const library = seededIndex({ projects: { medium: [LONG_NIGHT] } });
  await renderLibrary({ person: DANA, library, api, client });
  act(() => mounted?.unmount());
  await renderLibrary({ person: DANA, library, api, client });
  const problem = [...document.querySelectorAll("p")].find(
    (p) => p.textContent === LIBRARY_PROBLEM,
  );
  expect([
    answers.length,
    problem?.textContent,
    switcherButton().textContent,
    rowsOf(region("Projects")).map(rowWords),
  ]).toEqual([
    0,
    LIBRARY_PROBLEM,
    "Writers' room",
    [["The Long Night", "Film", "Priya, 14 min ago", "Synced"]],
  ]);
});

/** The side panel's tab, as the Library leaves it. */
function SideTabProbe(props: { seen: (tab: string | null) => void }) {
  props.seen(usePanel("side").tab);
  return null;
}

test("in demo mode the Tour opens the first time a person reaches the Library, and only then", async () => {
  const stores = createFaultyStoreSpace();
  const draw = () =>
    renderLibrary({
      person: YOU,
      library: seededIndex({}),
      demo: true,
      stores,
    });
  let tab: string | null = null;
  const probe = document.createElement("div");
  const probeRoot = createRoot(probe);
  /** The side panel's tab once the person's flags have been read and looked at. */
  const tabOnceRead = async (services: PersonServices) => {
    await act(async () => {
      await services.ready;
      await turn();
    });
    act(() => probeRoot.render(<SideTabProbe seen={(t) => (tab = t)} />));
    return tab;
  };
  const first = await tabOnceRead((await draw()).services);
  act(() => panelsActions.close("side"));
  act(() => mounted?.unmount());
  const second = await tabOnceRead((await draw()).services);
  // a Tour that lists no scenario is not opened on its own
  const opened = TOUR.scenarios.some(isShown) ? "tour" : null;
  expect([first, second]).toEqual([opened, null]);
  act(() => probeRoot.unmount());
});

/** The tag of what holds focus, and its name. */
const focused = (): string[] => {
  const element = document.activeElement;
  return [
    element?.tagName ?? "",
    element?.getAttribute("aria-label") ?? element?.textContent ?? "",
  ];
};

test("the Library drawn while the palette is open leaves focus in the palette's field, and takes it once the palette closes", async () => {
  const { router } = await renderLibrary({
    person: YOU,
    library: seededIndex({}),
    path: `/s/${NIGHT_DOC}`,
  });
  await act(async () => paletteActions.open("all"));
  expect(focused()).toEqual(["INPUT", "Commands"]);
  await act(async () => router.navigate({ to: "/" }));
  expect(focused()).toEqual(["INPUT", "Commands"]);
  // sent to the window, where the shell hears it: happy-dom has no input event, so React would read the removed field
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(focused()).toEqual(["H1", "Library"]);
});
