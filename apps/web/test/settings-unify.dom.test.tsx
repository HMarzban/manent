// Unified Settings System regression suite: SettingsShell, progressive ElementStyleRow, and Set by you return-to-tab.
import { withDom } from "@manent/testkit/dom";
import { createMemoryBag } from "@manent/settings";
import {
  CommandsProvider,
  PROJECT_WORDS,
  SettingsProvider,
  TimingProvider,
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
import { ElementStyleRow } from "../src/project/style-editor.tsx";
import { createProjectStore } from "../src/screens/project-settings/project-store.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { SettingsShell } from "../src/settings-shell/settings-shell.tsx";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

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
  });
  return host;
}

describe("SettingsShell", () => {
  test("preserves direct div > header > h1 and avoids double aria-current in links mode", async () => {
    const environment = testEnvironment();
    const services = testServices({ userId: "dana", environment });
    const el = await mountInRouter(services, environment, () => (
      <SettingsShell
        backLabel="‹ Library"
        onBack={() => {}}
        title="Writers' room · Workspace settings"
        navLabel="Workspace settings"
        navMode="links"
        navItems={[
          { id: "people", label: "People", href: "/w/medium/settings/people" },
          {
            id: "notifications",
            label: "Notifications",
            href: "/w/medium/settings/notifications",
          },
        ]}
        activeNavId="people"
        onSelectNav={() => {}}
      >
        <p>Body</p>
      </SettingsShell>
    ));

    const directH1 = el.querySelector("div > header > h1");
    expect(directH1?.textContent).toBe("Writers' room · Workspace settings");
    expect(el.querySelector("main")).not.toBeNull();
    // Only the <a> carries aria-current="page"; the inner .mn-row does not duplicate aria-current
    const currentEls = [...el.querySelectorAll("[aria-current]")];
    expect(currentEls).toHaveLength(1);
    expect(currentEls[0]?.tagName).toBe("A");
    expect(currentEls[0]?.getAttribute("aria-current")).toBe("page");
    const main = el.querySelector("main");
    expect(main?.className.includes("relative")).toBe(true);
    expect(main?.className.includes("overscroll-contain")).toBe(true);
    const bodyRow = main?.parentElement;
    expect(bodyRow?.className.includes("relative")).toBe(true);
    expect(bodyRow?.className.includes("overscroll-contain")).toBe(true);
  });
});

describe("ElementStyleRow", () => {
  test("collapses all elements by default with real format defaults, tracks changed count, and supports Reset all", async () => {
    const environment = testEnvironment();
    const services = testServices({ userId: "dana", environment });
    const store = createProjectStore({
      bag: createMemoryBag({ initial: {}, writable: () => true }),
      canChange: true,
      guard: environment.guard,
    });
    const el = await mountInRouter(services, environment, () => (
      <SettingsProvider store={store}>
        <ElementStyleRow settingKey="project.style" projectId="harbour" />
      </SettingsProvider>
    ));

    const rows = [...el.querySelectorAll("[data-element]")];
    expect(rows.length).toBeGreaterThan(5);
    const sceneHeading = el.querySelector('[data-element="scene_heading"]');
    expect(sceneHeading).not.toBeNull();
    const trigger = sceneHeading!.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    );
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    // Shows real format defaults instead of 48 opaque "As the format sets it" boxes
    expect(trigger?.textContent).toContain("Scene Heading");
    expect(trigger?.textContent).toContain("Capitals");
    expect(trigger?.textContent).toContain("1 line");
    // No expanded grid initially
    expect(
      el.querySelector('[data-tour="setting:project.style"] .grid'),
    ).toBeNull();

    // Expand Scene Heading and verify format default placeholders
    await act(async () => {
      trigger!.click();
    });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const spaceInput = sceneHeading!.querySelector<HTMLInputElement>(
      'input[inputmode="numeric"]',
    );
    expect(spaceInput).not.toBeNull();
    expect(spaceInput?.placeholder).toBe("Default: 1 line");

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
    });

    expect(el.textContent).toContain(PROJECT_WORDS.styleChangedCount(1));
    expect(trigger?.textContent).toContain(
      PROJECT_WORDS.styleValueSpaceBefore(3),
    );
    expect(sceneHeading!.querySelector(".mn-setting-dot")).not.toBeNull();

    // Reset all clears back to defaults
    const resetAllBtn = [...el.querySelectorAll("button")].find(
      (btn) => btn.textContent?.trim() === PROJECT_WORDS.styleResetAll,
    );
    expect(resetAllBtn).toBeDefined();
    await act(async () => {
      resetAllBtn!.click();
    });
    expect(store.get("project.style")).toEqual({});
    expect(el.textContent).not.toContain(PROJECT_WORDS.styleChangedCount(1));
  });

  test("lets non-owners expand elements to inspect styles while keeping controls disabled and Reset hidden", async () => {
    const environment = testEnvironment();
    const services = testServices({ userId: "sam", environment });
    const store = createProjectStore({
      bag: createMemoryBag({
        initial: {
          "project.style": {
            scene_heading: {
              capitalized: false,
              underlined: null,
              bold: null,
              colour: null,
              spaceBefore: 2,
              indent: null,
              width: null,
            },
          },
        },
        writable: () => false,
      }),
      canChange: false,
      guard: environment.guard,
    });
    const el = await mountInRouter(services, environment, () => (
      <SettingsProvider store={store}>
        <ElementStyleRow settingKey="project.style" projectId="harbour" />
      </SettingsProvider>
    ));

    expect(el.textContent).toContain(PROJECT_WORDS.styleChangedCount(1));
    expect(el.textContent).not.toContain(PROJECT_WORDS.styleResetAll);
    const sceneHeading = el.querySelector('[data-element="scene_heading"]');
    const trigger = sceneHeading!.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    );
    expect(trigger?.disabled).toBe(false);
    await act(async () => {
      trigger!.click();
    });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const inputs = [
      ...sceneHeading!.querySelectorAll<HTMLInputElement>('input[type="text"]'),
    ];
    expect(inputs.length).toBe(3);
    expect(inputs.every((input) => input.disabled)).toBe(true);
  });
});
