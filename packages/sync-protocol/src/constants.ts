// Protocol constants: the version, the size limits, frame type numbers and error codes.

export const PROTOCOL_VERSION = 1;

/** The largest frame either side sends; a larger message travels as chunks. */
export const FRAME_LIMIT_BYTES = 4 * 1024 * 1024;

/** The largest message, reassembled from its chunks. */
export const MESSAGE_LIMIT_BYTES = 64 * 1024 * 1024;

/** Frame type numbers. 0–15 are connection frames, 16–127 document frames. */
export const FRAME = {
  HELLO: 0,
  WELCOME: 1,
  AUTH_EXPIRING: 2,
  AUTH_REFRESH: 3,
  ERROR: 4,
  PING: 5,
  SUBSCRIBE: 16,
  SUBSCRIBED: 17,
  GENERATION_MOVED: 18,
  UNSUBSCRIBE: 19,
  SYNC: 20,
  PUSH: 21,
  ACK: 22,
  AWARENESS: 23,
  CONTROL: 24,
  VIEW_SNAPSHOT: 25,
  VIEW_PATCH: 26,
  SET: 27,
} as const;

/** Error and close codes. */
export const CODE = {
  BAD_FRAME: 4400,
  UNAUTHENTICATED: 4401,
  FORBIDDEN: 4403,
  TOO_OLD: 4408,
  GENERATION_MISMATCH: 4409,
  DOCUMENT_DELETED: 4410,
  TOO_LARGE: 4413,
  VALIDATION_FAILED: 4422,
  SETTING_REFUSED: 4423,
  RATE_LIMITED: 4429,
  STORAGE_FAILED: 1011,
  RESTARTING: 1012,
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];

/** True when a push refused with this code will be refused again however often it is retried. */
export function isPermanentPushError(code: number): boolean {
  return (
    code === CODE.BAD_FRAME ||
    code === CODE.TOO_LARGE ||
    code === CODE.VALIDATION_FAILED
  );
}
