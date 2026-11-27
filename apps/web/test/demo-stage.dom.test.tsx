import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { SEED_DOCS, docPath, seedProject } from "@manent/demo";
import { clearMarks, mark, setMarksEnabled } from "@manent/perf";
import {
  createMemoryNetwork,
  createMemoryStoreSpace,
} from "@manent/sync-client/testing";
import { soloLeader } from "@manent/sync-client";
import type { DemoResponse, WritersRequest } from "@manent/sync-protocol";
import { DEMO_WORDS, TimingProvider } from "@manent/ui";
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
import { resolveSmartCompanion } from "../src/demo/demo-context.ts";
import { DemoFormatJumps } from "../src/demo/demo-format-jumps.tsx";
import { ResetControl } from "../src/demo/reset-control.tsx";
import { TOUR_SHARED_KEY } from "../src/demo/tour-progress.ts";
import { WritersControl } from "../src/demo/writers-control.tsx";
import { RootLayout } from "../src/root-layout.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { tourActions } from "../src/state/tour.store.ts";
import {
  MemoryStorage,
  V1,
  createClock,
  fakeApi,
  fixedRandom,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();
notifyManager.setScheduler((notify) => notify());

let mounted: Root | null = null;
afterEach(() => {
  act(() => {
    mounted?.unmount();
    tourActions.close();
    tourActions.select(null);
    tourActions.setTrack(null);
    tourActions.setVerified(null);
    tourActions.setBlockedWindow(null);
    panelsActions.close("side");
    panelsActions.close("left");
  });
  clearMarks();
  mounted = null;
  document.body.replaceChildren();
});

async function mountStage(options?: {
  withControl?: boolean;
  session?: MemoryStorage;
}): Promise<{
  container: HTMLElement;
  session: MemoryStorage;
  client: QueryClient;
}> {
  const clock = createClock();
  const local = new MemoryStorage();
  const session = options?.session ?? new MemoryStorage();
  const stores = createMemoryStoreSpace();
  const demo: DemoResponse = {
    demo: true,
    seedId: "seed-1",
    control: options?.withControl
      ? { url: "http://127.0.0.1:4748", token: "tok" }
      : null,
  };
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    storage: local,
    tabStorage: session,
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
    .setPerson({ token: "tok-dana", userId: "dana", name: "Dana Reyes" });
  const api = fakeApi({ demo: async () => demo });
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ server: "running" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout api={api} fetch={fakeFetch} usePerson={usePerson} />
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
  client.setQueryData(["demo"], demo);
  if (demo.control !== null)
    client.setQueryData(["server-status", demo.control.url], "running");

  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    await Promise.all([
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
    until(
      () => container.querySelector("button[aria-label='Timings']") !== null,
    ),
  );
  return { container, session, client };
}

test("LiveInstrument stays active offline, shows offline banner and offers 1-click Go online", async () => {
  const { container } = await mountStage();
  const timingsBtn = container.querySelector<HTMLButtonElement>(
    "button[aria-label='Timings']",
  );
  await act(async () => timingsBtn?.click());
  await act(() =>
    until(
      () => document.querySelector("[data-tour='demo:connection']") !== null,
    ),
  );

  const offlineBtn = [
    ...document.querySelectorAll("[data-tour='demo:connection'] button"),
  ].find((b) => b.textContent === DEMO_WORDS.offline) as HTMLButtonElement;
  await act(async () => offlineBtn.click());

  expect(document.body.textContent).toContain(DEMO_WORDS.offlineBanner);
  expect(document.body.textContent).toContain(DEMO_WORDS.pausedOffline);
  expect(document.body.textContent).toContain(DEMO_WORDS.speedHeading);

  const reconnectBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === DEMO_WORDS.reconnect,
  );
  expect(reconnectBtn).toBeDefined();
  await act(async () => reconnectBtn?.click());
  expect(
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === DEMO_WORDS.reconnect,
    ),
  ).toBeUndefined();
});

test("Mission Pill opens the Unified Stage Sheet on Tour story tracks and Demo controls isolates 3 vertical bands", async () => {
  const { container } = await mountStage({ withControl: true });

  const missionTrigger = container.querySelector<HTMLButtonElement>(
    `button[aria-label='${DEMO_WORDS.tryProof}']`,
  );
  expect(missionTrigger).not.toBeNull();
  await act(async () => missionTrigger?.click());
  expect(document.body.textContent).toContain(DEMO_WORDS.chooseTourHeading);
  expect(document.body.textContent).toContain(DEMO_WORDS.trackOverviewTitle);
  expect(document.body.textContent).toContain(DEMO_WORDS.trackCoordinatorTitle);
  expect(document.body.textContent).toContain(DEMO_WORDS.trackBroadcastTitle);
  expect(document.body.textContent).toContain(DEMO_WORDS.trackGameTitle);
  expect(document.body.textContent).toContain(DEMO_WORDS.trackResilienceTitle);
  expect(document.body.textContent).toContain(DEMO_WORDS.tryFormatsHeading);
  expect(document.body.textContent).toContain(DEMO_WORDS.formatBook);
  expect(document.body.textContent).toContain(DEMO_WORDS.formatStagePlay);
  expect(document.body.textContent).toContain(DEMO_WORDS.formatMulticam);
  expect(document.body.textContent).toContain(DEMO_WORDS.formatAnimation);
  expect(document.body.textContent).toContain(DEMO_WORDS.formatPodcast);
  expect(document.body.textContent).toContain(
    DEMO_WORDS.formatBroadcastGraphics,
  );

  const controlsTab = [
    ...document.querySelectorAll<HTMLButtonElement>("[role='tab']"),
  ].find((b) => b.textContent?.includes(DEMO_WORDS.stageTabControls));
  expect(controlsTab).toBeDefined();
  await act(async () => controlsTab?.click());

  expect(document.body.textContent).toContain(DEMO_WORDS.scopeWindow);
  expect(document.body.textContent).toContain(DEMO_WORDS.scopeScript);
  expect(document.body.textContent).toContain(DEMO_WORDS.openScriptPrompt);
  expect(document.body.textContent).toContain(DEMO_WORDS.scopeAll);
  expect(document.body.textContent).toContain(DEMO_WORDS.allWindowsNote);
  expect(document.querySelector("[data-tour='demo:server']")).not.toBeNull();
  expect(document.querySelector("[data-tour='demo:reset']")).not.toBeNull();
});

test("resolveSmartCompanion stays workspace-compatible and falls back to Slack Water on solo or library surfaces", () => {
  const heavyDoc = SEED_DOCS.find((d) => d.projectKey.startsWith("heavy/"));
  expect(heavyDoc).toBeDefined();
  const onHeavy = resolveSmartCompanion({
    currentUserId: "dana",
    docId: heavyDoc!.docId,
    screen: "document",
  });
  expect(onHeavy.person.userId).toBe("priya");
  expect(onHeavy.needsSharedScript).toBe(false);

  const onLibrary = resolveSmartCompanion({
    currentUserId: "dana",
    docId: null,
    screen: "library",
  });
  expect(onLibrary.person.userId).toBe("sam");
  expect(onLibrary.targetPath).toBe(docPath("medium/harbour-lights/205"));
  expect(onLibrary.needsSharedScript).toBe(true);

  const asYou = resolveSmartCompanion({
    currentUserId: "you",
    docId: null,
    screen: "library",
  });
  expect(asYou.person.userId).toBe("dana");
  expect(asYou.needsSharedScript).toBe(true);
});

test("Offline -> typed -> online auto-verifies offline-write and surfaces a calm Next mission banner", async () => {
  const { container } = await mountStage();
  const timingsBtn = container.querySelector<HTMLButtonElement>(
    "button[aria-label='Timings']",
  );
  await act(async () => timingsBtn?.click());
  await act(() =>
    until(
      () => document.querySelector("[data-tour='demo:connection']") !== null,
    ),
  );
  const offlineBtn = [
    ...document.querySelectorAll("[data-tour='demo:connection'] button"),
  ].find((b) => b.textContent === DEMO_WORDS.offline) as HTMLButtonElement;
  await act(async () => offlineBtn.click());

  setMarksEnabled(true);
  mark("editor.keystroke", () => {});

  const reconnectBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === DEMO_WORDS.reconnect,
  );
  expect(reconnectBtn).toBeDefined();
  await act(async () => reconnectBtn?.click());

  await act(() =>
    until(
      () =>
        container.textContent?.includes(DEMO_WORDS.verifiedOffline) ?? false,
    ),
  );
  expect(container.textContent).toContain(DEMO_WORDS.verifiedOffline);
  expect(container.textContent).toContain(DEMO_WORDS.missionNext);
});

test("Blocked second-window pop-up surfaces a clickable Open in a new tab recovery link on the Demo Bar", async () => {
  const { container } = await mountStage();
  const originalOpen = window.open;
  window.open = (() => null) as typeof window.open;
  try {
    const labTrigger = container.querySelector<HTMLButtonElement>(
      `button[aria-label='${DEMO_WORDS.proofLab}']`,
    );
    await act(async () => labTrigger?.click());
    const secondWinBtn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Open a second window"),
    ) as HTMLButtonElement | undefined;
    expect(secondWinBtn).toBeDefined();
    await act(async () => secondWinBtn?.click());

    const recoveryLink =
      container.querySelector<HTMLAnchorElement>("a[target='_blank']");
    expect(recoveryLink).not.toBeNull();
    expect(recoveryLink?.textContent).toContain(DEMO_WORDS.openInNewTab);
  } finally {
    window.open = originalOpen;
  }
});

test("Hide demo bar collapses to a restore tab and auto-expands for a demo:* Tour highlight", async () => {
  const { container } = await mountStage();
  const hideBtn = container.querySelector<HTMLButtonElement>(
    `button[aria-label='${DEMO_WORDS.hideDemoBar}']`,
  );
  expect(hideBtn).not.toBeNull();
  await act(async () => hideBtn?.click());

  const showBtn = container.querySelector<HTMLButtonElement>(
    `button[aria-label='${DEMO_WORDS.showDemoBar}']`,
  );
  expect(showBtn).not.toBeNull();

  // Activating offline-write step 0 (highlights demo:connection) auto-expands the bar and opens Connection
  await act(async () => {
    tourActions.open("offline-write", 0);
  });
  await act(() =>
    until(
      () => document.querySelector("[data-tour='demo:connection']") !== null,
    ),
  );
  expect(
    container.querySelector(`button[aria-label='${DEMO_WORDS.showDemoBar}']`),
  ).toBeNull();
  expect(
    document.querySelector("[data-tour='demo:connection']"),
  ).not.toBeNull();
});

test("ResetControl keeps ConsequenceDialog open with refusal and preserves Tour progress on supervisor rejection", async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    TOUR_SHARED_KEY,
    JSON.stringify({ "offline-write": { done: true, at: 1 } }),
  );
  const environment = testEnvironment({ storage });
  bindGuard(environment.guard);
  const client = new QueryClient();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);

  await act(async () => {
    mounted?.render(
      <QueryClientProvider client={client}>
        <TimingProvider timing={{ now: () => 0, schedule: () => () => {} }}>
          <EnvironmentProvider environment={environment}>
            <ResetControl
              id="ctrl"
              client={{
                status: async () => "running",
                stop: async () => {},
                start: async () => {},
                reset: async () => {
                  throw new Error("unreachable");
                },
              }}
            />
          </EnvironmentProvider>
        </TimingProvider>
      </QueryClientProvider>,
    );
  });

  const resetBtn = container.querySelector<HTMLButtonElement>(
    "[data-tour='demo:reset']",
  );
  await act(async () => resetBtn?.click());

  const confirmBtn = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === DEMO_WORDS.resetAction,
  );
  expect(confirmBtn).toBeDefined();
  await act(async () => confirmBtn?.click());

  expect(document.body.textContent).toContain(DEMO_WORDS.resetRefused);
  expect(storage.getItem(TOUR_SHARED_KEY)).not.toBeNull();
});

test("Demo controls auto-opens for demo:server Tour step and stays closed when the server restarts", async () => {
  const { container, client } = await mountStage({ withControl: true });
  await act(async () => {
    tourActions.open("offline-server-stopped", 0);
  });
  await act(() =>
    until(
      () => document.querySelector("[data-tour='demo:server'] button") !== null,
    ),
  );
  const stopBtn = [
    ...document.querySelectorAll("[data-tour='demo:server'] button"),
  ].find((b) => b.textContent?.includes("Stop the server")) as
    HTMLButtonElement | undefined;
  expect(stopBtn).toBeDefined();
  await act(async () => stopBtn?.click());
  await act(async () => {
    client.setQueryData(["server-status", "http://127.0.0.1:4748"], "stopped");
  });
  await act(async () => {
    client.setQueryData(["server-status", "http://127.0.0.1:4748"], "running");
  });
  const labTrigger = container.querySelector<HTMLButtonElement>(
    `button[aria-label='${DEMO_WORDS.proofLab}']`,
  );
  expect(labTrigger?.getAttribute("aria-expanded")).toBe("false");
});

test("WritersControl renders an inline 3-step slider (1, 5, 20), switches placement and stops writers", async () => {
  const calls: WritersRequest[] = [];
  const environment = testEnvironment();
  bindGuard(environment.guard);
  const services = testServices({
    userId: "dana",
    environment,
    api: fakeApi({
      runningWriters: async () => ({
        count: 0,
        asked: 0,
        placement: "own_scenes",
        names: [],
        endsAt: null,
      }),
      writers: async (req) => {
        calls.push(req);
        return {
          count: req.count,
          asked: req.count,
          placement: req.placement,
          names: req.count === 0 ? [] : ["Sam Okafor"],
          endsAt: null,
        };
      },
    }),
  });
  const facts = createFactsStore({
    guard: environment.guard,
    frame: environment.frame,
  });
  const client = new QueryClient();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);

  await act(async () => {
    mounted?.render(
      <QueryClientProvider client={client}>
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <FactsContext value={facts.selectors}>
              <WritersControl docId="doc-1" signedIn unreachable={null} />
            </FactsContext>
          </ServicesProvider>
        </EnvironmentProvider>
      </QueryClientProvider>,
    );
  });

  const slider = container.querySelector<HTMLInputElement>(
    "input[type='range']",
  );
  expect(slider).not.toBeNull();
  expect([slider?.min, slider?.max, slider?.step]).toEqual(["0", "2", "1"]);

  // Click step 3 ("20") and switch placement to This scene, then Stop writers
  const btn20 = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "20",
  ) as HTMLButtonElement | undefined;
  expect(btn20).toBeDefined();
  await act(async () => btn20?.click());
  await act(() => until(() => container.textContent?.includes("20 writers")));

  const thisSceneBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === DEMO_WORDS.writersThisScene,
  ) as HTMLButtonElement | undefined;
  await act(async () => thisSceneBtn?.click());
  await act(() =>
    until(() => calls.some((c) => c.placement === "caret_scene")),
  );

  const stopBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === DEMO_WORDS.stopWriters,
  ) as HTMLButtonElement | undefined;
  expect(stopBtn).toBeDefined();
  await act(async () => stopBtn?.click());
  await act(() => until(() => calls.at(-1)?.count === 0));

  expect(calls.map((c) => [c.count, c.placement])).toEqual([
    [20, "own_scenes"],
    [20, "caret_scene"],
    [0, "own_scenes"],
  ]);
  services.dispose();
});

test("DemoFormatJumps routes to all six Writers' room showcase formats and hides when signed out", async () => {
  const opened: string[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);

  await act(async () => {
    mounted?.render(
      <DemoFormatJumps signedIn={false} onOpenPath={(h) => opened.push(h)} />,
    );
  });
  expect(container.querySelectorAll("button").length).toBe(0);

  await act(async () => {
    mounted?.render(
      <DemoFormatJumps signedIn onOpenPath={(h) => opened.push(h)} />,
    );
  });
  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map((b) => b.textContent)).toEqual([
    DEMO_WORDS.formatBook,
    DEMO_WORDS.formatStagePlay,
    DEMO_WORDS.formatMulticam,
    DEMO_WORDS.formatAnimation,
    DEMO_WORDS.formatPodcast,
    DEMO_WORDS.formatBroadcastGraphics,
  ]);
  for (const btn of buttons) {
    await act(async () => btn.click());
  }
  expect(opened).toEqual([
    docPath("medium/the-salt-almanac/manuscript"),
    docPath("medium/pier-four-at-low-water/script"),
    `/p/${seedProject("medium/platform-two").projectId}/board`,
    docPath("medium/tin-boat/101"),
    docPath("medium/harbour-tape/ep1"),
    docPath("medium/lannick-one-news/stories/07"),
  ]);
});
