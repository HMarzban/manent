// Which file a document lives in, who may do what, and what is deleted.
import type { Home } from "./doc-file.ts";

/** Which file a document lives in, who may do what, and what is deleted. */
export interface DocDirectory {
  /** An existing id keeps its home and kind. */
  place(
    docId: string,
    home: Home,
    kind: string,
    createdByUserId: string,
  ): { home: Home; kind: string; created: boolean };
  placeOf(docId: string): { home: Home; kind: string } | null;
  documentsIn(home: Home, kind?: string): string[];
  /** Each home a placed document lives in, once, ordered by its `kind:id` key. */
  homes(): readonly Home[];
  setRole(
    docId: string,
    userId: string,
    role: string,
    capabilities: readonly string[],
  ): void;
  removeRole(docId: string, userId: string): void;
  roleOf(
    docId: string,
    userId: string,
  ): { role: string; capabilities: string[] } | null;
  /** Every user holding a role on the document, ascending by userId; [] when none. */
  rolesOf(
    docId: string,
  ): { userId: string; role: string; capabilities: string[] }[];
  /** Whether a user other than `userId` holds a role on the document. */
  hasRoleBesides(docId: string, userId: string): boolean;
  /** Idempotent: the first tombstone wins. */
  tombstone(docId: string, deletedByUserId: string): void;
  tombstoneOf(
    docId: string,
  ): { deletedByUserId: string; deletedAt: number } | null;
}
