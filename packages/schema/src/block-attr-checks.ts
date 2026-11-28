import {
  ALIGNMENTS,
  CHAPTER_TARGET_WORDS_MAX,
  CHAPTER_TARGET_WORDS_MIN,
  DUALS,
  FIRST_LINES,
  GRAPHIC_ATTR_KEYS,
  GRAPHIC_KINDS,
  GRAPHIC_MAX_ALT_LENGTH,
  GRAPHIC_MAX_DIMENSION_PX,
  GRAPHIC_MAX_HEIGHT_LINES,
  GRAPHIC_MAX_LABEL_LENGTH,
  GRAPHIC_MIN_HEIGHT_LINES,
  LINK_KINDS,
} from "./attrs.ts";
import type { BlockAttrs, GraphicAttrs } from "./attrs.ts";
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
const ASSET_ID = /^[0-9a-f]{64}$/;

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

const isGraphicHeightLines = (value: unknown): boolean =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= GRAPHIC_MIN_HEIGHT_LINES &&
  value <= GRAPHIC_MAX_HEIGHT_LINES;

const isGraphicDimension = (value: unknown): boolean =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= GRAPHIC_MAX_DIMENSION_PX;

export const isAssetId = (value: unknown): value is string =>
  isString(value) && ASSET_ID.test(value);

/** Strictly flat seven-primitive graphic attributes and nothing else. */
export function isGraphicAttrs(value: unknown): value is GraphicAttrs {
  if (!isObject(value)) return false;
  if (Object.keys(value).length !== GRAPHIC_ATTR_KEYS.length) return false;
  for (const key of GRAPHIC_ATTR_KEYS)
    if (!Object.hasOwn(value, key)) return false;
  return (
    oneOf(GRAPHIC_KINDS)(value.kind) &&
    orNull(isAssetId)(value.assetId) &&
    isGraphicHeightLines(value.heightLines) &&
    isString(value.label) &&
    value.label.length <= GRAPHIC_MAX_LABEL_LENGTH &&
    isString(value.alt) &&
    value.alt.length <= GRAPHIC_MAX_ALT_LENGTH &&
    orNull(isGraphicDimension)(value.aspectWidth) &&
    orNull(isGraphicDimension)(value.aspectHeight)
  );
}

const isTargetWords = (value: unknown): boolean =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= CHAPTER_TARGET_WORDS_MIN &&
  value <= CHAPTER_TARGET_WORDS_MAX;

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
  graphic: orNull(isGraphicAttrs),
  firstLine: orNull(oneOf(FIRST_LINES)),
  targetWords: orNull(isTargetWords),
};
