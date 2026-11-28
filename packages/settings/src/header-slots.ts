// Header and footer slot types and parser for script settings, including alternating book/chapter slots and chapter-opening suppression.
import type { ParseResult, SettingType } from "./types.ts";

export const HEADER_SLOT_KINDS = [
  "none",
  "page_number",
  "page_of_total",
  "date",
  "title",
  "section",
  "duration",
  "revision_label",
  "verso_title_recto_chapter",
] as const;

/** What one place of a header or footer shows: a value of the script, or text typed for it. */
export type HeaderSlot =
  | { kind: (typeof HEADER_SLOT_KINDS)[number] }
  | { kind: "custom"; text: string };

/** A header or footer: its three places, first-page flag, rule flag, and optional chapter-opening suppression. */
export interface HeaderSlots {
  left: HeaderSlot;
  center: HeaderSlot;
  right: HeaderSlot;
  firstPage: boolean;
  rule: boolean;
  /** Optional manuscript flag: suppress running header on every chapter-opening page. Omitted when unset. */
  suppressChapterOpenings?: boolean;
}

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const isText = (input: unknown): input is string =>
  typeof input === "string" && !LONE_SURROGATE.test(input);
const isRecord = (input: unknown): input is Readonly<Record<string, unknown>> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const isSlotKind = (
  input: unknown,
): input is (typeof HEADER_SLOT_KINDS)[number] =>
  HEADER_SLOT_KINDS.some((kind) => kind === input);

function parseSlot(input: unknown): HeaderSlot | null {
  if (!isRecord(input)) return null;
  const { kind, text: typed } = input;
  const size = Object.keys(input).length;
  if (kind === "custom")
    return size === 2 && isText(typed)
      ? Object.freeze({ kind, text: typed })
      : null;
  return size === 1 && isSlotKind(kind) ? Object.freeze({ kind }) : null;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, i) => sameJson(item, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]))
  );
}

function parseSlots(input: unknown): ParseResult<HeaderSlots> {
  if (!isRecord(input)) return { ok: false, reason: "not_header_slots" };
  const keys = Object.keys(input);
  const hasSuppress = Object.hasOwn(input, "suppressChapterOpenings");
  if (keys.length !== (hasSuppress ? 6 : 5))
    return { ok: false, reason: "not_header_slots" };
  const left = parseSlot(input.left);
  const center = parseSlot(input.center);
  const right = parseSlot(input.right);
  const { firstPage, rule, suppressChapterOpenings } = input;
  if (left === null || center === null || right === null)
    return { ok: false, reason: "not_header_slots" };
  if (typeof firstPage !== "boolean" || typeof rule !== "boolean")
    return { ok: false, reason: "not_header_slots" };
  if (hasSuppress && typeof suppressChapterOpenings !== "boolean")
    return { ok: false, reason: "not_header_slots" };
  return {
    ok: true,
    value: Object.freeze(
      hasSuppress
        ? {
            left,
            center,
            right,
            firstPage,
            rule,
            suppressChapterOpenings: suppressChapterOpenings as boolean,
          }
        : { left, center, right, firstPage, rule },
    ),
  };
}

export const headerSlotsType: SettingType<HeaderSlots> = Object.freeze({
  kind: "header_slots",
  parse: parseSlots,
  equals: sameJson,
  choices: null,
});
