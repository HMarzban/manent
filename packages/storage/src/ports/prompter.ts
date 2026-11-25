// What was sent to the prompter, and the answers of send requests, kept in the rundown's file.

/** One send of a rundown row to the prompter; `versionId` and `senderUserId` are null for an automatic send. */
export interface PrompterSendRow {
  rundownId: string;
  rowId: string;
  storyId: string;
  /** Null for an automatic send, which records no version. */
  versionId: string | null;
  generation: number;
  seq: number;
  /** Null for an automatic send. */
  senderUserId: string | null;
  sentAt: number;
}

/** One prompter request's answer under its idempotency key: `result` is the response as JSON text. */
export interface PrompterRequestRow {
  docId: string;
  key: string;
  userId: string;
  result: string;
  createdAt: number;
}

/** Every write joins the document file's `transaction`. */
export interface PrompterStore {
  /** Records a send of a rundown row. */
  record(send: PrompterSendRow): void;
  /** The newest send of the row, by `sentAt`; null when the row has never been sent. */
  latest(rundownId: string, rowId: string): PrompterSendRow | null;
  /** The send immediately before `latest` for the row, by `sentAt`; null when fewer than two sends exist. */
  previous(rundownId: string, rowId: string): PrompterSendRow | null;
  /** The latest send of every row of the rundown, ascending by `rowId`; empty when none have been sent. */
  latestOf(rundownId: string): PrompterSendRow[];
  request(rundownId: string, key: string): PrompterRequestRow | null;
  /** Throws a RangeError for a key already stored for the rundown. */
  putRequest(row: PrompterRequestRow): void;
}
