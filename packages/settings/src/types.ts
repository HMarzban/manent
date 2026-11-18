// What a setting is: its scope, its value type, where it is shown and how it takes effect.
import type { MenuId, ScriptGroup, SectionId } from "./ids.ts";

export type Scope = "personal" | "device" | "script";
export type Platform = "mac" | "windows" | "linux";
export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface Choice<V extends string> {
  value: V;
  label: string;
}

/** A setting's value type. `parse` never coerces and never throws; `choices` is null for a boolean. */
export interface SettingType<T> {
  readonly kind: "boolean" | "choice";
  parse(input: unknown): ParseResult<T>;
  equals(a: T, b: T): boolean;
  readonly choices: readonly Choice<string>[] | null;
}

const same = <T>(a: T, b: T): boolean => Object.is(a, b);

const booleanType: SettingType<boolean> = Object.freeze({
  kind: "boolean",
  parse: (input: unknown): ParseResult<boolean> =>
    typeof input === "boolean"
      ? { ok: true, value: input }
      : { ok: false, reason: "not_boolean" },
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
      isValue(input)
        ? { ok: true, value: input }
        : { ok: false, reason: "not_choice" },
    equals: same,
    choices: list,
  });
}

/** The value types a setting may have: a switch, or one of a closed list of choices. */
export const t: {
  boolean(): SettingType<boolean>;
  choice<const V extends string>(choices: readonly Choice<V>[]): SettingType<V>;
} = Object.freeze({ boolean: () => booleanType, choice });

export type Surface =
  | { in: "preferences"; section: SectionId; order: number }
  | { in: "scriptSettings"; group: ScriptGroup; order: number }
  | { in: "menu"; menu: MenuId; group: string; order: number }
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
