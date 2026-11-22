// The workspace switcher: the current workspace's name, and a menu of every workspace with what it holds.
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  Button,
  DEMO_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LIBRARY_WORDS,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";

/** "6 projects · The Long Night", how far a workspace being seeded has got, or that its seed stopped. */
function useWorkspaceLine(workspace: WorkspaceRef): string {
  const { library } = useServices();
  const projects = useSubscribable(library.projects(workspace.id));
  const continueList = useSubscribable(library.continueList(workspace.id));
  const { seeding } = workspace;
  if (seeding?.failed) return DEMO_WORDS.seedingFailed;
  if (seeding !== null)
    return LIBRARY_WORDS.seeding(seeding.done, seeding.total);
  return LIBRARY_WORDS.workspaceLine(
    projects.length,
    continueList[0]?.title ?? null,
  );
}

function WorkspaceItem(props: {
  name: string;
  line: string;
  current: boolean;
  onChoose(): void;
}): ReactNode {
  const { name, line, current, onChoose } = props;
  return (
    <DropdownMenuItem
      aria-current={current ? "true" : undefined}
      onClick={onChoose}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-meta text-fg-muted">{line}</span>
      </span>
      {current ? (
        <CheckIcon aria-hidden="true" className="text-fg-accent" />
      ) : null}
    </DropdownMenuItem>
  );
}

function SeededWorkspace(props: {
  workspace: WorkspaceRef;
  current: boolean;
  onChoose(): void;
}): ReactNode {
  const { workspace, current, onChoose } = props;
  return (
    <WorkspaceItem
      name={workspace.name}
      line={useWorkspaceLine(workspace)}
      current={current}
      onChoose={onChoose}
    />
  );
}

/**
 * `workspaces` null is a person with no session, whose one workspace is Your desk, on this device only, with
 * Sign in to sync after it. Nothing is drawn when `current` is not one of `workspaces`.
 */
export function WorkspaceSwitcher(props: {
  current: string;
  workspaces: readonly WorkspaceRef[] | null;
}): ReactNode {
  const { current, workspaces } = props;
  const { commands } = useServices();
  const { where } = useEnvironment();
  const navigate = useNavigate();
  const name =
    workspaces === null
      ? LIBRARY_WORDS.yourDesk
      : workspaces.find((workspace) => workspace.id === current)?.name;
  if (name === undefined) return null;
  const choose = (id: string) => () =>
    void navigate({ href: `/?w=${encodeURIComponent(id)}` });
  return (
    <DropdownMenu>
      {/* a narrow title bar shortens the name before it loses a control */}
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="min-w-0 shrink" />}
      >
        <span className="truncate font-semibold">{name}</span>
        <ChevronDownIcon aria-hidden="true" className="text-fg-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {workspaces === null ? (
          <>
            <WorkspaceItem
              name={LIBRARY_WORDS.yourDesk}
              line={LIBRARY_WORDS.neverSynced(where.shell === "desktop")}
              current
              onChoose={choose(current)}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => commands.run("app.signInToSync", "menu")}
            >
              {LIBRARY_WORDS.signIn}
            </DropdownMenuItem>
          </>
        ) : (
          workspaces.map((workspace) => (
            <SeededWorkspace
              key={workspace.id}
              workspace={workspace}
              current={workspace.id === current}
              onChoose={choose(workspace.id)}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
