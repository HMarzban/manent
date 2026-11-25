import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import type { RundownJSON } from "@manent/schema";
import type { DocHandle, DocStatus, ViewHandle } from "@manent/sync-client";
import {
  CommandsProvider,
  PROMPTER_WORDS,
  RUNDOWN_WORDS,
  SettingsProvider,
  TimingProvider,
  createValue,
} from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
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
import { RundownScreen } from "../src/rundown/screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { DocumentServices, ProjectKind } from "../src/services/ports.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import {
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

const DOC_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const STORY_A = "33333333-3333-4333-8333-333333333333";
const STORY_B = "33333333-3333-4333-8333-333333333334";
const ROW_H1 = "44444444-4444-4444-8444-444444444441";
const ROW_1 = "44444444-4444-4444-8444-444444444442";
const ROW_2 = "44444444-4444-4444-8444-444444444443";
const ROW_3 = "44444444-4444-4444-8444-444444444444";

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => {
    panelsActions.close("side");
    mounted?.unmount();
  });
  mounted = null;
  globalThis.fetch = originalFetch;
});

function sampleProjectedRundown(nowMs: number): RundownJSON {
  const airAt = new Date(2026, 10, 17, 23, 35, 0).getTime();
  return {
    rundown: {
      airDate: "2026-11-17",
      airAt,
      windowLeadMs: 3_600_000,
      targetMs: 10 * 60 * 1000,
    },
    columns: [...SHOW_COLUMNS],
    rows: [
      {
        id: ROW_H1,
        order: "A",
        kind: "header",
        cells: {
          segment: {
            value: "ACT ONE",
            userId: "sam",
            setAt: nowMs - 10_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: null,
        prompter: null,
        unnumbered: false,
      },
      {
        id: ROW_1,
        order: "B",
        kind: "script",
        cells: {
          segment: {
            value: "Monologue",
            userId: "sam",
            setAt: nowMs - 5_000,
            previous: {
              value: "Cold Open",
              userId: "dana",
              setAt: nowMs - 60_000,
            },
          },
        },
        docId: STORY_A,
        blockId: null,
        durationMs: 618_000,
        prompter: {
          state: "changed",
          versionId: "v-1",
          sentAt: nowMs - 20_000,
          sentByUserId: "sam",
        },
        unnumbered: false,
      },
      {
        id: ROW_2,
        order: "C",
        kind: "script",
        cells: {
          segment: {
            value: "Desk Bit",
            userId: "sam",
            setAt: nowMs - 5_000,
            previous: null,
          },
        },
        docId: STORY_B,
        blockId: null,
        durationMs: 30_000,
        prompter: {
          state: "on",
          versionId: "v-2",
          sentAt: nowMs - 15_000,
          sentByUserId: "sam",
        },
        unnumbered: false,
      },
      {
        id: ROW_3,
        order: "D",
        kind: "item",
        cells: {
          segment: {
            value: "Band sting",
            userId: "sam",
            setAt: nowMs - 5_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: null,
        prompter: null,
        unnumbered: false,
      },
    ],
  };
}

function mockDescribe(role: "view" | "comment"): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/docs/describe")) {
      return new Response(JSON.stringify({ role, capabilities: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/docs/people")) {
      return new Response(
        JSON.stringify({
          people: [
            { userId: "sam", name: "Sam Okafor" },
            { userId: "dana", name: "Dana Reyes" },
            { userId: "leo", name: "Leo Park" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function mountViewerRundown(options: {
  role: "view" | "comment";
  initial: RundownJSON;
  nowMs?: number;
}) {
  const nowMs = options.nowMs ?? new Date(2026, 10, 17, 23, 0, 0).getTime();
  mockDescribe(options.role);

  const rundownVal = createValue<RundownJSON | null>(options.initial);
  const airWindowVal = createValue<{ startsAt: number; endsAt: number } | null>(
    {
      startsAt: new Date(2026, 10, 17, 22, 35, 0).getTime(),
      endsAt: new Date(2026, 10, 17, 23, 45, 0).getTime(),
    },
  );
  const viewStatus = createValue({
    link: "online" as const,
    live: true,
    role: options.role,
  });
  const viewHandle: ViewHandle = {
    docId: DOC_ID,
    blocks: createValue([]),
    rundown: rundownVal,
    airWindow: airWindowVal,
    status: viewStatus,
    viewers: createValue(1),
    close() {},
  };

  // Deliberately empty CRDT doc to prove Can view/Can comment reads 100% from ViewHandle.rundown
  const emptyCrdt = createDoc();
  const handleStatus = createValue<DocStatus>({
    saved: true,
    docSync: "synced",
    link: "online",
    waiting: 0,
    synced: true,
    wentOfflineAt: null,
    neverSynced: false,
    recovered: 0,
    side: ["read_only"],
  });
  const docHandle = {
    docId: DOC_ID,
    doc: () => emptyCrdt,
    status: handleStatus,
    readOnly: createValue<ViewHandle | null>(viewHandle),
    viewers: createValue(1),
    on: () => () => {},
    sendAwareness: () => {},
    onAwareness: () => () => {},
    close: async () => {},
  } as unknown as DocHandle;

  const privateDoc = createDoc();
  let rundownOpens = 0;
  const statusFacts: StatusFacts = {
    access: options.role,
    device: "ok",
    network: "online",
    server: "synced",
    waiting: 0,
    notSent: 0,
    offlineSinceAt: null,
    neverSynced: false,
    shell: "web",
    toReview: 0,
    now: nowMs,
  };
  const docServices: DocumentServices = {
    status: createValue(statusFacts),
    waitingByScene: createValue([]),
    stateFacts: createValue([]),
    scriptBag: {
      read: () => ({}),
      provenance: () => null,
      write: () => {},
      subscribe: () => () => {},
      canWrite: () => false,
    },
    people: createValue([]),
    viewers: createValue(1),
    material: {
      materialSnapshotOf: () => ({ alternates: {}, cuts: {}, notes: [] }),
      moveScene: () => ({ ok: false, reason: "not_found" }),
    },
  };

  const environment = testEnvironment({
    now: () => nowMs,
    shellState: createValue({
      ...INITIAL_SHELL_STATE,
      screen: "document" as const,
      docId: DOC_ID,
    }),
  });
  bindGuard(environment.guard);
  const nav = createNavigation({
    routeId: "/s/$docId",
    href: `/s/${DOC_ID}`,
    search: {},
  });
  const baseServices = testServices({
    userId: "leo",
    environment,
    router: nav.navigation,
  });
  const services = {
    ...baseServices,
    openHandle: async (id: string) => {
      if (id === DOC_ID) {
        rundownOpens += 1;
        return docHandle;
      }
      return { ...docHandle, docId: id, doc: () => privateDoc } as DocHandle;
    },
    onDevice: async () => new Set<string>(),
    library: {
      ...baseServices.library,
      documentTitle: () => createValue("Tue 17 Nov"),
      documentKind: () => createValue<ProjectKind | null>("show"),
      docKindOf: () => createValue("rundown" as const),
      documentProject: () => createValue(PROJECT_ID),
      projects: () =>
        createValue([
          {
            projectId: PROJECT_ID,
            title: "The Late Desk",
            kind: "show" as const,
            firstDocId: DOC_ID,
            lastEdited: { byName: "Sam", at: nowMs },
            place: { kind: "synced" as const },
          },
        ]),
    },
  };

  const factsStore = createFactsStore({
    guard: environment.guard,
    frame: environment.frame,
  });
  const rootRoute = createRootRoute({
    component: () => (
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <TimingProvider
                timing={{
                  now: environment.now,
                  schedule: environment.schedule,
                }}
              >
                <FactsContext value={factsStore.selectors}>
                  <RundownScreen
                    docId={DOC_ID}
                    kind="rundown"
                    doc={docServices}
                  />
                </FactsContext>
              </TimingProvider>
            </CommandsProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>
    ),
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/s/$docId",
      component: () => null,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/s/${DOC_ID}`] }),
  });
  await router.load();

  const host = document.createElement("div");
  document.body.innerHTML = "";
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted!.render(<RouterProvider router={router} />);
  });
  return { host, rundownVal, getRundownOpens: () => rundownOpens };
}

test("Can view renders live projected rundown grid, updates on ViewHandle patches, and omits Send, Restore and mutating row actions", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const initial = sampleProjectedRundown(nowMs);
  const { host, rundownVal, getRundownOpens } = await mountViewerRundown({
    role: "view",
    initial,
    nowMs,
  });

  await until(() => host.querySelector('[role="grid"]') !== null);

  // Title bar reads View only; state bar shows live timings and air window
  expect(
    host.querySelector('[data-region="title_bar"]')?.textContent,
  ).toContain(RUNDOWN_WORDS.viewOnly);
  expect(
    host.querySelector('[data-region="state_bar"]')?.textContent,
  ).toContain("Air 23:35 · Target 10:00 · Over 0:48");
  expect(
    host.querySelector('[data-region="state_bar"]')?.textContent,
  ).toContain(RUNDOWN_WORDS.airWindow);

  // Prompter column shows status readouts without any Send button (only the row-menu trigger lives in the last cell)
  const prompter1 = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="prompter"]`,
  );
  const prompter2 = host.querySelector(
    `[data-row-id="${ROW_2}"][data-col-id="prompter"]`,
  );
  expect(prompter1?.textContent).toContain(PROMPTER_WORDS.changed);
  expect(prompter1?.textContent).not.toContain(PROMPTER_WORDS.send);
  expect(
    prompter1?.querySelectorAll('[data-tour="prompter.send"]').length,
  ).toBe(0);
  expect(
    [...(prompter1?.querySelectorAll("button") ?? [])].map((b) =>
      b.getAttribute("aria-label"),
    ),
  ).toEqual(["Monologue — row menu"]);
  expect(prompter2?.textContent).toContain(PROMPTER_WORDS.onPrompter);
  expect(
    prompter2?.querySelectorAll('[data-tour="prompter.send"]').length,
  ).toBe(0);
  expect(
    [...(prompter2?.querySelectorAll("button") ?? [])].map((b) =>
      b.getAttribute("aria-label"),
    ),
  ).toEqual(["Desk Bit — row menu"]);

  // Live ViewHandle patch updates the grid immediately
  await act(async () => {
    rundownVal.set({
      ...initial,
      rows: initial.rows.map((r) =>
        r.id === ROW_1
          ? {
              ...r,
              cells: {
                ...r.cells,
                segment: { ...r.cells.segment!, value: "Updated Monologue" },
              },
            }
          : r,
      ),
    });
  });
  await until(() => host.textContent?.includes("Updated Monologue") ?? false);
  expect(host.textContent).toContain("Updated Monologue");

  // Row menu on script row with previous value shows ONLY Open beside & Previous value (no Move/Delete/Send/Start script)
  const row1Menu = host.querySelector(
    'button[aria-label="Updated Monologue — row menu"]',
  ) as HTMLButtonElement;
  expect(row1Menu).not.toBeNull();
  await act(async () => {
    row1Menu.click();
  });
  await until(() => document.querySelectorAll('[role="menuitem"]').length > 0);
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map(
      (el) => el.textContent,
    ),
  ).toEqual(["Open beside", "Previous value"]);

  // Item row with no previous value has no dead menu button
  expect(
    host.querySelector('button[aria-label="Band sting — row menu"]'),
  ).toBeNull();

  // Opening Previous value shows previous text, omits Restore button, and focuses panel with data-arrival & tabIndex=-1
  const prevItem = [...document.querySelectorAll('[role="menuitem"]')].find(
    (el) => el.textContent === "Previous value",
  ) as HTMLElement;
  await act(async () => {
    prevItem.click();
  });
  await until(
    () => document.querySelector('[data-surface="cell_popover"]') !== null,
  );
  const popover = document.querySelector(
    '[data-surface="cell_popover"]',
  ) as HTMLElement;
  expect(popover.textContent).toContain("Was Cold Open");
  expect(popover.textContent).not.toContain(RUNDOWN_WORDS.restore);
  expect(popover.querySelector("button")).toBeNull();
  expect(popover.getAttribute("tabindex")).toBe("-1");
  expect(popover.hasAttribute("data-arrival")).toBe(true);
  expect(document.activeElement).toBe(popover);

  // Typing on a grid cell in Can view does not open an editor or mutate the cell
  const segCell = host.querySelector(
    `[data-row-id="${ROW_1}"][data-col-id="segment"]`,
  ) as HTMLElement;
  await act(async () => {
    segCell.focus();
    segCell.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", bubbles: true }),
    );
  });
  expect(segCell.querySelector("input")).toBeNull();
  expect(segCell.textContent).toContain("Updated Monologue");

  // Details → Rundown renders full-contrast read-only fields (zero opacity-50) and does not open an extra write handle
  const opensBeforeDetails = getRundownOpens();
  await act(async () => {
    panelsActions.open("side", "details");
  });
  await until(() => host.querySelector('[data-tour="rundown:air"]') !== null);
  const sidePanel = host.querySelector('[data-region="side_panel"]')!;
  expect(sidePanel.querySelector(".opacity-50")).toBeNull();
  expect(getRundownOpens()).toBe(opensBeforeDetails);
});

test("Can comment renders the live projected rundown grid in read-only mode", async () => {
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const { host } = await mountViewerRundown({
    role: "comment",
    initial: sampleProjectedRundown(nowMs),
    nowMs,
  });

  await until(() => host.querySelector('[role="grid"]') !== null);
  expect(
    host.querySelector('[data-region="title_bar"]')?.textContent,
  ).toContain(RUNDOWN_WORDS.viewOnly);
  expect(host.textContent).toContain("Monologue");
  expect(host.textContent).not.toContain(RUNDOWN_WORDS.cannotOpenWithRole);
});
