// The changes to a script's settings that History lists: the last one of each setting, who made it, and the value it
// replaced, as the script's settings record them.
import { SETTINGS } from "@manent/settings";
import type { SettingKey, SettingsStore } from "@manent/settings";
import { useEffect, useMemo, useState } from "react";
import { useServices } from "../services/context.tsx";

/** `at` is when the change was made; `was` the value it replaced, the setting's default when none was recorded. */
export interface SettingChange {
  key: SettingKey;
  at: number;
  byUserId: string;
  was: unknown;
}

const SCRIPT_KEYS: readonly SettingKey[] = Object.freeze(
  SETTINGS.all.filter((def) => def.scope === "script").map((def) => def.key),
);

/** Each script setting someone has set, with what its record holds. */
function settingChangesOf(store: SettingsStore): SettingChange[] {
  return SCRIPT_KEYS.flatMap((key) => {
    const { provenance } = store.explain(key);
    if (provenance?.at == null || provenance.byUserId === null) return [];
    return [
      {
        key,
        at: provenance.at,
        byUserId: provenance.byUserId,
        was: provenance.was ?? SETTINGS.get(key).default,
      },
    ];
  });
}

/** The script's setting changes, kept current while they are shown. */
export function useSettingChanges(docId: string): readonly SettingChange[] {
  const services = useServices();
  const store = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );
  const [changes, setChanges] = useState(() => settingChangesOf(store));
  useEffect(() => {
    const update = (): void => setChanges(settingChangesOf(store));
    update();
    const stops = SCRIPT_KEYS.map((key) => store.subscribe(key, update));
    return () => {
      for (const stop of stops) stop();
    };
  }, [store]);
  return changes;
}
