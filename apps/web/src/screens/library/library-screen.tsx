// The Library: the workspace switcher, its navigation and the view the address chooses, New script and New project, the
// person menu and the status bar.
import { TOUR, isShown } from "@manent/demo";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  CommandButton,
  DEMO_WORDS,
  LIBRARY_WORDS,
  createValue,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import type { Api } from "../../api.ts";
import { focusHeading } from "../../focus.ts";
import { useServices } from "../../services/context.tsx";
import type { ContinueItem, ProjectItem } from "../../services/ports.ts";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import type { TabPerson } from "../../session.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { SidePosition } from "../../shell/side-position.tsx";
import { panelsActions } from "../../state/panels.store.ts";
import { pageTitle } from "../../text.ts";
import { SIDE_PANEL_TABS } from "../document/side-tabs.ts";
import { ContinueView } from "./continue-list.tsx";
import { LibraryNav } from "./library-nav.tsx";
import { LibraryStatusBar } from "./library-status-bar.tsx";
import { NewProjectPopover } from "./new-project-popover.tsx";
import { PersonMenu } from "./person-menu.tsx";
import { SearchField } from "./search-field.tsx";
import { LIBRARY_VIEWS } from "./views.ts";
import type { LibraryViewProps } from "./views.ts";
import { WorkspaceSwitcher } from "./workspace-switcher.tsx";

// what the lists read while the workspace shown is not known yet
const NO_ITEMS: Subscribable<readonly never[]> = createValue([]);
const CACHED: Subscribable<"cached" | "problem"> = createValue("cached");
// a Tour that lists no scenario is not opened on its own
const TOUR_EMPTY = !TOUR.scenarios.some(isShown);

/**
 * The workspace shown: the one in the address, else the person's first, else the person's own desk; null while the
 * server has not yet said which workspaces a signed-in person has. `workspaces` is null for a person with no session, and
 * for a signed-in person until the server has listed them; `serverProblem` when it answered that it could not.
 */
function useShownWorkspace(
  api: Api,
  person: TabPerson,
): {
  workspaceId: string | null;
  workspaces: readonly WorkspaceRef[] | null;
  serverProblem: boolean;
} {
  const w = useRouterState({
    select: (state): unknown => state.location.search.w,
  });
  const signedIn = person.token !== null;
  // a person with no session has no workspaces to ask the server about
  const me = useWorkspaces(api, person.userId, signedIn);
  const known = signedIn ? (me.data ?? null) : null;
  const answered = !signedIn || me.data !== undefined || me.isError;
  const fallback = answered ? (known?.[0]?.id ?? person.userId) : null;
  return {
    workspaceId: typeof w === "string" ? w : fallback,
    workspaces: known,
    serverProblem: signedIn && me.isError,
  };
}

/** The view the address chooses: the search's while it holds one, else the one its `view` names, else Continue. */
function useChosenView(): ComponentType<LibraryViewProps> {
  const view = useRouterState({
    select: (state): unknown => state.location.search.view,
  });
  const q = useRouterState({
    select: (state): unknown => state.location.search.q,
  });
  const searching = typeof q === "string" && q !== "";
  const named = typeof view === "string" ? view : null;
  const chosen = LIBRARY_VIEWS.find((entry) =>
    entry.chosenBy === "q" ? searching : !searching && entry.id === named,
  );
  return chosen?.View ?? ContinueView;
}

/**
 * Opens the Tour in the side position the first time this person reaches the Library in demo mode, once the Tour lists
 * a scenario.
 */
function useTourOnFirstVisit(): void {
  const { flags, ready } = useServices();
  const demo = useCommandState("demo.tour").visible;
  useEffect(() => {
    if (!demo || TOUR_EMPTY) return;
    let shown = true;
    // the flags are known once the private index has been read
    void ready.then(() => {
      if (!shown || flags.has("tour_seen")) return;
      flags.set("tour_seen");
      panelsActions.open("side", "tour");
    });
    return () => {
      shown = false;
    };
  }, [demo, flags, ready]);
}

/** What the index holds for the workspace shown; nothing while it is not known. */
function useWorkspaceLists(workspaceId: string | null): {
  continueList: readonly ContinueItem[];
  projects: readonly ProjectItem[];
  problem: boolean;
} {
  const { library } = useServices();
  const known = workspaceId !== null;
  return {
    continueList: useSubscribable(
      known ? library.continueList(workspaceId) : NO_ITEMS,
    ),
    projects: useSubscribable(known ? library.projects(workspaceId) : NO_ITEMS),
    problem:
      useSubscribable(known ? library.loadState(workspaceId) : CACHED) ===
      "problem",
  };
}

/**
 * What the main column says in place of the lists of a workspace that is being seeded, which hold nothing until it is
 * ready, or whose seed stopped.
 */
function GettingReady(props: {
  name: string;
  seeding: NonNullable<WorkspaceRef["seeding"]>;
}): ReactNode {
  const { name, seeding } = props;
  return (
    <p className="pt-6 text-ui">
      {seeding.failed
        ? DEMO_WORDS.seedingFailed
        : LIBRARY_WORDS.gettingReady(name, seeding.done, seeding.total)}
    </p>
  );
}

function Library(props: { api: Api; person: TabPerson }): ReactNode {
  const { api, person } = props;
  const { workspaceId, workspaces, serverProblem } = useShownWorkspace(
    api,
    person,
  );
  const { continueList, projects, problem } = useWorkspaceLists(workspaceId);
  const shown = workspaces?.find((ref) => ref.id === workspaceId) ?? null;
  const View = useChosenView();
  // a signed-in person's switcher waits for the server to say which workspaces they have
  const switcher =
    workspaceId !== null && (person.token === null || workspaces !== null);
  useTourOnFirstVisit();
  useEffect(() => {
    focusHeading(document);
  }, []);
  useEffect(() => {
    document.title = pageTitle(LIBRARY_WORDS.title, person.name);
  }, [person.name]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 tabIndex={-1} className="sr-only">
        {LIBRARY_WORDS.title}
      </h1>
      <ShellRegion
        region="title_bar"
        className="flex h-titlebar shrink-0 items-center gap-2 border-b border-line px-2"
      >
        {switcher ? (
          <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} />
        ) : null}
        <SearchField />
        <span className="flex-1" />
        <CommandButton id="file.import" variant="outline" />
        <CommandButton id="library.newScript" variant="outline" />
        <NewProjectPopover workspaceId={workspaceId} />
        <PersonMenu name={person.name} />
      </ShellRegion>
      <div className="@container flex min-h-0 flex-1">
        <LibraryNav projects={projects} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-8 px-6 pt-6 pb-8 *:w-full *:max-w-content-wide">
          {shown?.seeding == null ? (
            <View
              workspaceId={workspaceId}
              continueList={continueList}
              projects={projects}
              problem={problem || serverProblem}
            />
          ) : (
            <GettingReady name={shown.name} seeding={shown.seeding} />
          )}
        </div>
        <SidePosition docId={null} tabs={SIDE_PANEL_TABS} />
      </div>
      <LibraryStatusBar projects={projects} />
    </div>
  );
}

/** The route sends a tab with no person to the chooser; until it has, nothing is drawn. */
export function LibraryScreen(props: {
  api: Api;
  person: TabPerson | null;
}): ReactNode {
  const { api, person } = props;
  return person === null ? null : <Library api={api} person={person} />;
}
