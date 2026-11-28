import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { SignInChoice } from "@manent/sync-protocol";
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
import { PreShellControls } from "../src/demo/server-status-control.tsx";
import { ChooseScreen } from "../src/screens/choose.tsx";
import {
  EnvironmentProvider,
  usePersonServices,
} from "../src/services/context.tsx";
import type { TabPerson } from "../src/session.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { fakeHost } from "./desktop.fixtures.ts";
import {
  createNavigation,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
});

const YOU: SignInChoice = {
  userId: "you",
  name: "You",
  title: "Your own desk",
  registered: false,
};

/** The chooser in the desktop app or on the web, listing You; what it signed in and the person it chose. */
async function chooseYou(shell: "web" | "desktop"): Promise<{
  signedIn: string[];
  chosen: TabPerson[];
}> {
  const signedIn: string[] = [];
  const chosen: TabPerson[] = [];
  const api = fakeApi({
    choices: async () => [YOU],
    async signIn(userId) {
      signedIn.push(userId);
      return {
        ok: true,
        person: { token: "node-token", userId, name: "You" },
      };
    },
  });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/choose",
        component: () => (
          <ChooseScreen
            api={api}
            person={null}
            setPerson={(person) => chosen.push(person)}
            next="/"
          />
        ),
      }),
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/choose"] }),
  });
  const environment = testEnvironment({
    where: { platform: "mac", shell, browser: "Chrome", system: "macOS" },
    desktop: shell === "desktop" ? fakeHost() : null,
  });
  await router.load();
  act(() => mounted?.unmount());
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </EnvironmentProvider>,
    ),
  );
  const row = (): HTMLButtonElement | undefined =>
    [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("You"),
    );
  await act(() => until(() => row() !== undefined));
  await act(async () => {
    row()?.click();
    await until(() => chosen.length > 0);
  });
  return { signedIn, chosen };
}

test("in the desktop app choosing You signs in at the node, which keeps You's work", async () => {
  expect([await chooseYou("desktop"), await chooseYou("web")]).toEqual([
    {
      signedIn: ["you"],
      chosen: [{ token: "node-token", userId: "you", name: "You" }],
    },
    { signedIn: [], chosen: [{ token: null, userId: "you", name: "You" }] },
  ]);
});

test("the window knows whose services it draws, and that it draws nobody once the person is gone", async () => {
  const environment = testEnvironment({ desktop: fakeHost() });
  const api = fakeApi();
  const usePerson = createPersonStore(null);
  const { navigation } = createNavigation({
    routeId: "/",
    href: "/",
    search: {},
  });
  function Drawn(props: { person: TabPerson | null }): null {
    usePersonServices({
      person: props.person,
      demo: false,
      api,
      usePerson,
      router: navigation,
    });
    return null;
  }
  const draw = (person: TabPerson | null) =>
    act(async () =>
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <Drawn person={person} />
        </EnvironmentProvider>,
      ),
    );
  mounted = createRoot(document.createElement("div"));
  await draw({ token: "node-token", userId: "sam", name: "Sam" });
  const drawn = environment.personServices.get()?.userId ?? null;
  await draw(null);
  expect([drawn, environment.personServices.get()]).toEqual(["sam", null]);
});

async function mountChoose(shell: "web" | "desktop"): Promise<{
  container: HTMLDivElement;
  host: ReturnType<typeof fakeHost> | null;
}> {
  const host = shell === "desktop" ? fakeHost() : null;
  const api = fakeApi({ choices: async () => [YOU] });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/choose",
        component: () => (
          <ChooseScreen api={api} person={null} setPerson={() => {}} next="/" />
        ),
      }),
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/choose"] }),
  });
  const environment = testEnvironment({
    where: { platform: "mac", shell, browser: "Chrome", system: "macOS" },
    desktop: host,
  });
  await router.load();
  act(() => mounted?.unmount());
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </EnvironmentProvider>,
    ),
  );
  await act(() =>
    until(() => container.querySelectorAll("button.mn-choose-card").length > 0),
  );
  return { container, host };
}

test("in the desktop app Choose uses device copy, renders two balanced footer cards and opens the data folder", async () => {
  const { container, host } = await mountChoose("desktop");
  const text = container.textContent ?? "";

  expect(text.toLowerCase()).not.toContain("browser tab");
  expect(text.toLowerCase()).not.toContain("second tab");
  expect(text.toLowerCase()).not.toContain("open tabs");
  expect(text).toContain(
    "Pick anyone. You can switch at any time, and your work stays saved on this device.",
  );
  expect(text).toContain(
    "Every change saves on this device first and syncs when the server is online.",
  );
  expect(text).toContain(
    "Once inside, open Tour in the side panel for ways to try Manent — or open Manent in a browser to see live cursors side by side.",
  );

  const nav = container.querySelector("nav");
  expect(nav).not.toBeNull();
  expect(nav?.className).toContain("sm:grid-cols-2");
  expect(nav?.children.length).toBe(2);
  expect(nav?.textContent).toContain("This device");
  expect(nav?.textContent).toContain(
    "Saved on this device · syncs when online",
  );
  expect(nav?.textContent).toContain("GitHub");

  const openFolder = [...(nav?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent?.includes("Open folder"),
  );
  expect(openFolder).toBeDefined();
  expect(openFolder?.getAttribute("type")).toBe("button");
  expect(openFolder?.closest("a")).toBeNull();

  act(() => {
    openFolder?.click();
  });
  expect(host?.sent).toEqual([{ v: 1, t: "show_folder" }]);
});

test("on the web Choose keeps browser-tab copy and the three-column footer unchanged", async () => {
  const { container } = await mountChoose("web");
  const text = container.textContent ?? "";

  expect(text).toContain(
    "Pick anyone. You can switch at any time, and each browser tab can be a different person.",
  );
  expect(text).toContain(
    "Every change saves on this device first and syncs across open tabs.",
  );
  expect(text).toContain(
    "Once inside, open Tour in the side panel for ways to try Manent — or open a second tab as another person to see live cursors.",
  );

  const nav = container.querySelector("nav");
  expect(nav).not.toBeNull();
  expect(nav?.className).toContain("sm:grid-cols-3");
  expect(nav?.children.length).toBe(3);
  expect(nav?.textContent).toContain("Get desktop app");
  expect(nav?.textContent).toContain("GitHub");
  expect(nav?.textContent).not.toContain("Open folder");
});

function mountPreShellBar(shell: "web" | "desktop"): string {
  const environment = testEnvironment({
    where: { platform: "mac", shell, browser: "Chrome", system: "macOS" },
    desktop: shell === "desktop" ? fakeHost() : null,
  });
  act(() => mounted?.unmount());
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  act(() => {
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <PreShellControls
          person={null}
          onPersonClick={() => {}}
          control={null}
          resetting={false}
        />
      </EnvironmentProvider>,
    );
  });
  return container.textContent ?? "";
}

test("pre-shell demo bar hint adapts for desktop without browser-tab wording while keeping web copy", () => {
  const desktopText = mountPreShellBar("desktop");
  expect(desktopText).toBe(
    "Pick a person to start — works offline on this device and syncs when back online.",
  );
  expect(desktopText.toLowerCase()).not.toContain("second tab");

  const webText = mountPreShellBar("web");
  expect(webText).toBe(
    "Pick a person to start — open a second tab at any time to see changes merge live.",
  );
});
