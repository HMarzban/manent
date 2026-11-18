// The layout of a person's preferences in one shared map: one entry per preference and device, so no two devices write one key.

/**
 * One device's value for one preference. `at` is milliseconds since the epoch on that device's clock; `on` is
 * the device's name; an `unset` entry is a reset, which means "no value".
 */
export interface PrefEntry {
  v: unknown;
  at: number;
  on: string;
  unset: boolean;
}

export function entryKey(settingKey: string, deviceId: string): string {
  return `${settingKey}|${deviceId}`;
}

/** The setting key and device of a map key; null when the key is not an entry's. */
export function parseEntryKey(
  key: string,
): { settingKey: string; deviceId: string } | null {
  const bar = key.indexOf("|");
  if (bar <= 0 || bar === key.length - 1) return null;
  return { settingKey: key.slice(0, bar), deviceId: key.slice(bar + 1) };
}

const isPrefEntry = (value: unknown): value is PrefEntry =>
  typeof value === "object" &&
  value !== null &&
  "v" in value &&
  "at" in value &&
  typeof value.at === "number" &&
  Number.isFinite(value.at) &&
  "on" in value &&
  typeof value.on === "string" &&
  "unset" in value &&
  typeof value.unset === "boolean";

/**
 * The entry that holds for each preference: the latest `at`, a tie going to the larger device id. An entry
 * its shape rejects is skipped, never removed.
 */
export function latestEntries(
  map: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, PrefEntry & { deviceId: string }> {
  const latest = new Map<string, PrefEntry & { deviceId: string }>();
  for (const [key, value] of Object.entries(map)) {
    const parsed = parseEntryKey(key);
    if (parsed === null || !isPrefEntry(value)) continue;
    const { settingKey, deviceId } = parsed;
    const held = latest.get(settingKey);
    const later =
      held === undefined ||
      value.at > held.at ||
      (value.at === held.at && deviceId > held.deviceId);
    if (later) {
      const { v, at, on, unset } = value;
      latest.set(settingKey, { v, at, on, unset, deviceId });
    }
  }
  return latest;
}
