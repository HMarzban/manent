// Sharing: the sends, opens and reads of a document file, and the share links and grants of the control file.
// A token is never stored: a link keeps its token's SHA-256.

/** One role holder; `source` is where the role came from: `own`, `workspace` or `group:<groupId>`. */
export interface Grant {
  userId: string;
  role: string;
  source: string;
}

/** A group's grant on a document, from which each member's `group:<groupId>` row is made. */
export interface GroupGrant {
  groupId: string;
  role: string;
}

export interface ShareLinkRow {
  id: string;
  docId: string;
  tokenHash: Uint8Array;
  role: string;
  /** Null when the link never expires. */
  expiresAt: number | null;
  /** Null while the link holds. */
  revokedAt: number | null;
  createdByUserId: string;
  createdAt: number;
}

export interface DraftLinkRow {
  id: string;
  sendId: string;
  tokenHash: Uint8Array;
  /** The reader chooses who they are before the draft opens. */
  signIn: boolean;
  /** True for an "anyone with this link" token; false or absent for a named-recipient token. */
  open?: boolean;
  /** Null when the link never expires. */
  expiresAt: number | null;
  createdAt: number;
}

export interface DraftSendRow {
  id: string;
  docId: string;
  versionId: string;
  name: string;
  groupIds: string[];
  recipientUserIds: string[];
  watermarkedUserIds: string[];
  files: string[];
  what: string;
  /** The draft the asterisks are against; null when there are none. */
  againstVersionId: string | null;
  sentByUserId: string;
  sentAt: number;
  /** Directly named recipients (outside any sent group) at send time; null for older sends. */
  directRecipientCount?: number | null;
}

export interface DraftOpenRow {
  sendId: string;
  /** Null for a reader who did not say who they are. */
  userId: string | null;
  openedAt: number;
}

export interface ReaderReadRow {
  docId: string;
  userId: string;
  versionId: string;
  readAt: number;
}

/** Distinct signed-in openers (ascending) and total open count for one draft send. */
export interface DraftOpenStats {
  openers: string[];
  totalOpens: number;
}

/** The sent drafts, their opens and each reader's last read, in a document file; every write joins its `transaction`. */
export interface SharingStore {
  addSend(send: DraftSendRow): void;
  sendOf(sendId: string): DraftSendRow | null;
  /** Newest first, by `sentAt` then by id, both descending: the first is the script's newest send; [] when none. */
  sendsOf(docId: string): DraftSendRow[];
  /** The newest send of the script whose `groupIds` holds `groupId`, ordered as `sendsOf`; null when none. */
  newestSendTo(docId: string, groupId: string): DraftSendRow | null;
  addOpen(open: DraftOpenRow): void;
  /** Each signed-in reader who opened the send at least once, ascending; anonymous opens are not among them. */
  openersOf(sendId: string): string[];
  /** Every open of the send, anonymous ones included. */
  openCount(sendId: string): number;
  /** Batched openers and total opens for each listed `sendId` that has at least one open. */
  openStatsOf(sendIds: readonly string[]): Map<string, DraftOpenStats>;
  /** Replaces the reader's last read of the document. */
  putRead(read: ReaderReadRow): void;
  readOf(
    docId: string,
    userId: string,
  ): { versionId: string; readAt: number } | null;
}

/** The grants, share links and draft links of the control file; each `…At` it writes is `now()`. */
export interface ShareLinkStore {
  /**
   * Gives the user `role` on the document from `source`. An existing row keeps
   * its capabilities and last-active time; a new row has neither.
   */
  grant(docId: string, userId: string, role: string, source: string): void;
  /** Removes the user's role only when it came from `source`. */
  ungrant(docId: string, userId: string, source: string): void;
  /** Every role holder, ascending by userId; [] when none. */
  grantsOf(docId: string): Grant[];
  /** Sets the user's last-active time to now; nothing when they hold no role. */
  markActive(docId: string, userId: string): void;
  /** Every role holder's last-active time, ascending by userId; null until they are first active. */
  lastActiveOf(
    docId: string,
  ): { userId: string; lastActiveAt: number | null }[];
  /** Records a group's grant; granting the same group again replaces its role. */
  grantGroup(docId: string, groupId: string, role: string): void;
  ungrantGroup(docId: string, groupId: string): void;
  /** Ascending by groupId; [] when none. */
  groupGrantsOf(docId: string): GroupGrant[];
  addShareLink(link: Omit<ShareLinkRow, "revokedAt" | "createdAt">): void;
  /** Idempotent: the first revocation's time stays. */
  revokeShareLink(id: string): void;
  shareLinkOf(tokenHash: Uint8Array): ShareLinkRow | null;
  /** Revoked and expired links included, oldest first by `createdAt` then by id; [] when none. */
  shareLinksOf(docId: string): ShareLinkRow[];
  addDraftLink(link: Omit<DraftLinkRow, "createdAt">): void;
  draftLinkOf(tokenHash: Uint8Array): DraftLinkRow | null;
}
