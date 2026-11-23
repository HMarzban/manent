// Who holds which role: roles given to a person, and roles each member of a granted group takes from it.
import type { GroupEntry } from "@manent/crdt";
import type { Grant, ShareLinkStore } from "@manent/storage";
import { DOC_ROLES } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";

/** The roles a share gives: every role but the owner's. */
export type ShareRole = Exclude<DocRole, "owner">;

/** A person's role on a document changed: null when they no longer hold one. */
export interface RoleChange {
  userId: string;
  role: DocRole | null;
}

const GROUP_SOURCE = "group:";

/** Higher ranks more: a share never lowers a role to give a lesser one. */
const RANK: Readonly<Record<DocRole, number>> = Object.freeze({
  view: 0,
  comment: 1,
  edit: 2,
  owner: 3,
});

const isDocRole = (value: unknown): value is DocRole =>
  DOC_ROLES.some((role) => role === value);

export const isShareRole = (value: unknown): value is ShareRole =>
  isDocRole(value) && value !== "owner";

/** Whether `role` ranks above `held`, which is null when nothing is held. */
export const outranks = (role: DocRole, held: DocRole | null): boolean =>
  held === null || RANK[role] > RANK[held];

/** The source of a role a group's grant gives. */
const groupSource = (groupId: string): string => `${GROUP_SOURCE}${groupId}`;

/** The group a role came from; null for a role that came from no group. */
export const groupOfSource = (source: string): string | null =>
  source.startsWith(GROUP_SOURCE) ? source.slice(GROUP_SOURCE.length) : null;

/** The person's role on the document as stored; null when they hold none, or one this server does not know. */
export function heldRole(
  grants: readonly Grant[],
  userId: string,
): DocRole | null {
  const role = grants.find((grant) => grant.userId === userId)?.role;
  return isDocRole(role) ? role : null;
}

/**
 * Makes the document's group grants agree with the project's groups: a grant of a group the project no longer
 * holds, or whose role is now null, is removed; one whose group's role changed takes the new role.
 */
function reconcileGroupGrants(
  store: ShareLinkStore,
  docId: string,
  groups: ReadonlyMap<string, GroupEntry>,
): void {
  for (const { groupId, role } of store.groupGrantsOf(docId)) {
    const current = groups.get(groupId)?.role ?? null;
    if (current === null) store.ungrantGroup(docId, groupId);
    else if (current !== role) store.grantGroup(docId, groupId, current);
  }
}

/**
 * The granted group a member takes their role from: the highest role among the granted groups listing them, the
 * group they hold it from now when that one is among those, otherwise the first by id. Null: no granted group lists them.
 */
function bestGroup(
  userId: string,
  granted: readonly { groupId: string; role: ShareRole }[],
  groups: ReadonlyMap<string, GroupEntry>,
  currentGroupId: string | null,
): { groupId: string; role: ShareRole } | null {
  const listing = granted.filter((grant) =>
    groups.get(grant.groupId)?.memberUserIds.includes(userId),
  );
  const top = listing.reduce<ShareRole | null>(
    (best, grant) =>
      best === null || RANK[grant.role] > RANK[best] ? grant.role : best,
    null,
  );
  const highest = listing.filter((grant) => grant.role === top);
  return (
    highest.find((grant) => grant.groupId === currentGroupId) ??
    highest[0] ??
    null
  );
}

/**
 * Derives every role the document's group grants give from the project's groups, and returns each person whose role
 * changed. A role given to the person, and the owner's, is never touched; a member whose groups no longer give a role
 * loses the one they took from a group.
 */
export function expandGroupGrants(
  store: ShareLinkStore,
  docId: string,
  groups: ReadonlyMap<string, GroupEntry>,
): RoleChange[] {
  reconcileGroupGrants(store, docId, groups);
  const granted = store
    .groupGrantsOf(docId)
    .flatMap(({ groupId, role }) =>
      isShareRole(role) ? [{ groupId, role }] : [],
    );
  const rows = new Map(
    store.grantsOf(docId).map((grant) => [grant.userId, grant]),
  );
  const affected = new Set([
    ...[...rows.values()]
      .filter((grant) => groupOfSource(grant.source) !== null)
      .map((grant) => grant.userId),
    ...granted.flatMap(
      ({ groupId }) => groups.get(groupId)?.memberUserIds ?? [],
    ),
  ]);
  const changes: RoleChange[] = [];
  for (const userId of [...affected].toSorted()) {
    const row = rows.get(userId) ?? null;
    const fromGroup = row === null ? null : groupOfSource(row.source);
    if (row !== null && fromGroup === null) continue;
    const before = row !== null && isDocRole(row.role) ? row.role : null;
    const best = bestGroup(userId, granted, groups, fromGroup);
    if (best === null) {
      if (row !== null) store.ungrant(docId, userId, row.source);
    } else if (best.role !== before || best.groupId !== fromGroup) {
      store.grant(docId, userId, best.role, groupSource(best.groupId));
    }
    const after = best?.role ?? null;
    if (after !== before) changes.push({ userId, role: after });
  }
  return changes;
}
