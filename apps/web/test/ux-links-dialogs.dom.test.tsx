import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { VersionItem } from "@manent/sync-protocol";
import {
  HISTORY_WORDS,
  LINKS_WORDS,
  SHARING_WORDS,
  createMessageQueue,
  createValue,
} from "@manent/ui";
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
import { createRestoreFlow } from "../src/history/restore-flow.ts";
import type { HistorySource } from "../src/history/source.ts";
import { VersionLink } from "../src/links/version-link.tsx";
import { PageRowMenu } from "../src/production/page-row-menu.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { JoinScreen } from "../src/sharing/join-screen.tsx";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();

let root: Root | null = null;
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  document.body.replaceChildren();
});

async function mountInRouter(options: {
  initialPath: string;
  path: string;
  render: () => ReactNode;
  services?: PersonServices;
}): Promise<{
  container: HTMLElement;
  pathname: () => string;
}> {
  const environment = testEnvironment();
  const services =
    options.services ?? testServices({ userId: "dana", environment });
  const rootRoute = createRootRoute();
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: options.path,
    component: () => (
      <ServicesProvider services={services}>
        {options.render()}
      </ServicesProvider>
    ),
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-home="true" />,
  });
  const docRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/s/$docId",
    component: () => <div data-doc="true" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute, homeRoute, docRoute]),
    history: createMemoryHistory({ initialEntries: [options.initialPath] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <EnvironmentProvider environment={environment}>
        <RouterProvider router={router} />
      </EnvironmentProvider>,
    );
  });
  return { container, pathname: () => router.state.location.pathname };
}

test("JoinScreen refusal renders EmptyHeroCard with heading and Back to Library action", async () => {
  const { container, pathname } = await mountInRouter({
    initialPath: "/join/tok",
    path: "/join/$token",
    render: () => (
      <JoinScreen outcome={{ ok: false, reason: "link_revoked" }} />
    ),
  });

  expect(container.querySelector("h1")?.textContent).toBe(
    LINKS_WORDS.linkUnavailable,
  );
  expect(container.textContent).toContain(SHARING_WORDS.linkRevoked);
  const backButton = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === LINKS_WORDS.backToLibrary,
  );
  expect(backButton).not.toBeUndefined();
  await act(async () => {
    backButton?.click();
  });
  expect(pathname()).toBe("/");
});

test("VersionLink missing version renders EmptyHeroCard with alert, Open current script, and Back to Library", async () => {
  const environment = testEnvironment();
  const base = testServices({ userId: "dana", environment });
  const services: PersonServices = {
    ...base,
    history: {
      ...base.history,
      rows: () =>
        createValue({
          rows: [],
          state: { kind: "empty" },
          othersCanOpen: true,
        }),
      content: async () => null,
    },
  };

  const { container, pathname } = await mountInRouter({
    initialPath: "/s/doc-1/v/missing-ver",
    path: "/s/$docId/v/$versionId",
    render: () => <VersionLink />,
    services,
  });
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

  expect(container.querySelector("h1")?.textContent).toBe(
    LINKS_WORDS.versionUnavailable,
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    LINKS_WORDS.notInHistory,
  );
  const openCurrent = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === LINKS_WORDS.openScript,
  );
  const backLibrary = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === LINKS_WORDS.backToLibrary,
  );
  expect(openCurrent).not.toBeUndefined();
  expect(backLibrary).not.toBeUndefined();
  await act(async () => {
    openCurrent?.click();
  });
  expect(pathname()).toBe("/s/doc-1");
});

test("createRestoreFlow uses short Restore action label on full-script confirm", async () => {
  const seen: { title: string; action: string }[] = [];
  const source = {
    rows: () =>
      createValue({
        rows: [],
        state: { kind: "ready" },
        othersCanOpen: true,
      }),
    restore: async () => ({ ok: true as const, beforeVersionId: "b1" }),
  } as unknown as HistorySource;
  const flow = createRestoreFlow({
    source,
    messages: createMessageQueue(testEnvironment()),
    confirm: async (req) => {
      seen.push({ title: req.title, action: req.action });
      return true;
    },
    versionRef: () => "the version from Wed 16:50",
    sceneNumber: () => "14",
  });
  const version: VersionItem = {
    id: "v1",
    kind: "auto",
    name: null,
    createdByUserId: "dana",
    createdAt: 1000,
    onDevice: false,
    position: { generation: 1, seq: 1 },
    engineVersion: 1,
    summary: null,
  };
  await flow.restore("doc-1", version, { kind: "script" });
  expect(seen).toEqual([
    {
      title: "Restore the version from Wed 16:50?",
      action: HISTORY_WORDS.restore,
    },
  ]);
});

test("PageRowMenu renders Lucide icon instead of raw Unicode ellipsis", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "dana", environment });
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <PageRowMenu label="12A" onOpen={() => {}}>
            {(handle) => <div>{handle}</div>}
          </PageRowMenu>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  const button = container.querySelector("button");
  expect(button).not.toBeNull();
  expect(button?.querySelector("svg")).not.toBeNull();
  expect(button?.textContent).not.toContain("⋯");
});
