// Send-draft validation, recipient expansion and formatting of stored send rows.
import type { GroupEntry } from "@manent/crdt";
import type {
  DocFile,
  DraftOpenStats,
  DraftSendRow,
  Home,
  Storage,
} from "@manent/storage";
import { isDocId, isReplayKey } from "@manent/sync-protocol";
import type {
  DraftSendGroup,
  DraftSendItem,
  SendDraftRequest,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import { readProjectGroups } from "../sharing/groups.ts";
import { isLinkExpiry } from "../sharing/links.ts";
import { refused } from "./links.ts";
import type { DraftsRefusal } from "./links.ts";

const NAME_MAX_CHARS = 120;
const WHAT_MAX_CHARS = 128;
const ID_MAX_CHARS = 128;
const FILE_ID_MAX_CHARS = 64;
const FILES_MAX = 32;
const GROUPS_MAX = 64;
const RECIPIENTS_MAX = 500;
export const LINK_MARKER = "link";

export interface CachedTokens {
  recipientToken: string | null;
  linkToken: string | null;
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= ID_MAX_CHARS;

export function cachePut<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  max: number,
): void {
  if (cache.has(key)) cache.delete(key);
  else if (cache.size >= max) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Checks that `userId` may edit the placed, non-deleted script `docId`. */
export function authorizeScriptEditor(
  storage: Storage,
  userId: string,
  docId: string,
):
  { ok: true; home: Home; file: DocFile } | { ok: false; code: DraftsRefusal } {
  const place = storage.directory.placeOf(docId);
  if (place === null) return refused("not_found");
  if (storage.directory.tombstoneOf(docId) !== null) return refused("deleted");
  if (place.kind !== "script") return refused("unsupported_kind");
  const role = storage.directory.roleOf(docId, userId)?.role;
  if (role !== "owner" && role !== "edit") return refused("forbidden");
  return { ok: true, home: place.home, file: storage.open(place.home) };
}

/** Formats one `DraftSendRow` for `19:SF` and `19:HR`, counting only distinct recipient openers. */
export function buildSendItem(
  storage: Storage,
  file: DocFile,
  send: DraftSendRow,
  names: (userId: string) => string,
  preloaded?: {
    projectGroups?: ReadonlyMap<string, GroupEntry>;
    opens?: DraftOpenStats;
  },
): DraftSendItem {
  const projectGroups =
    preloaded?.projectGroups ?? readProjectGroups(storage, send.docId);
  const groups: DraftSendGroup[] = send.groupIds.map((groupId) => {
    const entry = projectGroups.get(groupId);
    return entry === undefined
      ? { groupId, name: groupId, count: 0, watermark: false }
      : {
          groupId: entry.id,
          name: entry.name,
          count: entry.memberUserIds.length,
          watermark: entry.watermark,
        };
  });
  const recipientSet = new Set(send.recipientUserIds);
  const rawOpeners =
    preloaded?.opens?.openers ?? file.sharing.openersOf(send.id);
  const openerUserIds = rawOpeners.filter((id) => recipientSet.has(id));
  const totalOpens =
    preloaded?.opens?.totalOpens ?? file.sharing.openCount(send.id);
  return {
    sendId: send.id,
    versionId: send.versionId,
    name: send.name,
    what: send.what,
    againstVersionId: send.againstVersionId,
    files: send.files.filter((fileId) => fileId !== LINK_MARKER),
    groups,
    recipientCount: send.recipientUserIds.length,
    openedCount: openerUserIds.length,
    openerUserIds,
    openerNames: openerUserIds.map(names),
    totalOpens,
    hasLink: send.files.includes(LINK_MARKER),
    watermarked: send.watermarkedUserIds.length > 0,
    sentByUserId: send.sentByUserId,
    sentAt: send.sentAt,
    directRecipientCount: send.directRecipientCount ?? null,
  };
}

export function validateSendInput(request: SendDraftRequest): {
  name: string;
  files: string[];
  groupIds: string[];
  recipientIds: string[];
} | null {
  const {
    docId,
    key,
    what,
    againstVersionId,
    files,
    groupIds,
    recipientUserIds,
    link,
  } = request;
  if (!isDocId(docId) || !isReplayKey(key)) return null;
  const name = typeof request.name === "string" ? request.name.trim() : "";
  if (name === "" || [...name].length > NAME_MAX_CHARS) return null;
  if (
    typeof what !== "string" ||
    what.length === 0 ||
    what.length > WHAT_MAX_CHARS
  )
    return null;
  if (againstVersionId !== null && !isId(againstVersionId)) return null;
  if (
    !Array.isArray(files) ||
    files.length > FILES_MAX ||
    !files.every(
      (f) =>
        typeof f === "string" &&
        f.length > 0 &&
        f.length <= FILE_ID_MAX_CHARS &&
        f !== LINK_MARKER,
    )
  )
    return null;
  if (
    !Array.isArray(groupIds) ||
    groupIds.length > GROUPS_MAX ||
    !groupIds.every(isId)
  )
    return null;
  if (
    !Array.isArray(recipientUserIds) ||
    recipientUserIds.length > RECIPIENTS_MAX ||
    !recipientUserIds.every(isId)
  )
    return null;
  if (typeof request.watermark !== "boolean") return null;
  if (
    link !== null &&
    (typeof link !== "object" ||
      !isLinkExpiry(link.expiresInMs) ||
      typeof link.signIn !== "boolean")
  )
    return null;
  return {
    name,
    files: [...new Set(files)],
    groupIds: [...new Set(groupIds)],
    recipientIds: [...new Set(recipientUserIds)],
  };
}

export function readStoredSend(
  text: string,
): { sendId: string; versionId: string } | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const kind: unknown = Reflect.get(parsed, "kind");
    const sendId: unknown = Reflect.get(parsed, "sendId");
    const versionId: unknown = Reflect.get(parsed, "versionId");
    return kind === "draft_send" && isId(sendId) && isId(versionId)
      ? { sendId, versionId }
      : null;
  } catch {
    return null;
  }
}

function canReceive(
  storage: Storage,
  users: Directory | null,
  docId: string,
  targetUserId: string,
): boolean {
  if (users === null) return true;
  if (storage.directory.roleOf(docId, targetUserId) !== null) return true;
  if (users.user(targetUserId) === null) return false;
  const owner = storage.directory
    .rolesOf(docId)
    .find((row) => row.role === "owner")?.userId;
  if (owner === undefined) return false;
  const theirs = new Set(users.workspacesOf(targetUserId).map((w) => w.id));
  return users.workspacesOf(owner).some((w) => theirs.has(w.id));
}

export function expandRecipients(options: {
  storage: Storage;
  users: Directory | null;
  docId: string;
  groups: readonly GroupEntry[];
  directIds: readonly string[];
  watermarkAll: boolean;
}):
  | {
      ok: true;
      recipientUserIds: string[];
      watermarkedUserIds: string[];
      directRecipientCount: number;
    }
  | { ok: false; code: DraftsRefusal } {
  const { storage, users, docId, groups, directIds, watermarkAll } = options;
  for (const id of directIds)
    if (!canReceive(storage, users, docId, id)) return refused("not_member");
  const recipients = new Set<string>(directIds);
  const groupMembers = new Set<string>();
  const watermarked = new Set<string>();
  for (const group of groups) {
    for (const memberId of group.memberUserIds) {
      if (!canReceive(storage, users, docId, memberId)) continue;
      groupMembers.add(memberId);
      recipients.add(memberId);
      if (group.watermark) watermarked.add(memberId);
    }
  }
  const directRecipientCount = directIds.filter(
    (id) => !groupMembers.has(id),
  ).length;
  const recipientUserIds = [...recipients].toSorted();
  const watermarkedUserIds = watermarkAll
    ? recipientUserIds
    : recipientUserIds.filter((id) => watermarked.has(id));
  return {
    ok: true,
    recipientUserIds,
    watermarkedUserIds,
    directRecipientCount,
  };
}
