// The script's settings: two maps at the document's root, written only by the authority.
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";

/** The origin of a write the authority makes itself. */
export const ORIGIN_SYSTEM = "system";

/** Who set a setting, when (milliseconds since the epoch), and the value it replaced (null: none). */
export interface SettingMeta {
  userId: string;
  setAt: number;
  replaced: unknown;
}

/** The script's `settings` and `settingsMeta` maps, keyed by registry key, each value plain JSON. */
export interface SettingsView {
  /** Every setting, keys in ascending order. */
  entries(): Record<string, unknown>;
  /** Null when the key has none, or what is stored is not one. */
  meta(key: string): SettingMeta | null;
  /** Writes both maps in one transaction with origin ORIGIN_SYSTEM. Only the authority calls it. */
  set(key: string, value: unknown, meta: SettingMeta): void;
}

function metaOf(stored: unknown): SettingMeta | null {
  if (typeof stored !== "object" || stored === null || !("replaced" in stored))
    return null;
  if (!("userId" in stored) || typeof stored.userId !== "string") return null;
  if (!("setAt" in stored) || typeof stored.setAt !== "number") return null;
  return {
    userId: stored.userId,
    setAt: stored.setAt,
    replaced: stored.replaced,
  };
}

export function scriptSettings(doc: CrdtDoc): SettingsView {
  const ydoc = yDocOf(doc);
  const settings = ydoc.getMap<unknown>("settings");
  const settingsMeta = ydoc.getMap<unknown>("settingsMeta");
  return {
    entries: () =>
      Object.fromEntries(
        [...settings.keys()].toSorted().map((key) => [key, settings.get(key)]),
      ),
    meta: (key) => metaOf(settingsMeta.get(key)),
    set: (key, value, { userId, setAt, replaced }) =>
      ydoc.transact(() => {
        settings.set(key, value);
        settingsMeta.set(key, { userId, setAt, replaced });
      }, ORIGIN_SYSTEM),
  };
}
