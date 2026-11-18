// The directory port: who exists, and where they belong.
import type { Identity, WorkspaceRef } from "@manent/sync-protocol";

export interface Directory {
  /** Null for a user the directory does not list. */
  user(userId: string): Identity | null;
  /** In order; [] for a user the directory does not list. */
  workspacesOf(userId: string): readonly WorkspaceRef[];
}
