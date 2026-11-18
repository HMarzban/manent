// The Library: the workspace switcher, Continue, the projects, New script and New project, the person menu and the status bar.
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  CommandButton,
  LIBRARY_WORDS,
  Row,
  SurfaceState,
  VirtualRows,
  createValue,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import type {
  Subscribable,
  SurfaceRenderers,
  SurfaceStateValue,
} from "@manent/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Api } from "../../api.ts";
import { focusHeading } from "../../focus.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ContinueItem, ProjectItem } from "../../services/ports.ts";
import type { TabPerson } from "../../session.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { SidePosition } from "../../shell/side-position.tsx";
import { panelsActions } from "../../state/panels.store.ts";
import { pageTitle } from "../../text.ts";
import { SIDE_PANEL_TABS } from "../document/side-tabs.ts";
import { ContinueList } from "./continue-list.tsx";
import { LibraryStatusBar } from "./library-status-bar.tsx";
import { NewProjectPopover } from "./new-project-popover.tsx";
import { PersonMenu } from "./person-menu.tsx";
import { ProjectList } from "./project-list.tsx";
import { WorkspaceSwitcher } from "./workspace-switcher.tsx";

// what the lists read while the workspace shown is not known yet
const NO_ITEMS: Subscribable<readonly never[]> = createValue([]);
const CACHED: Subscribable<"cached" | "problem"> = createValue("cached");
// the placeholder rows drawn while the workspace is not known
const PLACEHOLDER_ROWS = 6;

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
  const me = useQuery({
    queryKey: ["me", person.userId],
    queryFn: listWorkspaces(api),
    enabled: signedIn,
  });
  const known = signedIn ? (me.data ?? null) : null;
  const answered = !signedIn || me.data !== undefined || me.isError;
  const fallback = answered ? (known?.[0]?.id ?? person.userId) : null;
  return {
    workspaceId: typeof w === "string" ? w : fallback,
    workspaces: known,
    serverProblem: signedIn && me.isError,
  };
}

/** The person's workspaces; a server that cannot list them throws, so the query keeps the last list it heard. */
function listWorkspaces(api: Api): () => Promise<readonly WorkspaceRef[]> {
  return async () => {
    const answer = await api.me();
    if (!answer.ok) {
      throw new Error(
        `the server did not list the workspaces: ${answer.reason}`,
      );
    }
    return answer.me.workspaces;
  };
}

function Placeholders(): ReactNode {
  return Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
    <div
      key={index}
      aria-hidden="true"
      data-placeholder
      className="min-h-row-2"
    />
  ));
}

/** The projects' names, under Continue, the place the main column shows. */
function Places(props: { projects: readonly ProjectItem[] }): ReactNode {
  const { projects } = props;
  return (
    <ShellRegion
      region="left_panel"
      className="flex w-panel-left shrink-0 flex-col border-e border-line py-1"
    >
      <Row current>{LIBRARY_WORDS.continueHeading}</Row>
      <h2 className="px-2 pt-2 text-micro text-fg-muted uppercase">
        {LIBRARY_WORDS.projectsHeading}
      </h2>
      <div className="min-h-0 flex-1">
        <VirtualRows
          count={projects.length}
          rowHeight="one"
          label={LIBRARY_WORDS.projectsHeading}
          renderRow={(index) => <Row>{projects[index]?.title}</Row>}
        />
      </div>
    </ShellRegion>
  );
}

/** Opens the Tour in the side position the first time this person reaches the Library in demo mode. */
function useTourOnFirstVisit(): void {
  const { flags } = useServices();
  const demo = useCommandState("demo.tour").visible;
  useEffect(() => {
    if (!demo || flags.has("tour_seen")) return;
    flags.set("tour_seen");
    panelsActions.open("side", "tour");
  }, [demo, flags]);
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

/** The main column: Continue, then the projects; the problem line above them when the list could not be loaded. */
function Lists(props: {
  workspaceId: string | null;
  continueList: readonly ContinueItem[];
  projects: readonly ProjectItem[];
  problem: boolean;
}): ReactNode {
  const { workspaceId, continueList, projects } = props;
  const { where, now } = useEnvironment();
  const navigate = useNavigate();
  const [arrivedAt] = useState(() => now());
  const open = (docId: string) => void navigate({ href: `/s/${docId}` });
  const problem = <p className="px-2 py-1 text-ui">{LIBRARY_WORDS.problem}</p>;
  const lists = (
    <>
      {props.problem ? problem : null}
      {projects.length === 0 ? null : (
        <ContinueList items={continueList} shell={where.shell} open={open} />
      )}
      <ProjectList
        projects={projects}
        shell={where.shell}
        now={now()}
        open={open}
      />
    </>
  );
  const render: SurfaceRenderers = {
    ready: () => lists,
    empty: () => lists,
    loading: () => <Placeholders />,
    // only a list that throws while it is drawn ends here
    problem: () => problem,
    // the Library has none of these: each row says where its document is, and the index lists only what the person may open
    offline: () => lists,
    read_only: () => lists,
    no_access: () => lists,
  };
  const state: SurfaceStateValue =
    workspaceId === null
      ? { kind: "loading", sinceMs: arrivedAt }
      : projects.length === 0
        ? { kind: "empty" }
        : { kind: "ready" };
  return <SurfaceState surface="library" state={state} render={render} />;
}

function Library(props: { api: Api; person: TabPerson }): ReactNode {
  const { api, person } = props;
  const { workspaceId, workspaces, serverProblem } = useShownWorkspace(
    api,
    person,
  );
  const { continueList, projects, problem } = useWorkspaceLists(workspaceId);
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
        <span className="flex-1" />
        <CommandButton id="library.newScript" variant="outline" />
        <NewProjectPopover workspaceId={workspaceId} />
        <PersonMenu name={person.name} />
      </ShellRegion>
      <div className="flex min-h-0 flex-1">
        <Places projects={projects} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Lists
            workspaceId={workspaceId}
            continueList={continueList}
            projects={projects}
            problem={problem || serverProblem}
          />
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
