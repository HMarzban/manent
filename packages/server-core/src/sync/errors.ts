// Every document ERROR this server sends: its message, and the code that goes with it.
import { CODE, isPermanentPushError } from "@manent/sync-protocol";
import type { DocRef, Message } from "@manent/sync-protocol";
import type { Refusal } from "./write-path.ts";

const TABLE = {
  rate_limited: CODE.RATE_LIMITED,
  document_full: CODE.RATE_LIMITED,
  busy: CODE.RATE_LIMITED,
  too_many_client_ids: CODE.TOO_LARGE,
  deleted: CODE.DOCUMENT_DELETED,
  forbidden: CODE.FORBIDDEN,
  prompter_unavailable: CODE.FORBIDDEN,
  read_only_role: CODE.FORBIDDEN,
  too_old: CODE.TOO_OLD,
  client_id_taken: CODE.BAD_FRAME,
  not_subscribed: CODE.FORBIDDEN,
  generation_moved: CODE.GENERATION_MISMATCH,
  bad_update: CODE.BAD_FRAME,
  foreign_client_id: CODE.BAD_FRAME,
  incomplete: CODE.BAD_FRAME,
  invalid: CODE.VALIDATION_FAILED,
  too_large: CODE.TOO_LARGE,
  storage_failed: CODE.STORAGE_FAILED,
  unknown_frame: CODE.BAD_FRAME,
  bad_value: CODE.SETTING_REFUSED,
  unknown_key: CODE.SETTING_REFUSED,
  locked: CODE.SETTING_REFUSED,
} as const;

export type SyncErrorMessage = keyof typeof TABLE;

/** Every ERROR.message this server sends, and its code. A code changes only with PROTOCOL_VERSION. */
export const SYNC_ERRORS: Readonly<Record<string, number>> =
  Object.freeze(TABLE);

// A refusal that holds however often it is sent again, though its code alone would not say so
const PERMANENT: Partial<Record<SyncErrorMessage, boolean>> = {
  deleted: true,
  too_many_client_ids: true,
  client_id_taken: true,
  unknown_frame: false,
};

function isSyncErrorMessage(value: string): value is SyncErrorMessage {
  return Object.hasOwn(TABLE, value);
}

/**
 * The ERROR for `message` about `doc`. `permanent` defaults to what the message's code means for a
 * push; `clientSeq` names the one entry refused for good, and is null otherwise.
 */
export function syncError(
  message: SyncErrorMessage,
  doc: DocRef,
  options: {
    permanent?: boolean;
    retryAfterMs?: number;
    clientSeq?: number;
  } = {},
): Message {
  const code = TABLE[message];
  return {
    type: "ERROR",
    code,
    message,
    retryAfterMs: options.retryAfterMs ?? null,
    permanent:
      options.permanent ?? PERMANENT[message] ?? isPermanentPushError(code),
    doc,
    clientSeq: options.clientSeq ?? null,
  };
}

/** The ERROR for a refusal the write path made; TypeError for a message outside the table. */
export function refusalError(refusal: Refusal, doc: DocRef): Message {
  const { message, permanent, retryAfterMs, clientSeq } = refusal;
  if (!isSyncErrorMessage(message))
    throw new TypeError(`no ERROR is named ${message}`);
  return syncError(message, doc, {
    permanent,
    ...(retryAfterMs === null ? {} : { retryAfterMs }),
    ...(clientSeq === null ? {} : { clientSeq }),
  });
}
