import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import {
  CommandsProvider,
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
import { HeaderFooterRow } from "../src/screens/document/header-footer-row.tsx";
import { LinesPerPageRow } from "../src/screens/document/layout-engine-row.tsx";
import { PrivateView } from "../src/screens/library/private-view.tsx";
import { TrashView } from "../src/screens/library/trash-view.tsx";
import { ApiKeysGroup } from "../src/screens/workspace-settings/api-keys-group.tsx";
import { NotificationsGroup } from "../src/screens/workspace-settings/notifications-group.tsx";
import { PeopleGroup } from "../src/screens/workspace-settings/people-group.tsx";
import { workspacePeopleHolder } from "../src/screens/workspace-settings/workspace-api.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { privateProjectPicker } from "../src/services/sync/private-folder.ts";
import { writePerson } from "../src/session.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { typeInto } from "./document-frame.fixtures.tsx";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => privateProjectPicker.close());
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

function requestMeta(
  input: string | URL | Request,
  init?: RequestInit,
): { url: string; method: string } {
  if (input instanceof Request) return { url: input.url, method: input.method };
  return { url: String(input), method: (init?.method ?? "GET").toUpperCase() };
}

function mount(
  services: PersonServices,
  environment: ReturnType<typeof testEnvironment>,
  node: ReactNode,
): { rerender(next: ReactNode): void } {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const timing = { now: environment.now, schedule: environment.schedule };
  const draw = (child: ReactNode): void => {
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
                  {child}
                </QueryClientProvider>
              </CommandsProvider>
            </SettingsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  };
  act(() => draw(node));
  return { rerender: (next) => act(() => draw(next)) };
}

async function mountRoute(
  services: PersonServices,
  environment: ReturnType<typeof testEnvironment>,
  renderNode: () => ReactNode,
  initialHref = "/",
): Promise<void> {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: renderNode });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [initialHref] }),
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

test("late API key creation response after switching workspaces never reveals the previous workspace's key", async () => {
  const environment = testEnvironment();
  writePerson(environment.tabStorage, {
    userId: "dana",
    name: "Dana Reyes",
    token: "tok-dana",
  });
  const services = testServices({ userId: "dana", environment });
  let resolveCreate: ((response: Response) => void) | null = null;
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const { url, method } = requestMeta(input, init);
        if (url.includes("/api/workspace/api-keys") && method === "POST") {
          return new Promise<Response>((resolve) => {
            resolveCreate = resolve;
          });
        }
        return Response.json({ keys: [] });
      },
      { preconnect: () => {} },
    ),
  );

  try {
    const mounted = mount(
      services,
      environment,
      <ApiKeysGroup workspaceId="ws-a" canChange online />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const input = host!.querySelector<HTMLInputElement>("input")!;
    act(() => input.focus());
    typeInto(input, "Build script");
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    act(() => submit.click());
    expect(resolveCreate).not.toBeNull();

    // Switch to workspace B before ws-a's create resolves
    mounted.rerender(<ApiKeysGroup workspaceId="ws-b" canChange online />);
    await act(async () => {
      resolveCreate!(
        Response.json({
          row: {
            id: "k1",
            name: "Build script",
            createdAt: 100,
            lastUsedAt: null,
            revokedAt: null,
          },
          key: "manent_secret_from_ws_a",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host!.textContent).not.toContain("manent_secret_from_ws_a");
  } finally {
    fetchSpy.mockRestore();
  }
});

test("late notification save response after switching workspaces never posts a saved notice for the old workspace", async () => {
  const environment = testEnvironment();
  writePerson(environment.tabStorage, {
    userId: "dana",
    name: "Dana Reyes",
    token: "tok-dana",
  });
  const services = testServices({ userId: "dana", environment });
  let resolveSave: ((response: Response) => void) | null = null;
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const { url, method } = requestMeta(input, init);
        if (url.includes("/api/workspace/notifications") && method === "POST") {
          return new Promise<Response>((resolve) => {
            resolveSave = resolve;
          });
        }
        return Response.json({
          adapters: [
            {
              adapter: "webhook",
              on: false,
              available: true,
              hint: null,
              state: null,
              nextTryAt: null,
            },
          ],
        });
      },
      { preconnect: () => {} },
    ),
  );

  try {
    const mounted = mount(
      services,
      environment,
      <NotificationsGroup workspaceId="ws-a" canChange online />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const input = host!.querySelector<HTMLInputElement>("input")!;
    act(() => input.focus());
    typeInto(input, "https://hooks.example.test/abc");
    const saveBtn = [...host!.querySelectorAll("button")].find(
      (b) => b.textContent === "Save",
    )!;
    act(() => saveBtn.click());
    expect(resolveSave).not.toBeNull();

    mounted.rerender(
      <NotificationsGroup workspaceId="ws-b" canChange online />,
    );
    await act(async () => {
      resolveSave!(Response.json({ adapters: [] }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(services.messages.current()).toBeNull();
  } finally {
    fetchSpy.mockRestore();
  }
});

test("PeopleGroup suppresses stale load errors offline and gives role triggers uniform w-36 width", () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "dana", environment });
  const holder = workspacePeopleHolder("dana", "ws-people-test");
  holder.set({
    people: [{ userId: "sam", name: "Sam Okafor", role: "edit" }],
    loadError: true,
  });

  mount(
    services,
    environment,
    <PeopleGroup workspaceId="ws-people-test" canChange online={false} />,
  );

  expect(host!.querySelector('[role="alert"]')).toBeNull();
  const trigger = host!.querySelector('[data-slot="select-trigger"]');
  expect(trigger?.className).toContain("w-36");
});

test("PrivateView close button uses Close label", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  privateProjectPicker.open();
  await mountRoute(
    services,
    environment,
    () => (
      <PrivateView
        workspaceId="medium"
        continueList={[]}
        projects={[]}
        problem={false}
      />
    ),
    "/?view=private",
  );
  expect(host!.querySelector('button[aria-label="Close"]')).not.toBeNull();
});

test("TrashView reaches 1 day left when one full day remains", async () => {
  const environment = testEnvironment({ now: () => 10_000 });
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
      list: async () => ({
        ok: true,
        items: [
          {
            docId: "d1",
            workspaceId: "medium",
            title: "Slack Water",
            kind: "script",
            deletedAt: 5_000,
            deletedByUserId: "sam",
            deletedByName: "Sam Okafor",
            purgeAfterAt: 10_000 + 86_400_000,
          },
        ],
      }),
    },
  };

  await mountRoute(services, environment, () => (
    <TrashView
      workspaceId="medium"
      continueList={[]}
      projects={[]}
      problem={false}
    />
  ));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(host!.textContent).toContain("1 day left");
});

test("LinesPerPageRow shows a leading alert icon on range refusal and HeaderFooterRow renders without spurious Custom announcement", () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });
  const scriptStore = services.openScriptStore("doc-1");
  const mounted = mount(
    { ...services, settings: scriptStore },
    environment,
    <LinesPerPageRow settingKey="script.linesPerPage" docId="doc-1" />,
  );
  const numInput = host!.querySelector<HTMLInputElement>(
    'input[type="number"]',
  )!;
  act(() => numInput.focus());
  typeInto(numInput, "3");
  act(() => {
    numInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  const alert = host!.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  expect(alert!.querySelector("svg")).not.toBeNull();

  mounted.rerender(<HeaderFooterRow settingKey="script.header" />);
  expect(services.messages.current()).toBeNull();
});
