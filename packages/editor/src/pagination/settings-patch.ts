// How a transaction's patch changes the pagination plugin's settings, and whether every page start must be found again.
import type { PaginationSettings, PaginationState } from "./plugin.ts";

/** What `setPagination` sets: some of the settings, or with `repaginate` alone a refresh after a composition. */
export type SettingsPatch = Partial<PaginationSettings> & { repaginate?: true };

/** Throws RangeError when the profile was made by another engine than the one that would paginate it. */
export function assertSameEngine(settings: PaginationSettings): void {
  const { engine, profile } = settings;
  if (profile.engineVersion !== engine.version)
    throw new RangeError(
      `a profile of engine ${profile.engineVersion} cannot be paginated by engine ${engine.version}`,
    );
}

export function withPatch(
  settings: PaginationSettings,
  patch: SettingsPatch,
): PaginationSettings {
  const next: PaginationSettings = {
    engine: patch.engine ?? settings.engine,
    profile: patch.profile ?? settings.profile,
    locks: patch.locks ?? settings.locks,
    layout: patch.layout === undefined ? settings.layout : patch.layout,
  };
  assertSameEngine(next);
  return next;
}

// What makes every page start open to question again: another engine, another layout, locks, or other patches.
export function needsFullRun(
  prev: PaginationState,
  patch: SettingsPatch,
): boolean {
  return (
    (patch.engine !== undefined && patch.engine !== prev.settings.engine) ||
    (patch.profile !== undefined &&
      patch.profile.key !== prev.settings.profile.key) ||
    patch.locks !== undefined ||
    (patch.layout !== undefined &&
      (patch.layout?.key ?? null) !== prev.index.layoutKey)
  );
}
