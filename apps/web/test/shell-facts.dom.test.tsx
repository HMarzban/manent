import { withDom } from "@manent/testkit/dom";
import { expect, mock, test } from "bun:test";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { FactsWriter } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

// the stand-in page hands the test the facts writer the bridge would hold
let facts: FactsWriter | null = null;
mock.module("../src/editor-host/stand-in-mount.ts", () => ({
  standInMount: {
    mount(ports: { facts: FactsWriter }) {
      facts = ports.facts;
      return () => {};
    },
  },
}));

test("Space before is checked while the caret block has its own, as the fact changes", async () => {
  const { AppShell } = await import("../src/shell/app-shell.tsx");
  const { EnvironmentProvider, ServicesProvider } =
    await import("../src/services/context.tsx");
  // the shell loads the stand-in's module apart before it mounts the page, and a load from disk can outlast the render's
  // act, so the test would publish before the page is there: loaded here first, it comes from the module registry
  await import("../src/shell/stand-in-script.ts");
  const clock = createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(environment.guard);
  const services = testServices({ userId: "leo", environment });
  const rootRoute = createRootRoute({
    component: () => (
      <ServicesProvider services={services}>
        <AppShell>
          <Outlet />
        </AppShell>
      </ServicesProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/__stand-in",
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/__stand-in"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <EnvironmentProvider environment={environment}>
        <RouterProvider router={router} />
      </EnvironmentProvider>,
    ),
  );
  const checked = () => services.commands.state("format.spaceBefore").checked;
  const seen = [checked()];
  for (const value of [true, null]) {
    act(() => facts?.publish({ blockSpaceBeforeSet: value }));
    act(() => clock.advance(16));
    seen.push(checked());
  }
  act(() => root.unmount());
  expect(seen).toEqual([false, true, false]);
});
