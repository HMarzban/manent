// One value per key, made the first time it is asked for.

/** The value `values` holds under `key`; made by `make` and kept there when it holds none. */
export function cached<T>(
  values: Map<string, T>,
  key: string,
  make: () => T,
): T {
  const known = values.get(key);
  if (known !== undefined) return known;
  const made = make();
  values.set(key, made);
  return made;
}
