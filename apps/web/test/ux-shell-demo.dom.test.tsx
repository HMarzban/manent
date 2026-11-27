import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
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
import { DemoBar } from "../src/demo/demo-bar.tsx";
import { RouteNotFound } from "../src/router.tsx";
import { SidePosition } from "../src/shell/side-position.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { TEXT } from "../src/text.ts";
import { testEnvironment } from "./services.fixtures.ts";

withDom();
bindGuard(testEnvironment().guard);

let mounted: Root | null = null;
afterEach(() => {
  act(() => {
    mounted?.unmount();
    panelsActions.close("side");
    panelsActions.close("left");
  });
  mounted = null;
  document.body.replaceChildren();
});

test("RouteNotFound renders an empty hero card and navigates back to Library", async () => {
  const rootRoute = createRootRoute({ notFoundComponent: RouteNotFound });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Library home</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    defaultNotFoundComponent: RouteNotFound,
    history: createMemoryHistory({ initialEntries: ["/does-not-exist"] }),
  });
  await router.load();

  const host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted?.render(<RouterProvider router={router} />);
  });

  expect(host.querySelector("h2")?.textContent).toBe(TEXT.notFoundTitle);
  expect(host.textContent).toContain(TEXT.notFoundBody);
  const back = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === TEXT.backToLibrary,
  );
  expect(back).toBeDefined();
  await act(async () => {
    back?.click();
  });
  expect(router.state.location.pathname).toBe("/");
});

test("SidePosition uses rem-scaled width on desktop and overlays with dismissible scrim below 768px", async () => {
  bindGuard(testEnvironment().guard);
  panelsActions.open("side", "tour");
  const tabs = [
    {
      id: "tour" as const,
      useTab: () => ({ present: true, label: "Tour" }),
      Tab: () => <p>Tour body</p>,
    },
  ];

  const host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);

  Object.defineProperty(window, "innerWidth", {
    value: 1440,
    configurable: true,
  });
  await act(async () => {
    mounted?.render(<SidePosition docId={null} tabs={tabs} />);
  });
  const desktopPanel = host.querySelector<HTMLElement>(
    "[data-region='side_panel']",
  );
  expect(desktopPanel?.style.width).toBe("20rem");
  expect(desktopPanel?.style.maxWidth).toBe("100vw");
  expect(host.querySelector("[data-overlay]")).toBeNull();

  Object.defineProperty(window, "innerWidth", {
    value: 375,
    configurable: true,
  });
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
  const overlay = host.querySelector("[data-overlay]");
  expect(overlay).not.toBeNull();
  const scrim = overlay?.querySelector<HTMLElement>("[aria-hidden='true']");
  expect(scrim).not.toBeNull();
  await act(async () => {
    scrim?.click();
  });
  expect(host.querySelector("[data-region='side_panel']")).toBeNull();

  Object.defineProperty(window, "innerWidth", {
    value: 1024,
    configurable: true,
  });
});

test("SidePosition skips its own scrim when already wrapped by an outer overlay", async () => {
  panelsActions.open("side", "tour");
  const tabs = [
    {
      id: "tour" as const,
      useTab: () => ({ present: true, label: "Tour" }),
      Tab: () => <p>Tour body</p>,
    },
  ];
  Object.defineProperty(window, "innerWidth", {
    value: 375,
    configurable: true,
  });
  const host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted?.render(
      <div data-overlay="">
        <SidePosition docId={null} tabs={tabs} />
      </div>,
    );
  });
  expect(host.querySelectorAll("[data-overlay]").length).toBe(1);
  expect(host.querySelector(".bg-scrim")).toBeNull();
  Object.defineProperty(window, "innerWidth", {
    value: 1024,
    configurable: true,
  });
});

test("DemoBar stays single-row with h-demobar and hides person name below sm", async () => {
  await import("../src/demo/demo-bar-controls.tsx");
  const host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted?.render(
      <DemoBar
        person={{ token: "tok", userId: "dana", name: "Dana Reyes" }}
        onPersonClick={() => {}}
        control={null}
        resetting={false}
      />,
    );
  });
  const bar = host.querySelector<HTMLElement>("[data-surface='demo']");
  expect(bar?.className).toContain("h-demobar");
  expect(bar?.className).toContain("min-h-demobar");
  const personBtn = host.querySelector<HTMLButtonElement>(
    "button[aria-label='Person: Dana Reyes']",
  );
  expect(personBtn).not.toBeNull();
  const nameSpan = personBtn?.querySelector("span.hidden");
  expect(nameSpan?.textContent).toBe("Dana Reyes");
});
