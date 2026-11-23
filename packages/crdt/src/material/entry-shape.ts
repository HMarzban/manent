// The guard every material entry's validator opens with.

/** A plain JSON object, as an entry of a material map is stored. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
