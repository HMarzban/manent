// Workspace settings screen: unified left-rail settings shell across People, Notifications, API keys and Broadcast.
import { DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import {
  SEND_WORDS,
  SHARING_WORDS,
  WORKSPACE_WORDS,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { BellIcon, KeyRoundIcon, RadioIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { demoPersonName, personTitleName } from "../../demo/demo-bridge.ts";
import { focusHeading } from "../../focus.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import { readPerson } from "../../session.ts";
import { SettingsNotice } from "../../settings-shell/settings-card.tsx";
import { SettingsShell } from "../../settings-shell/settings-shell.tsx";
import type { SettingsNavItem } from "../../settings-shell/settings-shell.tsx";
import { usePlaceName } from "../../settings-shell/use-place-name.ts";
import { pageTitle } from "../../text.ts";
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

function groupIcon(group: WorkspaceSettingsGroup): ReactNode {
  switch (group) {
    case "people":
      return <UsersIcon aria-hidden="true" />;
    case "notifications":
      return <BellIcon aria-hidden="true" />;
    case "api_keys":
      return <KeyRoundIcon aria-hidden="true" />;
    case "broadcast":
      return <RadioIcon aria-hidden="true" />;
  }
}

export function WorkspaceSettingsScreen(props: {
  workspaceId: string;
  group: string | null;
  from?: string | null;
}): ReactNode {
  const { workspaceId, group, from = null } = props;
  const activeGroup: WorkspaceSettingsGroup =
    WORKSPACE_SETTINGS_GROUPS.find((entry) => entry === group) ?? "people";
  const services = useServices();
  const environment = useEnvironment();
  const navigate = useNavigate();
  const online = useWorkspaceOnline();
  const placeName = usePlaceName(from ?? "/");
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
              demoPersonName(payload.byUserId) ??
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
    document.title = pageTitle(
      WORKSPACE_WORDS.windowTitle(WORKSPACE_WORDS.groups[activeGroup]),
      personTitleName(services.userId, services.personName),
    );
  }, [services.userId, services.personName, activeGroup]);

  useEffect(() => {
    focusHeading(document);
  }, [workspaceId]);

  const myRole =
    cached.people?.find((person) => person.userId === services.userId)?.role ??
    null;
  const canChange = myRole === "owner";
  const ActiveGroup = GROUP_COMPONENTS[activeGroup];
  const fromQuery = from === null ? "" : `?from=${encodeURIComponent(from)}`;
  const backHref = from ?? `/?w=${encodeURIComponent(workspaceId)}`;
  const backLabel =
    from === null ? WORKSPACE_WORDS.backToLibrary : SEND_WORDS.back(placeName);

  const navItems: readonly SettingsNavItem<WorkspaceSettingsGroup>[] = useMemo(
    () =>
      WORKSPACE_SETTINGS_GROUPS.map((id) => ({
        id,
        label: WORKSPACE_WORDS.groups[id],
        icon: groupIcon(id),
        href: `/w/${encodeURIComponent(workspaceId)}/settings/${id}${fromQuery}`,
      })),
    [workspaceId, fromQuery],
  );

  return (
    <SettingsShell
      backLabel={backLabel}
      backTitle={from === null ? undefined : placeName}
      onBack={() => void navigate({ href: backHref })}
      title={
        workspaceRef === null
          ? WORKSPACE_WORDS.title
          : `${workspaceRef.name} · ${WORKSPACE_WORDS.title}`
      }
      navLabel={WORKSPACE_WORDS.title}
      navMode="links"
      navItems={navItems}
      activeNavId={activeGroup}
      onSelectNav={(next) =>
        void navigate({
          href: `/w/${encodeURIComponent(workspaceId)}/settings/${next}${fromQuery}`,
        })
      }
      contentClassName="flex flex-col gap-5"
    >
      <ActiveGroup
        workspaceId={workspaceId}
        canChange={canChange}
        online={online}
        api={api}
      />
      {cached.people !== null && !canChange && online ? (
        <SettingsNotice tone="locked">
          {WORKSPACE_WORDS.ownersOnly}
        </SettingsNotice>
      ) : null}
      <p className="text-meta text-fg-muted">{WORKSPACE_WORDS.scope}</p>
    </SettingsShell>
  );
}
