// The notifications waiting to be delivered over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import {
  NOTIFICATION_ADAPTERS,
  OUTBOX_RETENTION_MS,
  OUTBOX_STOPPED_AT,
  StorageError,
} from "../ports/index.ts";
import type {
  NotificationAdapter,
  OutboxRow,
  OutboxStore,
  PendingOutboxRow,
} from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

interface SqlOutboxRow {
  readonly id: number;
  readonly workspace_id: string;
  readonly adapter: string;
  readonly payload: string;
  readonly attempts: number;
  readonly next_try_at: number;
  readonly delivered_at: number | null;
}

interface SqlPendingRow {
  readonly adapter: string;
  readonly attempts: number;
  readonly next_try_at: number;
}

function parseAdapter(value: string): NotificationAdapter {
  const found = NOTIFICATION_ADAPTERS.find((adapter) => adapter === value);
  if (found === undefined) throw new StorageError("corrupt");
  return found;
}

const toRow = (row: SqlOutboxRow): OutboxRow => ({
  id: row.id,
  workspaceId: row.workspace_id,
  adapter: parseAdapter(row.adapter),
  payload: row.payload,
  attempts: row.attempts,
  nextTryAt: row.next_try_at,
  deliveredAt: row.delivered_at,
});

/** Creates the SQLite OutboxStore over the control database. */
export function createSqliteOutbox(options: {
  db: Database;
  now: () => number;
}): OutboxStore {
  const { db, now } = options;
  const insert = db.query<{ id: number }, [string, string, string, number]>(
    `INSERT INTO notification_outbox (workspace_id, adapter, payload, attempts, next_try_at, delivered_at)
     VALUES (?, ?, ?, 0, ?, NULL)
     RETURNING id`,
  );
  const purgeDelivered = db.query<null, [number]>(
    `DELETE FROM notification_outbox WHERE delivered_at IS NOT NULL AND delivered_at <= ?`,
  );
  const selectDue = db.query<SqlOutboxRow, [number, number, number]>(
    `SELECT id, workspace_id, adapter, payload, attempts, next_try_at, delivered_at
     FROM notification_outbox
     WHERE delivered_at IS NULL AND next_try_at <= ? AND next_try_at < ?
     ORDER BY next_try_at ASC, id ASC
     LIMIT ?`,
  );
  const markDelivered = db.query<null, [number, number]>(
    `UPDATE notification_outbox SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL`,
  );
  const markRetry = db.query<null, [number, number]>(
    `UPDATE notification_outbox SET attempts = attempts + 1, next_try_at = ? WHERE id = ? AND delivered_at IS NULL`,
  );
  const selectPending = db.query<SqlPendingRow, [string]>(
    `SELECT adapter, attempts, next_try_at
     FROM notification_outbox
     WHERE workspace_id = ? AND delivered_at IS NULL
     ORDER BY id ASC`,
  );

  return {
    enqueue(input): OutboxRow {
      const nextTryAt = now();
      const id = transact(
        db,
        () =>
          insert.get(
            input.workspaceId,
            input.adapter,
            input.payload,
            nextTryAt,
          )!.id,
      );
      return {
        id,
        workspaceId: input.workspaceId,
        adapter: input.adapter,
        payload: input.payload,
        attempts: 0,
        nextTryAt,
        deliveredAt: null,
      };
    },
    due(limit): OutboxRow[] {
      const current = now();
      const capped = Math.max(0, Math.floor(limit));
      return transact(db, () => {
        purgeDelivered.run(current - OUTBOX_RETENTION_MS);
        if (capped === 0) return [];
        return selectDue.all(current, OUTBOX_STOPPED_AT, capped).map(toRow);
      });
    },
    delivered(id): void {
      transact(db, () => {
        markDelivered.run(now(), id);
      });
    },
    retry(id, nextTryAt): void {
      transact(db, () => {
        markRetry.run(nextTryAt, id);
      });
    },
    giveUp(id): void {
      transact(db, () => {
        markRetry.run(OUTBOX_STOPPED_AT, id);
      });
    },
    pending(workspaceId): PendingOutboxRow[] {
      return selectPending.all(workspaceId).map((row) => ({
        adapter: parseAdapter(row.adapter),
        attempts: row.attempts,
        nextTryAt: row.next_try_at,
      }));
    },
  };
}
