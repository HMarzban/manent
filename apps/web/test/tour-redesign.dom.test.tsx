import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { TOUR, isShown } from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { TourFloatingBar } from "../src/demo/tour-floating-bar.tsx";
import {
  TOUR_HIGHLIGHTS,
  otherWindowNameOfStep,
} from "../src/demo/tour-highlights.ts";
import { TourPanel } from "../src/demo/tour-panel.tsx";
import {
  TOUR_ACTIVE_KEY,
  TOUR_SHARED_KEY,
  clearDemoTourStorage,
  createTourProgress,
} from "../src/demo/tour-progress.ts";
import { runSetup } from "../src/demo/tour-setup.ts";
import { createLocalMap } from "../src/services/local-map.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { TabStorage } from "../src/session.ts";
import { AnnouncerRegion } from "../src/shell/announcer-region.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { tourActions, useTourActive } from "../src/state/tour.store.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();
bindGuard(testEnvironment().guard);

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  tourActions.hydrate(null);
  tourActions.select(null);
  tourActions.close();
  panelsActions.close("side");
  document.body.replaceChildren();
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function memoryTabStorage(): TabStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

async function renderPanel(
  options: {
    storage?: Storage;
    tabStorage?: TabStorage;
    userId?: string;
    extra?: ReactNode;
  } = {},
): Promise<{ container: HTMLElement; dispose: () => void }> {
  const storage = options.storage ?? memoryStorage();
  const tabStorage = options.tabStorage ?? memoryTabStorage();
  const clock = createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    dom: createShellDom(document),
    storage,
    tabStorage,
  });
  bindGuard(environment.guard);
  const services = testServices({ userId: options.userId ?? "sam" });
  const rootRoute = createRootRoute({
    component: () => (
      <ServicesProvider services={services}>
        <TourPanel />
        {options.extra ?? null}
        <AnnouncerRegion />
      </ServicesProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={new QueryClient()}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  return { container, dispose: () => services.dispose() };
}

function FloatingBarProbe(): ReactNode {
  const active = useTourActive();
  return (
    <>
      <span data-probe>
        {active ? `${active.scenarioId}:${active.step}` : "none"}
      </span>
      <TourFloatingBar />
    </>
  );
}

test("every highlight names a shown scenario in the Tour", () => {
  const shownIds = new Set(TOUR.scenarios.filter(isShown).map((s) => s.id));
  expect(TOUR_HIGHLIGHTS.length).toBe(6);
  expect(TOUR_HIGHLIGHTS.every((id) => shownIds.has(id))).toBe(true);
});

test("companion-window steps name only the extra window's person", () => {
  const follow = TOUR.scenarios.find((s) => s.id === "together-follow")!;
  expect(otherWindowNameOfStep(follow.steps[0]!.text, follow)).toBe(null);
  expect(otherWindowNameOfStep(follow.steps[1]!.text, follow)).toBe("Dana");
  expect(otherWindowNameOfStep(follow.steps[2]!.text, follow)).toBe(null);
});

test("shared tour progress survives switching people and clears on reset", () => {
  const storage = memoryStorage();
  const tab = memoryTabStorage();
  const sam = testServices({ userId: "sam" });
  const dana = testServices({ userId: "dana" });
  const sharedA = createLocalMap({
    storage,
    key: TOUR_SHARED_KEY,
    events: () => () => {},
  });
  const sharedB = createLocalMap({
    storage,
    key: TOUR_SHARED_KEY,
    events: () => () => {},
  });
  const progressSam = createTourProgress(sam.tour, sharedA);
  const progressDana = createTourProgress(dana.tour, sharedB);

  progressSam.mark("write-true-pages", true, 100);
  expect(progressSam.done("write-true-pages")).toBe(true);
  const sharedAfter = createLocalMap({
    storage,
    key: TOUR_SHARED_KEY,
    events: () => () => {},
  });
  expect(
    createTourProgress(dana.tour, sharedAfter).done("write-true-pages"),
  ).toBe(true);
  progressDana.mark("write-true-pages", false, 200);
  expect(progressDana.done("write-true-pages")).toBe(false);

  progressSam.mark("write-true-pages", true, 300);
  tab.setItem(
    TOUR_ACTIVE_KEY,
    JSON.stringify({ scenarioId: "write-true-pages", step: 0 }),
  );
  clearDemoTourStorage(storage, tab);
  expect(storage.getItem(TOUR_SHARED_KEY)).toBe(null);
  expect(tab.getItem(TOUR_ACTIVE_KEY)).toBe(null);
  sam.dispose();
  dana.dispose();
});

test("a blocked second window ends set-up with popup_blocked", async () => {
  const scenario: TourScenario = TOUR.scenarios.find(
    (s) => s.id === "together-cursors",
  )!;
  const outcome = await runSetup(scenario, {
    prepare: async () => ({ ok: true }),
    switchPerson: async () => {},
    navigate: () => {},
    openWindow: () => false,
  });
  expect(outcome).toEqual({ ok: false, reason: "popup_blocked" });
});

test("the tour hub shows progress, collapsible groups, non-interactive filtered headings, stepper navigation and a resume strip", async () => {
  const storage = memoryStorage();
  const { container, dispose } = await renderPanel({ storage });
  const totalShown = TOUR.scenarios.filter(isShown).length;

  expect(container.textContent).toContain(`0 of ${totalShown} ticked`);
  const bar = container.querySelector<HTMLElement>("[role='progressbar']");
  expect(bar?.getAttribute("aria-valuenow")).toBe("0");
  expect(bar?.getAttribute("aria-valuemax")).toBe(String(totalShown));

  // Default All view expands only the first unfinished group ("Write") with aria-controls wired
  const headings = [...container.querySelectorAll("h2")];
  expect(headings[0]?.textContent).toBe("Write");
  const firstToggle = headings[0]?.querySelector("button");
  const secondToggle = headings[1]?.querySelector("button");
  expect(firstToggle?.getAttribute("aria-expanded")).toBe("true");
  expect(firstToggle?.getAttribute("aria-controls")).not.toBe(null);
  expect(secondToggle?.getAttribute("aria-expanded")).toBe("false");

  // Switching to Highlights shows the 6 curated scenarios with plain non-button group headings
  const highlightsBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Highlights",
  );
  await act(async () => highlightsBtn?.click());
  expect(container.querySelectorAll("[data-tour-card]").length).toBe(
    TOUR_HIGHLIGHTS.length,
  );
  expect(container.querySelectorAll("h2 > button").length).toBe(0);

  // Clicking a scenario card opens Focused Stepper mode
  const firstCard =
    container.querySelector<HTMLButtonElement>("[data-tour-card]");
  await act(async () => firstCard?.click());
  expect(container.textContent).toContain("All parts");
  expect(container.textContent).toContain("Set it up");

  // Going back to Browse keeps a compact In progress resume strip once a step is opened
  const stepRow = container.querySelector<HTMLElement>("ol > li > div");
  await act(async () => stepRow?.click());
  const backBtn = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("All parts"),
  );
  await act(async () => backBtn?.click());
  expect(container.textContent).toContain("In progress");

  dispose();
});

test("the floating tour bar appears only when the tour tab is not showing and offsets beside another open side panel", async () => {
  const tabStorage = memoryTabStorage();
  const scenario = TOUR.scenarios.find((s) => s.id === "write-true-pages")!;
  const target = document.createElement("button");
  target.setAttribute("data-tour", scenario.steps[0]!.highlight);
  document.body.append(target);

  const environment = testEnvironment({
    dom: createShellDom(document),
    tabStorage,
  });
  bindGuard(environment.guard);
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <FloatingBarProbe />
      </EnvironmentProvider>,
    ),
  );

  // Closed side panel, no active scenario -> no floating bar
  expect(container.querySelector("[data-tour-chrome='true']")).toBe(null);

  // Open scenario while side panel is closed -> floating bar appears and rings target
  await act(async () => tourActions.open(scenario.id, 0));
  const bar = container.querySelector<HTMLElement>("[data-tour-chrome='true']");
  expect(bar?.getAttribute("data-surface")).toBe("demo");
  expect(bar?.getAttribute("aria-label")).toBe("Tour");
  expect(bar?.textContent).toContain(scenario.steps[0]!.text);
  expect(target.hasAttribute("data-tour-ring")).toBe(true);

  // Opening another side panel (Comments) offsets the floating bar left of that panel
  await act(async () => panelsActions.open("side", "comments"));
  const beside = container.querySelector<HTMLElement>(
    "[data-tour-chrome='true']",
  );
  expect(beside?.style.insetInlineEnd).toBe("336px");

  // Opening the Tour side panel hides the floating bar (no duplicate UI)
  await act(async () => panelsActions.open("side", "tour"));
  expect(container.querySelector("[data-tour-chrome='true']")).toBe(null);

  // Closing the side panel shows it again and stepping advances to step 1
  await act(async () => panelsActions.close("side"));
  const nextBtn = container.querySelector<HTMLButtonElement>(
    "[data-tour-chrome='true'] button[aria-label='Next']",
  );
  await act(async () => nextBtn?.click());
  expect(container.querySelector("[data-probe]")?.textContent).toBe(
    `${scenario.id}:1`,
  );
});

test("reloading a tab restores the active stepper and companion-window steps suppress the local ring", async () => {
  const tabStorage = memoryTabStorage();
  const follow = TOUR.scenarios.find((s) => s.id === "together-follow")!;
  const target = document.createElement("div");
  target.setAttribute("data-tour", follow.steps[1]!.highlight);
  document.body.append(target);

  // Seed per-tab storage directly as a browser reload would find it (without calling hydrate ahead of mount)
  tabStorage.setItem(
    TOUR_ACTIVE_KEY,
    JSON.stringify({ scenarioId: follow.id, step: 1 }),
  );

  const { container, dispose } = await renderPanel({ tabStorage });
  expect(container.textContent).toContain("All parts");
  expect(container.textContent).toContain("In Dana's window");
  expect(target.hasAttribute("data-tour-ring")).toBe(false);

  // Advance to last step and click Mark ticked and next
  const nextBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Next",
  );
  await act(async () => nextBtn?.click());
  const finishBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Mark ticked and next",
  );
  await act(async () => finishBtn?.click());
  expect(container.textContent).not.toContain(follow.promise);
  dispose();
});

test("a companion window opened with panels closed clears cloned tab storage and never shows the floating bar", async () => {
  const tabStorage = memoryTabStorage();
  tabStorage.setItem(
    TOUR_ACTIVE_KEY,
    JSON.stringify({ scenarioId: "write-true-pages", step: 0 }),
  );
  tourActions.suppress();
  tourActions.hydrate(tabStorage);
  expect(tabStorage.getItem(TOUR_ACTIVE_KEY)).toBe(null);
  const { container, dispose } = await renderPanel({ tabStorage });
  expect(container.textContent).not.toContain("In progress");
  dispose();
});

test("the remaining filter shows the empty hero card once every scenario is ticked and disables Ticked on the last step", async () => {
  const storage = memoryStorage();
  const shared = createLocalMap({
    storage,
    key: TOUR_SHARED_KEY,
    events: () => () => {},
  });
  const shown = TOUR.scenarios.filter(isShown);
  for (const s of shown) shared.set(s.id, { done: true, at: 1 });

  const { container, dispose } = await renderPanel({ storage });
  expect(container.textContent).toContain(`All ${shown.length} ticked`);
  const remainingBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "To try",
  );
  await act(async () => remainingBtn?.click());
  expect(container.textContent).toContain("Nothing left to try");
  const showAllBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Show all",
  );
  await act(async () => showAllBtn?.click());
  const expectedGroups = TOUR.groups.filter((g) =>
    shown.some((s) => s.group === g),
  );
  expect(
    [...container.querySelectorAll("h2")].map((h) => h.textContent),
  ).toEqual(expectedGroups);

  // Opening a ticked scenario when nothing else is unticked shows a disabled Ticked button on its final step
  const firstScenario = shown[0]!;
  await act(async () =>
    tourActions.open(firstScenario.id, firstScenario.steps.length - 1),
  );
  const tickedBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Ticked",
  );
  expect(tickedBtn?.disabled).toBe(true);
  dispose();
});
