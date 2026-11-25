// The notifications waiting to be delivered kept in memory, for the in-memory driver.
import { OUTBOX_RETENTION_MS, OUTBOX_STOPPED_AT } from "../ports/index.ts";
import type {
  OutboxRow,
  OutboxStore,
  PendingOutboxRow,
} from "../ports/index.ts";

/** The control file's rows. Values are replaced, never changed in place. */
export interface OutboxTables {
  nextId: number;
  readonly rows: Map<number, OutboxRow>;
}

/** Creates empty in-memory tables for OutboxStore. */
export function createOutboxTables(): OutboxTables {
  return { nextId: 1, rows: new Map() };
}

const compareDue = (a: OutboxRow, b: OutboxRow): number =>
  a.nextTryAt - b.nextTryAt || a.id - b.id;

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryOutbox(options: {
  now: () => number;
  read: () => OutboxTables;
  commit: <T>(apply: () => T) => T;
}): OutboxStore {
  const { now, read, commit } = options;
  return {
    enqueue(input): OutboxRow {
      return commit(() => {
        const tables = read();
        const id = tables.nextId;
        tables.nextId += 1;
        const row: OutboxRow = {
          id,
          workspaceId: input.workspaceId,
          adapter: input.adapter,
          payload: input.payload,
          attempts: 0,
          nextTryAt: now(),
          deliveredAt: null,
        };
        tables.rows.set(id, row);
        return { ...row };
      });
    },
    due(limit): OutboxRow[] {
      const current = now();
      const cutoff = current - OUTBOX_RETENTION_MS;
      const capped = Number.isFinite(limit)
        ? Math.max(0, Math.floor(limit))
        : 0;
      return commit(() => {
        const tables = read();
        for (const [id, row] of tables.rows) {
          if (row.deliveredAt !== null && row.deliveredAt <= cutoff) {
            tables.rows.delete(id);
          }
        }
        if (capped === 0) return [];
        return [...tables.rows.values()]
          .filter(
            (row) =>
              row.deliveredAt === null &&
              row.nextTryAt <= current &&
              row.nextTryAt < OUTBOX_STOPPED_AT,
          )
          .toSorted(compareDue)
          .slice(0, capped)
          .map((row) => ({ ...row }));
      });
    },
    delivered(id): void {
      commit(() => {
        const tables = read();
        const row = tables.rows.get(id);
        if (row === undefined || row.deliveredAt !== null) return;
        tables.rows.set(id, { ...row, deliveredAt: now() });
      });
    },
    retry(id, nextTryAt): void {
      commit(() => {
        const tables = read();
        const row = tables.rows.get(id);
        if (row === undefined || row.deliveredAt !== null) return;
        tables.rows.set(id, {
          ...row,
          attempts: row.attempts + 1,
          nextTryAt,
        });
      });
    },
    giveUp(id): void {
      commit(() => {
        const tables = read();
        const row = tables.rows.get(id);
        if (row === undefined || row.deliveredAt !== null) return;
        tables.rows.set(id, {
          ...row,
          attempts: row.attempts + 1,
          nextTryAt: OUTBOX_STOPPED_AT,
        });
      });
    },
    pending(workspaceId): PendingOutboxRow[] {
      return [...read().rows.values()]
        .filter(
          (row) => row.workspaceId === workspaceId && row.deliveredAt === null,
        )
        .toSorted((a, b) => a.id - b.id)
        .map((row) => ({
          adapter: row.adapter,
          attempts: row.attempts,
          nextTryAt: row.nextTryAt,
        }));
    },
  };
}
