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
