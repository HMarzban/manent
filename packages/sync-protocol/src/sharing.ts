// What the sharing routes answer, and what a client sends them.
import type { DocRole } from "./messages.ts";

/** The roles a share gives: every role but the owner's, which is never given. */
export type ShareRole = Exclude<DocRole, "owner">;

/** How long a new share link holds, in milliseconds: never (null), 1 day, 7 days or 30 days. */
export const SHARE_LINK_EXPIRIES_MS = Object.freeze([
  null,
  86_400_000,
  604_800_000,
  2_592_000_000,
] as const);

export type ShareLinkExpiryMs = (typeof SHARE_LINK_EXPIRIES_MS)[number];

/** One person holding a role on the document. */
export interface SharePerson {
  userId: string;
  name: string;
  role: DocRole;
  /** The group whose grant gave the role; null for a role given to the person. */
  groupId: string | null;
  /** Null until the person is first active on the document. */
  lastActiveAt: number | null;
}

/** A group given access to the document; each member holds its role unless given one of their own. */
export interface ShareGroup {
  groupId: string;
  role: ShareRole;
}

/** A share link that has not been turned off; its token is shown only when it is made. */
export interface ShareLink {
  id: string;
  role: ShareRole;
  /** Null when the link never expires; a link past it is refused `link_expired`. */
  expiresAt: number | null;
  createdAt: number;
}

/** The body of POST /api/share/people. */
export interface SharePeopleRequest {
  docId: string;
}

/**
 * The answer to POST /api/share/people, and to every route that changes who has access: the role holders ascending
 * by `userId`, the groups given access ascending by `groupId`, and the links not turned off, oldest first, which only
 * the owner is given ([] for anyone else).
 */
export interface SharePeopleResponse {
  people: SharePerson[];
  groups: ShareGroup[];
  links: ShareLink[];
}

/** The body of POST /api/share/grant: gives the person `role`, or changes the role they hold. Owner only. */
export interface ShareGrantRequest {
  docId: string;
  userId: string;
  role: ShareRole;
}

/** The body of POST /api/share/remove: removes the person's role. Owner only. */
export interface ShareRemoveRequest {
  docId: string;
  userId: string;
}

/** The body of POST /api/share/grant-group and POST /api/share/remove-group. Owner only. */
export interface ShareGroupRequest {
  docId: string;
  groupId: string;
}

/**
 * The answer to POST /api/share/grant-group: who has access now, and the members the group lists who were not given
 * its role, since a share to them would be refused `not_member`.
 */
export interface ShareGrantGroupResponse extends SharePeopleResponse {
  skipped: string[];
}

/** The body of POST /api/share/link: makes a link that gives `role`. Owner only. */
export interface ShareLinkRequest {
  docId: string;
  role: ShareRole;
  expiresInMs: ShareLinkExpiryMs;
}

/** The answer to POST /api/share/link; `token` opens the link at `/join/<token>` and is never given again. */
export interface ShareLinkResponse {
  link: ShareLink;
  token: string;
}

/** The body of POST /api/share/revoke-link: turns the link off for good. Owner only. */
export interface ShareRevokeRequest {
  docId: string;
  linkId: string;
}

/** The body of POST /api/share/join. */
export interface ShareJoinRequest {
  token: string;
}

/**
 * The answer to POST /api/share/join: the role the person now holds. `joined` is false when they already held this
 * role or a higher one, which a link never lowers.
 */
export interface ShareJoinResponse {
  docId: string;
  role: DocRole;
  joined: boolean;
}
