// Preferences → Account: who you are, where your preferences are kept, your workspaces and Sign out.
import { DEMO_PEOPLE } from "@manent/demo";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  Avatar,
  Button,
  CommandButton,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
  WORKSPACE_WORDS,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SignOutDialogHost } from "../../account/sign-out-dialog.tsx";
import { useDesktopCloudOnline } from "../../desktop/desktop-offline.ts";
import { initialsOf } from "../../initials.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import {
  SettingsCard,
  SettingsNotice,
} from "../../settings-shell/settings-card.tsx";
import { DemoRestoreCard } from "./demo-restore-group.tsx";

/** In the demo, the person and their title, read-only, with Switch person. */
function DemoPerson(): ReactNode {
  const { userId } = useServices();
  const person = DEMO_PEOPLE.find((p) => p.userId === userId);
  return (
    <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
      {person === undefined ? null : (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={person.name}
            initials={initialsOf(person.name)}
            colour={null}
            size="md"
            decorative
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-ui font-medium text-fg">{person.name}</span>
            <span className="text-meta text-fg-muted">{person.title}</span>
          </div>
        </div>
      )}
      <CommandButton id="app.switchPerson" variant="outline" />
    </div>
  );
}

/** Workspaces the signed-in person belongs to, with a direct link into each workspace's settings. */
function WorkspacesCard(props: {
  onOpenWorkspace?: (workspaceId: string) => void;
}): ReactNode {
  const { api, userId } = useServices();
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceRef[]>([]);
  useEffect(() => {
    let active = true;
    void api.me().then(
      (result) => {
        if (!active || !result.ok) return;
        setWorkspaces(result.me.workspaces);
      },
      () => {
        // leave workspaces card absent when offline or unauthenticated
      },
    );
    return () => {
      active = false;
    };
  }, [api, userId]);
  if (workspaces.length === 0) return null;
  return (
    <SettingsCard title={PREFERENCES_WORDS.workspacesGroup} divided>
      {workspaces.map((workspace) => (
        <div
          key={workspace.id}
          className="flex min-h-row flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        >
          <span className="min-w-0 truncate text-ui font-medium text-fg">
            {workspace.name}
          </span>
          {props.onOpenWorkspace === undefined ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => props.onOpenWorkspace?.(workspace.id)}
            >
              {WORKSPACE_WORDS.title}
            </Button>
          )}
        </div>
      ))}
    </SettingsCard>
  );
}

export function AccountPane(props: {
  onOpenWorkspace?: (workspaceId: string) => void;
}): ReactNode {
  const services = useServices();
  const { desktop } = useEnvironment();
  const desktopOnline = useDesktopCloudOnline(desktop);
  const demo = useCommandState("app.switchPerson").visible;
  const signedOut = useCommandState("app.signInToSync").visible;
  const synced = useSubscribable(services.privateIndexSynced());
  return (
    <>
      <SettingsCard divided>
        {demo ? <DemoPerson /> : null}
        {signedOut ? (
          <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
            <p className="text-ui text-fg-muted">
              {PREFERENCES_WORDS.accountNotSignedIn}
            </p>
            <CommandButton id="app.signInToSync" variant="outline" />
          </div>
        ) : (
          <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
            <p className="text-ui text-fg-muted">
              {PREFERENCES_WORDS.accountSaved(synced ? "synced" : "waiting")}
            </p>
            <CommandButton id="app.signOut" variant="outline" />
          </div>
        )}
      </SettingsCard>
      {desktop !== null && !desktopOnline ? (
        <SettingsNotice tone="offline">
          {DESKTOP_WORDS.connectionNote}
        </SettingsNotice>
      ) : null}
      <WorkspacesCard onOpenWorkspace={props.onOpenWorkspace} />
      <DemoRestoreCard />
      <SignOutDialogHost />
    </>
  );
}
