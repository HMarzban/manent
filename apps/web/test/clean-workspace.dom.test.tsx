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
import type { Api, SignInResult } from "../src/api.ts";
import {
  isCleanWorkspace,
  resetCleanWorkspaceCache,
  setCleanWorkspace,
} from "../src/demo/demo-mode.ts";
import { TOUR_ACTIVE_KEY } from "../src/demo/tour-progress.ts";
import { ChooseScreen } from "../src/screens/choose.tsx";
import {
  DemoRestoreCard,
  DemoRestoreGroup,
} from "../src/screens/preferences/demo-restore-group.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { followSeed } from "../src/services/sync/device-trust.ts";
import { CLEAN_WORKSPACE_KEY } from "../src/session.ts";
import type { TabPerson } from "../src/session.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { tourActions } from "../src/state/tour.store.ts";
import { pageTitle } from "../src/text.ts";
import { fakeHost } from "./desktop.fixtures.ts";
import { fakeApi, testEnvironment } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCleanWorkspaceCache();
  tourActions.suppress();
  panelsActions.close("side");
  document.body.replaceChildren();
});

const ROSTER: readonly SignInChoice[] = [
  {
    userId: "dana",
    name: "Dana Reyes",
    title: "Showrunner, workspace owner",
    registered: true,
  },
  {
    userId: "you",
    name: "You",
    title: "A new person with an empty workspace",
    registered: false,
  },
];

async function renderChoose(options: {
  api: Api;
  shell?: "web" | "desktop";
  person?: TabPerson | null;
  next?: string;
  compact?: boolean;
  onPerson?: (person: TabPerson) => void;
  demoModeCalls?: boolean[];
  connectionCalls?: Array<{ mode: string; delayMs: number }>;
}): Promise<{
  container: HTMLDivElement;
  pathname: () => string;
}> {
  const shell = options.shell ?? "web";
  const host =
    shell === "desktop"
      ? fakeHost({
          setDemoMode: async (dismissed) => {
            options.demoModeCalls?.push(dismissed);
          },
          setConnection: async (mode, delayMs) => {
            options.connectionCalls?.push({ mode, delayMs });
          },
        })
      : null;
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/choose",
        component: () => (
          <ChooseScreen
            api={options.api}
            person={options.person ?? null}
            setPerson={(p) => options.onPerson?.(p)}
            next={options.next ?? "/"}
            compact={options.compact}
          />
        ),
      }),
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
      createRoute({ getParentRoute: () => rootRoute, path: "/s/$docId" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/choose"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  const environment = testEnvironment({
    where: { platform: "mac", shell, browser: "Chrome", system: "macOS" },
    desktop: host,
  });
  await act(async () => {
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          <RouterProvider router={router} />
        </QueryClientProvider>
      </EnvironmentProvider>,
    );
  });
  await act(() =>
    until(() => container.querySelectorAll("button.mn-choose-card").length > 0),
  );
  return { container, pathname: () => router.state.location.pathname };
}

test("CleanWorkspaceCta renders below PeopleGrid, updates PersonaSpotlight on focus, and hides in compact mode", async () => {
  const { container } = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
  });
  const cta = container.querySelector<HTMLButtonElement>(
    "button.mn-choose-clean-cta",
  );
  expect(cta).not.toBeNull();
  expect(cta?.textContent).toContain("Start in a clean workspace");
  expect(cta?.textContent).toContain(
    "Removes the Demo bar and Tour — an empty workspace kept in this browser.",
  );

  // Ordering: Dana card comes before the Clean Workspace CTA
  const allButtons = [...container.querySelectorAll("button")];
  const danaIndex = allButtons.findIndex((b) =>
    b.textContent?.includes("Dana Reyes"),
  );
  const ctaIndex = allButtons.indexOf(cta!);
  expect(danaIndex).toBe(0);
  expect(ctaIndex).toBeGreaterThan(danaIndex);

  // Focusing the CTA previews the clean blank-page folio in PersonaSpotlight
  const aside = container.querySelector("aside");
  act(() => {
    cta!.focus();
  });
  expect(aside?.textContent).toContain("Your desk · Clean workspace");
  expect(aside?.textContent).toContain("No Demo bar");
  expect(aside?.textContent).toContain("No Tour");
  expect(
    aside?.querySelector('.mn-choose-sheet[data-blank="true"]'),
  ).not.toBeNull();

  // Compact mode omits the CTA
  const compact = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
    compact: true,
  });
  expect(
    compact.container.querySelector("button.mn-choose-clean-cta"),
  ).toBeNull();
});

test("clicking CleanWorkspaceCta clears Tour/demo state, ignores stale demo next path, and enters You cleanly", async () => {
  window.localStorage.setItem("manent.seed", "seed-old");
  window.sessionStorage.setItem("manent.demo.connection", "offline");
  window.sessionStorage.setItem(
    TOUR_ACTIVE_KEY,
    JSON.stringify({ scenarioId: "write-true-pages", step: 0 }),
  );
  tourActions.open("write-true-pages", 0);
  panelsActions.open("side", "tour");

  const chosen: TabPerson[] = [];
  const { container, pathname } = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
    person: { token: "dana-tok", userId: "dana", name: "Dana Reyes" },
    next: "/s/dana-script-1",
    onPerson: (person) => chosen.push(person),
  });

  const cta = container.querySelector<HTMLButtonElement>(
    "button.mn-choose-clean-cta",
  )!;
  await act(async () => {
    cta.click();
    await until(() => chosen.length > 0);
  });

  expect(chosen).toEqual([{ token: null, userId: "you", name: "You" }]);
  expect(isCleanWorkspace()).toBe(true);
  expect(window.localStorage.getItem(CLEAN_WORKSPACE_KEY)).toBe("1");
  expect(window.localStorage.getItem("manent.seed")).toBeNull();
  expect(window.sessionStorage.getItem("manent.demo.connection")).toBeNull();
  expect(window.sessionStorage.getItem(TOUR_ACTIVE_KEY)).toBeNull();
  expect(panelsActions.get().side.tab).toBeNull();
  expect(pathname()).toBe("/");
  expect(pageTitle("Library", "You")).toBe("Library — You — Manent");
});

test("on desktop CleanWorkspaceCta uses device copy, dims cards while signing in, and persists demo-mode on the node", async () => {
  const pending = Promise.withResolvers<SignInResult>();
  const signedIn: string[] = [];
  const demoModeCalls: boolean[] = [];
  const connectionCalls: Array<{ mode: string; delayMs: number }> = [];
  const chosen: TabPerson[] = [];

  const { container } = await renderChoose({
    shell: "desktop",
    api: fakeApi({
      choices: async () => ROSTER,
      signIn(userId) {
        signedIn.push(userId);
        return pending.promise;
      },
    }),
    onPerson: (p) => chosen.push(p),
    demoModeCalls,
    connectionCalls,
  });

  const cta = container.querySelector<HTMLButtonElement>(
    "button.mn-choose-clean-cta",
  )!;
  expect(cta.textContent).toContain(
    "Removes the Demo bar and Tour — an empty workspace kept on this device.",
  );

  await act(async () => {
    cta.click();
    await until(() => cta.getAttribute("data-pending") === "true");
  });

  expect(cta.getAttribute("aria-busy")).toBe("true");
  const cards = [
    ...container.querySelectorAll<HTMLButtonElement>("button.mn-choose-card"),
  ];
  expect(cards.every((c) => c.getAttribute("data-dimmed") === "true")).toBe(
    true,
  );

  await act(async () => {
    pending.resolve({
      ok: true,
      person: { token: "node-you", userId: "you", name: "You" },
    });
    await until(() => chosen.length > 0);
  });

  expect(signedIn).toEqual(["you"]);
  expect(demoModeCalls).toEqual([true]);
  expect(connectionCalls).toEqual([{ mode: "online", delayMs: 0 }]);
});

test("followSeed skips demo seed checks and never clears local data while clean workspace is active", async () => {
  let demoCalls = 0;
  let beforeClearCalls = 0;
  window.localStorage.setItem("manent.seed", "seed-old");
  setCleanWorkspace(true);

  await followSeed(
    {
      api: fakeApi({
        demo: async () => {
          demoCalls += 1;
          return { demo: true, seedId: "seed-new", control: null };
        },
      }),
      storage: window.localStorage,
    },
    async () => {
      beforeClearCalls += 1;
    },
  );

  expect(demoCalls).toBe(0);
  expect(beforeClearCalls).toBe(0);
});

test("Preferences DemoRestoreGroup and DemoRestoreCard restore Demo and Tour cleanly", async () => {
  const demoModeCalls: boolean[] = [];
  const host = fakeHost({
    setDemoMode: async (dismissed) => {
      demoModeCalls.push(dismissed);
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);

  // Hidden when not in clean workspace mode
  await act(async () => {
    mounted?.render(
      <EnvironmentProvider environment={testEnvironment({ desktop: host })}>
        <DemoRestoreGroup />
        <DemoRestoreCard />
      </EnvironmentProvider>,
    );
  });
  expect(container.textContent).toBe("");

  // Visible when clean workspace mode is on, and clicking turns Demo and Tour back on
  act(() => setCleanWorkspace(true));
  expect(container.textContent).toContain("Demo and Tour");
  const restoreButton = container.querySelector<HTMLButtonElement>("button")!;
  expect(restoreButton.textContent).toBe("Turn Demo and Tour back on");

  act(() => {
    restoreButton.click();
  });
  expect(isCleanWorkspace()).toBe(false);
  expect(window.localStorage.getItem(CLEAN_WORKSPACE_KEY)).toBeNull();
  expect(demoModeCalls).toEqual([false]);
});
