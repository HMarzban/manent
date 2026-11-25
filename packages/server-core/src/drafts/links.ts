// Draft link lookup and server-side access enforcement: token hashes, expiry, revocation and recipients.
import { timingSafeEqual } from "node:crypto";
import type {
  DocFile,
  DraftLinkRow,
  DraftSendRow,
  Home,
  Storage,
} from "@manent/storage";
import type { HttpErrorCode, VersionContent } from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import { openVersion } from "../history/content.ts";
import { PRODUCTION_EXTRAS } from "../production/extras.ts";
import { hashToken, isLinkToken } from "../sharing/links.ts";
import type { Clock } from "../sync/ports.ts";

/** Every refusal code a drafts operation may return. */
export type DraftsRefusal = Extract<
  HttpErrorCode,
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_member"
  | "not_found"
  | "not_sent"
  | "unsupported_kind"
  | "deleted"
  | "link_expired"
  | "link_revoked"
  | "engine_unavailable"
  | "busy"
>;

export type DraftsOutcome<T> =
  { ok: true; value: T } | { ok: false; code: DraftsRefusal };

export const refused = (
  code: DraftsRefusal,
): { ok: false; code: DraftsRefusal } => ({ ok: false, code }) as const;

export interface ResolvedDraftLink {
  link: DraftLinkRow;
  send: DraftSendRow;
  file: DocFile;
  content: VersionContent;
}

const isSameHash = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && timingSafeEqual(a, b);

/** Locates the send row and its document file by scanning project homes when not cached. */
export function findSend(
  storage: Storage,
  sendId: string,
  sendHomes: Map<string, Home>,
): { send: DraftSendRow; file: DocFile } | null {
  const cached = sendHomes.get(sendId);
  if (cached !== undefined) {
    const file = storage.open(cached);
    const send = file.sharing.sendOf(sendId);
    if (send !== null) return { send, file };
    sendHomes.delete(sendId);
  }
  const homes = storage.directory.homes();
  const ordered = [
    ...homes.filter((home) => home.kind === "project"),
    ...homes.filter((home) => home.kind !== "project"),
  ];
  for (const home of ordered) {
    const file = storage.open(home);
    const send = file.sharing.sendOf(sendId);
    if (send !== null) {
      if (!sendHomes.has(sendId) && sendHomes.size >= 512) {
        const oldest = sendHomes.keys().next().value;
        if (oldest !== undefined) sendHomes.delete(oldest);
      }
      sendHomes.set(sendId, home);
      return { send, file };
    }
  }
  return null;
}

/**
 * Validates `token` against stored SHA-256 hashes, enforces expiry, document deletion and
 * recipient membership when `signIn` is required, and materializes the sent version's content.
 */
export function resolveDraftLink(options: {
  storage: Storage;
  clock: Clock;
  sendHomes: Map<string, Home>;
  users: Directory | null;
  userId: string | null;
  token: string;
}): DraftsOutcome<ResolvedDraftLink> {
  const { storage, clock, sendHomes, users, userId, token } = options;
  if (!isLinkToken(token)) return refused("bad_request");
  const tokenHash = hashToken(token);
  const link = storage.shareLinks.draftLinkOf(tokenHash);
  if (link === null || !isSameHash(link.tokenHash, tokenHash))
    return refused("not_found");
  if (link.expiresAt !== null && clock.now() >= link.expiresAt)
    return refused("link_expired");
  const found = findSend(storage, link.sendId, sendHomes);
  if (found === null) return refused("not_found");
  const { send, file } = found;
  if (storage.directory.tombstoneOf(send.docId) !== null)
    return refused("link_revoked");
  if (link.signIn) {
    if (userId === null) return refused("unauthenticated");
    const restricted =
      link.open !== true &&
      (send.groupIds.length > 0 || send.recipientUserIds.length > 0);
    if (restricted && !send.recipientUserIds.includes(userId))
      return refused("not_sent");
  }
  if (userId !== null && users !== null && users.user(userId) === null)
    return refused("unauthenticated");
  const version = file.history.get(send.versionId);
  const content =
    version === null || version.docId !== send.docId
      ? null
      : openVersion(file, version, PRODUCTION_EXTRAS.locksAt);
  if (content === null) return refused("not_found");
  return { ok: true, value: { link, send, file, content } };
}

/**
 * Returns the send row for `candidateVersionId` only when it is a strictly earlier sent draft
 * of the same script (`sends` is newest-first).
 */
export function isEarlierSend(
  sends: readonly DraftSendRow[],
  currentSendId: string,
  candidateVersionId: string,
): DraftSendRow | null {
  const currentIndex = sends.findIndex((s) => s.id === currentSendId);
  const targetIndex = sends.findIndex(
    (s) => s.versionId === candidateVersionId,
  );
  if (currentIndex < 0 || targetIndex <= currentIndex) return null;
  return sends[targetIndex] ?? null;
}
