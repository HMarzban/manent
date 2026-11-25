import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import { readInk } from "@manent/formats";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
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
import { archiveSource } from "../src/archive/archive-source.ts";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { RootLayout } from "../src/root-layout.tsx";
import { SendScreen } from "../src/screens/send/send-screen.tsx";
import { EnvironmentProvider, useServices } from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  createClock,
  fakeApi,
  keepingSyncs,
  testEnvironment,
} from "./services.fixtures.ts";
import { fakeHandle } from "./sync.fixtures.ts";

withDom();

const LEO = { token: null, userId: "leo", name: "Leo Marsh" };
const noop = (): void => {};
const restores: (() => void)[] = [];
let mounted: Root | null = null;

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  for (const restore of restores.splice(0).toReversed()) restore();
});

let services: PersonServices | null = null;
function ServicesProbe(): ReactNode {
  services = useServices();
  return <h1 tabIndex={-1}>Library</h1>;
}

async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 2000 && !done(); turn++)
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

test("Ink Export hides the empty page-preview box and renders S4-IK-31/32 notices above the Export button", async () => {
  const clock = createClock();
  const { environment, started } = keepingSyncs(
    testEnvironment({
      dom: createShellDom(document),
      now: clock.now,
      schedule: clock.schedule,
      frame: (fn) => clock.schedule(fn, 16),
    }),
  );
  bindGuard(environment.guard);
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout api={fakeApi()} fetch={fetch} usePerson={usePerson} />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: ServicesProbe,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId",
        component: () => <h1 tabIndex={-1}>Logbook</h1>,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId/send/$form",
        component: () => <SendScreen />,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
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
  const [sync] = started;
  if (sync === undefined) throw new Error("no sync");
  const liveSync = await sync;
  await act(async () => {
    const wsHandle = await liveSync.client.open(
      indexDocId("workspace", "leo"),
      {
        create: {
          kind: "index",
          home: workspaceHome("leo"),
          workspaceId: null,
        },
      },
    );
    jsonMap(wsHandle.doc(), "projects").set("proj-g", {
      title: "Game samples",
      kind: "game",
      createdAt: 0,
      createdByUserId: "seed",
    });
    jsonMap(wsHandle.doc(), "documents").set("ink-doc", {
      projectId: "proj-g",
      title: "The Keeper's Logbook",
      kind: "ink",
      createdAt: 0,
      editedAt: null,
      editedByUserId: null,
    });
    await wsHandle.close();
  });
  act(() => {
    services?.openScriptStore("ink-doc").set("script.format", "ink");
  });

  let n = 0;
  const inkDoc = createDoc();
  scriptBody(inkDoc).write((w) =>
    w.insertBlocks(
      null,
      readInk("=== start ===\nHello.\n-> END\n", () => `b${++n}`),
    ),
  );
  const editor: LiveEditor = {
    docId: "ink-doc",
    doc: inkDoc,
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {
      publish: noop,
      subscribe: () => noop,
      subscribePeople: () => noop,
    },
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  };
  restores.push(registerLiveEditor(editor));

  const index = createDoc();
  jsonMap(index, "projects").set("proj-g", {
    title: "Game samples",
    kind: "game",
    createdAt: 1,
    createdByUserId: "leo",
  });
  jsonMap(index, "documents").set("ink-doc", {
    projectId: "proj-g",
    title: "The Keeper's Logbook",
    kind: "ink",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
  });
  jsonMap(index, "documents").set("ink-missing", {
    projectId: "proj-g",
    title: "Logbook — Act Two",
    kind: "ink",
    createdAt: 2,
    editedAt: null,
    editedByUserId: null,
  });
  const prevSource = archiveSource.get();
  archiveSource.set({
    api: fakeApi(),
    userId: "leo",
    openHandle: async (docId: string) =>
      fakeHandle(
        docId,
        docId === indexDocId("workspace", "leo") ? index : createDoc(),
      ),
    documentBlocks: async () => null,
  } as unknown as PersonServices);
  restores.push(() => {
    if (prevSource !== null) archiveSource.set(prevSource);
  });

  await act(() =>
    router.navigate({ href: "/s/ink-doc/send/export?as=ink_project" }),
  );
  await until(
    () =>
      container.textContent?.includes(
        "'Logbook — Act Two' isn't on this device, so the file leaves it out.",
      ) === true,
  );

  // Page preview section is hidden on Ink.
  expect(container.querySelector("section")).toBeNull();
  // S4-IK-32 sits outside the Checks <dl> row, above the Export button.
  expect(container.querySelector("dl")?.textContent).not.toContain(
    "isn't on this device",
  );
  const confirmButton = container.querySelector('[data-tour="send:confirm"]');
  expect(confirmButton?.parentElement?.parentElement?.textContent).toContain(
    "'Logbook — Act Two' isn't on this device, so the file leaves it out.",
  );
});
