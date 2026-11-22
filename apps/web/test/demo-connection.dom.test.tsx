import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  createMemoryNetwork,
  createMemoryStoreSpace,
} from "@manent/sync-client/testing";
import { soloLeader } from "@manent/sync-client";
import type { DemoResponse } from "@manent/sync-protocol";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
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
import { RootLayout } from "../src/root-layout.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  MemoryStorage,
  V1,
  createClock,
  fakeApi,
  fixedRandom,
  testEnvironment,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();
// Query tells its observers at once, so a test sees an answer in the act that delivered it
notifyManager.setScheduler((notify) => notify());

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

const DEMO: DemoResponse = { demo: true, seedId: null, control: null };

/** A tab of Dana's in demo mode, whose sync keeps its Connection in the tab's `session` storage. */
async function tab(session: MemoryStorage): Promise<HTMLElement> {
  const clock = createClock();
  const local = new MemoryStorage();
  const stores = createMemoryStoreSpace();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    storage: local,
    dom: createShellDom(document),
    startSync: (person, deviceId) =>
      createPersonSync({
        person,
        baseUrl: "http://manent.test",
        deviceId,
        build: "test",
        versions: V1,
        minServer: V1,
        ports: {
          transport: createMemoryNetwork({ random: () => 0 }).transport(
            person.userId,
          ),
          store: stores.store(person.userId),
          leader: soloLeader(deviceId),
          clock: { now: clock.now, schedule: clock.schedule },
          random: fixedRandom(),
          frames: { request: (fn) => clock.schedule(fn, 16) },
        },
        memory: createDeviceMemory({ local, session }),
        onlineEvents: null,
        visible: () => true,
        now: clock.now,
      }),
  });
  bindGuard(environment.guard);
  const usePerson = createPersonStore(null);
  usePerson
    .getState()
    .setPerson({ token: "token-dana", userId: "dana", name: "Dana Reyes" });
  const api = fakeApi({ demo: async () => DEMO });
  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout api={api} fetch={fetch} usePerson={usePerson} />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const client = new QueryClient();
  client.setQueryData(["demo"], DEMO);
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    await Promise.all([
      import("../src/demo/connection.tsx"),
      import("../src/demo/demo-bar-controls.tsx"),
      import("../src/shell/shell-palette.tsx"),
    ]);
    mounted?.render(
      <QueryClientProvider client={client}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    );
  });
  await act(() =>
    until(() => container.querySelector("[role='group']") !== null),
  );
  return container;
}

/** The Connection's name, and each of its choices with whether it is the one pressed. */
function connectionOf(container: ParentNode) {
  const group = container.querySelector("[role='group']");
  return {
    name: group?.getAttribute("aria-label") ?? null,
    choices: [...(group?.querySelectorAll("button") ?? [])].map((choice) => [
      choice.textContent,
      choice.getAttribute("aria-pressed"),
    ]),
  };
}

async function choose(container: ParentNode, name: string): Promise<void> {
  const choice = [...container.querySelectorAll("[role='group'] button")].find(
    (b) => b.textContent === name,
  );
  if (!(choice instanceof HTMLElement)) throw new RangeError(`no ${name}`);
  await act(async () => choice.click());
}

test("the demo bar's Connection is one choice of Online, Offline and Slow, kept per tab", async () => {
  const session = new MemoryStorage();
  const first = await tab(session);
  const before = connectionOf(first);
  await choose(first, "Offline");
  const chosen = connectionOf(first);
  const kept = session.getItem("manent.demo.connection");
  act(() => mounted?.unmount());
  document.body.replaceChildren();

  // a reload of the same tab, and another tab
  const reloaded = connectionOf(await tab(session));
  act(() => mounted?.unmount());
  document.body.replaceChildren();
  const other = connectionOf(await tab(new MemoryStorage()));
  expect({ before, chosen, kept, reloaded, other }).toEqual({
    before: {
      name: "Connection",
      choices: [
        ["Online", "true"],
        ["Offline", "false"],
        ["Slow", "false"],
      ],
    },
    chosen: {
      name: "Connection",
      choices: [
        ["Online", "false"],
        ["Offline", "true"],
        ["Slow", "false"],
      ],
    },
    kept: "offline",
    reloaded: {
      name: "Connection",
      choices: [
        ["Online", "false"],
        ["Offline", "true"],
        ["Slow", "false"],
      ],
    },
    other: {
      name: "Connection",
      choices: [
        ["Online", "true"],
        ["Offline", "false"],
        ["Slow", "false"],
      ],
    },
  });
});
