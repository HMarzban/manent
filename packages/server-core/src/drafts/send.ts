// Sending a draft: freezes a `sent` version with `draft_sends`, opens one round per group, and makes draft links.
import { startRound } from "@manent/crdt";
import type {
  DocFile,
  DraftSendRow,
  Home,
  Storage,
  VersionRow,
} from "@manent/storage";
import { commentsDocId } from "@manent/sync-protocol";
import type {
  DraftSentControl,
  SendDraftRequest,
  SendDraftResponse,
  VersionItem,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import type { DraftEvents } from "../history/draft-events.ts";
import type { HistoryService } from "../history/service.ts";
import { itemOf } from "../history/summaries.ts";
import { findGroups, readProjectGroups } from "../sharing/groups.ts";
import { hashToken } from "../sharing/links.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import { isStorageError } from "../sync/storage-error.ts";
import { refused } from "./links.ts";
import type { DraftsOutcome } from "./links.ts";
import {
  LINK_MARKER,
  authorizeScriptEditor,
  buildSendItem,
  cachePut,
  expandRecipients,
  readStoredSend,
  validateSendInput,
} from "./recipients.ts";
import type { CachedTokens } from "./recipients.ts";

const TOKEN_CACHE_MAX = 256;

const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

export interface SendDraftDeps {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  ids(): string;
  tokens(): string;
  names: (userId: string) => string;
  users: Directory | null;
  draftEvents?: DraftEvents;
  log: (error: unknown) => void;
  sendHomes: Map<string, Home>;
  tokenCache: Map<string, CachedTokens>;
}

export async function executeSendDraft(
  deps: SendDraftDeps,
  userId: string,
  request: SendDraftRequest,
  keep: HistoryService["keep"],
): Promise<DraftsOutcome<SendDraftResponse>> {
  const validated = validateSendInput(request);
  if (validated === null) return refused("bad_request");
  const { storage, sync, clock, ids, tokens, names, users } = deps;
  const { docId } = request;
  const access = authorizeScriptEditor(storage, userId, docId);
  if (!access.ok) return access;
  const { home, file } = access;
  const stored = file.history.request(docId, request.key);
  if (stored !== null) {
    if (stored.userId !== userId) return refused("bad_request");
    const parsed = readStoredSend(stored.result);
    if (parsed === null) return refused("bad_request");
    const sendRow = file.sharing.sendOf(parsed.sendId);
    const versionRow = file.history.get(parsed.versionId);
    if (
      sendRow === null ||
      versionRow === null ||
      sendRow.docId !== docId ||
      versionRow.docId !== docId
    )
      return refused("bad_request");
    const cached = deps.tokenCache.get(`${docId}:${userId}:${request.key}`);
    return {
      ok: true,
      value: {
        send: buildSendItem(storage, file, sendRow, names),
        version: itemOf(file, versionRow),
        recipientToken: cached?.recipientToken ?? null,
        linkToken: cached?.linkToken ?? null,
      },
    };
  }
  if (request.againstVersionId !== null) {
    const against = file.history.get(request.againstVersionId);
    if (against === null || against.docId !== docId)
      return refused("not_found");
  }
  const projectGroups = readProjectGroups(storage, docId);
  if (validated.groupIds.some((id) => !projectGroups.has(id)))
    return refused("not_found");
  const groups = findGroups(storage, docId, validated.groupIds);
  const expanded = expandRecipients({
    storage,
    users,
    docId,
    groups,
    directIds: validated.recipientIds,
    watermarkAll: request.watermark,
  });
  if (!expanded.ok) return expanded;

  const sendId = ids();
  const versionId = ids();
  const sentAt = clock.now();
  const storedFiles =
    request.link !== null ? [...validated.files, LINK_MARKER] : validated.files;
  const sendRow: DraftSendRow = {
    id: sendId,
    docId,
    versionId,
    name: validated.name,
    groupIds: groups.map((group) => group.id),
    recipientUserIds: expanded.recipientUserIds,
    watermarkedUserIds: expanded.watermarkedUserIds,
    files: storedFiles,
    what: request.what,
    againstVersionId: request.againstVersionId,
    sentByUserId: userId,
    sentAt,
  };

  let versionItem: VersionItem | null = null;
  const commitSend = (txFile: DocFile): void => {
    const docRow = txFile.log.get(docId);
    if (docRow === null) throw new RangeError(`no document ${docId} here`);
    const versionRow: VersionRow = {
      id: versionId,
      docId,
      generation: docRow.generation,
      seq: docRow.headSeq,
      kind: "sent",
      name: validated.name,
      createdByUserId: userId,
      createdAt: sentAt,
      deviceId: null,
    };
    keep(txFile, versionRow);
    txFile.sharing.addSend(sendRow);
    txFile.history.putRequest({
      docId,
      key: request.key,
      userId,
      result: JSON.stringify({ kind: "draft_send", sendId, versionId }),
      createdAt: sentAt,
    });
    versionItem = itemOf(txFile, versionRow);
  };

  if (groups.length > 0) {
    const commentsId = commentsDocId(docId);
    if (storage.directory.placeOf(commentsId) === null) {
      const created = sync().access.create(userId, {
        docId: commentsId,
        kind: "comments",
        home: `${home.kind}:${home.id}`,
        scriptDocId: docId,
      });
      if (!created.ok)
        return refused(created.code === "deleted" ? "deleted" : "forbidden");
    }
    const written = await sync().authorityWrite(commentsId, {
      userId,
      origin: "system",
      edit(doc) {
        for (const group of groups)
          startRound(
            doc,
            { roundId: ids(), name: group.name, versionId },
            () => sentAt,
          );
        return { ok: true };
      },
      inTransaction: commitSend,
    });
    if (!written.ok) return refused("busy");
  } else {
    try {
      file.transaction(() => commitSend(file));
    } catch (error) {
      if (!isStorageError(error)) throw error;
      return refused("busy");
    }
  }

  const hasRecipients =
    groups.length > 0 || expanded.recipientUserIds.length > 0;
  const recipientToken = hasRecipients ? tokens() : null;
  const linkToken = request.link !== null ? tokens() : null;
  if (recipientToken !== null)
    storage.shareLinks.addDraftLink({
      id: ids(),
      sendId,
      tokenHash: hashToken(recipientToken),
      signIn: true,
      expiresAt: null,
    });
  if (linkToken !== null && request.link !== null)
    storage.shareLinks.addDraftLink({
      id: ids(),
      sendId,
      tokenHash: hashToken(linkToken),
      signIn: request.link.signIn,
      expiresAt:
        request.link.expiresInMs === null
          ? null
          : sentAt + request.link.expiresInMs,
    });

  cachePut(deps.sendHomes, sendId, home, 512);
  cachePut(
    deps.tokenCache,
    `${docId}:${userId}:${request.key}`,
    { recipientToken, linkToken },
    TOKEN_CACHE_MAX,
  );
  try {
    deps.draftEvents?.sent(docId, versionId, userId);
  } catch (error) {
    deps.log(error);
  }
  const control: DraftSentControl = { sendId, versionId };
  sync().broadcast(docId, "draft_sent", encodeJson(control));
  const storedVersion = file.history.get(versionId);
  const version =
    versionItem ??
    (storedVersion === null ? null : itemOf(file, storedVersion));
  if (version === null) return refused("not_found");
  return {
    ok: true,
    value: {
      send: buildSendItem(storage, file, sendRow, names),
      version,
      recipientToken,
      linkToken,
    },
  };
}
