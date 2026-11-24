import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { entryKey } from "@manent/settings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
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
import { RootLayout } from "../src/root-layout.tsx";
import { EnvironmentProvider, useServices } from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { ShellRegion, createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import {
  paletteActions,
  selectors as paletteSelectors,
} from "../src/state/palette.store.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import type { PersonStore } from "../src/state/person.store.ts";
import {
  MemoryStorage,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const LEO = { token: null, userId: "leo", name: "Leo Marsh" };
const DANA = { token: null, userId: "dana", name: "Dana Reyes" };

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.documentElement.removeAttribute("data-theme");
});

/** Every PersonServices the Library screen was drawn with, in order. */
const seen: PersonServices[] = [];

function LibraryProbe() {
  seen.push(useServices());
  return <h1 tabIndex={-1}>Library</h1>;
}

async function renderApp(options: {
  path: string;
  usePerson: PersonStore;
  storage?: Storage;
}): Promise<{ router: AnyRouter; container: HTMLElement }> {
  const environment = testEnvironment({
    dom: createShellDom(document),
    storage: options.storage ?? new MemoryStorage(),
  });
  bindGuard(environment.guard);
  const api = fakeApi();
  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout api={api} fetch={fetch} usePerson={options.usePerson} />
    ),
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: LibraryProbe,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/s/$docId",
      component: () => (
        <ShellRegion region="title_bar">
          <button type="button">Title</button>
        </ShellRegion>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/preferences/$pane",
      component: () => <button type="button">Search</button>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/r/$token",
      component: () => <h1 tabIndex={-1}>Draft</h1>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [options.path] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  const client = new QueryClient();
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={client}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  return { router, container };
}

const pressEscape = (target: Element): void => {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
};

const pressMod = (key: string, mod: "metaKey" | "ctrlKey"): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key,
    [mod]: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
};

const button = (container: HTMLElement, name: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};

test("the editor host is mounted once across screens and covered, never unmounted", async () => {
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  const { router, container } = await renderApp({ path: "/", usePerson });
  const host = container.querySelector("[data-editor-host]");
  expect(host?.hasAttribute("inert")).toBe(true);
  await act(() =>
    router.navigate({ to: "/s/$docId", params: { docId: DOC_ID } }),
  );
  expect(container.querySelector("[data-editor-host]")).toBe(host);
  expect(host?.hasAttribute("inert")).toBe(false);
  expect(host?.querySelector("[data-placeholder]")).not.toBeNull();
  await act(() => router.navigate({ href: "/preferences/writing" }));
  expect(container.querySelector("[data-editor-host]")).toBe(host);
  expect(host?.hasAttribute("inert")).toBe(true);
  expect(host?.childElementCount).toBe(0);
});

test("Escape returns focus to the page from the frame and never leaves a screen", async () => {
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  const { router, container } = await renderApp({
    path: `/s/${DOC_ID}`,
    usePerson,
  });
  const title = button(container, "Title");
  act(() => title.focus());
  pressEscape(title);
  expect(
    document.activeElement
      ?.closest("[data-region]")
      ?.getAttribute("data-region"),
  ).toBe("page");
  await act(() => router.navigate({ href: "/preferences/writing" }));
  const search = button(container, "Search");
  act(() => search.focus());
  pressEscape(search);
  expect(document.activeElement).toBe(search);
});

/** A person's map holding one Theme entry, set on this device. */
const themeEntry = (value: string): string =>
  JSON.stringify({
    [entryKey("appearance.theme", "this-device")]: {
      v: value,
      at: 1,
      on: "Chrome on macOS",
      unset: false,
    },
  });

const theme = (): string | null =>
  document.documentElement.getAttribute("data-theme");

test("switching person rebuilds the services and applies the new person's theme once it is read from the device", async () => {
  const storage = new MemoryStorage();
  storage.setItem("manent.device.id", "this-device");
  storage.setItem("manent.prefs.leo", themeEntry("dark"));
  storage.setItem("manent.prefs.dana", themeEntry("light"));
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  seen.length = 0;
  await renderApp({ path: "/", usePerson, storage });
  await act(() => until(() => theme() === "dark"));
  const before = seen.at(-1);
  act(() => usePerson.getState().setPerson(DANA));
  await act(() => until(() => theme() === "light"));
  expect(seen.at(-1)?.userId).toBe("dana");
  expect(seen.at(-1)).not.toBe(before);
  expect(before?.userId).toBe("leo");
});

test("a side panel tab drawn after its command gives focus to its first control once drawn, unless focus moved on", async () => {
  const dom = createShellDom(document);
  const panel = document.createElement("div");
  panel.dataset.region = "side_panel";
  const tab = document.createElement("div");
  tab.setAttribute("role", "tabpanel");
  const elsewhere = document.createElement("button");
  panel.append(tab);
  document.body.append(panel, elsewhere);
  const first = document.createElement("button");
  dom.focusSidePanel();
  tab.append(first);
  // the observer answers in a microtask
  await Promise.resolve();
  const focusedFirst = document.activeElement === first;
  first.remove();
  dom.focusSidePanel();
  elsewhere.focus();
  tab.append(document.createElement("button"));
  await Promise.resolve();
  const stayed = document.activeElement === elsewhere;
  panel.remove();
  elsewhere.remove();
  expect([focusedFirst, stayed]).toEqual([true, true]);
});

test("the reader route keeps the editor host covered without mounting the palette, global keys, or file drop", async () => {
  paletteActions.close();
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  const { router, container } = await renderApp({
    path: "/r/tok-1",
    usePerson,
  });
  const host = container.querySelector("[data-editor-host]");
  expect(host?.hasAttribute("inert")).toBe(true);
  expect(pressMod("k", "metaKey").defaultPrevented).toBe(false);
  expect(pressMod("k", "ctrlKey").defaultPrevented).toBe(false);
  expect(pressMod(",", "metaKey").defaultPrevented).toBe(false);
  expect(pressMod(",", "ctrlKey").defaultPrevented).toBe(false);
  expect(paletteSelectors.isOpen()).toBe(false);
  expect(router.state.location.pathname).toBe("/r/tok-1");
  const grid = container.querySelector<HTMLElement>(".grid");
  const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
  act(() => {
    grid?.dispatchEvent(dragOver);
  });
  expect(dragOver.defaultPrevented).toBe(false);
});
