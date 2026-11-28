// The sharing service, which the server's configuration carries to its routes: who holds a role on a document, the
// groups given access to it and its share links. Only the owner changes them or sees the links; anyone holding a role
// may list the people and the groups.
import { readGroups } from "@manent/crdt";
import type { GroupEntry } from "@manent/crdt";
import type { Grant, ShareLinkRow, Storage } from "@manent/storage";
import type { DocKind, DocRole } from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";
import {
  expandGroupGrants,
  heldRole,
  isShareRole,
  outranks,
} from "./grants.ts";
import type { RoleChange, ShareRole } from "./grants.ts";
import { projectIndexOf, readProjectGroups } from "./groups.ts";
import { hashToken, linkRefusal } from "./links.ts";

export type SharingRefusal =
  | "bad_request"
  | "not_found"
  | "forbidden"
  | "deleted"
  | "unsupported_kind"
  | "not_member"
  | "link_expired"
  | "link_revoked";

export type SharingOutcome<T> =
  { ok: true; value: T } | { ok: false; code: SharingRefusal };

/** Who has access to a document, as storage holds it. */
export interface ShareState {
  /** Ascending by userId. */
  grants: Grant[];
  /** Ascending by userId; null until the person is first active. */
  lastActive: { userId: string; lastActiveAt: number | null }[];
  /** Ascending by groupId. */
  groups: { groupId: string; role: ShareRole }[];
  /** The links not turned off, oldest first; given only to the owner, [] to anyone else. */
  links: ShareLinkRow[];
}

/** `userId` is always the caller's, from their session; every decision is taken from what storage holds. */
export interface SharingService extends SyncHooks {
  /** Anyone holding a role on the document; the links are the owner's alone. */
  people(userId: string, docId: string): SharingOutcome<ShareState>;
  /**
   * Gives `target` `role` as their own, or changes the role they hold; never the owner's. A first role goes only to a
   * person the directory lists who shares a workspace with the document's owner (`not_member`).
   */
  grant(
    userId: string,
    docId: string,
    target: string,
    role: ShareRole,
  ): SharingOutcome<ShareState>;
  /** Removes the role `target` holds, wherever it came from; never the owner's. */
  remove(
    userId: string,
    docId: string,
    target: string,
  ): SharingOutcome<ShareState>;
  /**
   * Gives the project's group its role on the document, for each of its members, now and later; `skipped` are the
   * members a share to them would refuse `not_member`, never granted.
   */
  grantGroup(
    userId: string,
    docId: string,
    groupId: string,
  ): SharingOutcome<{ state: ShareState; skipped: string[] }>;
  /** Takes the group's grant away; each member keeps any role another group or their own grant gives. */
  removeGroup(
    userId: string,
    docId: string,
    groupId: string,
  ): SharingOutcome<ShareState>;
  /** A new link giving `role`, expiring `expiresInMs` from now (null: never), with its token. */
  createLink(
    userId: string,
    docId: string,
    role: ShareRole,
    expiresInMs: number | null,
  ): SharingOutcome<{ link: ShareLinkRow; token: string }>;
  /** Turns the document's link off for good. */
  revokeLink(
    userId: string,
    docId: string,
    linkId: string,
  ): SharingOutcome<ShareState>;
  /** Gives the caller the link's role as their own, unless they hold a higher one. */
  join(
    userId: string,
    token: string,
  ): SharingOutcome<{ docId: string; role: DocRole; joined: boolean }>;
}

/** The kinds that hold no role of their own to share: a comments document's are its script's. */
const UNSHARED_KINDS: readonly DocKind[] = Object.freeze([
  "comments",
  "private",
  "index",
]);

const refused = (code: SharingRefusal) => ({ ok: false, code }) as const;

/** How long after a failed reconciliation the next attempt is made, unless a share read or change makes it first. */
const RECONCILE_RETRY_MS = 1_000;
/** Minimum interval between persisting `last_active_at` updates for one person on one document. */
const MARK_ACTIVE_INTERVAL_MS = 30_000;

/**
 * `users` is the directory a share's gate asks; `tokens` makes a link's token: 32 random bytes in base64url; `log`
 * is told each failure a hook may not throw. The `committed` hook marks each person active on a document they push
 * to, and gives each member of a granted group its role again whenever the project's groups change. A document whose
 * roles could not be given again is reconciled before its next share read or change, and on a timer until it is.
 */
export function createSharingService(options: {
  storage: Storage;
  users: Directory;
  sync: () => SyncService;
  clock: Clock;
  ids: () => string;
  tokens: () => string;
  log: (error: unknown) => void;
}): SharingService {
  const { storage, users, clock, ids, tokens, log } = options;
  const { directory, shareLinks: store } = storage;
  /** The documents whose group grants wait to be reconciled after a failure. */
  const unsettled = new Set<string>();
  /** Last persisted `markActive` timestamp per `${docId}\0${userId}` to avoid full-fsync writes on every keystroke. */
  const lastMarkedActive = new Map<string, number>();
  let cancelRetry: (() => void) | null = null;

  const stateOf = (docId: string): ShareState => ({
    grants: store.grantsOf(docId),
    lastActive: store.lastActiveOf(docId),
    groups: store
      .groupGrantsOf(docId)
      .flatMap(({ groupId, role }) =>
        isShareRole(role) ? [{ groupId, role }] : [],
      ),
    links: store.shareLinksOf(docId).filter((link) => link.revokedAt === null),
  });

  const tell = (
    docId: string,
    changes: readonly RoleChange[],
    byUserId: string,
  ): void => {
    for (const { userId, role } of changes)
      options.sync().membershipChanged(docId, userId, role, byUserId);
  };

  /** Null when the caller owns the document and its kind holds roles to share. */
  function ownerRefusal(userId: string, docId: string): SharingRefusal | null {
    const place = directory.placeOf(docId);
    if (place === null) return "not_found";
    if (directory.tombstoneOf(docId) !== null) return "deleted";
    if (UNSHARED_KINDS.some((kind) => kind === place.kind))
      return "unsupported_kind";
    return directory.roleOf(docId, userId)?.role === "owner"
      ? null
      : "forbidden";
  }

  /** Runs `change` for the owner of the document, then answers who has access. */
  function asOwner(
    userId: string,
    docId: string,
    change: () => SharingRefusal | null,
  ): SharingOutcome<ShareState> {
    settle(docId);
    const refusal = ownerRefusal(userId, docId) ?? change();
    return refusal === null
      ? { ok: true, value: stateOf(docId) }
      : refused(refusal);
  }

  /**
   * The gate of every share: the directory lists the person, and they share a workspace with the document's owner,
   * the nearest the server holds to the document's workspace.
   */
  function isMember(docId: string, userId: string): boolean {
    if (users.user(userId) === null) return false;
    const owner = directory
      .rolesOf(docId)
      .find((row) => row.role === "owner")?.userId;
    if (owner === undefined) return false;
    const theirs = new Set(users.workspacesOf(userId).map((w) => w.id));
    return users.workspacesOf(owner).some((w) => theirs.has(w.id));
  }

  /** Gives each member of the document's granted groups their role from the project's `groups`, telling each change. */
  function regroup(
    docId: string,
    groups: ReadonlyMap<string, GroupEntry>,
    byUserId: string,
  ): string[] {
    return expandGroupGrants(store, docId, groups, {
      isMember: (userId) => isMember(docId, userId),
      changed: (change) => tell(docId, [change], byUserId),
    });
  }

  /** Reconciles every unsettled document, then tries again later while any stays unsettled. */
  function retryLater(): void {
    if (cancelRetry !== null) return;
    cancelRetry = clock.schedule(() => {
      cancelRetry = null;
      // a copy: a document that fails again is put back in the set, and would be visited again
      for (const docId of Array.from(unsettled)) settle(docId);
    }, RECONCILE_RETRY_MS);
  }

  /** `regroup`, and on a failure the document stays unsettled, so a member a group no longer lists still loses the role. */
  function reconcile(
    docId: string,
    groups: () => ReadonlyMap<string, GroupEntry>,
    byUserId: string,
  ): void {
    try {
      regroup(docId, groups(), byUserId);
      unsettled.delete(docId);
    } catch (error) {
      log(error);
      unsettled.add(docId);
      retryLater();
    }
  }

  /** Reconciles the document first when its roles wait to be given again; asked before every share read or change. */
  function settle(docId: string): void {
    if (unsettled.has(docId))
      reconcile(docId, () => readProjectGroups(storage, docId), SYSTEM_USER_ID);
  }

  /** The project's groups changed: every document of the project with a group's grant is given its roles again. */
  function groupsChanged(room: Room, byUserId: string): void {
    const docIds = directory
      .documentsIn(room.home)
      .filter(
        (docId) =>
          docId !== room.docId && store.groupGrantsOf(docId).length > 0,
      );
    // marked before the groups are read, so a failure reading them leaves each document to be reconciled
    for (const docId of docIds) unsettled.add(docId);
    let read: ReadonlyMap<string, GroupEntry> | null = null;
    const groups = (): ReadonlyMap<string, GroupEntry> =>
      (read ??=
        room.doc === null
          ? readProjectGroups(storage, room.docId)
          : readGroups(room.doc));
    for (const docId of docIds) reconcile(docId, groups, byUserId);
  }

  return {
    people(userId, docId) {
      if (directory.placeOf(docId) === null) return refused("not_found");
      if (directory.tombstoneOf(docId) !== null) return refused("deleted");
      settle(docId);
      const role = directory.roleOf(docId, userId)?.role;
      if (role === undefined) return refused("forbidden");
      const state = stateOf(docId);
      return {
        ok: true,
        value: role === "owner" ? state : { ...state, links: [] },
      };
    },
    grant: (userId, docId, target, role) =>
      asOwner(userId, docId, () => {
        const grants = store.grantsOf(docId);
        const held = heldRole(grants, target);
        if (held === "owner") return "forbidden";
        // a person who already holds a role, as one who joined by a link may, can have it changed
        if (held === null && !isMember(docId, target)) return "not_member";
        store.grant(docId, target, role, "own");
        if (held !== role) tell(docId, [{ userId: target, role }], userId);
        return null;
      }),
    remove: (userId, docId, target) =>
      asOwner(userId, docId, () => {
        const row = store
          .grantsOf(docId)
          .find((grant) => grant.userId === target);
        if (row === undefined) return null;
        if (row.role === "owner") return "forbidden";
        store.ungrant(docId, target, row.source);
        lastMarkedActive.delete(`${docId}\0${target}`);
        tell(docId, [{ userId: target, role: null }], userId);
        return null;
      }),
    grantGroup(userId, docId, groupId) {
      let skipped: string[] = [];
      const outcome = asOwner(userId, docId, () => {
        const groups = readProjectGroups(storage, docId);
        const group = groups.get(groupId);
        if (group === undefined) return "not_found";
        // a group without a role is only ever sent drafts
        if (group.role === null) return "bad_request";
        store.grantGroup(docId, groupId, group.role);
        skipped = regroup(docId, groups, userId);
        return null;
      });
      return outcome.ok
        ? { ok: true, value: { state: outcome.value, skipped } }
        : outcome;
    },
    removeGroup: (userId, docId, groupId) =>
      asOwner(userId, docId, () => {
        store.ungrantGroup(docId, groupId);
        // the members' roles come off even when a write fails here: the document stays unsettled until they do
        reconcile(docId, () => readProjectGroups(storage, docId), userId);
        return null;
      }),
    createLink(userId, docId, role, expiresInMs) {
      settle(docId);
      const refusal = ownerRefusal(userId, docId);
      if (refusal !== null) return refused(refusal);
      const token = tokens();
      const tokenHash = hashToken(token);
      const expiresAt = expiresInMs === null ? null : clock.now() + expiresInMs;
      const id = ids();
      store.addShareLink({
        id,
        docId,
        tokenHash,
        role,
        expiresAt,
        createdByUserId: userId,
      });
      const link = store.shareLinkOf(tokenHash);
      return link === null
        ? refused("not_found")
        : { ok: true, value: { link, token } };
    },
    revokeLink: (userId, docId, linkId) =>
      asOwner(userId, docId, () => {
        const link = store
          .shareLinksOf(docId)
          .find((held) => held.id === linkId);
        if (link === undefined) return "not_found";
        store.revokeShareLink(link.id);
        return null;
      }),
    join(userId, token) {
      const link = store.shareLinkOf(hashToken(token));
      if (link === null || !isShareRole(link.role)) return refused("not_found");
      const refusal = linkRefusal(link, clock.now());
      if (refusal !== null) return refused(refusal);
      const { docId, role } = link;
      if (directory.placeOf(docId) === null) return refused("not_found");
      if (directory.tombstoneOf(docId) !== null) return refused("deleted");
      settle(docId);
      const held = heldRole(store.grantsOf(docId), userId);
      if (held !== null && outranks(held, role))
        return { ok: true, value: { docId, role: held, joined: false } };
      // the same role taken from a group becomes the person's own, so it outlasts the group's grant
      store.grant(docId, userId, role, "own");
      const joined = held !== role;
      if (joined) tell(docId, [{ userId, role }], userId);
      return { ok: true, value: { docId, role, joined } };
    },
    committed({ room, sender, report }) {
      if (report === null) return;
      const byUserId = sender?.userId ?? SYSTEM_USER_ID;
      const isGroups =
        report.maps.includes("groups") &&
        projectIndexOf(room.home) === room.docId;
      try {
        if (isGroups) groupsChanged(room, byUserId);
      } catch (error) {
        // a hook never throws: the project's documents could not even be listed
        log(error);
      }
      try {
        if (byUserId !== SYSTEM_USER_ID) {
          const activeKey = `${room.docId}\0${byUserId}`;
          const now = clock.now();
          const prev = lastMarkedActive.get(activeKey);
          if (prev === undefined || now - prev >= MARK_ACTIVE_INTERVAL_MS) {
            store.markActive(room.docId, byUserId);
            lastMarkedActive.set(activeKey, now);
          }
        }
      } catch {
        // a hook never throws: a refused write leaves the last-active time older, and the next push writes it again
      }
    },
  };
}
