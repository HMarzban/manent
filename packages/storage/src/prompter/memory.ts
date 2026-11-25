// The prompter's sends and send requests kept in memory, for the in-memory driver.
import type {
  PrompterRequestRow,
  PrompterSendRow,
  PrompterStore,
} from "../ports/index.ts";

/** One document file's rows. Values are replaced, never changed in place. */
export interface PrompterTables {
  /** By rundownId, rowId and sentAt. */
  sends: Map<string, PrompterSendRow>;
  /** By docId and key. */
  requests: Map<string, PrompterRequestRow>;
}

/** A copy that a transaction may change without touching `tables`. */
export function copyPrompterTables(
  tables: PrompterTables | undefined,
): PrompterTables {
  return {
    sends: new Map(tables?.sends),
    requests: new Map(tables?.requests),
  };
}

const sendKey = (rundownId: string, rowId: string, sentAt: number): string =>
  JSON.stringify([rundownId, rowId, sentAt]);

const requestKey = (docId: string, key: string): string =>
  JSON.stringify([docId, key]);

const copySend = (row: PrompterSendRow): PrompterSendRow => ({
  rundownId: row.rundownId,
  rowId: row.rowId,
  storyId: row.storyId,
  versionId: row.versionId,
  generation: row.generation,
  seq: row.seq,
  senderUserId: row.senderUserId,
  sentAt: row.sentAt,
});

const copyRequest = (row: PrompterRequestRow): PrompterRequestRow => ({
  docId: row.docId,
  key: row.key,
  userId: row.userId,
  result: row.result,
  createdAt: row.createdAt,
});

const newestFirst = (a: PrompterSendRow, b: PrompterSendRow): number =>
  b.sentAt - a.sentAt;

const byRowId = (a: PrompterSendRow, b: PrompterSendRow): number =>
  a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0;

function sendsOfRow(
  tables: PrompterTables,
  rundownId: string,
  rowId: string,
): PrompterSendRow[] {
  return [...tables.sends.values()]
    .filter((s) => s.rundownId === rundownId && s.rowId === rowId)
    .toSorted(newestFirst);
}

function latestOfRundown(
  tables: PrompterTables,
  rundownId: string,
): PrompterSendRow[] {
  const byRow = new Map<string, PrompterSendRow>();
  for (const send of tables.sends.values()) {
    if (send.rundownId !== rundownId) continue;
    const held = byRow.get(send.rowId);
    if (held === undefined || send.sentAt > held.sentAt)
      byRow.set(send.rowId, send);
  }
  return [...byRow.values()].toSorted(byRowId).map(copySend);
}

/** The store over `read` and `write`, which give the file's tables as one transaction sees them. */
export function createMemoryPrompter(options: {
  read: () => PrompterTables;
  write: <T>(op: (tables: PrompterTables) => T) => T;
}): PrompterStore {
  const { read, write } = options;
  return {
    record: (send) =>
      write((t) => {
        const at = sendKey(send.rundownId, send.rowId, send.sentAt);
        if (t.sends.has(at))
          throw new Error(
            `prompter send for ${send.rundownId}/${send.rowId} at ${send.sentAt} is already stored`,
          );
        t.sends.set(at, copySend(send));
      }),
    latest: (rundownId, rowId) => {
      const row = sendsOfRow(read(), rundownId, rowId)[0];
      return row === undefined ? null : copySend(row);
    },
    previous: (rundownId, rowId) => {
      const row = sendsOfRow(read(), rundownId, rowId)[1];
      return row === undefined ? null : copySend(row);
    },
    latestOf: (rundownId) => latestOfRundown(read(), rundownId),
    request: (rundownId, key) => {
      const row = read().requests.get(requestKey(rundownId, key));
      return row === undefined ? null : copyRequest(row);
    },
    putRequest: (row) =>
      write((t) => {
        const at = requestKey(row.docId, row.key);
        if (t.requests.has(at))
          throw new RangeError(
            `prompter request key ${row.key} is already stored`,
          );
        t.requests.set(at, copyRequest(row));
      }),
  };
}
