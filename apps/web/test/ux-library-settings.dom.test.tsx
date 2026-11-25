import { withDom } from "@manent/testkit/dom";
import {
  CommandsProvider,
  SEARCH_WORDS,
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
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ElementStyleRow } from "../src/project/style-editor.tsx";
import { FavouritesView } from "../src/screens/library/favourites-view.tsx";
import { LibraryStatusBar } from "../src/screens/library/library-status-bar.tsx";
import { PrivateView } from "../src/screens/library/private-view.tsx";
import { ProjectList } from "../src/screens/library/project-list.tsx";
import { SeasonSection } from "../src/screens/library/series/season-section.tsx";
import { AccountPane } from "../src/screens/preferences/account-pane.tsx";
import { KeyboardPane } from "../src/screens/preferences/keyboard-pane.tsx";
import { SearchFilterMenu } from "../src/search/filter-menu.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices, ProjectItem } from "../src/services/ports.ts";
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
): Promise<void> {
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
          <TimingProvider timing={timing}>
            <SettingsProvider store={services.settings}>
              <CommandsProvider
                service={services.commands}
                resolved={services.resolved}
                platform="mac"
              >
                <QueryClientProvider client={queries}>
                  <RouterProvider router={router} />
                </QueryClientProvider>
              </CommandsProvider>
            </SettingsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
    await router.load();
  });
}

test("SearchFilterMenu renders Filter with a Lucide chevron and no raw Unicode triangle", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  await mountInRouter(services, environment, () => (
    <SearchFilterMenu
      query=""
      folders={[]}
      now={environment.now}
      onChangeQuery={() => {}}
    />
  ));
  expect(SEARCH_WORDS.filterButton).toBe("Filter");
  const trigger = host!.querySelector<HTMLButtonElement>(
    '[data-tour="search:filter"]',
  );
  expect(trigger?.textContent).toBe("Filter");
  expect(trigger?.textContent).not.toContain("▾");
  expect(trigger?.querySelector("svg")).not.toBeNull();
});

test("ProjectList unifies plain projects into a single Projects table even around Series projects", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  const now = environment.now();
  const projects: ProjectItem[] = [
    {
      projectId: "p1",
      title: "Game samples",
      kind: "game",
      firstDocId: "d1",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
    {
      projectId: "p2",
      title: "Harbour Lights",
      kind: "series",
      firstDocId: "d2",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
    {
      projectId: "p3",
      title: "The Long Night",
      kind: "film",
      firstDocId: "d3",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
  ];
  await mountInRouter(services, environment, () => (
    <ProjectList projects={projects} shell="web" now={now} open={() => {}} />
  ));
  const headings = [...host!.querySelectorAll("h2")].filter(
    (h) => h.textContent === "Projects",
  );
  expect(headings.length).toBe(1);
});

test("Favourites and Private empty states render centred EmptyHeroCard with single CTA on Private", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  await mountInRouter(services, environment, () => (
    <FavouritesView
      workspaceId="medium"
      continueList={[]}
      projects={[]}
      problem={false}
    />
  ));
  expect(host!.querySelector("h2")?.textContent).toBe("Favourites");
  expect(host!.querySelector("svg")).not.toBeNull();

  act(() => root!.unmount());
  root = null;
  host?.remove();

  await mountInRouter(services, environment, () => (
    <PrivateView
      workspaceId="medium"
      continueList={[]}
      projects={[]}
      problem={false}
    />
  ));
  expect(host!.querySelector("h2")?.textContent).toBe("Private");
  const buttons = [...host!.querySelectorAll("button")].map(
    (b) => b.textContent,
  );
  expect(buttons).toEqual(["New script"]);
});

test("LibraryStatusBar shows project count summary when all projects are on this device", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  const now = environment.now();
  const projects: ProjectItem[] = [
    {
      projectId: "p1",
      title: "The Long Night",
      kind: "film",
      firstDocId: "d1",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
    {
      projectId: "p2",
      title: "Game samples",
      kind: "game",
      firstDocId: "d2",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
  ];
  await mountInRouter(services, environment, () => (
    <LibraryStatusBar projects={projects} />
  ));
  expect(host!.textContent).toContain("2 projects");
});

test("SeasonSection gives its heading full-width wrap room on narrow containers and ElementStyleRow uses single column below sm", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  const projectStore = services.openScriptStore("proj-1");
  await mountInRouter(services, environment, () => (
    <>
      <SeasonSection
        projectId="harbour"
        projectTitle="Harbour Lights"
        season={{ id: "s2", number: 2, title: null }}
        episodes={[]}
        targetPages={55}
        canEdit
        creating={false}
        people={[]}
        lastEditedByDoc={new Map()}
        placeByDoc={new Map()}
        shell="web"
        now={environment.now()}
        open={() => {}}
        onSaveEpisode={() => {}}
        onNewEpisode={() => {}}
        onNewSeason={() => {}}
      />
      <SettingsProvider store={projectStore}>
        <ElementStyleRow settingKey="project.style" projectId="harbour" />
      </SettingsProvider>
    </>
  ));
  const heading = host!.querySelector("h2");
  expect(heading?.className).toContain("basis-full");
  const styleGrid = host!.querySelector(
    '[data-tour="setting:project.style"] .grid',
  );
  expect(styleGrid?.className).toContain("grid-cols-1");
});

test("KeyboardPane hides desktop-only commands on web and AccountPane aligns action rows symmetrically", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  await mountInRouter(services, environment, () => (
    <>
      <KeyboardPane deviceName={null} onShortcuts={() => {}} />
      <AccountPane />
    </>
  ));
  expect(host!.textContent).not.toContain("Open in browser");
  const signOutBtn = [...host!.querySelectorAll("button")].find(
    (b) => b.textContent === "Sign out" || b.textContent === "Sign in to sync",
  );
  expect(signOutBtn?.parentElement?.className).toContain("justify-between");
});
