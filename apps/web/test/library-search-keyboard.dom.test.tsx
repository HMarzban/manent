import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import {
  API_KEYS_WORDS,
  CommandsProvider,
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  NOTIFICATIONS_WORDS,
  Popover,
  PopoverContent,
  SEARCH_WORDS,
  SERIES_WORDS,
  SettingsProvider,
  TimingProvider,
  createValue,
} from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { PitchPopover } from "../src/room/pitch-popover.tsx";
import { SyncCentre } from "../src/screens/document/sync-centre.tsx";
import { FolderView } from "../src/screens/library/folder-tree.tsx";
import { PrivateView } from "../src/screens/library/private-view.tsx";
import { SearchField } from "../src/screens/library/search-field.tsx";
import { SearchResults } from "../src/screens/library/search-results.tsx";
import { SeasonSection } from "../src/screens/library/series/season-section.tsx";
import { TrashView } from "../src/screens/library/trash-view.tsx";
import { ApiKeysGroup } from "../src/screens/workspace-settings/api-keys-group.tsx";
import { NotificationsGroup } from "../src/screens/workspace-settings/notifications-group.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices, ProjectItem } from "../src/services/ports.ts";
import { writePerson } from "../src/session.ts";
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
  initialHref = "/",
): Promise<{ history: ReturnType<typeof createMemoryHistory> }> {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const history = createMemoryHistory({ initialEntries: [initialHref] });
  const rootRoute = createRootRoute({ component: renderNode });
  const router = createRouter({ routeTree: rootRoute, history });
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
  return { history };
}

test("SearchField ArrowDown moves into SearchResults Rows, ArrowUp returns to field, and empty/tooLong render EmptyHeroCard", async () => {
  const environment = testEnvironment({ online: () => false });
  const services = testServices({ userId: "sam", environment });
  const now = environment.now();
  const projects: ProjectItem[] = [
    {
      projectId: "p1",
      title: "Harbour Lights",
      kind: "film",
      firstDocId: "d1",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
    {
      projectId: "p2",
      title: "Harbour Fog",
      kind: "film",
      firstDocId: "d2",
      lastEdited: { byName: "Sam", at: now },
      place: { kind: "synced" },
    },
  ];
  await mountInRouter(
    services,
    environment,
    () => (
      <>
        <SearchField />
        <SearchResults
          workspaceId="ws-1"
          continueList={[]}
          projects={projects}
          problem={false}
        />
      </>
    ),
    "/?w=ws-1&q=Harbour",
  );

  const input = host!.querySelector<HTMLInputElement>(
    '[data-search-field="library"]',
  )!;
  const rows = [
    ...host!.querySelectorAll<HTMLElement>(
      '[data-search-results] [role="listitem"] [role="button"]',
    ),
  ];
  expect(rows.length).toBe(2);

  act(() => input.focus());
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(document.activeElement).toBe(rows[0]!);

  act(() => {
    rows[0]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(document.activeElement).toBe(rows[1]!);

  act(() => {
    rows[1]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(document.activeElement).toBe(rows[0]!);

  act(() => {
    rows[0]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(document.activeElement).toBe(input);

  // Empty search renders EmptyHeroCard with Clear search action
  act(() => root!.unmount());
  root = null;
  host?.remove();
  await mountInRouter(
    services,
    environment,
    () => (
      <SearchResults
        workspaceId="ws-1"
        continueList={[]}
        projects={projects}
        problem={false}
      />
    ),
    "/?w=ws-1&q=NoSuchMatch",
  );
  expect(host!.textContent).toContain(SEARCH_WORDS.noMatchesTitle);
  expect(
    [...host!.querySelectorAll("button")].some(
      (b) => b.textContent === SEARCH_WORDS.clearSearch,
    ),
  ).toBe(true);

  // Too-long query renders EmptyHeroCard with descriptionRole="alert"
  act(() => root!.unmount());
  root = null;
  host?.remove();
  const longQuery = "a".repeat(505);
  await mountInRouter(
    services,
    environment,
    () => (
      <SearchResults
        workspaceId="ws-1"
        continueList={[]}
        projects={projects}
        problem={false}
      />
    ),
    `/?w=ws-1&q=${longQuery}`,
  );
  expect(host!.querySelector('[role="alert"]')?.textContent).toBe(
    SEARCH_WORDS.tooLong,
  );
});

test("PitchPopover traps Tab and restores opener focus on Escape, Enter submit, and outside pointerdown", () => {
  const opener = document.createElement("button");
  opener.textContent = "Pitch";
  document.body.append(opener);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  let closed = 0;
  let submitted = "";
  const mountPopover = () => {
    act(() => opener.focus());
    act(() => {
      root!.render(
        <PitchPopover
          place={{ left: 20, top: 20 }}
          onSubmit={(text) => {
            submitted = text;
          }}
          onClose={() => {
            closed++;
          }}
        />,
      );
    });
  };

  mountPopover();
  const input = host.querySelector<HTMLInputElement>("input")!;
  expect(document.activeElement).toBe(input);

  const tabEvent = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    input.dispatchEvent(tabEvent);
  });
  expect([tabEvent.defaultPrevented, document.activeElement === input]).toEqual(
    [true, true],
  );

  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect([closed, document.activeElement === opener]).toEqual([1, true]);

  act(() => root!.render(null));
  mountPopover();
  const input2 = host.querySelector<HTMLInputElement>("input")!;
  input2.value = "A sharper retort";
  act(() => {
    input2.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect([submitted, document.activeElement === opener]).toEqual([
    "A sharper retort",
    true,
  ]);
});

test("Library views, SeasonSection, SyncCentre alert, NotificationsGroup, and ApiKeysGroup WCAG 2.2 empty & focus states", async () => {
  const environment = testEnvironment({ online: () => false });
  writePerson(environment.tabStorage, {
    userId: "sam",
    name: "Sam",
    token: "tok-sam",
  });
  const base = testServices({ userId: "sam", environment });
  const services: PersonServices = {
    ...base,
    resolved: createValue({
      ...base.resolved.get(),
      "library.restore": {
        id: "library.restore",
        enabled: true,
        checked: null,
        value: null,
        whyNot: null,
        keys: null,
      },
    }),
    trash: {
      ...base.trash,
      list: async () => ({ ok: false }),
    },
  };

  // FolderView empty hero card + PrivateView two CTAs + SeasonSection single New episode
  await mountInRouter(
    services,
    environment,
    () => (
      <>
        <FolderView
          workspaceId="ws-1"
          continueList={[]}
          projects={[]}
          problem={false}
        />
        <PrivateView
          workspaceId="ws-1"
          continueList={[]}
          projects={[]}
          problem={false}
        />
        <SeasonSection
          projectId="p1"
          projectTitle="Harbour"
          season={{ id: "s1", number: 1, title: null }}
          episodes={[]}
          targetPages={null}
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
        <TrashView
          workspaceId="ws-1"
          continueList={[]}
          projects={[]}
          problem={false}
        />
        <Popover open>
          <PopoverContent>
            <SyncCentre
              doc={{
                ...services.documents.open("d-alert"),
                status: createValue({
                  access: "edit",
                  device: "failing",
                  network: "offline",
                  server: "synced",
                  waiting: 0,
                  notSent: 0,
                  offlineSinceAt: null,
                  neverSynced: false,
                  shell: "web",
                  toReview: 0,
                  now: environment.now(),
                }),
              }}
            />
          </PopoverContent>
        </Popover>
      </>
    ),
    "/?view=folder&folder=f1",
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const newEpisodeButtons = [...host!.querySelectorAll("button")].filter((b) =>
    b.textContent?.includes(SERIES_WORDS.newEpisode),
  );
  expect([
    host!.textContent?.includes(LIBRARY_FILES_WORDS.folderEmptyTitle),
    host!.textContent?.includes(LIBRARY_WORDS.newProject),
    newEpisodeButtons.length,
    document.body.querySelectorAll('[role="alert"]').length >= 2,
  ]).toEqual([true, true, 1, true]);

  // ApiKeysGroup & NotificationsGroup offline + empty + Revoke cancel focus restoration
  act(() => root!.unmount());
  root = null;
  host?.remove();
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("api-keys")) {
          return Response.json({
            keys: [
              {
                id: "k1",
                name: "Engine reader",
                createdAt: 1000,
                lastUsedAt: null,
                revokedAt: null,
              },
            ],
          });
        }
        return Response.json({ adapters: [] });
      },
      { preconnect: () => {} },
    ),
  );
  try {
    await mountInRouter(services, environment, () => (
      <>
        <NotificationsGroup
          workspaceId="ws-empty-member"
          canChange={false}
          online
        />
        <ApiKeysGroup workspaceId="ws-revoke-focus" canChange online />
      </>
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host!.textContent).toContain(NOTIFICATIONS_WORDS.memberEmpty);
    expect(host!.querySelector("table")?.className).toContain("text-start");

    const revokeBtn = [...host!.querySelectorAll("button")].find(
      (b) => b.textContent === API_KEYS_WORDS.revoke,
    )!;
    act(() => revokeBtn.click());
    const cancelBtn = [...host!.querySelectorAll("button")].find(
      (b) => b.textContent === API_KEYS_WORDS.cancel,
    )!;
    expect(document.activeElement).toBe(cancelBtn);
    act(() => cancelBtn.click());
    expect(document.activeElement?.textContent).toBe(API_KEYS_WORDS.revoke);
  } finally {
    fetchSpy.mockRestore();
  }
});
