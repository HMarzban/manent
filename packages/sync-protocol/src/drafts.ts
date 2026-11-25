// What the sent-draft routes answer, what a client sends them, and the CONTROL frames they broadcast.
import type { VersionContent, VersionItem } from "./history-http.ts";
import type { ShareLinkExpiryMs } from "./sharing.ts";

/** The data of a `draft_sent` CONTROL frame, as UTF-8 JSON. */
export interface DraftSentControl {
  sendId: string;
  versionId: string;
}

/** The data of a `draft_opened` CONTROL frame, as UTF-8 JSON. `userId` is null for an anonymous open. */
export interface DraftOpenedControl {
  sendId: string;
  userId: string | null;
}

/** Settings for the optional "anyone with this link" draft link made on a send. */
export interface SendDraftLinkInput {
  expiresInMs: ShareLinkExpiryMs;
  /** True when readers must choose who they are before the draft opens. */
  signIn: boolean;
}

/**
 * The body of POST /api/drafts/send. Idempotent by `key` (`isReplayKey`).
 * Server-held group flags always override `watermark: false` for members of watermarked groups.
 */
export interface SendDraftRequest {
  docId: string;
  key: string;
  name: string;
  what: string;
  /** The earlier draft asterisks are against; null when none. */
  againstVersionId: string | null;
  files: string[];
  groupIds: string[];
  recipientUserIds: string[];
  watermark: boolean;
  link: SendDraftLinkInput | null;
}

/** One group a draft was sent to, with its name, member count and watermark flag from the project index. */
export interface DraftSendGroup {
  groupId: string;
  name: string;
  count: number;
  watermark: boolean;
}

/** One sent draft of a script, newest first. Visible only to the script's owner and editors. */
export interface DraftSendItem {
  sendId: string;
  versionId: string;
  name: string;
  what: string;
  againstVersionId: string | null;
  files: string[];
  groups: DraftSendGroup[];
  recipientCount: number;
  openedCount: number;
  openerUserIds: string[];
  openerNames: string[];
  totalOpens: number;
  hasLink: boolean;
  watermarked: boolean;
  sentByUserId: string;
  sentAt: number;
  /** Directly named recipients (outside any sent group) at send time; null for older sends. */
  directRecipientCount?: number | null;
}

/**
 * The answer to POST /api/drafts/send. `recipientToken` is the sign-in link for named recipients
 * (groups or people); `linkToken` is the "anyone with this link" token. Tokens are shown only when made.
 */
export interface SendDraftResponse {
  send: DraftSendItem;
  version: VersionItem;
  recipientToken: string | null;
  linkToken: string | null;
}

/** The body of POST /api/drafts/sends. */
export interface DraftSendsRequest {
  docId: string;
}

/** The answer to POST /api/drafts/sends, newest first. */
export interface DraftSendsResponse {
  sends: DraftSendItem[];
}

/** The body of POST /api/drafts/open. */
export interface DraftOpenRequest {
  token: string;
}

/** The answer to POST /api/drafts/open. */
export interface DraftOpenResponse {
  docId: string;
  sendId: string;
  versionId: string;
  name: string;
  sentAt: number;
  content: VersionContent;
  /** The signed-in reader's name when watermarked; null for non-watermarked or anonymous readers. */
  watermark: string | null;
  canComment: boolean;
  /** Earlier sent draft the signed-in reader last read on this script; null when none or anonymous. */
  lastReadVersionId: string | null;
}

/** The answer to GET /api/drafts/since?token=...&since=... for an earlier sent draft of the same script. */
export interface DraftSinceResponse {
  versionId: string;
  /** Name of the earlier sent draft, when known. */
  name?: string;
  content: VersionContent;
}

/** The body of POST /api/drafts/pdf. */
export interface DraftPdfRequest {
  token: string;
}
