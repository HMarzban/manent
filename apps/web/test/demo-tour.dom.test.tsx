import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { TOUR, isShown } from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import type { DemoResponse, SignInChoice } from "@manent/sync-protocol";
import { useCommandState } from "@manent/ui";
import type { Message } from "@manent/ui";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
  useQuery,
} from "@tanstack/react-query";
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
import type { Api } from "../src/api.ts";
import { DemoBar } from "../src/demo/demo-bar.tsx";
import { TourPanel } from "../src/demo/tour-panel.tsx";
import { TourScenarioRow } from "../src/demo/tour-scenario.tsx";
import { SERVER_STATUS_QUERY } from "../src/demo/use-demo.ts";
import { RootLayout } from "../src/root-layout.tsx";
import { ChooseScreen } from "../src/screens/choose.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
  useServices,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { AnnouncerRegion } from "../src/shell/announcer-region.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { tourActions } from "../src/state/tour.store.ts";
import {
  createClock,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();
// Query tells its observers at once, so a test sees an answer in the act that delivered it
notifyManager.setScheduler((notify) => notify());

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  // a scenario a test opened stays open in the tab's store
  tourActions.close();
  document.body.replaceChildren();
});

/** Draws `node` as the app would: inside the environment, Query and a router at `/`, which draws `screen`. */
async function render(
  node: ReactNode,
  options: {
    clock?: ReturnType<typeof createClock>;
    client?: QueryClient;
    screen?: () => ReactNode;
  } = {},
): Promise<HTMLElement> {
  const clock = options.clock ?? createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    dom: createShellDom(document),
  });
  bindGuard(environment.guard);
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: options.screen,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={options.client ?? new QueryClient()}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  return container;
}

const settle = (): Promise<void> =>
  act(async () => {
    await Promise.resolve();
  });

/** The demo bar's controls are loaded lazily: loaded here, they arrive inside this act. */
const demoBarControls = (): Promise<void> =>
  act(async () => {
    await import("../src/demo/demo-bar-controls.tsx");
  });

const buttons = (root: ParentNode): HTMLButtonElement[] => [
  ...root.querySelectorAll("button"),
];

/** A button's name: its label when it has one, otherwise its words. */
const nameOf = (button: HTMLButtonElement): string | null =>
  button.getAttribute("aria-label") ?? button.textContent;

const paragraphs = (root: ParentNode): (string | null)[] =>
  [...root.querySelectorAll("p")].map((p) => p.textContent);

const SCENARIO: TourScenario = {
  id: "a-first-page",
  group: "Write",
  promise: "Write a first page and watch it reach the server.",
  setup: {
    userId: "sam",
    open: "/",
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Open the commands.", highlight: "app.palette" },
    { text: "Choose New script.", highlight: "library.newScript" },
  ],
  check: "Saved · Synced",
  evidence: ["Saved · Synced"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};

/** A row with nothing in Set it up's place and not yet done. */
const ROW = { hold: null, done: false, onDone: () => {} } as const;

test("a group with no scenario listed is not drawn", async () => {
  const services = testServices({ userId: "sam" });
  const container = await render(
    <ServicesProvider services={services}>
      <TourPanel />
    </ServicesProvider>,
  );
  // the groups drawn are exactly those that list a shown scenario, in the Tour's order
  const listed = TOUR.groups.filter((group) =>
    TOUR.scenarios.some((s) => s.group === group && isShown(s)),
  );
  expect(listed.length).toBeLessThan(TOUR.groups.length);
  expect(
    [...container.querySelectorAll("h2")].map((h) => h.textContent),
  ).toEqual(listed);
  services.dispose();
});

/** A server status the demo bar has heard, as its query holds it. */
function HeardServer(props: { state: string }): ReactNode {
  useQuery({
    queryKey: [SERVER_STATUS_QUERY, "control"],
    queryFn: () => props.state,
    initialData: props.state,
  });
  return null;
}

test("a set-up that did not work says why, with Set it up again", async () => {
  const failing = await render(
    <>
      <TourScenarioRow
        scenario={SCENARIO}
        {...ROW}
        setUp={async () => ({ ok: false, reason: "unknown" })}
      />
      <AnnouncerRegion />
    </>,
  );
  await act(async () => buttons(failing)[0]?.click());
  expect(paragraphs(failing)).toEqual([
    "Write a first page and watch it reach the server.",
    "Couldn't set this up.",
  ]);
  expect(buttons(failing).map((b) => b.textContent)).toEqual([
    "Set it up again",
  ]);
  expect(failing.querySelector("[aria-live='polite']")?.textContent).toBe(
    "Couldn't set this up.",
  );
  act(() => mounted?.unmount());
  document.body.replaceChildren();

  const setUps: string[] = [];
  const stopped = await render(
    <>
      <HeardServer state="stopped" />
      <TourScenarioRow
        scenario={SCENARIO}
        {...ROW}
        setUp={async (scenario) => {
          setUps.push(scenario.id);
          return { ok: true };
        }}
      />
      <AnnouncerRegion />
    </>,
  );
  await settle();
  await act(async () => buttons(stopped)[0]?.click());
  expect(paragraphs(stopped)).toEqual([
    "Write a first page and watch it reach the server.",
    "Couldn't reach Manent. Start the server, then set it up again.",
  ]);
  expect(buttons(stopped).map((b) => b.textContent)).toEqual([
    "Set it up again",
  ]);
  expect(stopped.querySelector("[aria-live='polite']")?.textContent).toBe(
    "Couldn't reach Manent. Start the server, then set it up again.",
  );
  expect(setUps).toEqual([]);
});

test("a scenario shows its promise, one bordered Set it up, numbered steps and its check", async () => {
  const setUps: string[] = [];
  const container = await render(
    <TourScenarioRow
      scenario={SCENARIO}
      {...ROW}
      setUp={async (scenario) => {
        setUps.push(scenario.id);
        return { ok: true };
      }}
    />,
  );
  expect(paragraphs(container)).toEqual([
    "Write a first page and watch it reach the server.",
  ]);
  const [setUp, ...others] = buttons(container);
  expect(others).toEqual([]);
  expect(setUp?.textContent).toBe("Set it up");
  expect(setUp?.className.split(" ").includes("border-border")).toBe(true);
  expect(
    [...container.querySelectorAll("ol > li")].map((li) => li.textContent),
  ).toEqual(["1Open the commands.", "2Choose New script."]);
  expect(container.querySelector("dl")?.textContent).toBe(
    "What to checkSaved · Synced",
  );
  await act(async () => setUp?.click());
  expect(setUps).toEqual(["a-first-page"]);
});

/** The `data-tour` of every control the Tour ring marks. */
const ringed = (): string[] =>
  [...document.querySelectorAll("[data-tour-ring]")].map(
    (control) => control.getAttribute("data-tour") ?? "",
  );

/** The words of the step the person is on, as the Tour shows it: none while no step is current. */
const currentStep = (container: HTMLElement): (string | null)[] =>
  [...container.querySelectorAll("ol [aria-current='true']")].map(
    (step) => step.textContent,
  );

/** The Tour's numbered step rows, in order. */
const stepRows = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("ol > li > div"),
];

test("only the step the person is on rings its control, and choosing a step in the Tour moves them there", async () => {
  const palette = document.createElement("button");
  palette.setAttribute("data-tour", "app.palette");
  const newScript = document.createElement("button");
  newScript.setAttribute("data-tour", "library.newScript");
  const field = document.createElement("input");
  document.body.append(palette, newScript, field);
  field.focus();
  const container = await render(
    <TourScenarioRow
      scenario={SCENARIO}
      {...ROW}
      setUp={async () => ({ ok: true })}
    />,
  );
  // a scenario the person has not opened rings nothing
  expect(ringed()).toEqual([]);
  await act(async () => buttons(container)[0]?.click());
  expect(ringed()).toEqual(["app.palette"]);
  expect(currentStep(container)).toEqual(["1Open the commands."]);
  // the Tour ring is not focus
  expect(document.activeElement).toBe(field);
  // pressing the ringed control leaves the person on the step
  act(() => palette.click());
  expect(ringed()).toEqual(["app.palette"]);
  expect(currentStep(container)).toEqual(["1Open the commands."]);
  act(() => stepRows(container)[1]?.click());
  expect(ringed()).toEqual(["library.newScript"]);
  expect(currentStep(container)).toEqual(["2Choose New script."]);
  act(() => stepRows(container)[0]?.click());
  expect(ringed()).toEqual(["app.palette"]);
  act(() => mounted?.unmount());
  mounted = null;
  expect(ringed()).toEqual([]);
});

test("clicking into the ringed page to write does not move the person on to the next step", async () => {
  const page = document.createElement("div");
  page.setAttribute("data-tour", "page");
  const line = document.createElement("p");
  page.append(line);
  document.body.append(page);
  const container = await render(
    <TourScenarioRow
      scenario={{
        ...SCENARIO,
        steps: [
          { text: "Type a scene heading.", highlight: "page" },
          { text: "Type an action line under it.", highlight: "page" },
        ],
      }}
      {...ROW}
      setUp={async () => ({ ok: true })}
    />,
  );
  await act(async () => buttons(container)[0]?.click());
  act(() => {
    page.click();
    line.click();
  });
  expect(currentStep(container)).toEqual(["1Type a scene heading."]);
  expect(ringed()).toEqual(["page"]);
});

test("the demo bar is its own colour scope and says Demo", async () => {
  const container = await render(
    <DemoBar
      person={{ token: null, userId: "dana", name: "Dana Reyes" }}
      onPersonClick={() => {}}
      control={null}
      resetting={false}
    />,
  );
  const bar = container.querySelector("section");
  expect(bar?.getAttribute("data-surface")).toBe("demo");
  expect(bar?.getAttribute("aria-label")).toBe("Demo");
  const word = bar?.firstElementChild;
  expect(word?.textContent).toBe("Demo");
  // the filled tag, set in capitals by the stylesheet, not in the words
  expect(word?.hasAttribute("data-fill")).toBe(true);
  // 32 px whether or not its controls have arrived, so nothing moves when they do
  expect(bar?.className.split(" ").includes("min-h-demobar")).toBe(true);
  await demoBarControls();
  expect(buttons(container).map(nameOf)).toEqual(["Person: Dana Reyes"]);
});

test("the demo bar offers the Tour once the tab has a person", async () => {
  const demo = { demo: true as const, seedId: "seed-1", control: null };
  const api: Api = fakeApi({ demo: async () => demo });
  const usePerson = createPersonStore(null);
  const client = new QueryClient();
  client.setQueryData(["demo"], demo);
  const container = await render(
    <RootLayout api={api} fetch={fetch} usePerson={usePerson} />,
    { client },
  );
  const bar = (): Element | null =>
    container.querySelector("[data-surface='demo']");
  await demoBarControls();
  expect(buttons(bar() ?? container).map(nameOf)).toEqual([]);
  // the shell loads its palette lazily: loaded here first, it arrives inside the act below
  await import("../src/shell/shell-palette.tsx");
  await act(async () =>
    usePerson
      .getState()
      .setPerson({ token: null, userId: "dana", name: "Dana Reyes" }),
  );
  expect(buttons(bar() ?? container).map(nameOf)).toEqual([
    "Person: Dana Reyes",
    "Online",
    "Offline",
    "Slow",
    "Add writers",
    "Timings",
    "Reorganise",
    "Tour",
  ]);
});

test("a message shown before the demo's first answer stays, and the answer offers the Tour", async () => {
  const { promise: answered, resolve: answer } =
    Promise.withResolvers<DemoResponse | null>();
  const api: Api = fakeApi({ demo: () => answered });
  const usePerson = createPersonStore(null);
  usePerson
    .getState()
    .setPerson({ token: null, userId: "dana", name: "Dana Reyes" });
  const seen: { services: PersonServices; tour: boolean }[] = [];
  const screen = (): ReactNode => {
    seen.push({
      services: useServices(),
      tour: useCommandState("demo.tour").visible,
    });
    return null;
  };
  const notice: Message = {
    id: "command_unavailable",
    text: "Print needs a document open.",
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
  await render(<RootLayout api={api} fetch={fetch} usePerson={usePerson} />, {
    screen,
  });
  act(() => seen.at(-1)?.services.messages.push(notice));
  await act(async () =>
    answer({ demo: true, seedId: "seed-1", control: null }),
  );
  const last = seen.at(-1);
  expect({
    message: last?.services.messages.current() ?? null,
    tour: last?.tour ?? null,
  }).toEqual({ message: notice, tour: true });
});

const CHOICES: readonly SignInChoice[] = [
  {
    userId: "dana",
    name: "Dana Reyes",
    title: "Head writer",
    registered: true,
  },
  {
    userId: "leo",
    name: "Leo Marsh",
    title: "Executive, reader and commenter",
    registered: true,
  },
];

function chooser(options: { api: Api; chosen: string | null }): ReactNode {
  const person =
    CHOICES.map((c) => ({ token: null, userId: c.userId, name: c.name })).find(
      (p) => p.userId === options.chosen,
    ) ?? null;
  return (
    <ChooseScreen
      api={options.api}
      person={person}
      setPerson={() => {}}
      next="/"
    />
  );
}

test("the chosen person carries the word Chosen as well as aria-current", async () => {
  const container = await render(
    chooser({ api: fakeApi({ choices: async () => CHOICES }), chosen: "leo" }),
  );
  await settle();
  const [dana, leo] = buttons(container);
  expect(dana?.textContent).toBe("DRDana ReyesHead writer");
  expect(dana?.hasAttribute("aria-current")).toBe(false);
  expect(leo?.textContent).toBe(
    "LMLeo MarshExecutive, reader and commenterChosen",
  );
  expect(leo?.getAttribute("aria-current")).toBe("true");
});

test("while the people load the chooser shows nothing, then six placeholder rows, and never words", async () => {
  const { promise: pending, resolve: answer } =
    Promise.withResolvers<readonly SignInChoice[]>();
  const clock = createClock();
  const container = await render(
    chooser({ api: fakeApi({ choices: () => pending }), chosen: null }),
    { clock },
  );
  const placeholders = (): Element[] => [
    ...container.querySelectorAll("[data-placeholder]"),
  ];
  const heading =
    "Choose who you arePick anyone. You can switch at any time, and each browser tab can be a different person.Manent has no features that write for you, and your scripts are never used to train AI.Read the AI pledge";
  act(() => clock.advance(149));
  expect(placeholders()).toEqual([]);
  expect(container.textContent).toBe(heading);
  act(() => clock.advance(1));
  expect(placeholders().map((p) => p.getAttribute("aria-hidden"))).toEqual([
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
  ]);
  expect(container.textContent).toBe(heading);
  await act(async () => {
    answer(CHOICES);
    await pending;
  });
  await settle();
  // a placeholder, once shown, stays its least time
  act(() => clock.advance(300));
  expect(placeholders()).toEqual([]);
  expect(buttons(container).map((b) => b.textContent)).toEqual([
    "DRDana ReyesHead writer",
    "LMLeo MarshExecutive, reader and commenter",
    "Read the AI pledge",
  ]);
});
