import { ALIGNMENTS, DUALS } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import { ACT_BREAK_KINDS } from "./block-types.ts";
import { parseFrom } from "./identity.ts";
import { isBoolean, isCount, isString, oneOf, orNull } from "./shape.ts";
import type { Check } from "./shape.ts";

/** The valid values of each block attribute except `id` and `type`, which have their own codes. */
export const BLOCK_ATTR_CHECKS: Readonly<
  Record<Exclude<keyof BlockAttrs, "id" | "type">, Check>
> = {
  num: orNull(isString),
  omitted: isBoolean,
  dual: orNull(oneOf(DUALS)),
  synopsis: isString,
  align: orNull(oneOf(ALIGNMENTS)),
  indent: orNull(isCount),
  width: orNull(isCount),
  spaceBefore: orNull(isCount),
  noContd: isBoolean,
  noTiming: isBoolean,
  writerUserId: orNull(isString),
  suggest: orNull(isString),
  from: (value) =>
    value === null || (isString(value) && parseFrom(value) !== null),
  kind: orNull(oneOf(ACT_BREAK_KINDS)),
  suggestId: orNull(isString),
  suggestAuthorUserId: orNull(isString),
  suggestAt: orNull(isCount),
};
