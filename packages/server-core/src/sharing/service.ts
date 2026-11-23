// The sharing service, which the server's configuration carries to its routes: who holds a role on a document, the
// groups given access to it and its share links. Only the owner changes them; anyone holding a role may list them.
import { readGroups } from "@manent/crdt";
import type { GroupEntry } from "@manent/crdt";
import type { Grant, ShareLinkRow, Storage } from "@manent/storage";
import type { DocKind, DocRole } from "@manent/sync-protocol";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { SyncHooks, SyncService } from "../sync/ports.ts";
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
  /** The links not turned off, oldest first. */
  links: ShareLinkRow[];
}

/** `userId` is always the caller's, from their session; every decision is taken from what storage holds. */
export interface SharingService extends SyncHooks {
  /** Anyone holding a role on the document. */
  people(userId: string, docId: string): SharingOutcome<ShareState>;
  /** Gives `target` `role` as their own, or changes the role they hold; never the owner's. */
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
  /** Gives the project's group its role on the document, for each of its members, now and later. */
  grantGroup(
    userId: string,
    docId: string,
    groupId: string,
  ): SharingOutcome<ShareState>;
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

/**
 * `tokens` makes a link's token: 32 random bytes in base64url. The `committed` hook marks each person active on a
 * document they push to, and gives each member of a granted group its role again whenever the project's groups change.
 */
export function createSharingService(options: {
  storage: Storage;
  sync: () => SyncService;
  now: () => number;
  ids: () => string;
  tokens: () => string;
}): SharingService {
  const { storage, now, ids, tokens } = options;
  const { directory, shareLinks: store } = storage;

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
    const refusal = ownerRefusal(userId, docId) ?? change();
    return refusal === null
      ? { ok: true, value: stateOf(docId) }
      : refused(refusal);
  }

  /** Gives each member of the document's granted groups their role from the project's `groups`, and tells each change. */
  function regroup(
    docId: string,
    groups: ReadonlyMap<string, GroupEntry>,
    byUserId: string,
  ): void {
    tell(docId, expandGroupGrants(store, docId, groups), byUserId);
  }

  /** The project's groups changed: every document of the project with a group's grant is given its roles again. */
  function groupsChanged(room: Room, byUserId: string): void {
    const groups =
      room.doc === null
        ? readProjectGroups(storage, room.docId)
        : readGroups(room.doc);
    for (const docId of directory.documentsIn(room.home))
      if (docId !== room.docId && store.groupGrantsOf(docId).length > 0)
        regroup(docId, groups, byUserId);
  }

  return {
    people(userId, docId) {
      if (directory.placeOf(docId) === null) return refused("not_found");
      if (directory.roleOf(docId, userId) === null) return refused("forbidden");
      return { ok: true, value: stateOf(docId) };
    },
    grant: (userId, docId, target, role) =>
      asOwner(userId, docId, () => {
        const grants = store.grantsOf(docId);
        const held = heldRole(grants, target);
        if (held === "owner") return "forbidden";
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
        tell(docId, [{ userId: target, role: null }], userId);
        return null;
      }),
    grantGroup: (userId, docId, groupId) =>
      asOwner(userId, docId, () => {
        const groups = readProjectGroups(storage, docId);
        const group = groups.get(groupId);
        if (group === undefined) return "not_found";
        // a group without a role is only ever sent drafts
        if (group.role === null) return "bad_request";
        store.grantGroup(docId, groupId, group.role);
        regroup(docId, groups, userId);
        return null;
      }),
    removeGroup: (userId, docId, groupId) =>
      asOwner(userId, docId, () => {
        store.ungrantGroup(docId, groupId);
        regroup(docId, readProjectGroups(storage, docId), userId);
        return null;
      }),
    createLink(userId, docId, role, expiresInMs) {
      const refusal = ownerRefusal(userId, docId);
      if (refusal !== null) return refused(refusal);
      const token = tokens();
      const tokenHash = hashToken(token);
      const expiresAt = expiresInMs === null ? null : now() + expiresInMs;
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
      const refusal = linkRefusal(link, now());
      if (refusal !== null) return refused(refusal);
      const { docId, role } = link;
      if (directory.placeOf(docId) === null) return refused("not_found");
      if (directory.tombstoneOf(docId) !== null) return refused("deleted");
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
      } catch {
        // a hook never throws: a write refused here leaves the roles as they were, and the next change to the
        // project's groups gives them again
      }
      try {
        if (byUserId !== SYSTEM_USER_ID) store.markActive(room.docId, byUserId);
      } catch {
        // a hook never throws: a refused write leaves the last-active time older, and the next push writes it again
      }
    },
  };
}
