import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import {
  CommandsProvider,
  SettingsProvider,
  TimingProvider,
  createValue,
} from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { closeSignOutPrompt } from "../src/account/sign-out-store.ts";
import { createHandlers } from "../src/handlers/index.ts";
import type { HandlerDeps } from "../src/handlers/index.ts";
import { ChooseScreen } from "../src/screens/choose.tsx";
import { PersonMenu } from "../src/screens/library/person-menu.tsx";
import { AccountPane } from "../src/screens/preferences/account-pane.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { createPersonServices } from "../src/services/services.ts";
import {
  SESSION_KEY,
  chooseUrl,
  readPerson,
  safeNext,
  writePerson,
} from "../src/session.ts";
import type { TabPerson, TabStorage } from "../src/session.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  QUIET_DOM,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  closeSignOutPrompt();
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

function fakeTabStorage(): TabStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const SAM: TabPerson = {
  token: "secret-tok-123",
  userId: "sam",
  name: "Sam Okafor",
};

test("safeNext rejects external, protocol-relative, javascript and backslash redirects while preserving /join/$token", () => {
  expect(chooseUrl("/join/abc-123")).toBe("/choose?next=%2Fjoin%2Fabc-123");
  expect(safeNext("/join/abc-123")).toBe("/join/abc-123");
  expect(safeNext("/s/doc-1?at=b1")).toBe("/s/doc-1?at=b1");
  for (const unsafe of [
    null,
    "",
    "//evil.com",
    "//evil.com/join/abc",
    "https://evil.com",
    "http://evil.com/join/abc",
    "javascript:alert(1)",
    "/\\evil.com",
    "/join/abc\r\nSet-Cookie: x=1",
    "/\t/evil.com",
  ]) {
    expect(safeNext(unsafe)).toBe("/");
  }
});

test("sign out with zero waiting changes clears SESSION_KEY and person store and navigates to /choose?next=%2F", async () => {
  const storage = fakeTabStorage();
  writePerson(storage, SAM);
  const usePerson = createPersonStore(storage);
  const environment = testEnvironment();
  const route = createNavigation({
    routeId: "/",
    href: "/s/doc-1",
    search: {},
  });
  const services: PersonServices = {
    ...testServices({ userId: SAM.userId, environment }),
    waitingDocuments: async () => [],
  };
  const deps: HandlerDeps = {
    services,
    api: fakeApi(),
    usePerson,
    router: route.navigation,
    dom: QUIET_DOM,
    shellState: environment.shellState.get,
    frame: environment.frame,
    visitUndo: environment.visitUndo,
    desktop: null,
    nodeCloud: null,
    language: environment.language,
    now: environment.now,
    storage: environment.storage,
  };

  expect(usePerson.getState().person).toEqual(SAM);
  expect(readPerson(storage)).toEqual(SAM);

  createHandlers(deps)["app.signOut"]();
  await Promise.resolve();
  await Promise.resolve();

  expect(usePerson.getState().person).toBeNull();
  expect(storage.getItem(SESSION_KEY)).toBeNull();
  expect(readPerson(storage)).toBeNull();
  expect(route.visited).toEqual(["/choose?next=%2F"]);
});

test("sign out with waiting changes opens guard dialog; Cancel keeps session and Sign out clears it", async () => {
  const storage = fakeTabStorage();
  writePerson(storage, SAM);
  const usePerson = createPersonStore(storage);
  const environment = testEnvironment();
  const route = createNavigation({ routeId: "/", href: "/", search: {} });
  const base = testServices({ userId: SAM.userId, environment });
  const services: PersonServices = {
    ...base,
    waitingDocuments: async () => [
      { docId: "script-a", waiting: 2 },
      { docId: "script-b", waiting: 1 },
    ],
    library: {
      ...base.library,
      docKindOf: () => createValue("script"),
      documentTitle: (docId: string) =>
        createValue(docId === "script-a" ? "Slack Water" : "Salt"),
    },
  };

  const handlers = createHandlers({
    services,
    api: fakeApi(),
    usePerson,
    router: route.navigation,
    dom: QUIET_DOM,
    shellState: environment.shellState.get,
    frame: environment.frame,
    visitUndo: environment.visitUndo,
    desktop: null,
    nodeCloud: null,
    language: environment.language,
    now: environment.now,
    storage: environment.storage,
  });

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const timing = { now: environment.now, schedule: environment.schedule };
  act(() => {
    root!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <TimingProvider timing={timing}>
            <SettingsProvider store={services.settings}>
              <CommandsProvider
                service={services.commands}
                resolved={services.resolved}
                platform="mac"
              >
                <PersonMenu name={SAM.name} />
              </CommandsProvider>
            </SettingsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });

  // Invoke app.signOut with 3 waiting changes
  await act(async () => {
    handlers["app.signOut"]();
    for (
      let i = 0;
      i < 50 && document.body.querySelector("[role='alertdialog']") === null;
      i++
    )
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  const dialog = document.body.querySelector("[role='alertdialog']");
  expect(dialog).not.toBeNull();
  expect(dialog!.textContent).toContain("Sign out with 3 changes waiting?");
  expect(dialog!.textContent).toContain(
    "They stay on this device and sync when you sign in here again.",
  );
  expect(dialog!.textContent).toContain("Export a copy");
  const confirmBtn = dialog!.querySelector<HTMLButtonElement>(
    '[data-tour="workspace:sign_out"]',
  );
  expect(confirmBtn?.textContent).toBe("Sign out");

  // Cancel keeps session intact
  const cancelBtn = [...dialog!.querySelectorAll("button")].find(
    (b) => b.textContent === "Cancel",
  )!;
  act(() => cancelBtn.click());
  expect(document.body.querySelector("[role='alertdialog']")).toBeNull();
  expect(usePerson.getState().person).toEqual(SAM);
  expect(storage.getItem(SESSION_KEY)).not.toBeNull();
  expect(route.visited).toEqual([]);

  // Open again and click Sign out -> clears session and navigates
  await act(async () => {
    handlers["app.signOut"]();
    for (
      let i = 0;
      i < 50 && document.body.querySelector("[role='alertdialog']") === null;
      i++
    )
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  const confirmBtn2 = document.body.querySelector<HTMLButtonElement>(
    '[data-tour="workspace:sign_out"]',
  )!;
  act(() => confirmBtn2.click());
  expect(usePerson.getState().person).toBeNull();
  expect(storage.getItem(SESSION_KEY)).toBeNull();
  expect(route.visited).toEqual(["/choose?next=%2F"]);
});

test("AccountPane reflects privateIndexSynced and shows Sign out when signed in", () => {
  const storage = fakeTabStorage();
  writePerson(storage, SAM);
  const usePerson = createPersonStore(storage);
  const environment = testEnvironment();
  const synced = createValue(false);
  const base = createPersonServices({
    ...environment,
    person: SAM,
    demo: createValue(true),
    api: fakeApi(),
    usePerson,
    router: createNavigation({ routeId: "/", href: "/", search: {} })
      .navigation,
  });
  const services: PersonServices = {
    ...base,
    privateIndexSynced: () => synced,
  };
  // Ensure app.signOut is registered in COMMANDS and visible when signedIn
  const signOutCmd = COMMANDS.find((c) => c.id === "app.signOut");
  expect(signOutCmd?.label).toBe("Sign out");

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const timing = { now: environment.now, schedule: environment.schedule };
  act(() => {
    root!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <TimingProvider timing={timing}>
            <SettingsProvider store={services.settings}>
              <CommandsProvider
                service={services.commands}
                resolved={services.resolved}
                platform="mac"
              >
                <AccountPane />
              </CommandsProvider>
            </SettingsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });

  expect(host.textContent).toContain("Saved on this device · Waiting to sync");
  expect(host.textContent).toContain("Sign out");

  act(() => synced.set(true));
  expect(host.textContent).toContain(
    "Saved on this device · Synced to your account",
  );
  base.dispose();
});

test("ChooseScreen unfolds AI pledge in place and still routes to /join/$token after choosing a person", async () => {
  const environment = testEnvironment();
  const chosen: TabPerson[] = [];
  const api = fakeApi({
    choices: async () => [
      { userId: "sam", name: "Sam Okafor", title: "Writer", registered: true },
    ],
    signIn: async () => ({ ok: true, person: SAM }),
  });

  const rootRoute = createRootRoute();
  const chooseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/choose",
    component: () => (
      <ChooseScreen
        api={api}
        person={null}
        setPerson={(p) => chosen.push(p)}
        next="/join/share-token-42"
      />
    ),
  });
  const joinRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/join/$token",
    component: () => <div data-joined="true">Joined</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([chooseRoute, joinRoute]),
    history: createMemoryHistory({
      initialEntries: ["/choose?next=%2Fjoin%2Fshare-token-42"],
    }),
  });
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <EnvironmentProvider environment={environment}>
        <QueryClientProvider client={queries}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </EnvironmentProvider>,
    );
    await router.load();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // AI pledge is folded initially and unfolds in place
  expect(host.textContent).toContain(
    "Manent has no features that write for you, and your scripts are never used to train AI.",
  );
  const pledgeBtn = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Read the AI pledge",
  )!;
  expect(pledgeBtn.getAttribute("aria-expanded")).toBe("false");
  expect(host.textContent).not.toContain("generates no scenes");

  act(() => pledgeBtn.click());
  expect(pledgeBtn.getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).toContain("generates no scenes");

  // Choosing Sam preserves /join/$token navigation
  const samCard = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Sam Okafor"),
  )!;
  const navSpy = spyOn(router, "navigate");
  await act(async () => {
    samCard.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(chosen).toEqual([SAM]);
  expect(navSpy).toHaveBeenCalledWith({ href: "/join/share-token-42" });
  navSpy.mockRestore();
});
