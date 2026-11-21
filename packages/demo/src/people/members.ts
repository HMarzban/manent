// The members the seed adds who are not sign-in choices: Small's second person and Lanternfield Studios' staff.
import type { Capability, DocRole } from "@manent/sync-protocol";

export interface GeneratedMember {
  userId: string;
  name: string;
  /** The job title shown beside the name. */
  title: string;
  workspaceId: "small" | "heavy";
  /** The role on the workspace's index. */
  role: DocRole;
  capabilities: readonly Capability[];
  /** The codes of the projects they work on ("H24"). */
  activeOn: readonly string[];
  /** One of the simulated writers Add writers draws from. */
  writerPool: boolean;
}

export const GENERATED_MEMBERS: readonly GeneratedMember[] = [];
