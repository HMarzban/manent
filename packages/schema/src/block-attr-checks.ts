import { ALIGNMENTS, DUALS, LINK_KINDS } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import { ACT_BREAK_KINDS } from "./block-types.ts";
import { isBlockId, parseFrom } from "./identity.ts";
import {
  isBoolean,
  isCount,
  isObject,
  isString,
  oneOf,
  orNull,
} from "./shape.ts";
import type { Check } from "./shape.ts";

const ELEMENT_NAME = /^[a-z_]{1,32}$/;

/** The shape every element name has, known to this build or not. */
export function isElementName(value: unknown): value is string {
  return isString(value) && ELEMENT_NAME.test(value);
}

const isTag = (value: unknown): boolean => isString(value) && value !== "";

/** `{ kind, blockId }` and nothing else. */
function isLinkTo(value: unknown): boolean {
  return (
    isObject(value) &&
    Object.keys(value).length === 2 &&
    oneOf(LINK_KINDS)(value.kind) &&
    isBlockId(value.blockId)
  );
}

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
  tags: (value) => Array.isArray(value) && value.every(isTag),
  linkTo: orNull(isLinkTo),
};
