import "@manent/testkit/dom";
import { COMMANDS, createCommandService, menuModel } from "@manent/commands";
import type { CommandContext } from "@manent/commands";
import {
  CommandsProvider,
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  TooltipProvider,
  WRITING_TOOLS_WORDS,
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
import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { startReaderReadAloud } from "../src/read-aloud/runner.ts";
import { RundownFooterBar } from "../src/rundown/rundown-footer-bar.tsx";
import { BoardTitleButton } from "../src/screens/document/board-title-button.tsx";
import { LibraryNav } from "../src/screens/library/library-nav.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { ProjectKind } from "../src/services/ports.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
});

function baseContext(over: Partial<CommandContext> = {}): CommandContext {
  return {
    screen: "document",
    focus: "page",
    docOpen: true,
    role: "editor",
    online: true,
    platform: "mac",
    shell: "web",
    demo: false,
    signedIn: true,
    workspace: "writable",
    panelOpen: { left: false, side: false },
    historyPresent: false,
    format: "screenplay",
    rulerShown: false,
    layoutView: "page",
    spaceBeforeSet: false,
    zoom: null,
    zoomPercent: null,
    docKind: "script",
    projectKind: "film",
    outlineStart: false,
    writing: { position: "everyone", othersHaveAccess: true },
    material: {
      caretInSpeech: true,
      alternates: 0,
      selection: false,
      cuts: 0,
    },
    rundown: null,
    prompter: null,
    inTrash: false,
    canDelete: false,
    focusMode: false,
    readingAloud: false,
    sprintRunning: false,
    production: null,
    ...over,
  };
}

function makeService(ctx: CommandContext, ran: string[] = []) {
  const handlers: Record<string, () => void> = {};
  for (const def of COMMANDS) {
    handlers[def.id] = () => {
      ran.push(def.id);
    };
  }
  return createCommandService({
    commands: COMMANDS,
    handlers,
    context: () => ctx,
    settings: { get: () => "light", set: () => ({ ok: true }) },
    bindings: () => new Map(),
    onDisabled: () => {},
  });
}

async function mountRouter(node: ReactNode) {
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const boardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$projectId/board",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, boardRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<RouterProvider router={router} />);
  });
  return router;
}

test("Web Title and View menus expose Writing, Tools, and Room driving on scripts while keeping rundowns clean", () => {
  const scriptService = makeService(baseContext());
  const titleItems = menuModel("title", COMMANDS, scriptService).groups.flat();
  expect(
    titleItems
      .filter((item) => item.submenu === "Writing")
      .map((item) => item.id),
  ).toEqual([
    "writing.forEveryone",
    "writing.asSuggestions",
    "writing.privately",
  ]);
  expect(
    titleItems
      .filter((item) => item.submenu === "Tools")
      .map((item) => item.id),
  ).toEqual([
    "script.renameCharacter",
    "readAloud.start",
    "script.reports",
    "alternate.show",
  ]);

  const viewItems = menuModel("view", COMMANDS, scriptService).groups.flat();
  expect(viewItems.map((item) => item.id)).toContain("view.presentToRoom");
  expect(viewItems.map((item) => item.id)).toContain("room.takeKeys");
  expect(viewItems.map((item) => item.id)).toContain("room.pitch");

  const rundownService = makeService(
    baseContext({
      docKind: "rundown",
      format: null,
      writing: null,
      material: null,
      rundown: {
        canEdit: true,
        selectedRows: 0,
        scriptRowSelected: false,
        editingCell: false,
      },
    }),
  );
  const rundownTitleIds = menuModel("title", COMMANDS, rundownService)
    .groups.flat()
    .map((item) => item.id);
  expect(rundownTitleIds).not.toContain("writing.forEveryone");
  expect(rundownTitleIds).not.toContain("script.renameCharacter");
  const rundownViewIds = menuModel("view", COMMANDS, rundownService)
    .groups.flat()
    .map((item) => item.id);
  expect(rundownViewIds).not.toContain("view.presentToRoom");
  expect(rundownViewIds).not.toContain("room.takeKeys");
  expect(rundownViewIds).not.toContain("room.pitch");
});

test("BoardTitleButton shows only for series episodes and navigates to the project board", async () => {
  const environment = testEnvironment();
  const kind = createValue<ProjectKind | null>("film");
  const project = createValue<string | null>("proj-1");
  const base = testServices({ userId: "sam", environment });
  const services = {
    ...base,
    library: {
      ...base.library,
      documentKind: () => kind,
      documentProject: () => project,
    },
  };

  const router = await mountRouter(
    <EnvironmentProvider environment={environment}>
      <ServicesProvider services={services}>
        <TooltipProvider>
          <BoardTitleButton docId="ep-1" />
        </TooltipProvider>
      </ServicesProvider>
    </EnvironmentProvider>,
  );

  expect(host!.querySelector("[data-tour='title:board']")).toBeNull();

  await act(async () => {
    kind.set("series");
  });
  const btn = host!.querySelector<HTMLButtonElement>(
    "[data-tour='title:board']",
  );
  expect(btn).not.toBeNull();
  expect(btn!.textContent).toContain("Board");
  await act(async () => {
    btn!.click();
  });
  expect(router.state.location.pathname).toBe("/p/proj-1/board");
});

test("RundownFooterBar renders Add row, Add header row, and Import rows only on non-empty editable rundowns", async () => {
  const environment = testEnvironment();
  const { resolved } = testServices({ userId: "sam", environment });
  const ran: string[] = [];
  const service = makeService(
    baseContext({
      docKind: "rundown",
      format: null,
      rundown: {
        canEdit: true,
        selectedRows: 1,
        scriptRowSelected: true,
        editingCell: false,
      },
    }),
    ran,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root!.render(
      <CommandsProvider service={service} resolved={resolved} platform="mac">
        <RundownFooterBar readOnly={true} hasRows={true} />
      </CommandsProvider>,
    );
  });
  expect(host.querySelector("[data-tour='rundown:footer']")).toBeNull();

  await act(async () => {
    root!.render(
      <CommandsProvider service={service} resolved={resolved} platform="mac">
        <RundownFooterBar readOnly={false} hasRows={false} />
      </CommandsProvider>,
    );
  });
  expect(host.querySelector("[data-tour='rundown:footer']")).toBeNull();

  await act(async () => {
    root!.render(
      <CommandsProvider service={service} resolved={resolved} platform="mac">
        <RundownFooterBar readOnly={false} hasRows={true} />
      </CommandsProvider>,
    );
  });
  const buttons = [
    ...host.querySelectorAll<HTMLButtonElement>(
      "[data-tour='rundown:footer'] button",
    ),
  ];
  expect(buttons.map((b) => b.textContent)).toEqual([
    "Add row",
    "Add header row",
    "Import rows from script",
  ]);
  await act(async () => {
    buttons[0]!.click();
    buttons[1]!.click();
    buttons[2]!.click();
  });
  expect(ran).toEqual([
    "rundown.addRow",
    "rundown.addHeaderRow",
    "rundown.importRows",
  ]);
});

test("LibraryNav mobile drawer opens, closes on Escape with focus restoration, and closes on view navigation", async () => {
  const environment = testEnvironment();
  const services = testServices({ userId: "sam", environment });

  function Harness(): ReactNode {
    const [open, setOpen] = useState(false);
    return (
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <CommandsProvider
            service={services.commands}
            resolved={services.resolved}
            platform="mac"
          >
            <button
              type="button"
              data-tour="library:nav-toggle"
              onClick={() => setOpen(true)}
            >
              {LIBRARY_WORDS.navigation}
            </button>
            <LibraryNav
              workspaceId="ws-1"
              current="continue"
              projects={[]}
              mobileOpen={open}
              onCloseMobile={() => {
                setOpen(false);
                document
                  .querySelector<HTMLButtonElement>(
                    "[data-tour='library:nav-toggle']",
                  )
                  ?.focus();
              }}
              drawerId="lib-drawer"
            />
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>
    );
  }

  await mountRouter(<Harness />);
  const toggle = host!.querySelector<HTMLButtonElement>(
    "[data-tour='library:nav-toggle']",
  )!;
  await act(async () => {
    toggle.click();
  });
  const drawer = host!.querySelector("[data-tour='library:nav-drawer']");
  expect(drawer).not.toBeNull();
  const closeBtn = drawer!.querySelector<HTMLButtonElement>(
    `button[aria-label="${LIBRARY_WORDS.closeNavigation}"]`,
  )!;
  expect(document.activeElement).toBe(closeBtn);

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(host!.querySelector("[data-tour='library:nav-drawer']")).toBeNull();
  expect(document.activeElement).toBe(toggle);

  // Reopen and choose Favourites → auto-closes drawer
  await act(async () => {
    toggle.click();
  });
  const favRow = [
    ...host!.querySelectorAll<HTMLElement>(
      "[data-tour='library:nav-drawer'] [role='button']",
    ),
  ].find((el) => el.textContent === LIBRARY_FILES_WORDS.favouritesHeading);
  expect(favRow).toBeDefined();
  await act(async () => {
    favRow!.click();
  });
  expect(host!.querySelector("[data-tour='library:nav-drawer']")).toBeNull();
});

test("startReaderReadAloud reports no-voice cleanly for anonymous reader links without services", () => {
  const queue = createMessageQueue({
    now: () => 0,
    schedule: () => () => {},
  });
  startReaderReadAloud(queue);
  const current = queue.current();
  expect(current?.text).toContain(WRITING_TOOLS_WORDS.readAloud);
  expect(current?.text).toContain(WRITING_TOOLS_WORDS.readAloudNoVoice);
});
