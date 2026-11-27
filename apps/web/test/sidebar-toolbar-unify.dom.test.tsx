import { withDom } from "@manent/testkit/dom";
import { afterEach, describe, expect, test } from "bun:test";
import {
  ACCOUNT_WORDS,
  CommandsProvider,
  LIBRARY_FILES_WORDS,
  SettingsProvider,
  TimingProvider,
  TooltipProvider,
  createValue,
} from "@manent/ui";
import type { StateFact, StatusFacts } from "@manent/ui";
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
import { SignOutDialogHost } from "../src/account/sign-out-dialog.tsx";
import {
  closeSignOutPrompt,
  openSignOutPrompt,
} from "../src/account/sign-out-store.ts";
import { RundownTitleBar } from "../src/rundown/rundown-title-bar.tsx";
import { BoardTitleBar } from "../src/screens/board/board-bars.tsx";
import { TitleBar } from "../src/screens/document/title-bar.tsx";
import { HistoryScreenBar } from "../src/screens/history/history-screen-bar.tsx";
import { ContinueList } from "../src/screens/library/continue-list.tsx";
import { FavouritesView } from "../src/screens/library/favourites-view.tsx";
import {
  PROJECT_DRAG_MIME,
  endProjectDrag,
} from "../src/screens/library/folder-dnd.ts";
import { FolderView } from "../src/screens/library/folder-view.tsx";
import { LibraryNav } from "../src/screens/library/library-nav.tsx";
import { LibraryScreen } from "../src/screens/library/library-screen.tsx";
import { ProjectList } from "../src/screens/library/project-list.tsx";
import { SendFrame, SendLayout } from "../src/screens/send/send-frame.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  ContinueItem,
  DocumentServices,
  PersonServices,
  ProjectItem,
} from "../src/services/ports.ts";
import type { FolderEntry } from "../src/services/sync/folders.ts";
import { SettingsShell } from "../src/settings-shell/settings-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { materialActions } from "../src/state/material.store.ts";
import { workspaceActions } from "../src/state/workspace.store.ts";
import { createMemoryBag } from "@manent/settings";
import {
  createClock,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  endProjectDrag();
  closeSignOutPrompt();
  workspaceActions.set("writable");
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

const NOW = new Date(2026, 10, 27, 12, 0).getTime();

const LONG_NIGHT: ProjectItem = {
  projectId: "proj-night",
  title: "The Long Night",
  kind: "film",
  firstDocId: "doc-night",
  lastEdited: { byName: "Dana", at: NOW - 60_000 },
  place: { kind: "synced" },
};

const HARBOUR: ProjectItem = {
  projectId: "proj-harbour",
  title: "Harbour Lights",
  kind: "film",
  firstDocId: "doc-harbour",
  lastEdited: { byName: "Dana", at: NOW - 120_000 },
  place: { kind: "synced" },
};

const NIGHT_CONTINUE: ContinueItem = {
  docId: "doc-night",
  title: "The Long Night",
  projectTitle: "The Long Night",
  kind: "film",
  place: { kind: "synced" },
};

const ACTIVE_FOLDER: FolderEntry = {
  id: "folder-active",
  name: "In production",
  parentId: null,
  createdAt: NOW - 10_000,
  createdByUserId: "dana",
};

const SUB_FOLDER: FolderEntry = {
  id: "folder-sub",
  name: "Season 1",
  parentId: "folder-active",
  createdAt: NOW - 5_000,
  createdByUserId: "dana",
};

function makeDragEvent(type: string): Event {
  const store = new Map<string, string>();
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      effectAllowed: "all",
      dropEffect: "none",
      setData: (mime: string, data: string) => store.set(mime, data),
      getData: (mime: string) => store.get(mime) ?? "",
      types: [PROJECT_DRAG_MIME],
    },
  });
  return event;
}

async function mountInApp(
  services: PersonServices,
  environment: ReturnType<typeof testEnvironment>,
  renderNode: () => ReactNode,
  initialHref = "/?w=ws1",
): Promise<HTMLElement> {
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
                <TooltipProvider>
                  <QueryClientProvider client={queries}>
                    <RouterProvider router={router} />
                  </QueryClientProvider>
                </TooltipProvider>
              </CommandsProvider>
            </SettingsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
    await router.load();
  });
  return host;
}

function withFolderStubs(
  base: PersonServices,
  options: {
    folders?: readonly FolderEntry[];
    projectFolders?: ReadonlyMap<string, string | null>;
    favCount?: number;
  } = {},
) {
  const moves: {
    workspaceId: string;
    projectId: string;
    folderId: string | null;
  }[] = [];
  const folderList = createValue<readonly FolderEntry[]>(
    options.folders ?? [ACTIVE_FOLDER],
  );
  const folderMap = createValue<ReadonlyMap<string, string | null>>(
    options.projectFolders ?? new Map(),
  );
  const favEntries = Array.from({ length: options.favCount ?? 0 }, (_, i) => ({
    id: i === 0 ? LONG_NIGHT.projectId : `proj-${i}`,
    kind: "project" as const,
    workspaceId: "ws1",
    favouritedAt: NOW - i,
  }));
  const services: PersonServices = {
    ...base,
    personName: "Dana Reyes",
    personSignedIn: true,
    library: {
      ...base.library,
      projects: () => createValue([LONG_NIGHT, HARBOUR]),
      continueList: () => createValue([NIGHT_CONTINUE]),
      documentProject: (docId) =>
        createValue(
          docId === NIGHT_CONTINUE.docId ? LONG_NIGHT.projectId : null,
        ),
      documentTitle: () => createValue("The Long Night"),
    },
    favourites: {
      ...base.favourites,
      list: () => createValue(favEntries),
    },
    folders: {
      ...base.folders,
      list: () => folderList,
      projectFolders: () => folderMap,
      moveProject: async (workspaceId, projectId, folderId) => {
        const previousFolderId = folderMap.get().get(projectId) ?? null;
        moves.push({ workspaceId, projectId, folderId });
        const next = new Map(folderMap.get());
        next.set(projectId, folderId);
        folderMap.set(next);
        return { previousFolderId };
      },
    },
  };
  return { services, moves, folderMap };
}

describe("Mature Library sidebar and drag-to-folder", () => {
  test("renders leading icons for Continue, Favourites, Private, Trash and New folder, with count on Favourites only when > 0", async () => {
    const env = testEnvironment({ dom: createShellDom(document) });
    const base = testServices({ userId: "dana", environment: env });
    const { services } = withFolderStubs(base, {
      folders: [ACTIVE_FOLDER],
      projectFolders: new Map([[HARBOUR.projectId, ACTIVE_FOLDER.id]]),
      favCount: 2,
    });

    const el = await mountInApp(services, env, () => (
      <LibraryNav
        workspaceId="ws1"
        current="continue"
        projects={[LONG_NIGHT, HARBOUR]}
      />
    ));

    const navRows = [...el.querySelectorAll(".mn-row")];
    const rowByText = (text: string) =>
      navRows.find((r) => r.textContent?.includes(text));

    // Continue, Favourites, Private and Trash all carry leading SVG icons
    for (const label of ["Continue", "Favourites", "Private", "Trash"]) {
      const row = rowByText(label);
      expect(row).toBeDefined();
      expect(row?.querySelector("[data-leading] svg")).not.toBeNull();
    }

    // Continue has no trailing count; Favourites shows "2"; Private (0) shows no count
    expect(rowByText("Continue")?.textContent).toBe("Continue");
    expect(rowByText("Favourites")?.textContent).toBe("Favourites2");
    expect(rowByText("Private")?.textContent).toBe("Private");

    // Folder shows direct item count "1"
    expect(rowByText("In production")?.textContent).toBe("In production1");

    // New folder button carries FolderPlusIcon
    const newFolderBtn = el.querySelector('[data-tour="library.newFolder"]');
    expect(newFolderBtn?.querySelector("svg")).not.toBeNull();
  });

  test("drags a ProjectRow into a sidebar folder, moves it via moveProjectWithUndo, and reveals drop-to-root for foldered projects", async () => {
    const clock = createClock(NOW);
    const env = testEnvironment({
      dom: createShellDom(document),
      now: clock.now,
      schedule: clock.schedule,
    });
    const base = testServices({ userId: "dana", environment: env });
    const { services, moves } = withFolderStubs(base, {
      folders: [ACTIVE_FOLDER, SUB_FOLDER],
      projectFolders: new Map([[HARBOUR.projectId, ACTIVE_FOLDER.id]]),
    });

    const el = await mountInApp(services, env, () => (
      <div className="flex">
        <LibraryNav
          workspaceId="ws1"
          current="continue"
          projects={[LONG_NIGHT, HARBOUR]}
        />
        <ContinueList items={[NIGHT_CONTINUE]} shell="web" open={() => {}} />
        <ProjectList
          projects={[LONG_NIGHT, HARBOUR]}
          shell="web"
          now={NOW}
          open={() => {}}
        />
      </div>
    ));

    const folderTarget = el.querySelector<HTMLElement>(
      `[data-folder-id="${ACTIVE_FOLDER.id}"]`,
    )!;
    const draggables = [
      ...el.querySelectorAll<HTMLElement>('[draggable="true"]'),
    ];
    expect(draggables.length).toBeGreaterThanOrEqual(2);

    // 1. Drag The Long Night (from ContinueRow) onto In production folder
    const continueDraggable =
      el
        .querySelector('section[aria-label="Continue"]')
        ?.querySelector<HTMLElement>('[draggable="true"]') ?? null;
    expect(continueDraggable).not.toBeNull();

    act(() => {
      continueDraggable!.dispatchEvent(makeDragEvent("dragstart"));
    });
    act(() => {
      folderTarget.dispatchEvent(makeDragEvent("dragover"));
    });
    expect(folderTarget.getAttribute("data-drop-target")).toBe("active");

    // Collapsed folder with children auto-expands after 500 ms drag-over
    act(() => clock.advance(500));
    expect(el.textContent).toContain("Season 1");

    await act(async () => {
      folderTarget.dispatchEvent(makeDragEvent("drop"));
    });
    expect(moves).toEqual([
      {
        workspaceId: "ws1",
        projectId: LONG_NIGHT.projectId,
        folderId: ACTIVE_FOLDER.id,
      },
    ]);
    expect(services.messages.current()?.text).toBe(
      LIBRARY_FILES_WORDS.movedToFolder(LONG_NIGHT.title, ACTIVE_FOLDER.name),
    );

    // 2. Dragging Harbour Lights (inside ACTIVE_FOLDER) reveals drop-to-root strip and moves it to null
    const harbourSidebarDraggable = [
      ...el
        .querySelector('[data-tour="library:folders"]')!
        .querySelectorAll<HTMLElement>('[draggable="true"]'),
    ].find((node) => node.textContent?.includes(HARBOUR.title))!;
    expect(harbourSidebarDraggable).toBeDefined();

    act(() => {
      harbourSidebarDraggable.dispatchEvent(makeDragEvent("dragstart"));
    });
    const rootDrop = el.querySelector<HTMLElement>("[data-drop-root]")!;
    expect(rootDrop).not.toBeNull();
    act(() => {
      rootDrop.dispatchEvent(makeDragEvent("dragover"));
    });
    expect(rootDrop.getAttribute("data-drop-target")).toBe("active");
    await act(async () => {
      rootDrop.dispatchEvent(makeDragEvent("drop"));
    });
    expect(moves.at(-1)).toEqual({
      workspaceId: "ws1",
      projectId: HARBOUR.projectId,
      folderId: null,
    });
  });

  test("disables project dragging when workspace is read-only", async () => {
    const env = testEnvironment({ dom: createShellDom(document) });
    const base = testServices({ userId: "dana", environment: env });
    const { services } = withFolderStubs(base);
    workspaceActions.set("read_only");

    const el = await mountInApp(services, env, () => (
      <LibraryNav
        workspaceId="ws1"
        current="continue"
        projects={[LONG_NIGHT]}
      />
    ));
    expect(el.querySelectorAll('[draggable="true"]').length).toBe(0);
  });

  test("zero-learning-curve view headers appear on non-empty Favourites and Folder views", async () => {
    const env = testEnvironment({ dom: createShellDom(document) });
    const base = testServices({ userId: "dana", environment: env });
    const { services } = withFolderStubs(base, {
      folders: [ACTIVE_FOLDER, SUB_FOLDER],
      projectFolders: new Map([[LONG_NIGHT.projectId, ACTIVE_FOLDER.id]]),
      favCount: 1,
    });

    const el = await mountInApp(
      services,
      env,
      () => (
        <>
          <FavouritesView
            workspaceId="ws1"
            continueList={[]}
            projects={[LONG_NIGHT]}
            problem={false}
          />
          <FolderView
            workspaceId="ws1"
            continueList={[]}
            projects={[LONG_NIGHT]}
            problem={false}
          />
        </>
      ),
      `/?w=ws1&view=folder&folder=${ACTIVE_FOLDER.id}`,
    );

    expect(el.textContent).toContain(LIBRARY_FILES_WORDS.favouritesNote);
    expect(el.textContent).toContain("In production");
    expect(el.textContent).toContain("1 folder · 1 project");
  });
});

describe("Unified main toolbar and universal PersonMenu avatar", () => {
  const statusFacts: StatusFacts = {
    access: "edit",
    device: "ok",
    network: "online",
    server: "synced",
    waiting: 0,
    notSent: 0,
    offlineSinceAt: null,
    neverSynced: false,
    shell: "web",
    toReview: 0,
    now: NOW,
  };

  function stubDoc(): DocumentServices {
    return {
      status: createValue(statusFacts),
      waitingByScene: createValue([]),
      stateFacts: createValue<readonly StateFact[]>([]),
      scriptBag: createMemoryBag({ initial: {}, writable: () => true }),
      people: createValue([]),
      viewers: createValue(0),
      material: materialActions,
    };
  }

  test("every app screen toolbar renders the trailing PersonMenu avatar and identity header on open", async () => {
    const env = testEnvironment({ dom: createShellDom(document) });
    const base = testServices({ userId: "dana", environment: env });
    const { services } = withFolderStubs(base);
    const doc = stubDoc();

    const screens: readonly [string, () => ReactNode][] = [
      [
        "Library",
        () => (
          <LibraryScreen
            api={fakeApi({
              me: async () => ({
                ok: true,
                me: {
                  userId: "dana",
                  name: "Dana Reyes",
                  workspaces: [
                    { id: "ws1", name: "Writers' room", seeding: null },
                  ],
                },
              }),
            })}
            person={{ token: "tok", userId: "dana", name: "Dana Reyes" }}
          />
        ),
      ],
      ["Document", () => <TitleBar docId="doc-night" doc={doc} />],
      [
        "Rundown",
        () => (
          <RundownTitleBar docId="doc-night" doc={doc} title="Show · 27 Nov" />
        ),
      ],
      [
        "Board",
        () => (
          <BoardTitleBar
            projectTitle="Harbour Lights"
            seasons={[]}
            activeSeason={null}
            canEdit={true}
            showViewOnly={false}
            onBack={() => {}}
            onSeasonChange={() => {}}
            onAddStoryline={() => {}}
          />
        ),
      ],
      [
        "History",
        () => (
          <HistoryScreenBar
            docId="doc-night"
            title="The Long Night"
            isRundown={false}
            canEdit={true}
            selectedRow={null}
            offeredVersionId={null}
            onBack={() => {}}
          />
        ),
      ],
      [
        "Settings",
        () => (
          <SettingsShell
            backLabel="‹ Library"
            onBack={() => {}}
            title="Preferences"
            navLabel="Preferences"
            navMode="tabs"
            navItems={[{ id: "writing", label: "Writing" }]}
            activeNavId="writing"
            onSelectNav={() => {}}
          >
            <p>Content</p>
          </SettingsShell>
        ),
      ],
      [
        "Send",
        () => (
          <SendLayout
            place={{ name: "The Long Night", back: () => {} }}
            side={null}
          >
            <SendFrame
              title="Export"
              aside={null}
              rows={[]}
              pages={null}
              hidePages
              action={{
                label: "Export",
                busyLabel: "Exporting…",
                busy: false,
                disabledReason: null,
                problem: null,
                progress: null,
                cancel: null,
                run: () => {},
              }}
            />
          </SendLayout>
        ),
      ],
    ];

    for (const [name, renderScreen] of screens) {
      const el = await mountInApp(services, env, renderScreen);
      const avatarTrigger = el.querySelector<HTMLButtonElement>(
        '[data-tour="title:account"] button',
      );
      expect(
        avatarTrigger,
        `${name} should render account avatar trigger`,
      ).not.toBeNull();
      expect(avatarTrigger?.textContent).toBe("DR");

      // Open account menu and verify identity header + Preferences
      await act(async () => {
        avatarTrigger!.click();
      });
      const menu = document.body.querySelector('[role="menu"]');
      expect(menu?.textContent, `${name} account menu header`).toContain(
        "Dana Reyes",
      );
      expect(menu?.textContent, `${name} account menu status`).toContain(
        ACCOUNT_WORDS.signedIn,
      );
      expect(menu?.textContent, `${name} account menu Preferences`).toContain(
        "Preferences",
      );

      act(() => root?.unmount());
      root = null;
      host?.remove();
      host = null;
    }
  });

  test("mounting two SignOutDialogHost instances simultaneously renders strictly one guard dialog", async () => {
    const env = testEnvironment({ dom: createShellDom(document) });
    const services = testServices({ userId: "dana", environment: env });
    await mountInApp(services, env, () => (
      <>
        <SignOutDialogHost />
        <SignOutDialogHost />
      </>
    ));

    act(() => {
      openSignOutPrompt({
        totalWaiting: 2,
        scripts: [],
        services,
        now: env.now,
        onConfirm: () => closeSignOutPrompt(),
        onCancel: () => closeSignOutPrompt(),
      });
    });

    expect(document.body.querySelectorAll('[role="alertdialog"]').length).toBe(
      1,
    );
  });
});
