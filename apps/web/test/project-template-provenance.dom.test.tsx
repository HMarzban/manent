// Unit & DOM tests for TemplateRow Custom indicator + undoable template switch, project-setting provenance, and remote toast.
import { withDom } from "@manent/testkit/dom";
import { createDoc, jsonMap } from "@manent/crdt";
import type { CrdtDoc, ProjectIndexMap } from "@manent/crdt";
import { createMemoryBag } from "@manent/settings";
import type { Bag } from "@manent/settings";
import {
  CommandsProvider,
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  PREFERENCES_WORDS,
  PROJECT_WORDS,
  SettingsProvider,
  TimingProvider,
  formatDate,
} from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ProjectIndex } from "../src/project/project-index.ts";
import { createProjectSettingsBag } from "../src/project/settings-bag.ts";
import {
  applyTemplateSwitch,
  captureTemplateSnapshot,
  divergesFromTemplate,
  restoreTemplateSnapshot,
  templateDefaultsFor,
} from "../src/project/template-defaults.ts";
import { announcing } from "../src/screens/document/setting-messages.ts";
import { ProjectRow } from "../src/screens/project-settings/project-format-cards.tsx";
import { createProjectStore } from "../src/screens/project-settings/project-store.ts";
import { useRemoteProjectSettingMessages } from "../src/screens/project-settings/remote-project-messages.ts";
import { TemplateRow } from "../src/screens/project-settings/template-row.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";
import { fakeHandle, turn } from "./sync.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

function fakeProjectIndex(projectId: string, doc: CrdtDoc): ProjectIndex {
  const handle = fakeHandle(`index:project:${projectId}`, doc);
  return {
    projectId,
    handle: async () => handle,
    map: async (name: ProjectIndexMap) => jsonMap(doc, name),
    close: async () => {},
  };
}

async function mountInRouter(
  services: PersonServices,
  environment: ReturnType<typeof testEnvironment>,
  renderNode: () => ReactNode,
): Promise<HTMLElement> {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: renderNode });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const timing = { now: environment.now, schedule: environment.schedule };
  await act(async () => {
    root!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <TimingProvider timing={timing}>
                <QueryClientProvider client={queries}>
                  <RouterProvider router={router} />
                </QueryClientProvider>
              </TimingProvider>
            </CommandsProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
    await router.load();
  });
  return host;
}

describe("TemplateRow and per-template defaults", () => {
  test("detects divergence from template defaults, shows Custom badge, resets, and restores on Undo", async () => {
    const environment = testEnvironment();
    const services = testServices({ userId: "dana", environment });
    const rawStore = createProjectStore({
      bag: createMemoryBag({
        initial: { "project.template": "drama" },
        writable: () => true,
      }),
      canChange: true,
      guard: environment.guard,
    });
    const store = announcing(rawStore, services);

    const el = await mountInRouter(services, environment, () => (
      <SettingsProvider store={store}>
        <TemplateRow settingKey="project.template" projectId="harbour" />
      </SettingsProvider>
    ));

    // Fresh Drama project shows no Custom badge.
    expect(divergesFromTemplate(store)).toBe(false);
    expect(el.querySelector("[data-template-custom]")).toBeNull();
    expect(el.textContent).not.toContain(
      PROJECT_WORDS.templateDiffers("Drama"),
    );

    // Customising Element style and Target length diverges from Drama.
    await act(async () => {
      store.set("project.style", {
        scene_heading: {
          capitalized: null,
          underlined: null,
          bold: null,
          colour: null,
          spaceBefore: 3,
          indent: null,
          width: null,
        },
      });
      store.set("project.targetPages", 75);
    });

    expect(divergesFromTemplate(store)).toBe(true);
    expect(el.querySelector("[data-template-custom]")?.textContent).toBe(
      "Custom",
    );
    expect(el.textContent).toContain(PROJECT_WORDS.templateDiffers("Drama"));

    // Clicking Reset reapplies Drama defaults cleanly and registers full Undo.
    const resetBtn = [...el.querySelectorAll("button")].find(
      (btn) => btn.textContent?.trim() === PREFERENCES_WORDS.reset,
    );
    expect(resetBtn).toBeDefined();
    await act(async () => {
      resetBtn!.click();
    });

    expect(divergesFromTemplate(store)).toBe(false);
    expect(el.querySelector("[data-template-custom]")).toBeNull();
    expect(store.get("project.style")).toEqual({});
    expect(store.get("project.targetPages")).toBe(58);
    expect(store.get("project.acts")).toEqual(
      templateDefaultsFor("drama")["project.acts"],
    );
    expect(store.get("project.ladder")).toEqual(HISTORY_WORDS.seriesLadder);
    expect(services.messages.current()?.text).toBe("Template is now Drama.");

    // Undo puts back every custom value and brings the Custom badge back.
    await act(async () => {
      services.reverses.run("setting_changed");
    });
    expect(store.get("project.targetPages")).toBe(75);
    expect(store.get("project.style")).toEqual({
      scene_heading: {
        capitalized: null,
        underlined: null,
        bold: null,
        colour: null,
        spaceBefore: 3,
        indent: null,
        width: null,
      },
    });
    expect(divergesFromTemplate(store)).toBe(true);
    expect(el.querySelector("[data-template-custom]")?.textContent).toBe(
      "Custom",
    );
  });

  test("switching templates applies per-template defaults and supports full snapshot Undo", () => {
    const environment = testEnvironment();
    const store = createProjectStore({
      bag: createMemoryBag({
        initial: { "project.template": "drama", "project.targetPages": 70 },
        writable: () => true,
      }),
      canChange: true,
      guard: environment.guard,
    });

    expect(divergesFromTemplate(store)).toBe(true);
    const snapshot = captureTemplateSnapshot(store);
    expect(applyTemplateSwitch(store, "multi_camera")).toBe(true);
    expect(store.get("project.template")).toBe("multi_camera");
    expect(store.get("project.targetPages")).toBe(44);
    expect(store.get("project.acts")).toEqual([
      "Cold Open",
      "Act One",
      "Act Two",
      "Tag",
    ]);
    expect(store.get("project.ladder")).toEqual(HISTORY_WORDS.seriesLadder);
    expect(divergesFromTemplate(store)).toBe(false);

    // Switching to Custom preserves current settings without flagging divergence.
    expect(applyTemplateSwitch(store, "custom")).toBe(true);
    expect(store.get("project.template")).toBe("custom");
    expect(store.get("project.targetPages")).toBe(44);
    expect(divergesFromTemplate(store)).toBe(false);

    // Restoring the snapshot reverts back to Drama with the prior custom target length.
    restoreTemplateSnapshot(store, snapshot);
    expect(store.get("project.template")).toBe("drama");
    expect(store.get("project.targetPages")).toBe(70);
    expect(store.explain("project.acts").source).toBe("default");
    expect(divergesFromTemplate(store)).toBe(true);
  });
});

describe("Project-setting provenance and remote toast", () => {
  test("createProjectSettingsBag stores additive provenance in settings_meta and syncs it across replicas", async () => {
    const danaDoc = createDoc({ clientId: 1 });
    const samDoc = createDoc({ clientId: 2 });
    const setAt = Date.UTC(2026, 9, 27, 14, 0, 0);

    const danaBag = createProjectSettingsBag({
      index: fakeProjectIndex("harbour", danaDoc),
      userId: "dana",
      now: () => setAt,
    });
    const samBag = createProjectSettingsBag({
      index: fakeProjectIndex("harbour", samDoc),
      userId: "sam",
      now: () => setAt + 5_000,
    });
    await turn();

    const received: { keys: readonly string[]; origin: string }[] = [];
    samBag.subscribe((keys, origin) => received.push({ keys, origin }));

    const beforeSv = samDoc.encodeStateVector();
    danaBag.write({ "project.targetPages": 58 });
    expect(danaBag.provenance("project.targetPages")).toEqual({
      at: setAt,
      on: null,
      byUserId: "dana",
      was: null,
    });

    samDoc.applyUpdate(danaDoc.diff(beforeSv), "remote");
    expect(samBag.read()["project.targetPages"]).toBe(58);
    expect(samBag.provenance("project.targetPages")).toEqual({
      at: setAt,
      on: null,
      byUserId: "dana",
      was: null,
    });
    expect(received).toEqual([
      { keys: ["project.targetPages"], origin: "remote" },
    ]);
  });

  test("ProjectRow renders Set by provenance for another owner's change and announces a calm remote toast", async () => {
    const setAt = Date.UTC(2026, 9, 27, 14, 0, 0);
    const environment = testEnvironment({ now: () => setAt + 60_000 });
    const services = testServices({ userId: "sam", environment });

    const danaDoc = createDoc({ clientId: 1 });
    const samDoc = createDoc({ clientId: 2 });
    const danaBag = createProjectSettingsBag({
      index: fakeProjectIndex("harbour", danaDoc),
      userId: "dana",
      now: () => setAt,
    });
    const samBag = createProjectSettingsBag({
      index: fakeProjectIndex("harbour", samDoc),
      userId: "sam",
      now: () => setAt + 60_000,
    });
    await turn();

    const store = createProjectStore({
      bag: samBag,
      canChange: true,
      guard: environment.guard,
    });
    const people = [
      { userId: "dana", name: "Dana Reyes" },
      { userId: "sam", name: "Sam Okafor" },
    ];

    function Harness(props: { bag: Bag }): ReactNode {
      useRemoteProjectSettingMessages({
        bag: props.bag,
        projectTitle: "Harbour Lights",
        projectKind: "series",
        people,
        userId: services.userId,
        messages: services.messages,
      });
      return (
        <SettingsProvider store={store}>
          <ProjectRow
            settingKey="project.targetPages"
            projectId="harbour"
            people={people}
          />
        </SettingsProvider>
      );
    }

    const el = await mountInRouter(services, environment, () => (
      <Harness bag={samBag} />
    ));

    // Initial hydration emits no toast and shows no Set by line.
    expect(services.messages.current()).toBeNull();
    expect(
      el.querySelector('[data-project-provenance="project.targetPages"]'),
    ).toBeNull();

    // Dana remotely changes target length to 58 pages.
    const sv = samDoc.encodeStateVector();
    danaBag.write({ "project.targetPages": 58 });
    await act(async () => {
      samDoc.applyUpdate(danaDoc.diff(sv), "remote");
    });

    const expectedSetBy = DOCUMENT_WORDS.setBy(
      "Dana Reyes",
      formatDate(setAt),
      "No target",
    );
    expect(
      el.querySelector('[data-project-provenance="project.targetPages"]')
        ?.textContent,
    ).toBe(expectedSetBy);
    expect(services.messages.current()).toMatchObject({
      text: PROJECT_WORDS.otherSettingChanged(
        "Dana",
        "target length",
        "58 pages",
        "Harbour Lights",
      ),
      lifetime: "brief",
      ownWork: false,
      actions: [],
    });

    // Dana remotely changes Scene Heading style -> calm style toast.
    const sv2 = samDoc.encodeStateVector();
    danaBag.write({
      "project.style": {
        scene_heading: {
          capitalized: false,
          underlined: null,
          bold: null,
          colour: null,
          spaceBefore: null,
          indent: null,
          width: null,
        },
      },
    });
    await act(async () => {
      samDoc.applyUpdate(danaDoc.diff(sv2), "remote");
    });
    expect(services.messages.current()?.text).toBe(
      PROJECT_WORDS.otherStyleChanged(
        "Dana",
        "Scene Heading",
        "Harbour Lights",
        null,
      ),
    );

    // Sam's own local change hides "Set by" for self and produces no remote toast.
    services.messages.withdraw("project_setting_changed");
    await act(async () => {
      store.set("project.targetPages", 60);
    });
    expect(
      el.querySelector('[data-project-provenance="project.targetPages"]'),
    ).toBeNull();
    expect(services.messages.current()).toBeNull();
  });
});
