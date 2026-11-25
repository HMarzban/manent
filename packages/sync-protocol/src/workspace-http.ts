// What the workspace settings routes answer, and what a client sends them.
import { DOC_ROLES } from "./messages.ts";
import type { DocRole } from "./messages.ts";

/** Valid workspace identifier: 1 to 64 ASCII letters, digits, underscores or hyphens. */
export const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const USER_ID_LIMIT = 128;

/** One member of a workspace and their workspace role. */
export interface WorkspacePerson {
  userId: string;
  name: string;
  role: DocRole;
}

/** Response for GET /api/workspace/people. */
export interface WorkspacePeopleResponse {
  people: WorkspacePerson[];
}

/** Request body for POST /api/workspace/people/role. */
export interface WorkspaceRoleRequest {
  workspaceId: string;
  userId: string;
  role: DocRole;
}

/** Response for POST /api/workspace/people/role. */
export interface WorkspaceRoleResponse {
  ok: true;
}

/** One workspace setting row as returned by GET /api/workspace/settings; value is always null for non-owners and masked for owners. */
export interface WorkspaceSettingView {
  key: string;
  on: boolean;
  value: string | null;
}

/** Response for GET /api/workspace/settings. */
export interface WorkspaceSettingsResponse {
  settings: WorkspaceSettingView[];
}

/** True when value is a well-formed workspace identifier. */
export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_ID_PATTERN.test(value);
}

const isDocRole = (value: unknown): value is DocRole =>
  DOC_ROLES.some((role) => role === value);

/** True when value is a well-formed WorkspaceRoleRequest body. */
export function isWorkspaceRoleRequest(
  value: unknown,
): value is WorkspaceRoleRequest {
  if (typeof value !== "object" || value === null) return false;
  const workspaceId: unknown = Reflect.get(value, "workspaceId");
  const userId: unknown = Reflect.get(value, "userId");
  const role: unknown = Reflect.get(value, "role");
  return (
    isWorkspaceId(workspaceId) &&
    typeof userId === "string" &&
    userId.length > 0 &&
    userId.length <= USER_ID_LIMIT &&
    isDocRole(role)
  );
}
