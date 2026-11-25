// The prompter's sends and send requests over SQLite.
import type { Database } from "bun:sqlite";
import type {
  PrompterRequestRow,
  PrompterSendRow,
  PrompterStore,
} from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

const SEND_COLUMNS = `doc_id AS rundownId, row_id AS rowId, story_doc_id AS storyId, version_id AS versionId,
  generation, seq, sent_by_user_id AS senderUserId, sent_at AS sentAt`;

function prepare(db: Database) {
  return {
    record: db.query<
      never,
      [
        string,
        string,
        string,
        string | null,
        number,
        number,
        string | null,
        number,
      ]
    >(
      `INSERT INTO prompter_sends (doc_id, row_id, story_doc_id, version_id, generation, seq, sent_by_user_id, sent_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ),
    latest: db.query<PrompterSendRow, [string, string]>(
      `SELECT ${SEND_COLUMNS} FROM prompter_sends WHERE doc_id = ?1 AND row_id = ?2 ORDER BY sent_at DESC LIMIT 1`,
    ),
    previous: db.query<PrompterSendRow, [string, string]>(
      `SELECT ${SEND_COLUMNS} FROM prompter_sends WHERE doc_id = ?1 AND row_id = ?2 ORDER BY sent_at DESC LIMIT 1 OFFSET 1`,
    ),
    latestOf: db.query<PrompterSendRow, [string]>(
      `SELECT ${SEND_COLUMNS} FROM (
         SELECT doc_id, row_id, story_doc_id, version_id, generation, seq, sent_by_user_id, sent_at,
           row_number() OVER (PARTITION BY row_id ORDER BY sent_at DESC) AS rank
         FROM prompter_sends WHERE doc_id = ?1
       ) WHERE rank = 1 ORDER BY row_id`,
    ),
    request: db.query<PrompterRequestRow, [string, string]>(
      `SELECT doc_id AS docId, request_key AS "key", user_id AS userId, result, created_at AS createdAt
       FROM prompter_requests WHERE doc_id = ?1 AND request_key = ?2`,
    ),
    putRequest: db.query<never, [string, string, string, string, number]>(
      `INSERT INTO prompter_requests (doc_id, request_key, user_id, result, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (doc_id, request_key) DO NOTHING`,
    ),
  };
}

/** The store over a document file's connection, so that its writes join the file's `transaction`. */
export function createSqlitePrompter(db: Database): PrompterStore {
  const sql = prepare(db);
  return {
    record: (send) =>
      transact(db, () =>
        sql.record.run(
          send.rundownId,
          send.rowId,
          send.storyId,
          send.versionId,
          send.generation,
          send.seq,
          send.senderUserId,
          send.sentAt,
        ),
      ),
    latest: (rundownId, rowId) => sql.latest.get(rundownId, rowId),
    previous: (rundownId, rowId) => sql.previous.get(rundownId, rowId),
    latestOf: (rundownId) => sql.latestOf.all(rundownId),
    request: (rundownId, key) => sql.request.get(rundownId, key),
    putRequest: (row) =>
      transact(db, () => {
        const written = sql.putRequest.run(
          row.docId,
          row.key,
          row.userId,
          row.result,
          row.createdAt,
        );
        if (written.changes === 0)
          throw new RangeError(
            `prompter request key ${row.key} is already stored`,
          );
      }),
  };
}
