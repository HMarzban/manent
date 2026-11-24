// The sent-draft service: sending drafts, listing sends, opening draft links, comparing earlier drafts and rendering PDFs.
import type { ScriptFontFiles } from "@manent/formats";
import type { Home, Storage } from "@manent/storage";
import { isDocId } from "@manent/sync-protocol";
import type {
  DraftOpenResponse,
  DraftOpenedControl,
  DraftSendItem,
  DraftSinceResponse,
  SendDraftRequest,
  SendDraftResponse,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import type { DraftReaders } from "../comments/ports.ts";
import { openVersion } from "../history/content.ts";
import type { DraftEvents } from "../history/draft-events.ts";
import type { HistoryService } from "../history/service.ts";
import { PRODUCTION_EXTRAS } from "../production/extras.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import { isEarlierSend, refused, resolveDraftLink } from "./links.ts";
import type { DraftsOutcome, DraftsRefusal } from "./links.ts";
import { renderDraftPdf } from "./pdf.ts";
import { authorizeScriptEditor, buildSendItem } from "./recipients.ts";
import type { CachedTokens } from "./recipients.ts";
import { executeSendDraft } from "./send.ts";

export type { DraftsOutcome, DraftsRefusal };

export interface DraftsService extends DraftReaders {
  send(
    userId: string,
    request: SendDraftRequest,
    keep: HistoryService["keep"],
  ): Promise<DraftsOutcome<SendDraftResponse>>;
  /** Newest first; refused `forbidden` for anyone other than the script's owner or editors. */
  sends(userId: string, docId: string): DraftsOutcome<DraftSendItem[]>;
  open(userId: string | null, token: string): DraftsOutcome<DraftOpenResponse>;
  since(
    userId: string | null,
    token: string,
    versionId: string,
  ): DraftsOutcome<DraftSinceResponse>;
  pdf(userId: string | null, token: string): Promise<DraftsOutcome<Uint8Array>>;
}

const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

const isCommentRole = (role: string | undefined): boolean =>
  role === "owner" || role === "edit" || role === "comment";

/** Server-held `draft_sends` reader check: true only when `userId` was sent a draft of the placed, non-deleted script `docId`. */
export function createDraftReaders(storage: Storage): DraftReaders {
  return {
    isDraftReader(userId, docId) {
      if (!isDocId(docId)) return false;
      const place = storage.directory.placeOf(docId);
      if (place === null || place.kind !== "script") return false;
      if (storage.directory.tombstoneOf(docId) !== null) return false;
      return storage
        .open(place.home)
        .sharing.sendsOf(docId)
        .some((send) => send.recipientUserIds.includes(userId));
    },
  };
}

export function createDraftsService(options: {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  ids(): string;
  tokens(): string;
  names: (userId: string) => string;
  fonts: ScriptFontFiles | (() => Promise<ScriptFontFiles>);
  users?: Directory;
  draftEvents?: DraftEvents;
  log?: (error: unknown) => void;
}): DraftsService {
  const { storage, sync, clock, ids, tokens, names, fonts } = options;
  const users = options.users ?? null;
  const log = options.log ?? (() => {});
  const readers = createDraftReaders(storage);
  const sendHomes = new Map<string, Home>();
  const tokenCache = new Map<string, CachedTokens>();
  const chains = new Map<string, Promise<void>>();
  let loadedFonts: Promise<ScriptFontFiles> | null = null;

  const getFonts = (): Promise<ScriptFontFiles> => {
    if (typeof fonts !== "function") return Promise.resolve(fonts);
    loadedFonts ??= fonts();
    return loadedFonts;
  };

  function inChain<T>(docId: string, run: () => Promise<T>): Promise<T> {
    const before = chains.get(docId);
    const next = before === undefined ? run() : before.then(run);
    const tail = next.then(
      () => {},
      () => {},
    );
    chains.set(docId, tail);
    void tail.then(() => {
      if (chains.get(docId) === tail) chains.delete(docId);
    });
    return next;
  }

  return {
    isDraftReader: readers.isDraftReader,
    send: (userId, request, keep) =>
      isDocId(request.docId)
        ? inChain(request.docId, () =>
            executeSendDraft(
              {
                storage,
                sync,
                clock,
                ids,
                tokens,
                names,
                users,
                draftEvents: options.draftEvents,
                log,
                sendHomes,
                tokenCache,
              },
              userId,
              request,
              keep,
            ),
          )
        : Promise.resolve(refused("bad_request")),
    sends(userId, docId) {
      if (!isDocId(docId)) return refused("bad_request");
      const access = authorizeScriptEditor(storage, userId, docId);
      if (!access.ok) return access;
      return {
        ok: true,
        value: access.file.sharing
          .sendsOf(docId)
          .map((send) => buildSendItem(storage, access.file, send, names)),
      };
    },
    open(userId, token) {
      const resolved = resolveDraftLink({
        storage,
        clock,
        sendHomes,
        users,
        userId,
        token,
      });
      if (!resolved.ok) return resolved;
      const { send, file, content } = resolved.value;
      const now = clock.now();
      const watermark =
        userId !== null && send.watermarkedUserIds.includes(userId)
          ? names(userId)
          : null;
      const canComment =
        userId !== null &&
        (readers.isDraftReader(userId, send.docId) ||
          isCommentRole(storage.directory.roleOf(send.docId, userId)?.role));
      const previous =
        userId === null
          ? null
          : (file.sharing.readOf(send.docId, userId)?.versionId ?? null);
      const lastReadVersionId =
        previous !== null &&
        isEarlierSend(file.sharing.sendsOf(send.docId), send.id, previous) !==
          null
          ? previous
          : null;
      file.sharing.addOpen({ sendId: send.id, userId, openedAt: now });
      if (userId !== null)
        file.sharing.putRead({
          docId: send.docId,
          userId,
          versionId: send.versionId,
          readAt: now,
        });
      const control: DraftOpenedControl = { sendId: send.id, userId };
      sync().broadcast(send.docId, "draft_opened", encodeJson(control));
      return {
        ok: true,
        value: {
          docId: send.docId,
          sendId: send.id,
          versionId: send.versionId,
          name: send.name,
          sentAt: send.sentAt,
          content,
          watermark,
          canComment,
          lastReadVersionId,
        },
      };
    },
    since(userId, token, versionId) {
      const resolved = resolveDraftLink({
        storage,
        clock,
        sendHomes,
        users,
        userId,
        token,
      });
      if (!resolved.ok) return resolved;
      const { send, file } = resolved.value;
      const earlier = isEarlierSend(
        file.sharing.sendsOf(send.docId),
        send.id,
        versionId,
      );
      if (earlier === null) return refused("not_sent");
      const version = file.history.get(earlier.versionId);
      const content =
        version === null || version.docId !== send.docId
          ? null
          : openVersion(file, version, PRODUCTION_EXTRAS.locksAt);
      if (content === null) return refused("not_sent");
      return {
        ok: true,
        value: { versionId: earlier.versionId, name: earlier.name, content },
      };
    },
    async pdf(userId, token) {
      const resolved = resolveDraftLink({
        storage,
        clock,
        sendHomes,
        users,
        userId,
        token,
      });
      if (!resolved.ok) return resolved;
      const { send, content } = resolved.value;
      const watermark =
        userId !== null && send.watermarkedUserIds.includes(userId)
          ? names(userId)
          : null;
      return renderDraftPdf(
        await getFonts(),
        content,
        send.name,
        send.sentAt,
        watermark,
      );
    },
  };
}
