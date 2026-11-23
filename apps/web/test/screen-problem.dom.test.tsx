import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createAppRouter, loadScreen } from "../src/router.tsx";
import { ScreenProblem } from "../src/shell/screen-problem.tsx";
import { createPersonStore } from "../src/state/person.store.ts";
import { fakeApi } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  sessionStorage.clear();
});

/** A frame holding one screen whose code fails to load with `cause`, drawn into a fresh container. */
async function renderFailingScreen(cause: Error): Promise<HTMLElement> {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <nav>Frame</nav>
        <Outlet />
      </>
    ),
  });
  const screenRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: lazyRouteComponent(
      loadScreen(() => Promise.reject(cause)),
      "Screen",
    ),
    errorComponent: ScreenProblem,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([screenRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  // React and the router report the error the route's boundary caught; the screen's own words are what these tests read
  const reported = spyOn(console, "error").mockImplementation(() => {});
  const warned = spyOn(console, "warn").mockImplementation(() => {});
  await act(async () => mounted?.render(<RouterProvider router={router} />));
  reported.mockRestore();
  warned.mockRestore();
  return container;
}

test("a screen whose code cannot load says so in its own area, the frame around it stays, and Reload reloads the tab", async () => {
  const reload = spyOn(window.location, "reload").mockImplementation(() => {});
  // a message the router does not read as a newer build
  const container = await renderFailingScreen(new TypeError("Load failed"));
  expect(container.querySelector("nav")?.textContent).toBe("Frame");
  expect(container.querySelector("p")?.textContent).toBe(
    "Couldn't load this screen. Your work is unaffected.",
  );
  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map((b) => b.textContent)).toEqual(["Reload"]);
  expect(reload).toHaveBeenCalledTimes(0);
  act(() => buttons[0]?.click());
  expect(reload).toHaveBeenCalledTimes(1);
  reload.mockRestore();
});

test("a screen's code missing after a newer build still reloads the tab once", async () => {
  const reload = spyOn(window.location, "reload").mockImplementation(() => {});
  await renderFailingScreen(new TypeError("Importing a module script failed."));
  expect(reload).toHaveBeenCalledTimes(1);
  reload.mockRestore();
});

test("every screen whose code loads on first visit has the same problem in its own area, whose code is loaded with the router", async () => {
  const router = createAppRouter({
    api: fakeApi(),
    fetch,
    usePerson: createPersonStore(null),
  });
  const screens = Object.values(router.routesById).filter(
    (route) => route.options.component !== undefined && !route.isRoot,
  );
  const problems = [
    ...new Set(screens.map((route) => route.options.errorComponent)),
  ];
  expect([screens.map((route) => route.id), problems.length]).toEqual([
    [
      "/",
      "/choose",
      "/s/$docId",
      "/s/$docId/send/$form",
      "/preferences/$pane",
      "/s/$docId/present",
      "/s/$docId/prompter",
      "/s/$docId/v/$versionId",
      "/s/$docId/changes/$a/$b",
    ],
    1,
  ]);
  const Problem = problems[0];
  if (typeof Problem !== "function")
    throw new TypeError("the screens have no problem component");
  // settles after the load the router began when it was made
  await import("../src/shell/screen-problem.tsx");
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  // drawn at once, with no Suspense around it: its code is already here
  act(() =>
    mounted?.render(
      <Problem error={new TypeError("Load failed")} reset={() => {}} />,
    ),
  );
  expect(container.textContent).toBe(
    "Couldn't load this screen. Your work is unaffected.Reload",
  );
});
