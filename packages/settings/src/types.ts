// What a setting is: its scope, its value type, where it is shown and how it takes effect.
import type { MenuId, ProjectGroup, ScriptGroup, SectionId } from "./ids.ts";

export type Scope = "personal" | "device" | "script" | "project";
export type Platform = "mac" | "windows" | "linux";
export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface Choice<V extends string> {
  value: V;
  label: string;
}

/**
 * A setting's value type. `parse` never coerces and never throws, and gives a value back in its one canonical form,
 * frozen; `choices` is null for every kind but a choice.
 */
export interface SettingType<T> {
  readonly kind:
    | "boolean"
    | "choice"
    | "text"
    | "number"
    | "element_style"
    | "header_slots"
    | "labels"
    | "fields";
  parse(input: unknown): ParseResult<T>;
  equals(a: T, b: T): boolean;
  readonly choices: readonly Choice<string>[] | null;
}

/**
 * How one element of a project or script looks: null is the format's own value. `spaceBefore` is in lines, `indent`
 * and `width` in inches.
 */
export interface ElementStyle {
  capitalized: boolean | null;
  underlined: boolean | null;
  bold: boolean | null;
  colour: string | null;
  spaceBefore: number | null;
  indent: number | null;
  width: number | null;
}

/** Keyed by element name; an element not listed keeps the format's own look. */
export type ElementStyles = Readonly<Record<string, ElementStyle>>;

const HEADER_SLOT_KINDS = [
  "none",
  "page_number",
  "page_of_total",
  "date",
  "title",
  "section",
  "duration",
  "revision_label",
] as const;

/** What one place of a header or footer shows: a value of the script, or text typed for it. */
export type HeaderSlot =
  | { kind: (typeof HEADER_SLOT_KINDS)[number] }
  | { kind: "custom"; text: string };

/** A header or footer: its three places, whether it is on the first page too, and whether a rule sets it apart. */
export interface HeaderSlots {
  left: HeaderSlot;
  center: HeaderSlot;
  right: HeaderSlot;
  firstPage: boolean;
  rule: boolean;
}

interface NumberRange {
  min: number;
  max: number;
  step: number;
}

const same = <T>(a: T, b: T): boolean => Object.is(a, b);
const accepted = <T>(value: T): ParseResult<T> => ({ ok: true, value });
const refused = <T>(reason: string): ParseResult<T> => ({ ok: false, reason });

// a stored text holding a lone surrogate would read back as U+FFFD on other replicas
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const isText = (input: unknown): input is string =>
  typeof input === "string" && !LONE_SURROGATE.test(input);
const isRecord = (input: unknown): input is Readonly<Record<string, unknown>> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

/** Whether two JSON values are equal, member by member. */
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

const booleanType: SettingType<boolean> = Object.freeze({
  kind: "boolean",
  parse: (input: unknown): ParseResult<boolean> =>
    typeof input === "boolean" ? accepted(input) : refused("not_boolean"),
  equals: same,
  choices: null,
});

function choice<const V extends string>(
  choices: readonly Choice<V>[],
): SettingType<V> {
  const list = Object.freeze(choices.map((c) => Object.freeze({ ...c })));
  const values: ReadonlySet<string> = new Set(list.map((c) => c.value));
  const isValue = (input: unknown): input is V =>
    typeof input === "string" && values.has(input);
  return Object.freeze({
    kind: "choice",
    parse: (input: unknown): ParseResult<V> =>
      isValue(input) ? accepted(input) : refused("not_choice"),
    equals: same,
    choices: list,
  });
}

function text(options: { maxLength: number }): SettingType<string> {
  return Object.freeze({
    kind: "text",
    parse(input: unknown): ParseResult<string> {
      if (!isText(input)) return refused("not_text");
      return input.length > options.maxLength
        ? refused("too_long")
        : accepted(input);
    },
    equals: same,
    choices: null,
  });
}

function parseNumber(input: unknown, range: NumberRange): ParseResult<number> {
  if (typeof input !== "number" || !Number.isFinite(input))
    return refused("not_number");
  if (input < range.min || input > range.max) return refused("out_of_range");
  const steps = (input - range.min) / range.step;
  // within a millionth of a step, so that a step of 0.1 holds 0.3 as binary fractions give it
  return Math.abs(steps - Math.round(steps)) < 1e-6
    ? accepted(input)
    : refused("off_step");
}

function numberType(range: NumberRange): SettingType<number> {
  return Object.freeze({
    kind: "number",
    parse: (input: unknown) => parseNumber(input, range),
    equals: same,
    choices: null,
  });
}

function numberOrNull(range: NumberRange): SettingType<number | null> {
  return Object.freeze({
    kind: "number",
    parse: (input: unknown): ParseResult<number | null> =>
      input === null ? accepted(null) : parseNumber(input, range),
    equals: same,
    choices: null,
  });
}

function labels(options: {
  maxItems: number;
  maxLength: number;
}): SettingType<readonly string[]> {
  const isLabel = (item: unknown): item is string =>
    isText(item) && item.length > 0 && item.length <= options.maxLength;
  return Object.freeze({
    kind: "labels",
    parse(input: unknown): ParseResult<readonly string[]> {
      if (!Array.isArray(input) || input.length > options.maxItems)
        return refused("not_labels");
      return input.every(isLabel)
        ? accepted(Object.freeze([...input]))
        : refused("not_labels");
    },
    equals: sameJson,
    choices: null,
  });
}

function fields(
  names: readonly string[],
): SettingType<Readonly<Record<string, string>>> {
  const known: ReadonlySet<string> = new Set(names);
  return Object.freeze({
    kind: "fields",
    parse(input: unknown): ParseResult<Readonly<Record<string, string>>> {
      if (!isRecord(input) || Object.keys(input).some((key) => !known.has(key)))
        return refused("not_fields");
      const value: Record<string, string> = {};
      for (const name of names) {
        const field = Object.hasOwn(input, name) ? input[name] : "";
        if (!isText(field)) return refused("not_fields");
        value[name] = field;
      }
      return accepted(Object.freeze(value));
    },
    equals: sameJson,
    choices: null,
  });
}

const STYLE_FIELDS: readonly string[] = [
  "capitalized",
  "underlined",
  "bold",
  "colour",
  "spaceBefore",
  "indent",
  "width",
];

const isFlag = (input: unknown): input is boolean | null =>
  input === null || typeof input === "boolean";
const isMeasure = (input: unknown): input is number | null =>
  input === null ||
  (typeof input === "number" && Number.isFinite(input) && input >= 0);

/** One element's style with every field present, an absent field read as null; null for anything else. */
function parseStyle(input: unknown): ElementStyle | null {
  if (!isRecord(input)) return null;
  if (Object.keys(input).some((key) => !STYLE_FIELDS.includes(key)))
    return null;
  const field = (name: keyof ElementStyle): unknown =>
    Object.hasOwn(input, name) ? input[name] : null;
  const capitalized = field("capitalized");
  const underlined = field("underlined");
  const bold = field("bold");
  const colour = field("colour");
  const spaceBefore = field("spaceBefore");
  const indent = field("indent");
  const width = field("width");
  if (!isFlag(capitalized) || !isFlag(underlined) || !isFlag(bold)) return null;
  if (colour !== null && !isText(colour)) return null;
  if (!isMeasure(spaceBefore) || !isMeasure(indent) || !isMeasure(width))
    return null;
  return Object.freeze({
    capitalized,
    underlined,
    bold,
    colour,
    spaceBefore,
    indent,
    width,
  });
}

// an element whose every field is null keeps the format's own look, as one not listed does, so it is left out
function parseStyles(input: unknown): ParseResult<ElementStyles> {
  if (!isRecord(input)) return refused("not_element_style");
  const styles: [string, ElementStyle][] = [];
  for (const element of Object.keys(input).toSorted()) {
    const style = parseStyle(input[element]);
    if (element === "" || !isText(element) || style === null)
      return refused("not_element_style");
    if (Object.values(style).some((value) => value !== null))
      styles.push([element, style]);
  }
  return accepted(Object.freeze(Object.fromEntries(styles)));
}

const elementStyleType: SettingType<ElementStyles> = Object.freeze({
  kind: "element_style",
  parse: parseStyles,
  equals: sameJson,
  choices: null,
});

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

function parseSlots(input: unknown): ParseResult<HeaderSlots> {
  if (!isRecord(input) || Object.keys(input).length !== 5)
    return refused("not_header_slots");
  const left = parseSlot(input.left);
  const center = parseSlot(input.center);
  const right = parseSlot(input.right);
  const { firstPage, rule } = input;
  if (left === null || center === null || right === null)
    return refused("not_header_slots");
  if (typeof firstPage !== "boolean" || typeof rule !== "boolean")
    return refused("not_header_slots");
  return accepted(Object.freeze({ left, center, right, firstPage, rule }));
}

const headerSlotsType: SettingType<HeaderSlots> = Object.freeze({
  kind: "header_slots",
  parse: parseSlots,
  equals: sameJson,
  choices: null,
});

/**
 * The value types a setting may have. A number is finite, within `min`…`max` and a whole number of `step`s from
 * `min`; `numberOrNull` also takes null, for a default such as "no target". A label is non-empty text of at most
 * `maxLength`. `fields` is one text per name, "" for a name not given.
 */
export const t: {
  boolean(): SettingType<boolean>;
  choice<const V extends string>(choices: readonly Choice<V>[]): SettingType<V>;
  text(options: { maxLength: number }): SettingType<string>;
  number(options: NumberRange): SettingType<number>;
  numberOrNull(options: NumberRange): SettingType<number | null>;
  labels(options: {
    maxItems: number;
    maxLength: number;
  }): SettingType<readonly string[]>;
  fields(
    names: readonly string[],
  ): SettingType<Readonly<Record<string, string>>>;
  elementStyle(): SettingType<ElementStyles>;
  headerSlots(): SettingType<HeaderSlots>;
} = Object.freeze({
  boolean: () => booleanType,
  choice,
  text,
  number: numberType,
  numberOrNull,
  labels,
  fields,
  elementStyle: () => elementStyleType,
  headerSlots: () => headerSlotsType,
});

export type Surface =
  | { in: "preferences"; section: SectionId; order: number }
  | { in: "scriptSettings"; group: ScriptGroup; order: number }
  | { in: "projectSettings"; group: ProjectGroup; order: number }
  /**
   * A choice is drawn in a submenu named by its own label. `under` is the key of the choice setting whose submenu a
   * switch is drawn in ("appearance.theme"); null for a switch drawn on its own, and always null for a choice.
   */
  | {
      in: "menu";
      menu: MenuId;
      group: string;
      order: number;
      under: string | null;
    }
  | { in: "palette" };

/** How a value takes effect: a root attribute (each value mapped to the attribute's value, null to remove it), the editor, or read where it is used. */
export type Apply =
  | {
      how: "attribute";
      name: `data-${string}`;
      values: Readonly<Record<string, string | null>>;
    }
  | { how: "editor"; effect: "behaviour" | "decorations" | "layout" }
  | { how: "read" };

export interface SettingDefinition<K extends string = string, T = unknown> {
  readonly key: K;
  readonly scope: Scope;
  readonly type: SettingType<T>;
  readonly default: T;
  readonly label: string;
  readonly description: string | null;
  /** The word for it in messages ("paper size"); null means the label. */
  readonly noun: string | null;
  readonly surfaces: readonly Surface[];
  readonly apply: Apply;
  /** Applied by the boot script before the first paint. */
  readonly boot: boolean;
  readonly guard: "layout" | null;
  readonly keywords: readonly string[];
}
