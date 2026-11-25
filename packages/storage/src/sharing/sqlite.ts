// The sharing tables over SQLite: a document file's sends, opens and reads, and the control file's links and grants.
import type { Database } from "bun:sqlite";
import type {
  DraftLinkRow,
  DraftOpenStats,
  DraftSendRow,
  ShareLinkRow,
  ShareLinkStore,
  SharingStore,
} from "../ports/index.ts";
import { createSqliteGrants, readStrings } from "../sqlite/directory.ts";
import { transact } from "../sqlite/files.ts";

type StoredSend = Omit<
  DraftSendRow,
  | "groupIds"
  | "recipientUserIds"
  | "watermarkedUserIds"
  | "files"
  | "directRecipientCount"
> & {
  groupIds: string;
  recipientUserIds: string;
  watermarkedUserIds: string;
  files: string;
  directRecipientCount: number | null;
};

const SEND = `SELECT id, doc_id AS docId, version_id AS versionId, name, group_ids AS groupIds,
  recipient_user_ids AS recipientUserIds, watermarked_user_ids AS watermarkedUserIds, files, what,
  against_version_id AS againstVersionId, sent_by_user_id AS sentByUserId, sent_at AS sentAt,
  direct_recipient_count AS directRecipientCount FROM draft_sends`;
const NEWEST_FIRST = "ORDER BY sent_at DESC, id DESC";

const readSend = (row: StoredSend): DraftSendRow => ({
  ...row,
  groupIds: readStrings(row.groupIds),
  recipientUserIds: readStrings(row.recipientUserIds),
  watermarkedUserIds: readStrings(row.watermarkedUserIds),
  files: readStrings(row.files),
  directRecipientCount: row.directRecipientCount ?? null,
});

const IN_CHUNK = 500;

function readOpenStats(
  db: Database,
  sendIds: readonly string[],
): Map<string, DraftOpenStats> {
  const uniqueIds = [...new Set(sendIds)];
  const result = new Map<string, DraftOpenStats>();
  for (let start = 0; start < uniqueIds.length; start += IN_CHUNK) {
    const slice = uniqueIds.slice(start, start + IN_CHUNK);
    const placeholders = slice.map(() => "?").join(", ");
    const rows = db
      .query<
        { sendId: string; userId: string | null; opens: number },
        string[]
      >(
        `SELECT send_id AS sendId, user_id AS userId, count(*) AS opens
         FROM draft_opens WHERE send_id IN (${placeholders})
         GROUP BY send_id, user_id ORDER BY send_id, user_id`,
      )
      .all(...slice);
    for (const row of rows) {
      let entry = result.get(row.sendId);
      if (entry === undefined) {
        entry = { openers: [], totalOpens: 0 };
        result.set(row.sendId, entry);
      }
      entry.totalOpens += row.opens;
      if (row.userId !== null) entry.openers.push(row.userId);
    }
  }
  return result;
}

/** The store over a document file's connection, so that its writes join the file's `transaction`. */
export function createSqliteSharing(db: Database): SharingStore {
  const sql = {
    addSend: db.query<never, StoredSend>(
      `INSERT INTO draft_sends (id, doc_id, version_id, name, group_ids, recipient_user_ids, watermarked_user_ids, files,
       what, against_version_id, sent_by_user_id, sent_at, direct_recipient_count) VALUES ($id, $docId, $versionId, $name,
       $groupIds, $recipientUserIds, $watermarkedUserIds, $files, $what, $againstVersionId, $sentByUserId, $sentAt,
       $directRecipientCount)`,
    ),
    sendOf: db.query<StoredSend, [string]>(`${SEND} WHERE id = ?1`),
    sendsOf: db.query<StoredSend, [string]>(
      `${SEND} WHERE doc_id = ?1 ${NEWEST_FIRST}`,
    ),
    newestSendTo: db.query<StoredSend, [string, string]>(
      `${SEND} WHERE doc_id = ?1 AND EXISTS (SELECT 1 FROM json_each(group_ids) WHERE value = ?2) ${NEWEST_FIRST} LIMIT 1`,
    ),
    addOpen: db.query<never, [string, string | null, number]>(
      "INSERT INTO draft_opens (send_id, user_id, opened_at) VALUES (?1, ?2, ?3)",
    ),
    openersOf: db.query<{ userId: string }, [string]>(
      "SELECT DISTINCT user_id AS userId FROM draft_opens WHERE send_id = ?1 AND user_id IS NOT NULL ORDER BY user_id",
    ),
    openCount: db.query<{ opens: number }, [string]>(
      "SELECT count(*) AS opens FROM draft_opens WHERE send_id = ?1",
    ),
    putRead: db.query<never, [string, string, string, number]>(
      `INSERT INTO reader_reads (doc_id, user_id, version_id, read_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (doc_id, user_id) DO UPDATE SET version_id = excluded.version_id, read_at = excluded.read_at`,
    ),
    readOf: db.query<{ versionId: string; readAt: number }, [string, string]>(
      "SELECT version_id AS versionId, read_at AS readAt FROM reader_reads WHERE doc_id = ?1 AND user_id = ?2",
    ),
  };
  return {
    addSend: (send) =>
      transact(db, () =>
        sql.addSend.run({
          ...send,
          groupIds: JSON.stringify(send.groupIds),
          recipientUserIds: JSON.stringify(send.recipientUserIds),
          watermarkedUserIds: JSON.stringify(send.watermarkedUserIds),
          files: JSON.stringify(send.files),
          directRecipientCount: send.directRecipientCount ?? null,
        }),
      ),
    sendOf(sendId) {
      const row = sql.sendOf.get(sendId);
      return row === null ? null : readSend(row);
    },
    sendsOf: (docId) => sql.sendsOf.all(docId).map(readSend),
    newestSendTo(docId, groupId) {
      const row = sql.newestSendTo.get(docId, groupId);
      return row === null ? null : readSend(row);
    },
    addOpen: (open) =>
      transact(db, () =>
        sql.addOpen.run(open.sendId, open.userId, open.openedAt),
      ),
    openersOf: (sendId) => sql.openersOf.all(sendId).map((row) => row.userId),
    openCount: (sendId) => sql.openCount.get(sendId)?.opens ?? 0,
    openStatsOf: (sendIds) => readOpenStats(db, sendIds),
    putRead: (r) =>
      transact(db, () =>
        sql.putRead.run(r.docId, r.userId, r.versionId, r.readAt),
      ),
    readOf: (docId, userId) => sql.readOf.get(docId, userId),
  };
}

type StoredDraftLink = Omit<DraftLinkRow, "signIn" | "open"> & {
  signIn: number;
  open: number;
};

const SHARE_LINK = `SELECT id, doc_id AS docId, token_hash AS tokenHash, role, expires_at AS expiresAt, revoked_at AS revokedAt,
  created_by_user_id AS createdByUserId, created_at AS createdAt FROM share_links`;
const DRAFT_LINK = `SELECT id, send_id AS sendId, token_hash AS tokenHash, sign_in AS signIn, open, expires_at AS expiresAt,
  created_at AS createdAt FROM draft_links`;

/** The control file's grants and links. */
export function createSqliteShareLinks(options: {
  db: Database;
  now: () => number;
}): ShareLinkStore {
  const { db, now } = options;
  const sql = {
    grantGroup: db.query<never, [string, string, string]>(
      "INSERT INTO group_grants (doc_id, group_id, role) VALUES (?1, ?2, ?3) ON CONFLICT (doc_id, group_id) DO UPDATE SET role = excluded.role",
    ),
    ungrantGroup: db.query<never, [string, string]>(
      "DELETE FROM group_grants WHERE doc_id = ?1 AND group_id = ?2",
    ),
    groupGrantsOf: db.query<{ groupId: string; role: string }, [string]>(
      "SELECT group_id AS groupId, role FROM group_grants WHERE doc_id = ?1 ORDER BY group_id",
    ),
    addShareLink: db.query<
      never,
      [string, string, Uint8Array, string, number | null, string, number]
    >(
      `INSERT INTO share_links (id, doc_id, token_hash, role, expires_at, created_by_user_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ),
    revokeShareLink: db.query<never, [string, number]>(
      "UPDATE share_links SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL",
    ),
    shareLinkOf: db.query<ShareLinkRow, [Uint8Array]>(
      `${SHARE_LINK} WHERE token_hash = ?1`,
    ),
    shareLinksOf: db.query<ShareLinkRow, [string]>(
      `${SHARE_LINK} WHERE doc_id = ?1 ORDER BY created_at, id`,
    ),
    addDraftLink: db.query<never, StoredDraftLink>(
      `INSERT INTO draft_links (id, send_id, token_hash, sign_in, open, expires_at, created_at)
       VALUES ($id, $sendId, $tokenHash, $signIn, $open, $expiresAt, $createdAt)`,
    ),
    draftLinkOf: db.query<StoredDraftLink, [Uint8Array]>(
      `${DRAFT_LINK} WHERE token_hash = ?1`,
    ),
  };
  return {
    ...createSqliteGrants(options),
    grantGroup: (docId, groupId, role) =>
      transact(db, () => sql.grantGroup.run(docId, groupId, role)),
    ungrantGroup: (docId, groupId) =>
      transact(db, () => sql.ungrantGroup.run(docId, groupId)),
    groupGrantsOf: (docId) => sql.groupGrantsOf.all(docId),
    addShareLink: (link) =>
      transact(db, () =>
        sql.addShareLink.run(
          link.id,
          link.docId,
          link.tokenHash,
          link.role,
          link.expiresAt,
          link.createdByUserId,
          now(),
        ),
      ),
    revokeShareLink: (id) =>
      transact(db, () => sql.revokeShareLink.run(id, now())),
    shareLinkOf: (tokenHash) => sql.shareLinkOf.get(tokenHash),
    shareLinksOf: (docId) => sql.shareLinksOf.all(docId),
    addDraftLink: (link) =>
      transact(db, () =>
        sql.addDraftLink.run({
          ...link,
          signIn: Number(link.signIn),
          open: Number(link.open ?? false),
          createdAt: now(),
        }),
      ),
    draftLinkOf(tokenHash) {
      const row = sql.draftLinkOf.get(tokenHash);
      return row === null
        ? null
        : { ...row, signIn: row.signIn === 1, open: row.open === 1 };
    },
  };
}
