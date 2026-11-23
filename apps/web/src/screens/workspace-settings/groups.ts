// The closed list of a workspace's settings groups, and the component that draws each.
import type { ComponentType } from "react";
import { ApiKeysGroup } from "./api-keys-group.tsx";
import { NotificationsGroup } from "./notifications-group.tsx";
import { PeopleGroup } from "./people-group.tsx";

export const WORKSPACE_SETTINGS_GROUPS = [
  "people",
  "notifications",
  "api_keys",
] as const;

export type WorkspaceSettingsGroup = (typeof WORKSPACE_SETTINGS_GROUPS)[number];

/** `canChange`: the person may change the workspace's settings. `online`: the server can be reached now. */
export interface WorkspaceSettingsGroupProps {
  workspaceId: string;
  canChange: boolean;
  online: boolean;
}

export const GROUP_COMPONENTS: Readonly<
  Record<WorkspaceSettingsGroup, ComponentType<WorkspaceSettingsGroupProps>>
> = Object.freeze({
  people: PeopleGroup,
  notifications: NotificationsGroup,
  api_keys: ApiKeysGroup,
});
