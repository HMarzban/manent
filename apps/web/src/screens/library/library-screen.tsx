// The Library: the workspace switcher, its navigation and the view the address chooses, New script and New project, the
// person menu and the status bar.
import { TOUR, isShown } from "@manent/demo";
import { indexDocId } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  CommandButton,
  DEMO_WORDS,
  LIBRARY_WORDS,
  ManentMark,
  Skeleton,
  createValue,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Api } from "../../api.ts";
import { focusHeading } from "../../focus.ts";
import { storageOfServices } from "../../services/api-cache.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ContinueItem, ProjectItem } from "../../services/ports.ts";
import { createDeviceMemory } from "../../services/sync/device-memory.ts";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import type { TabPerson } from "../../session.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { SidePosition } from "../../shell/side-position.tsx";
import { panelsActions } from "../../state/panels.store.ts";
import { workspaceActions } from "../../state/workspace.store.ts";
import { pageTitle } from "../../text.ts";
import { SIDE_PANEL_TABS } from "../document/side-tabs.ts";
import { useLibraryAddress } from "./library-address.ts";
import { LibraryNav } from "./library-nav.tsx";
import { LibraryStatusBar } from "./library-status-bar.tsx";
import { NewProjectPopover } from "./new-project-popover.tsx";
import { PersonMenu } from "./person-menu.tsx";
import { SearchField } from "./search-field.tsx";
import { CONTINUE_VIEW, LIBRARY_VIEWS } from "./views.ts";
import type { LibraryView } from "./views.ts";
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
  const environment = useEnvironment();
  const services = useServices();
  const w = useLibraryAddress().workspaceId;
  const signedIn = person.token !== null;
  const memory = useMemo(
    () =>
      createDeviceMemory({
        local: storageOfServices(services) ?? environment.storage,
        session: null,
      }),
    [services, environment.storage],
  );
  const cached = useMemo(
    () => (signedIn ? memory.workspaces(person.userId) : null),
    [memory, person.userId, signedIn],
  );
  // a person with no session has no workspaces to ask the server about
  const me = useWorkspaces(api, person.userId, signedIn, {
    cached,
    onListed: (list) => memory.setWorkspaces(person.userId, list),
  });
  const known = signedIn
    ? (me.data ?? (cached !== null && cached.length > 0 ? cached : null))
    : null;
  const answered = !signedIn || known !== null || me.isError;
  const fallback = answered ? (known?.[0]?.id ?? person.userId) : null;
  return {
    workspaceId: w ?? fallback,
    workspaces: known,
    serverProblem: signedIn && me.isError,
  };
}

/** The view the address chooses: the search's while it holds one, else the one its `view` names, else Continue. */
function useChosenView(): LibraryView {
  const { view, q } = useLibraryAddress();
  const chosen = LIBRARY_VIEWS.find((entry) =>
    entry.chosenBy === "q" ? q !== null : q === null && entry.id === view,
  );
  return chosen ?? CONTINUE_VIEW;
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
 * Tells the commands, while the Library is drawn, whether the person can add to the workspace shown: not while it is
 * being seeded, nor while their role on its index only reads it.
 */
function usePublishWorkspace(shown: {
  api: Api;
  userId: string;
  workspaceId: string | null;
  seeding: boolean;
}): void {
  const { api, userId, workspaceId, seeding } = shown;
  const index =
    workspaceId === null ? null : indexDocId("workspace", workspaceId);
  const role = useQuery({
    queryKey: ["role", userId, index],
    queryFn: () => (index === null ? null : api.role(index)),
    enabled: index !== null && !seeding,
  }).data;
  const workspace = seeding
    ? "getting_ready"
    : role === "comment" || role === "view"
      ? "read_only"
      : "writable";
  useEffect(() => {
    workspaceActions.set(workspace);
  }, [workspace]);
  useEffect(() => () => workspaceActions.set("writable"), []);
}

const GETTING_READY_ROWS = ["w-48", "w-36", "w-56", "w-44"] as const;

/**
 * What the main column says in place of the lists of a workspace that is being seeded, which hold nothing until it is
 * ready, or whose seed stopped.
 */
function GettingReady(props: {
  name: string;
  seeding: NonNullable<WorkspaceRef["seeding"]>;
}): ReactNode {
  const { name, seeding } = props;
  if (seeding.failed) {
    return (
      <div role="status" className="pt-6">
        <p className="text-ui">{DEMO_WORDS.seedingFailed}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 pt-6">
      <p role="status" className="text-ui text-fg-muted">
        {LIBRARY_WORDS.gettingReady(name, seeding.done, seeding.total)}
      </p>
      <div aria-busy="true" className="mn-table flex flex-col">
        <div aria-hidden="true" className="flex flex-col">
          <div className="mn-table-head flex items-center gap-3 px-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ms-auto hidden h-3 w-16 @lg:block" />
            <Skeleton className="h-3 w-16" />
          </div>
          {GETTING_READY_ROWS.map((width, index) => (
            <div
              key={index}
              className="flex min-h-row items-center gap-3 border-t border-line px-3 first:border-t-0"
            >
              <Skeleton className="size-icon shrink-0" />
              <Skeleton className={`h-3.5 max-w-full ${width}`} />
              <Skeleton className="ms-auto hidden h-3 w-20 @lg:block" />
              <Skeleton className="h-3.5 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
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
  usePublishWorkspace({
    api,
    userId: person.userId,
    workspaceId,
    seeding: shown?.seeding != null,
  });
  const { id: viewId, View } = useChosenView();
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
        className="flex min-h-titlebar shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1 sm:gap-2"
      >
        <ManentMark className="size-icon-lg shrink-0 text-fg" decorative />
        {switcher ? (
          <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} />
        ) : serverProblem ? null : (
          <div aria-busy="true" className="shrink-0">
            <Skeleton aria-hidden="true" className="h-control w-36" />
          </div>
        )}
        <SearchField />
        <span className="hidden sm:block sm:flex-1" />
        <div className="order-3 flex basis-full items-center gap-1.5 sm:order-none sm:contents">
          <CommandButton id="file.import" variant="outline" />
          <CommandButton id="library.newScript" variant="outline" />
          <NewProjectPopover workspaceId={workspaceId} />
        </div>
        <div className="order-2 flex shrink-0 sm:order-none">
          <PersonMenu name={person.name} />
        </div>
      </ShellRegion>
      <div className="@container relative flex min-h-0 flex-1">
        <LibraryNav
          workspaceId={workspaceId}
          current={viewId}
          projects={projects}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-8 px-4 pt-4 pb-8 sm:px-6 sm:pt-6 *:mx-auto *:w-full *:max-w-content-wide">
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
