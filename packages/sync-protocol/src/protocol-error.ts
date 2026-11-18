import type { CODE } from "./constants.ts";

type RefusalCode = typeof CODE.BAD_FRAME | typeof CODE.TOO_LARGE;

/** A frame that cannot be accepted: malformed (4400) or too large (4413). */
export class ProtocolError extends Error {
  readonly code: RefusalCode;

  constructor(
    code: RefusalCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProtocolError";
    this.code = code;
  }
}
