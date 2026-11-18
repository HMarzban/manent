// One setting's value, read so that only the components that read it re-render when it changes.
import type { SettingKey, SettingValue } from "@manent/settings";
import { useCallback, useSyncExternalStore } from "react";
import { useSettingsStore } from "./settings-context.tsx";

export function useSetting<K extends SettingKey>(key: K): SettingValue<K>;
// the store's get(K) is the same type as SettingValue<K>, but the checker cannot relate the two through a type
// parameter, so the body is typed by the union of every setting's value
export function useSetting(key: SettingKey): SettingValue<SettingKey> {
  const store = useSettingsStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const read = useCallback(() => store.get(key), [store, key]);
  return useSyncExternalStore(subscribe, read);
}
