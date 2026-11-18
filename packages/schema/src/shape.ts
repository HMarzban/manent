// Checks of values read from stored JSON, before anything trusts their type.

export type Json = Record<string, unknown>;
export type Check = (value: unknown) => boolean;

export function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** An integer of zero or more. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function orNull(check: Check): Check {
  return (value) => value === null || check(value);
}

export function oneOf(values: readonly unknown[]): Check {
  return (value) => values.includes(value);
}
