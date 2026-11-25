// Workspace settings screen: left navigation across People, Notifications, and API keys, shared status & role gating.
import { DEMO_PEOPLE } from "@manent/demo";
import { DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import {
  Button,
  MessageSlot,
  Row,
  SHARING_WORDS,
  WORKSPACE_WORDS,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { focusHeading } from "../../focus.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import { readPerson } from "../../session.ts";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { pageTitle } from "../../text.ts";
import { isCommandId } from "../preferences/search-index.ts";
import { GROUP_COMPONENTS, WORKSPACE_SETTINGS_GROUPS } from "./groups.ts";
import type { WorkspaceSettingsGroup } from "./groups.ts";
import { createWorkspaceApi, workspacePeopleHolder } from "./workspace-api.ts";

const firstName = (name: string): string => name.split(" ")[0] ?? name;

const isDocRole = (value: unknown): value is DocRole =>
  typeof value === "string" && DOC_ROLES.some((role) => role === value);

function parseMembershipControl(
  data: Uint8Array,
): { userId: string; role: DocRole; byUserId: string } | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(data));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    const userId: unknown = Reflect.get(parsed, "userId");
    const role: unknown = Reflect.get(parsed, "role");
    const byUserId: unknown = Reflect.get(parsed, "byUserId");
    if (
      typeof userId === "string" &&
      typeof byUserId === "string" &&
      isDocRole(role)
    ) {
      return { userId, role, byUserId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Tracks whether the browser and demo connection control are currently online. */
function useWorkspaceOnline(): boolean {
  const environment = useEnvironment();
  const services = useServices();
  const [browserOnline, setBrowserOnline] = useState(() =>
    environment.online(),
  );
  const [linkOnline, setLinkOnline] = useState(true);

  useEffect(() => {
    const onOnline = (): void => setBrowserOnline(true);
    const onOffline = (): void => setBrowserOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | null = null;
    void services.connection.then(
      (control) => {
        if (!active) return;
        const syncState = (): void =>
          setLinkOnline(control.mode.get() !== "offline");
        syncState();
        stop = control.mode.subscribe(syncState);
      },
      () => {
        // outside demo connection control, rely on browser online status
      },
    );
    return () => {
      active = false;
      stop?.();
    };
  }, [services]);

  return browserOnline && linkOnline;
}

function WorkspaceSettingsStatusBar(): ReactNode {
  const { messages, commands } = useServices();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-2 border-t border-line px-2"
    >
      <MessageSlot
        queue={messages}
        run={(id) => {
          if (isCommandId(id)) commands.run(id, "control");
        }}
        registered={isCommandId}
      />
      <CommandsButton />
    </ShellRegion>
  );
}

export function WorkspaceSettingsScreen(props: {
  workspaceId: string;
  group: string | null;
}): ReactNode {
  const { workspaceId, group } = props;
  const activeGroup: WorkspaceSettingsGroup =
    WORKSPACE_SETTINGS_GROUPS.find((entry) => entry === group) ?? "people";
  const services = useServices();
  const environment = useEnvironment();
  const navigate = useNavigate();
  const online = useWorkspaceOnline();
  const workspacesQuery = useWorkspaces(services.api, services.userId, true);
  const workspaces = workspacesQuery.data ?? null;
  const workspaceRef = workspaces?.find((ws) => ws.id === workspaceId) ?? null;
  const workspaceName = workspaceRef?.name ?? workspaceId;

  const holder = useMemo(
    () => workspacePeopleHolder(services.userId, workspaceId),
    [services.userId, workspaceId],
  );
  const cached = useSubscribable(holder.state);

  const api = useMemo(
    () =>
      createWorkspaceApi({
        fetch: globalThis.fetch,
        token: () => {
          const person = readPerson(environment.tabStorage);
          return person?.userId === services.userId ? person.token : null;
        },
      }),
    [environment.tabStorage, services.userId],
  );

  const activeWorkspaceRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    activeWorkspaceRef.current = workspaceId;
    return () => {
      activeWorkspaceRef.current = null;
    };
  }, [workspaceId]);

  const refreshPeople = useCallback(async (): Promise<void> => {
    const targetWorkspaceId = workspaceId;
    const answer = await api.people(targetWorkspaceId);
    if (activeWorkspaceRef.current !== targetWorkspaceId) return;
    if (answer.ok) {
      holder.set({ people: answer.value.people, loadError: false });
    } else if (answer.code === "forbidden") {
      void navigate({ href: "/", replace: true });
    } else {
      holder.set({ people: holder.state.get().people, loadError: true });
    }
  }, [api, holder, navigate, workspaceId]);

  // Redirect to Library when workspaces loaded and this workspace is not among them
  useEffect(() => {
    if (workspaces !== null && workspaceRef === null) {
      void navigate({ href: "/", replace: true });
    }
  }, [workspaces, workspaceRef, navigate]);

  // Fetch people whenever online or workspace changes
  useEffect(() => {
    if (!online) return;
    void refreshPeople();
  }, [online, refreshPeople]);

  // Listen for CONTROL membership_changed on the workspace index to refresh roles and announce S4-WS-13
  useEffect(() => {
    let stopped = false;
    let stop: (() => void) | null = null;
    const wsIndexId = indexDocId("workspace", workspaceId);
    void services.openHandle(wsIndexId).then(
      (handle) => {
        if (stopped) {
          void handle.close();
          return;
        }
        const off = handle.on((event) => {
          if (event.type !== "control" || event.kind !== "membership_changed") {
            return;
          }
          const payload = parseMembershipControl(event.data);
          if (
            payload !== null &&
            payload.userId === services.userId &&
            payload.byUserId !== services.userId
          ) {
            const peopleNow = holder.state.get().people;
            const byName =
              peopleNow?.find((p) => p.userId === payload.byUserId)?.name ??
              DEMO_PEOPLE.find((p) => p.userId === payload.byUserId)?.name ??
              payload.byUserId;
            services.messages.push({
              id: "workspace.role_changed_remote",
              text: WORKSPACE_WORDS.yourRoleChanged(
                firstName(byName),
                workspaceName,
                SHARING_WORDS.roles[payload.role],
              ),
              actions: [],
              lifetime: "brief",
              ownWork: false,
            });
          }
          void refreshPeople();
        });
        stop = () => {
          off();
          void handle.close();
        };
      },
      () => {
        // sync unavailable; HTTP fetch remains authoritative
      },
    );
    return () => {
      stopped = true;
      stop?.();
    };
  }, [services, workspaceId, workspaceName, holder, refreshPeople]);

  // Window title and focus heading on arrival
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === services.userId);
    document.title = pageTitle(
      WORKSPACE_WORDS.windowTitle(WORKSPACE_WORDS.groups[activeGroup]),
      person?.name ?? null,
    );
  }, [services.userId, activeGroup]);

  useEffect(() => {
    focusHeading(document);
  }, [workspaceId]);

  const myRole =
    cached.people?.find((person) => person.userId === services.userId)?.role ??
    null;
  const canChange = myRole === "owner";
  const ActiveGroup = GROUP_COMPONENTS[activeGroup];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-chrome">
      <header className="flex h-titlebar shrink-0 items-center gap-2 border-b border-line px-2">
        <Button
          variant="ghost"
          className="cursor-pointer text-fg-muted"
          onClick={() =>
            void navigate({ href: `/?w=${encodeURIComponent(workspaceId)}` })
          }
        >
          {WORKSPACE_WORDS.backToLibrary}
        </Button>
        <h1 tabIndex={-1} className="truncate text-heading outline-none">
          {WORKSPACE_WORDS.title}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto sm:flex-row sm:overflow-hidden">
        <nav
          aria-label={WORKSPACE_WORDS.title}
          className="flex shrink-0 flex-col gap-1 border-b border-line p-4 sm:w-panel-left sm:border-e sm:border-b-0 sm:px-2"
        >
          {WORKSPACE_SETTINGS_GROUPS.map((id) => {
            const current = id === activeGroup;
            return (
              <a
                key={id}
                href={`/w/${encodeURIComponent(workspaceId)}/settings/${id}`}
                aria-current={current ? "page" : undefined}
                className="block cursor-pointer rounded-control no-underline"
                onClick={(event) => {
                  event.preventDefault();
                  void navigate({
                    href: `/w/${encodeURIComponent(workspaceId)}/settings/${id}`,
                  });
                }}
              >
                <Row current={current}>{WORKSPACE_WORDS.groups[id]}</Row>
              </a>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 p-6 sm:overflow-auto">
          <div className="flex max-w-content flex-col gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-ui text-fg-muted">{WORKSPACE_WORDS.scope}</p>
              {!online ? (
                <p className="text-ui text-fg-muted">
                  {WORKSPACE_WORDS.needsConnection}
                </p>
              ) : cached.people !== null && !canChange ? (
                <p className="text-ui text-fg-muted">
                  {WORKSPACE_WORDS.ownersOnly}
                </p>
              ) : null}
            </div>
            <ActiveGroup
              workspaceId={workspaceId}
              canChange={canChange}
              online={online}
              api={api}
            />
          </div>
        </main>
      </div>
      <WorkspaceSettingsStatusBar />
    </div>
  );
}
