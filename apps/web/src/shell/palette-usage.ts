// Per-person device-local command usage history for the Command Palette, backed by createLocalMap.
import { MAX_USAGE_ENTRIES, SCREEN_IDS, recordUsage } from "@manent/commands";
import type { CommandUsage, ScreenId } from "@manent/commands";
import { createLocalMap } from "../services/local-map.ts";
import type { StorageEvents } from "../services/local-map.ts";

const ENTRIES_KEY = "usage";
const SCREEN_SET: ReadonlySet<string> = new Set(SCREEN_IDS);

export const paletteUsageKey = (userId: string): string =>
  `manent.palette.${userId}`;

const isScreenId = (value: unknown): value is ScreenId =>
  typeof value === "string" && SCREEN_SET.has(value);

const isUsageEntry = (value: unknown): value is CommandUsage =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "count") === "number" &&
  Number.isFinite(Reflect.get(value, "count")) &&
  typeof Reflect.get(value, "lastAt") === "number" &&
  Number.isFinite(Reflect.get(value, "lastAt")) &&
  (Reflect.get(value, "lastScreen") === undefined ||
    isScreenId(Reflect.get(value, "lastScreen")));

export interface PaletteUsageStore {
  read(): readonly CommandUsage[];
  record(id: string, screen: ScreenId, now: number): readonly CommandUsage[];
  dispose(): void;
}

/** Bounded per-person usage store kept in browser storage; falls back to memory when storage refuses. */
export function createPaletteUsage(options: {
  readonly userId: string;
  readonly storage: Storage | null;
  readonly events: StorageEvents;
}): PaletteUsageStore {
  const map = createLocalMap({
    storage: options.storage,
    key: paletteUsageKey(options.userId),
    events: options.events,
  });

  const read = (): readonly CommandUsage[] => {
    const raw = map.get(ENTRIES_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isUsageEntry).slice(0, MAX_USAGE_ENTRIES);
  };

  return {
    read,
    record(id, screen, now) {
      const before = read();
      const next = recordUsage(before, id, screen, now, MAX_USAGE_ENTRIES);
      if (next !== before) map.set(ENTRIES_KEY, next);
      return next;
    },
    dispose: map.dispose,
  };
}
