import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import {
  STORE_RETRY_MS,
  StoreError,
  createMemoryStore,
  soloLeader,
} from "@manent/sync-client";
import type { LocalStore } from "@manent/sync-client";
import { createMemoryNetwork } from "@manent/sync-client/testing";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { TimingProvider } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Navigation } from "../src/handlers/index.ts";
import type { Where } from "../src/platform.ts";
import { CloseBlocker } from "../src/router.tsx";
import { sendPath } from "../src/screens/send/form-ids.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { PersonServices } from "../src/services/ports.ts";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { CloseQuestion } from "../src/services/sync/close-question.tsx";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { chooseUrl } from "../src/session.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import { B1, action } from "./review.fixtures.ts";
import {
  MemoryStorage,
  V1,
  createClock,
  fixedRandom,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

const FIREFOX: Where = {
  platform: "mac",
  shell: "web",
  browser: "Firefox",
  system: "macOS",
};

/** `store`, refusing every change while `refusing.now` is true. */
function refusing(store: LocalStore, refusal: { now: boolean }): LocalStore {
  return new Proxy(store, {
    get(target, key) {
      if (key === "append")
        return (docId: string, entry: Parameters<LocalStore["append"]>[1]) =>
          refusal.now
            ? Promise.reject(new StoreError("quota"))
            : target.append(docId, entry);
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** You's services from `startAt`, on a device whose store refuses changes while `refusing.now`, over `router`. */
function youOn(options: {
  startAt: number;
  router: Navigation;
  where?: Where;
}) {
  const clock = createClock(options.startAt);
  const storage = new MemoryStorage();
  const refusal = { now: false };
  let started: Promise<PersonSync> | null = null;
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    storage,
    dom: createShellDom(document),
    ...(options.where === undefined ? {} : { where: options.where }),
    startSync(person, deviceId) {
      started = createPersonSync({
        person,
        baseUrl: "http://manent.test",
        deviceId,
        build: "test",
        versions: V1,
        minServer: V1,
        ports: {
          transport: createMemoryNetwork({ random: () => 0 }).transport(null),
          store: refusing(createMemoryStore(person.userId), refusal),
          leader: soloLeader(deviceId),
          clock: { now: clock.now, schedule: clock.schedule },
          random: fixedRandom(),
          frames: { request: (fn) => clock.schedule(fn, 16) },
        },
        memory: createDeviceMemory({ local: storage, session: null }),
        onlineEvents: null,
        visible: () => true,
        now: clock.now,
      });
      return started;
    },
  });
  const services = testServices({
    userId: "you",
    environment,
    router: options.router,
  });
  return {
    clock,
    environment,
    services,
    refusal,
    /** One change of the person's to the script. */
    async change(docId: string): Promise<void> {
      await until(() => started !== null);
      const sync = await started;
      const handle = await sync?.client.open(docId);
      if (handle === undefined) throw new RangeError("no sync started");
      scriptBody(handle.doc()).write((writer) =>
        writer.insertBlocks(null, [action(B1, "Rain.")]),
      );
    },
  };
}

const screen = (name: string) => () => <h1>{name}</h1>;

/** A router over the Library, a script, its Send screen and the chooser; the script's route asks before it is left. */
function appRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: screen("Library"),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId",
        component: () => (
          <>
            <h1>Script</h1>
            <CloseBlocker />
            <CloseQuestion />
          </>
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId/send/$form",
        component: screen("Send"),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/choose",
        component: screen("Choose who you are"),
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const navigation: Navigation = {
    navigate(href) {
      void router.navigate({ href });
    },
    here: () => ({
      routeId: router.state.matches.at(-1)?.routeId ?? null,
      href: router.state.location.href,
      search: router.state.location.search,
    }),
  };
  return { router, navigation };
}

async function mount(
  router: ReturnType<typeof appRouter>["router"],
  you: ReturnType<typeof youOn>,
): Promise<void> {
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <EnvironmentProvider environment={you.environment}>
        <ServicesProvider services={you.services}>
          {/* the shell gives every surface its timing */}
          <TimingProvider
            timing={{ now: you.clock.now, schedule: you.clock.schedule }}
          >
            <RouterProvider router={router} />
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );
}

/** Starts a navigation and never waits for it: a blocker may hold it for good. */
async function go(
  router: ReturnType<typeof appRouter>["router"],
  href: string,
): Promise<void> {
  await act(async () => {
    void router.navigate({ href });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const dialog = (): Element | null =>
  document.querySelector("[role='alertdialog']");

async function press(name: string): Promise<void> {
  const button = [...(dialog()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === name,
  );
  if (button === undefined) throw new RangeError(`no button ${name}`);
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const at = (router: ReturnType<typeof appRouter>["router"]): string =>
  router.state.location.pathname;

/** The question shown now: its title, body, focused button and buttons, or null. */
function question(): {
  title: string | null;
  body: string | null;
  focused: string | null;
  buttons: (string | null)[];
} | null {
  const shown = dialog();
  if (shown === null) return null;
  return {
    title: shown.querySelector("h2")?.textContent ?? null,
    body: shown.querySelector("p")?.textContent ?? null,
    focused: document.activeElement?.textContent ?? null,
    buttons: [...shown.querySelectorAll("button")].map((b) => b.textContent),
  };
}

test("leaving a script the device cannot save asks first, and the browser asks when the tab closes", async () => {
  const { router, navigation } = appRouter();
  const you = youOn({
    startAt: new Date(2026, 10, 17, 14, 9, 30).getTime(),
    router: navigation,
  });
  const { services } = you;
  const { docId } = await services.library.createProject("you", "film");
  await mount(router, you);
  await go(router, `/s/${docId}`);
  services.documents.open(docId);
  you.environment.shellState.set({
    ...INITIAL_SHELL_STATE,
    screen: "document",
    docId,
  });
  you.clock.advance(30_000);
  you.refusal.now = true;
  await you.change(docId);
  await act(() => until(() => services.closing.guard.failing() !== null));

  await go(router, "/");
  expect(question()).toEqual({
    title: "Export a copy before closing?",
    body: "Manent can't save on this device, so changes since 14:10 are only in this window.",
    focused: "Cancel",
    buttons: ["Cancel", "Close without exporting", "Export a copy"],
  });
  await press("Cancel");
  expect([at(router), question()]).toEqual([`/s/${docId}`, null]);

  // Export a copy goes to this script's own Send screen, which is never asked about
  await go(router, "/");
  await press("Export a copy");
  expect([at(router), question()]).toEqual([sendPath(docId, "export"), null]);

  await go(router, `/s/${docId}`);
  await go(router, chooseUrl(`/s/${docId}`));
  expect(question()?.title).toBe("Export a copy before closing?");
  await press("Close without exporting");
  expect([at(router), question()]).toEqual(["/choose", null]);

  await go(router, `/s/${docId}`);
  const closing = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);

  you.refusal.now = false;
  await act(async () => you.clock.advance(STORE_RETRY_MS));
  await act(() => until(() => services.closing.guard.failing() === null));
  await go(router, "/");
  const closingAgain = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(closingAgain);
  expect([at(router), question(), closingAgain.defaultPrevented]).toEqual([
    "/",
    null,
    false,
  ]);
  services.dispose();
});

/** The times the page asked the browser to keep its data, for You making two changes in `where`. */
async function persistenceAsked(where: Where | undefined): Promise<number> {
  let asked = 0;
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: {
      persisted: async () => false,
      persist: async () => {
        asked += 1;
        return true;
      },
    },
  });
  const { navigation } = appRouter();
  const you = youOn({ startAt: 0, router: navigation, where });
  const services: PersonServices = you.services;
  const { docId } = await services.library.createProject("you", "film");
  services.documents.open(docId);
  await you.change(docId);
  await you.change(docId);
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0));
  const message = services.messages.current();
  services.dispose();
  expect(message).toBeNull();
  return asked;
}

test("persistent storage is asked for once, quietly, and never in Firefox", async () => {
  expect({
    chrome: await persistenceAsked(undefined),
    firefox: await persistenceAsked(FIREFOX),
  }).toEqual({ chrome: 1, firefox: 0 });
});
